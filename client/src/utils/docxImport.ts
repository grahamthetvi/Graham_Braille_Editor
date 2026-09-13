/**
 * In-browser Word .docx → Graham editor plain text.
 *
 * Documents are parsed locally (mammoth.js, dynamic import). Nothing is uploaded.
 * Headings become plain paragraphs (no markdown `#`, which would pollute Grade 2).
 */

export const DOCX_MAX_BYTES = 10 * 1024 * 1024;
export const DOCX_OOXML_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOC_OLE_MIME = 'application/msword';

/** Private-use sentinel inserted for page/section/column breaks, then turned into `\n\n`. */
export const PAGE_BREAK_SENTINEL = '\uE000GBE_PB\uE001';

export type DocxImportErrorCode = 'too-large' | 'not-docx' | 'encrypted' | 'empty';

export class DocxImportError extends Error {
  readonly code: DocxImportErrorCode;

  constructor(code: DocxImportErrorCode, message = code) {
    super(message);
    this.name = 'DocxImportError';
    this.code = code;
  }
}

export type DocxImportResult = {
  text: string;
  warnings: string[];
};

export type DocxTablesResult = {
  /** Every top-level Word table, in document order. */
  tables: string[][][];
  /** Best single grid for the table editor (merged same-width page splits). */
  primary: string[][];
  warnings: string[];
};

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06];
const ZIP_SPAN = [0x50, 0x4b, 0x07, 0x08];
const OLE_CFBF = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function bytesStartWith(buf: Uint8Array, sig: readonly number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

function isZipBuffer(buf: Uint8Array): boolean {
  return bytesStartWith(buf, ZIP_LOCAL) || bytesStartWith(buf, ZIP_EOCD) || bytesStartWith(buf, ZIP_SPAN);
}

function isOleBuffer(buf: Uint8Array): boolean {
  return bytesStartWith(buf, OLE_CFBF);
}

export function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return true;
  const mime = (file.type || '').toLowerCase();
  return mime === DOCX_OOXML_MIME;
}

export function isLegacyDocFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.docm') || name.endsWith('.dotx')) return false;
  if (name.endsWith('.doc') || name.endsWith('.dot')) return true;
  const mime = (file.type || '').toLowerCase();
  return mime === DOC_OLE_MIME;
}

type ZipReader = {
  files: Record<string, { dir?: boolean }>;
  file: (name: string) => { async: (type: 'string') => Promise<string> } | null;
};

type JSZipModule = {
  loadAsync: (data: ArrayBuffer | Uint8Array) => Promise<ZipReader>;
};

type MammothImage = { altText?: string | null };

type MammothModule = {
  convertToHtml: (
    input: { arrayBuffer: ArrayBuffer; buffer?: Uint8Array },
    options?: Record<string, unknown>,
  ) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
  images: {
    imgElement: (fn: (image: MammothImage) => Promise<{ src: string }>) => unknown;
  };
};

type MammothNode = {
  type?: string;
  breakType?: string;
  children?: MammothNode[];
  value?: string;
};

function zipEntryNames(zip: ZipReader): string[] {
  return Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
}

function zipHas(zip: ZipReader, suffix: string): boolean {
  const target = suffix.replace(/^\/+/, '').toLowerCase();
  return zipEntryNames(zip).some((n) => n.replace(/^\/+/, '').toLowerCase() === target);
}

function findDocumentXmlPath(zip: ZipReader): string | undefined {
  return zipEntryNames(zip).find((n) => /(^|\/)word\/document\.xml$/i.test(n));
}

