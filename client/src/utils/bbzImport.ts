/**
 * BrailleBlaster BBZ (.bbz) → Graham editor plain text.
 *
 * A BBZ is a ZIP archive with a `bbx_location` pointer to a BBX XML document.
 * For editable import (option B), we extract print text from `<BLOCK>` nodes and
 * preserve blank lines from `<utd:newLine/>`. Files are parsed locally; nothing
 * is uploaded.
 */

export const BBZ_MAX_BYTES = 25 * 1024 * 1024;

export const BBZ_LOCATION_FILE = 'bbx_location';

export type BbzImportErrorCode = 'too-large' | 'not-bbz' | 'invalid-bbx' | 'empty';

export class BbzImportError extends Error {
  readonly code: BbzImportErrorCode;

  constructor(code: BbzImportErrorCode, message: string = code) {
    super(message);
    this.name = 'BbzImportError';
    this.code = code;
  }
}

export type BbzImportResult = {
  text: string;
  /** BBX path inside the archive (from bbx_location). */
  bbxPath: string;
};

type ZipReader = {
  files: Record<string, { dir?: boolean }>;
  file: (name: string) => { async: (type: 'string' | 'uint8array') => Promise<string | Uint8Array> } | null;
};

type JSZipModule = {
  loadAsync: (data: ArrayBuffer | Uint8Array) => Promise<ZipReader>;
};

const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EOCD = [0x50, 0x4b, 0x05, 0x06];

function bytesStartWith(buf: Uint8Array, sig: readonly number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

function isZipBuffer(buf: Uint8Array): boolean {
  return bytesStartWith(buf, ZIP_LOCAL) || bytesStartWith(buf, ZIP_EOCD);
}

async function loadJSZip(): Promise<JSZipModule> {
  const mod = (await import('jszip')) as unknown as { default?: JSZipModule } & JSZipModule;
  return (mod.default ?? mod) as JSZipModule;
}

export function isBbzFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.bbz');
}

/** Normalize a path from bbx_location for JSZip lookup. */
export function normalizeZipEntryPath(raw: string): string {
  const trimmed = raw.trim().replace(/\\/g, '/');
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

function stripXmlTags(inner: string): string {
  return inner.replace(/<[^>]+>/g, '');
}

/**
 * Extract Graham editor plain text from BrailleBlaster BBX XML.
 * Walks document order: each BLOCK is one line; utd:newLine inserts a blank line.
 */
export function bbxXmlToEditorText(bbxXml: string): string {
  const headEnd = bbxXml.indexOf('</head>');
  const body = headEnd >= 0 ? bbxXml.slice(headEnd + '</head>'.length) : bbxXml;

  const blockRe = /<BLOCK(?:\s[^>]*?)>([\s\S]*?)<\/BLOCK>|<utd:newLine\s*\/?>/g;
  let result = '';
  let match: RegExpExecArray | null;
  let foundContent = false;

  while ((match = blockRe.exec(body)) !== null) {
    if (match[0].startsWith('<BLOCK')) {
      const text = decodeXmlEntities(stripXmlTags(match[1] ?? '')).replace(/\r\n/g, '\n');
      if (!text.trim()) continue;
      if (result.length > 0) result += '\n';
      result += text;
      foundContent = true;
    } else {
      if (result.length > 0) result += '\n';
      foundContent = true;
    }
  }

  if (!foundContent || !result.trim()) {
    throw new BbzImportError('empty');
  }

  return result.trimEnd();
}

function zipHasEntry(zip: ZipReader, path: string): boolean {
  const normalized = normalizeZipEntryPath(path);
  if (zip.files[normalized]) return true;
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return Boolean(zip.files[withSlash]);
}

async function readZipText(zip: ZipReader, path: string): Promise<string> {
  const normalized = normalizeZipEntryPath(path);
  const candidates = [normalized, `/${normalized}`];
  for (const candidate of candidates) {
    const entry = zip.file(candidate);
    if (entry) {
      const data = await entry.async('string');
      return typeof data === 'string' ? data : new TextDecoder('utf-8').decode(data);
    }
  }
  throw new BbzImportError('not-bbz', `Missing ${path} in BBZ archive`);
}

async function resolveBbxPath(zip: ZipReader): Promise<string> {
  const locationRaw = (await readZipText(zip, BBZ_LOCATION_FILE)).trim();
  if (!locationRaw) {
    throw new BbzImportError('not-bbz', 'bbx_location is empty');
  }
  const bbxPath = normalizeZipEntryPath(locationRaw);
  if (!zipHasEntry(zip, bbxPath)) {
    throw new BbzImportError('not-bbz', `BBX not found at ${locationRaw}`);
  }
  return bbxPath;
}

/**
 * Parse a BBZ buffer and return editable plain text extracted from its BBX document.
 */
export async function importBbzToEditorText(buffer: ArrayBuffer): Promise<BbzImportResult> {
  const bytes = new Uint8Array(buffer);
  if (!isZipBuffer(bytes)) {
    throw new BbzImportError('not-bbz');
  }

  let zip: ZipReader;
  try {
    const JSZip = await loadJSZip();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new BbzImportError('not-bbz');
  }

  if (!zipHasEntry(zip, BBZ_LOCATION_FILE)) {
    throw new BbzImportError('not-bbz', 'bbx_location not found');
  }

  const bbxPath = await resolveBbxPath(zip);
  let bbxXml: string;
  try {
    bbxXml = await readZipText(zip, bbxPath);
  } catch (err) {
    if (err instanceof BbzImportError) throw err;
    throw new BbzImportError('invalid-bbx');
  }

  if (!bbxXml.trim() || !bbxXml.includes('<bbdoc')) {
    throw new BbzImportError('invalid-bbx');
  }

  let text: string;
  try {
    text = bbxXmlToEditorText(bbxXml);
  } catch (err) {
    if (err instanceof BbzImportError) throw err;
    throw new BbzImportError('invalid-bbx');
  }

  return { text, bbxPath };
}