function injectBreakSentinels(xml: string): string {
  const sentinelRun = `<w:r><w:t xml:space="preserve">${PAGE_BREAK_SENTINEL}</w:t></w:r>`;
  let out = xml.replace(/<w:br\b([^>]*)\/>|<w:br\b([^>]*)><\/w:br>/gi, (full, a: string, b: string) => {
    const attrs = `${a ?? ''}${b ?? ''}`;
    if (/w:type\s*=\s*["'](?:page|column)["']/i.test(attrs)) return sentinelRun;
    return full;
  });
  out = out.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi, (p) => {
    if (!/<w:sectPr\b/i.test(p) || p.includes(PAGE_BREAK_SENTINEL)) return p;
    return p.replace(/<\/w:p>/i, `${sentinelRun}</w:p>`);
  });
  return out;
}

function replaceBreakNodes(node: MammothNode): MammothNode {
  if (node.type === 'break' && (node.breakType === 'page' || node.breakType === 'column')) {
    return { type: 'text', value: PAGE_BREAK_SENTINEL };
  }
  if (node.children?.length) {
    return { ...node, children: node.children.map(replaceBreakNodes) };
  }
  return node;
}

function mammothInput(buffer: ArrayBuffer): { arrayBuffer: ArrayBuffer; buffer?: Uint8Array } {
  const input: { arrayBuffer: ArrayBuffer; buffer?: Uint8Array } = { arrayBuffer: buffer };
  const NodeBuffer = (globalThis as unknown as { Buffer?: { from: (u: Uint8Array) => Uint8Array } }).Buffer;
  if (NodeBuffer) {
    input.buffer = NodeBuffer.from(new Uint8Array(buffer));
  }
  return input;
}

async function loadJSZip(): Promise<JSZipModule> {
  const mod = (await import('jszip')) as unknown as { default?: JSZipModule } & JSZipModule;
  return (mod.default ?? mod) as JSZipModule;
}

async function loadMammoth(): Promise<MammothModule> {
  const mod = (await import('mammoth')) as unknown as { default?: MammothModule } & MammothModule;
  return (mod.default ?? mod) as MammothModule;
}

function collectWarnings(messages: Array<{ type: string; message: string }>): string[] {
  return messages
    .filter((m) => m.message)
    .map((m) => m.message);
}

/**
 * Convert mammoth HTML (and a few other block tags) into Graham editor source text.
 * Exported for unit tests of the post-processor (images, links, lists, headings).
 */
export function docxHtmlToEditorText(html: string): string {
  const nodes = parseHtmlFragment(html);
  const blocks = renderNodesAsBlocks(nodes);
  return finalizeEditorText(blocks.join('\n\n'));
}

function finalizeEditorText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(PAGE_BREAK_SENTINEL)
    .map((part) => part.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').trim())
    .filter((part) => part.length > 0)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type HtmlNode =
  | { type: 'text'; value: string }
  | { type: 'element'; name: string; attrs: Record<string, string>; children: HtmlNode[] };

const VOID_TAGS = new Set(['br', 'img', 'hr', 'col', 'wbr']);

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([:@A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

function parseHtmlFragment(html: string): HtmlNode[] {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  const root: HtmlNode[] = [];
  const stack: Array<{ name: string; attrs: Record<string, string>; children: HtmlNode[] }> = [];

  const currentChildren = (): HtmlNode[] => (stack.length ? stack[stack.length - 1].children : root);

  const re = /<(\/)?([A-Za-z][\w:-]*)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    if (m[4] != null) {
      currentChildren().push({ type: 'text', value: decodeEntities(m[4]) });
      continue;
    }
    const name = m[2].toLowerCase();
    const closing = Boolean(m[1]);
    const attrRaw = m[3] ?? '';
    const selfClosing = VOID_TAGS.has(name) || /\/\s*$/.test(attrRaw);
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const el = { name, attrs: parseAttrs(attrRaw), children: [] as HtmlNode[] };
    currentChildren().push({ type: 'element', ...el });
    if (!selfClosing) stack.push(el);
  }
  return root;
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, ent: string) => {
    if (ent[0] === '#') {
      const hex = ent[1] === 'x' || ent[1] === 'X';
      const code = hex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code)) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    }
    switch (ent) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
      case 'rsquo':
        return "'";
      case 'nbsp':
        return ' ';
      case 'ndash':
        return '–';
      case 'mdash':
        return '—';
      default:
        return `&${ent};`;
    }
  });
}

function isBlockName(name: string): boolean {
  return (
    name === 'p' ||
    name === 'div' ||
    name === 'blockquote' ||
    name === 'pre' ||
    name === 'table' ||
    name === 'ul' ||
    name === 'ol' ||
    name === 'h1' ||
    name === 'h2' ||
    name === 'h3' ||
    name === 'h4' ||
    name === 'h5' ||
    name === 'h6' ||
    name === 'tr' ||
    name === 'li'
  );
}

function collapseInlineWs(s: string): string {
  return s.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function renderInline(nodes: HtmlNode[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.value;
      continue;
    }
    if (node.name === 'br') {
      out += '\n';
      continue;
    }
    if (node.name === 'img') {
      const alt = (node.attrs.alt || '').trim();
      if (alt) out += `[Image: ${alt}]`;
      continue;
    }
    if (node.name === 'a') {
      out += renderInline(node.children);
      continue;
    }
    out += renderInline(node.children);
  }
  return out;
}

function renderList(node: HtmlNode & { type: 'element' }, depth: number): string[] {
  const ordered = node.name === 'ol';
  const lines: string[] = [];
  let index = 0;
  for (const child of node.children) {
    if (child.type !== 'element' || child.name !== 'li') continue;
    index += 1;
    const indent = '  '.repeat(depth);
    const prefix = ordered ? `${indent}${index}. ` : `${indent}- `;
    lines.push(...renderListItem(child.children, prefix, depth));
  }
  return lines;
}

function renderListItem(children: HtmlNode[], prefix: string, depth: number): string[] {
  const lines: string[] = [];
  const leading: HtmlNode[] = [];
  const flushLeading = () => {
    if (!leading.length) return;
    const text = collapseInlineWs(renderInline(leading));
    leading.length = 0;
    if (text) lines.push(prefix + text);
  };
  for (const child of children) {
    if (child.type === 'element' && (child.name === 'ul' || child.name === 'ol')) {
      flushLeading();
      if (lines.length === 0) lines.push(prefix.trimEnd());
      lines.push(...renderList(child, depth + 1));
    } else if (child.type === 'element' && child.name === 'p') {
      flushLeading();
      const text = collapseInlineWs(renderInline(child.children));
      if (text) {
        if (lines.length === 0) lines.push(prefix + text);
        else lines.push(`${'  '.repeat(depth)}${text}`);
      }
    } else {
      leading.push(child);
    }
  }
  flushLeading();
  if (lines.length === 0) lines.push(prefix.trimEnd());
  return lines;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function collectCellBlocks(nodes: HtmlNode[]): string[] {
  const blocks: string[] = [];
  const leading: string[] = [];
  const flushLeading = () => {
    const text = collapseInlineWs(leading.join('').replace(/\s+/g, ' '));
    leading.length = 0;
    if (text) blocks.push(text);
  };
  for (const node of nodes) {
    if (node.type === 'text') {
      leading.push(node.value);
      continue;
    }
    if (node.name === 'br') {
      leading.push(' ');
      continue;
    }
    if (node.name === 'p' || node.name === 'div' || node.name === 'li' || node.name === 'h1' || node.name === 'h2' || node.name === 'h3' || node.name === 'h4' || node.name === 'h5' || node.name === 'h6') {
      flushLeading();
      const text = collapseInlineWs(renderInline(node.children).replace(/\s+/g, ' '));
      if (text) blocks.push(text);
      continue;
    }
    if (node.name === 'ul' || node.name === 'ol') {
      flushLeading();
      const lines = renderList(node, 0).map((l) => l.trim()).filter(Boolean);
      if (lines.length) blocks.push(lines.join('; '));
      continue;
    }
    if (node.name === 'table') {
      flushLeading();
      const nested = tableElementToGrid(node);
      const flat = nested
        .map((row) => row.map((c) => c.trim()).filter(Boolean).join(', '))
        .filter(Boolean)
        .join('; ');
      if (flat) blocks.push(flat);
      continue;
    }
    leading.push(renderInline([node]));
  }
  flushLeading();
  return blocks;
}

function renderCellText(cell: HtmlNode & { type: 'element' }): string {
  return collectCellBlocks(cell.children).join(' ').replace(/\s+/g, ' ').trim();
}

function collectTableRows(node: HtmlNode, into: Array<HtmlNode & { type: 'element' }>): void {
  if (node.type !== 'element') return;
  if (node.name === 'tr') {
    into.push(node);
    return;
  }
  if (node.name === 'table' && into.length > 0) {
    // Nested tables stay inside their parent cell; do not hoist their rows.
    return;
  }
  for (const child of node.children) collectTableRows(child, into);
}

/** Convert one HTML table to a rectangular print grid, preserving empty cells. */
function tableElementToGrid(node: HtmlNode & { type: 'element' }): string[][] {
  const trs: Array<HtmlNode & { type: 'element' }> = [];
  collectTableRows(node, trs);
  const occupancy: number[] = [];
  const rows: string[][] = [];

  for (const tr of trs) {
    const cells = tr.children.filter(
      (c): c is HtmlNode & { type: 'element' } =>
        c.type === 'element' && (c.name === 'td' || c.name === 'th'),
    );
    const row: string[] = [];
    let col = 0;
    let ci = 0;
    while (ci < cells.length || occupancy[col] > 0) {
      while (occupancy[col] > 0) {
        row[col] = '';
        occupancy[col] -= 1;
        col += 1;
      }
      if (ci >= cells.length) break;
      const cell = cells[ci++];
      const colspan = parsePositiveInt(cell.attrs.colspan, 1);
      const rowspan = parsePositiveInt(cell.attrs.rowspan, 1);
      const text = renderCellText(cell);
      row[col] = text;
      for (let k = 1; k < colspan; k++) {
        row[col + k] = '';
      }
      if (rowspan > 1) {
        for (let k = 0; k < colspan; k++) {
          occupancy[col + k] = Math.max(occupancy[col + k] ?? 0, rowspan - 1);
        }
      }
      col += colspan;
    }
    while (occupancy[col] > 0) {
      row[col] = '';
      occupancy[col] -= 1;
      col += 1;
    }
    if (row.some((c) => c.length > 0)) rows.push(row);
  }

  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => {
    const padded = r.slice();
    while (padded.length < colCount) padded.push('');
    return padded;
  });
}

function collectTopLevelTables(nodes: HtmlNode[], into: Array<HtmlNode & { type: 'element' }>): void {
  for (const node of nodes) {
    if (node.type !== 'element') continue;
    if (node.name === 'table') {
      into.push(node);
      continue;
    }
    collectTopLevelTables(node.children, into);
  }
}

/** All top-level HTML tables as print grids (nested tables stay inside their cell). */
export function htmlToTableGrids(html: string): string[][][] {
  const tables: Array<HtmlNode & { type: 'element' }> = [];
  collectTopLevelTables(parseHtmlFragment(html), tables);
  return tables.map(tableElementToGrid).filter((grid) => grid.length > 0);
}

function rowsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, i) => cell.trim().toLowerCase() === (b[i] ?? '').trim().toLowerCase());
}

/**
 * Join page-split Word tables that share a column count. Repeated header rows
 * (typical when a heading row repeats on each printed page) are dropped.
 */
export function mergeImportedTableGrids(tables: string[][][]): string[][] {
  const nonempty = tables.filter((t) => t.length > 0);
  if (nonempty.length === 0) return [];
  if (nonempty.length === 1) return nonempty[0].map((r) => r.slice());

  const maxCols = nonempty.reduce((m, t) => Math.max(m, t[0]?.length ?? 0), 0);
  const same = nonempty.filter((t) => (t[0]?.length ?? 0) === maxCols);
  const header = same[0][0];
  const out = same[0].map((r) => r.slice());
  for (let i = 1; i < same.length; i++) {
    let extra = same[i];
    if (extra.length && rowsEqual(extra[0], header)) extra = extra.slice(1);
    for (const row of extra) out.push(row.slice());
  }
  return out;
}

export function tableGridToTsv(grid: string[][]): string {
  return grid
    .map((row) => row.map((cell) => cell.replace(/\t/g, ' ').trim()).join('\t'))
    .join('\n');
}

function renderTable(node: HtmlNode & { type: 'element' }): string {
  return tableGridToTsv(tableElementToGrid(node));
}

function renderNodesAsBlocks(nodes: HtmlNode[]): string[] {
  const blocks: string[] = [];
  const pendingText: string[] = [];

  const flushText = () => {
    const text = collapseInlineWs(pendingText.join(''));
    pendingText.length = 0;
    if (text) blocks.push(text);
  };

  for (const node of nodes) {
    if (node.type === 'text') {
      pendingText.push(node.value);
      continue;
    }
    if (node.name === 'br') {
      pendingText.push('\n');
      continue;
    }
    if (node.name === 'img') {
      flushText();
      const alt = (node.attrs.alt || '').trim();
      if (alt) blocks.push(`[Image: ${alt}]`);
      continue;
    }
    if (node.name === 'ul' || node.name === 'ol') {
      flushText();
      const lines = renderList(node, 0);
      if (lines.length) blocks.push(lines.join('\n'));
      continue;
    }
    if (node.name === 'table') {
      flushText();
      const table = renderTable(node);
      if (table) blocks.push(table);
      continue;
    }
    if (node.name === 'thead' || node.name === 'tbody' || node.name === 'tfoot') {
      flushText();
      blocks.push(...renderNodesAsBlocks(node.children));
      continue;
    }
    if (node.name === 'li') {
      flushText();
      const text = collapseInlineWs(renderInline(node.children));
      if (text) blocks.push(`- ${text}`);
      continue;
    }
    if (isBlockName(node.name)) {
      flushText();
      const nested: HtmlNode[] = [];
      const inlineKids: HtmlNode[] = [];
      for (const c of node.children) {
        if (
          c.type === 'element' &&
          (c.name === 'ul' || c.name === 'ol' || c.name === 'table' || (isBlockName(c.name) && c.name !== 'li'))
        ) {
          nested.push(c);
        } else {
          inlineKids.push(c);
        }
      }
      const inline = collapseInlineWs(renderInline(inlineKids));
      if (inline) blocks.push(inline);
      if (nested.length) blocks.push(...renderNodesAsBlocks(nested));
      continue;
    }
    if (node.name === 'style' || node.name === 'script') continue;
    pendingText.push(renderInline(node.children));
  }
  flushText();
  return blocks.filter((b) => b.length > 0);
}

async function convertDocxToHtml(buffer: ArrayBuffer): Promise<{ html: string; warnings: string[] }> {
  if (buffer.byteLength > DOCX_MAX_BYTES) {
    throw new DocxImportError('too-large');
  }
  const bytes = new Uint8Array(buffer);
  if (isOleBuffer(bytes) || !isZipBuffer(bytes)) {
    throw new DocxImportError('not-docx');
  }

  let zip: ZipReader;
  try {
    const JSZip = await loadJSZip();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocxImportError('not-docx');
  }

  if (zipHas(zip, 'EncryptedPackage') || zipHas(zip, 'EncryptionInfo')) {
    throw new DocxImportError('encrypted');
  }

  const docPath = findDocumentXmlPath(zip);
  if (!docPath) {
    throw new DocxImportError('not-docx');
  }

  const docEntry = zip.file(docPath);
  if (!docEntry) {
    throw new DocxImportError('not-docx');
  }

  let xml: string;
  try {
    xml = await docEntry.async('string');
  } catch {
    throw new DocxImportError('not-docx');
  }

  const rewritten = injectBreakSentinels(xml);
  let mammothBuffer = buffer;
  if (rewritten !== xml) {
    // JSZip instances are mutable; rewrite the part then re-pack.
    const mutable = zip as ZipReader & {
      file: (name: string, data?: string) => unknown;
      generateAsync?: (opts: { type: 'arraybuffer' }) => Promise<ArrayBuffer>;
    };
    mutable.file(docPath, rewritten);
    if (typeof mutable.generateAsync === 'function') {
      mammothBuffer = await mutable.generateAsync({ type: 'arraybuffer' });
    }
  }

  const mammoth = await loadMammoth();
  try {
    const result = await mammoth.convertToHtml(mammothInput(mammothBuffer), {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: image.altText?.trim() ? 'gbe-skipped-image' : '',
      })),
      transformDocument: replaceBreakNodes,
      styleMap: ['comment-reference =>'],
    });
    return { html: result.value, warnings: collectWarnings(result.messages) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/encrypt/i.test(msg) || /password/i.test(msg)) {
      throw new DocxImportError('encrypted');
    }
    throw new DocxImportError('not-docx');
  }
}

export async function importDocxToEditorText(buffer: ArrayBuffer): Promise<DocxImportResult> {
  const { html, warnings } = await convertDocxToHtml(buffer);
  const text = docxHtmlToEditorText(html);
  if (!text) {
    throw new DocxImportError('empty');
  }
  return { text, warnings };
}

/**
 * Extract Word tables as print grids for the Braille Formats table editor.
 * Page-split tables with the same column count are merged (repeated headers dropped).
 */
export async function importDocxTables(buffer: ArrayBuffer): Promise<DocxTablesResult> {
  const { html, warnings } = await convertDocxToHtml(buffer);
  const tables = htmlToTableGrids(html);
  const primary = mergeImportedTableGrids(tables);
  if (primary.length === 0) {
    throw new DocxImportError('empty');
  }
  return { tables, primary, warnings };
}
