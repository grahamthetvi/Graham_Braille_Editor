/**
 * Braille Formats 2016 §11 table layout → ASCII BRF lines.
 * All cell/TN strings passed in must already be translated to ASCII braille.
 */

import {
  DEFAULT_TN_BLANK_OTHER,
  DEFAULT_TN_BLANK_SIMPLE,
  DEFAULT_TN_LINEAR,
  DEFAULT_TN_LISTED,
  DEFAULT_TN_STAIRSTEP,
  TN_INDICATOR_ASCII,
  type TableFormat,
  type TableSpec,
} from '../types/table';

/** Dot 5 guide-dot character in North American ASCII BRF. */
export const GUIDE_DOT = '"';
/** Dots 2-5 separation-line filler. */
export const SEP_FILL = '3';
/** Three guide dots for blank entries in listed/stairstep/linear. */
export const BLANK_THREE = '"""';

export type ResolvedTableFormat = Exclude<TableFormat, 'auto'>;

export interface BrailleTableInput {
  /** Translated ASCII braille cells (same shape as print TableSpec.cells). */
  cells: string[][];
  hasColumnHeadings: boolean;
  /** Resolved format (not auto). */
  format: ResolvedTableFormat;
  /** Optional translated title. */
  titleBrf?: string;
  /** Translated format-change TN body (without TN indicators). */
  tnBrf?: string;
  /** Translated blank-cell TN body; emitted when any blank body cells exist. */
  blankTnBrf?: string;
  columnGap: 1 | 2;
  guideDots: boolean;
  /** Page width in cells. */
  cellsPerRow: number;
}

export interface TableLayoutResult {
  brf: string;
  format: ResolvedTableFormat;
  /** Human-readable warnings (e.g. Auto fell back). */
  warnings: string[];
  /** True when the chosen format could not fully satisfy fit rules. */
  ok: boolean;
}

function padLeft(text: string, startCell: number): string {
  const pad = Math.max(0, startCell - 1);
  return ' '.repeat(pad) + text;
}

/** Format a paragraph at margins A-B (1-based start / runover). */
function formatParagraph(text: string, startCell: number, runoverCell: number, width: number): string[] {
  const firstWidth = Math.max(1, width - (startCell - 1));
  const runWidth = Math.max(1, width - (runoverCell - 1));
  const lines: string[] = [];
  let remaining = text;
  let first = true;
  while (remaining.length > 0) {
    const max = first ? firstWidth : runWidth;
    const start = first ? startCell : runoverCell;
    if (remaining.length <= max) {
      lines.push(padLeft(remaining, start));
      break;
    }
    // Prefer break at space within the window.
    let breakAt = remaining.lastIndexOf(' ', max);
    if (breakAt <= 0) breakAt = max;
    lines.push(padLeft(remaining.slice(0, breakAt).trimEnd(), start));
    remaining = remaining.slice(breakAt).trimStart();
    first = false;
  }
  if (lines.length === 0) lines.push(padLeft('', startCell));
  return lines;
}

export function wrapTnAscii(bodyBrf: string): string {
  const trimmed = bodyBrf.trim();
  if (!trimmed) return '';
  return `${TN_INDICATOR_ASCII}${trimmed}${TN_INDICATOR_ASCII}`;
}

function emitTnBlock(bodyBrf: string | undefined, width: number): string[] {
  if (!bodyBrf?.trim()) return [];
  const wrapped = wrapTnAscii(bodyBrf.trim());
  return formatParagraph(wrapped, 7, 5, width);
}

function splitHeadBody(cells: string[][], hasColumnHeadings: boolean): {
  headings: string[];
  body: string[][];
  colCount: number;
} {
  const colCount = cells.length > 0 ? Math.max(...cells.map((r) => r.length), 1) : 1;
  const padRow = (row: string[]) => {
    const r = row.slice();
    while (r.length < colCount) r.push('');
    return r.map((c) => c ?? '');
  };
  if (hasColumnHeadings && cells.length > 0) {
    return {
      headings: padRow(cells[0]),
      body: cells.slice(1).map(padRow),
      colCount,
    };
  }
  return {
    headings: Array.from({ length: colCount }, () => ''),
    body: cells.map(padRow),
    colCount,
  };
}

function cellLines(text: string, colWidth: number, maxLines = 2): string[] {
  const t = text.trim() === '' ? '' : text;
  if (t === '') return [''];
  if (t.length <= colWidth) return [t];
  const lines: string[] = [];
  let remaining = t;
  while (remaining.length > 0 && lines.length < maxLines) {
    const isRunover = lines.length > 0;
    const avail = isRunover ? Math.max(1, colWidth - 2) : colWidth;
    if (remaining.length <= avail) {
      lines.push(isRunover ? '  ' + remaining : remaining);
      remaining = '';
      break;
    }
    let breakAt = remaining.lastIndexOf(' ', avail);
    if (breakAt <= 0) breakAt = avail;
    const chunk = remaining.slice(0, breakAt).trimEnd();
    lines.push(isRunover ? '  ' + chunk : chunk);
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length > 0 && lines.length > 0) {
    // Truncate overflow into last line indicator — keep within width.
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.slice(0, colWidth);
  }
  return lines.length ? lines : [''];
}

function fitsSimple(
  headings: string[],
  body: string[][],
  colCount: number,
  gap: number,
  width: number
): { ok: boolean; colWidths: number[] } {
  const colWidths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    let max = headings[c]?.length ?? 0;
    for (const row of body) {
      const len = row[c]?.length ?? 0;
      if (len > max) max = len;
    }
    // Cap extreme single-cell lengths so we still try wrapping within page.
    colWidths.push(Math.max(1, Math.min(max, width)));
  }

  // Shrink columns proportionally if needed until sum fits or we give up.
  const totalNeeded = () => colWidths.reduce((a, b) => a + b, 0) + gap * (colCount - 1);
  if (totalNeeded() <= width) {
    // Check ≤2-line wrap feasibility at these widths (use half width as min for wrap test).
    return { ok: true, colWidths };
  }

  // Try reducing widest columns until fit.
  let guard = 0;
  while (totalNeeded() > width && guard < 200) {
    guard++;
    let widest = 0;
    for (let i = 1; i < colWidths.length; i++) {
      if (colWidths[i] > colWidths[widest]) widest = i;
    }
    if (colWidths[widest] <= 1) break;
    colWidths[widest]--;
  }

  if (totalNeeded() > width) {
    return { ok: false, colWidths };
  }

  // Verify every cell fits in ≤2 lines at these widths.
  for (let c = 0; c < colCount; c++) {
    const w = colWidths[c];
    if ((headings[c]?.length ?? 0) > w * 2) return { ok: false, colWidths };
    for (const row of body) {
      const len = row[c]?.length ?? 0;
      // With runover indent, capacity ≈ w + (w-2)
      const capacity = w + Math.max(1, w - 2);
      if (len > capacity) return { ok: false, colWidths };
    }
  }
  return { ok: true, colWidths };
}

function separationLine(colWidth: number): string {
  if (colWidth <= 0) return '';
  return GUIDE_DOT + SEP_FILL.repeat(colWidth - 1);
}

function applyGuideDots(text: string, colWidth: number, guideDots: boolean): string {
  if (!guideDots) {
    return text.padEnd(colWidth, ' ').slice(0, colWidth);
  }
  if (text.trim() === '') {
    return GUIDE_DOT.repeat(colWidth);
  }
  const content = text;
  const remaining = colWidth - content.length;
  if (remaining >= 3) {
    // 1 blank + ≥2 guide dots
    return content + ' ' + GUIDE_DOT.repeat(remaining - 1);
  }
  return content.padEnd(colWidth, ' ').slice(0, colWidth);
}

function layoutSimple(input: BrailleTableInput, headings: string[], body: string[][], colCount: number): TableLayoutResult {
  const W = input.cellsPerRow;
  const gap = input.columnGap;
  const fit = fitsSimple(headings, body, colCount, gap, W);
  const warnings: string[] = [];
  if (!fit.ok) {
    warnings.push('Simple table does not fit the page width with ≤2-line cells.');
  }
  const colWidths = fit.colWidths;
  const lines: string[] = [];

  if (input.titleBrf?.trim()) {
    const t = input.titleBrf.trim();
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    lines.push(' '.repeat(pad) + t.slice(0, W));
    lines.push('');
  }

  const hasAnyHeading = headings.some((h) => h.trim() !== '');
  if (hasAnyHeading) {
    // Heading row: left-justify each heading in its column; no guide dots between headings.
    const headParts: string[] = [];
    for (let c = 0; c < colCount; c++) {
      const h = (headings[c] ?? '').slice(0, colWidths[c]);
      headParts.push(h.padEnd(colWidths[c], ' '));
    }
    lines.push(headParts.join(' '.repeat(gap)).slice(0, W));

    // Separation lines under headed columns only.
    const sepParts: string[] = [];
    for (let c = 0; c < colCount; c++) {
      if ((headings[c] ?? '').trim() !== '') {
        sepParts.push(separationLine(colWidths[c]));
      } else {
        sepParts.push(' '.repeat(colWidths[c]));
      }
    }
    lines.push(sepParts.join(' '.repeat(gap)).slice(0, W));
  }

  for (const row of body) {
    const perColLines = row.map((cell, c) => {
      const w = colWidths[c];
      if ((cell ?? '').trim() === '') {
        return [input.guideDots ? GUIDE_DOT.repeat(w) : ' '.repeat(w)];
      }
      const wrapped = cellLines(cell, w, 2);
      return wrapped.map((ln, idx) => {
        // Guide dots only on first line of the cell (not runovers of cols 2+).
        if (idx === 0) return applyGuideDots(ln, w, input.guideDots);
        return ln.padEnd(w, ' ').slice(0, w);
      });
    });
    const lineCount = Math.max(...perColLines.map((l) => l.length));
    for (let li = 0; li < lineCount; li++) {
      const parts: string[] = [];
      for (let c = 0; c < colCount; c++) {
        const chunk = perColLines[c][li] ?? ' '.repeat(colWidths[c]);
        parts.push(chunk.padEnd(colWidths[c], ' ').slice(0, colWidths[c]));
      }
      lines.push(parts.join(' '.repeat(gap)).slice(0, W));
    }
  }

  // Blank-cell TN after table when needed.
  const hasBlank = body.some((row) => row.some((c) => (c ?? '').trim() === ''));
  if (hasBlank && input.blankTnBrf?.trim()) {
    lines.push('');
    lines.push(...emitTnBlock(input.blankTnBrf, W));
  }

  lines.push(''); // blank line after table
  return {
    brf: lines.join('\n').replace(/\n+$/, '\n'),
    format: 'simple',
    warnings,
    ok: fit.ok,
  };
}

function colonJoin(heading: string, entry: string): string {
  const h = heading.trim() || 'col';
  const e = entry.trim() === '' ? BLANK_THREE : entry;
  return `${h}: ${e}`;
}

function layoutListed(input: BrailleTableInput, headings: string[], body: string[][], colCount: number): TableLayoutResult {
  const W = input.cellsPerRow;
  const lines: string[] = [];
  const warnings: string[] = [];

  if (input.titleBrf?.trim()) {
    const t = input.titleBrf.trim();
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    lines.push(' '.repeat(pad) + t.slice(0, W));
    lines.push('');
  }

  const tn = input.tnBrf?.trim() || '';
  if (tn) {
    lines.push(...emitTnBlock(tn, W));
    lines.push('');
  }

  for (let ri = 0; ri < body.length; ri++) {
    if (ri > 0) lines.push('');
    const row = body[ri];
    // First pair at cell 5: Col1Heading: row heading
    const first = colonJoin(headings[0] || 'col1', row[0] ?? '');
    lines.push(...formatParagraph(first, 5, 5, W));

    for (let c = 1; c < colCount; c++) {
      const entry = row[c] ?? '';
      const label = headings[c] || `col${c + 1}`;
      if (entry.trim() === '') {
        lines.push(...formatParagraph(`${label}: ${BLANK_THREE}`, 1, 3, W));
      } else if (entry.length + label.length + 2 > W - 0) {
        // Multi-line under heading: heading alone 1-5, entries 3-5
        lines.push(...formatParagraph(`${label}:`, 1, 5, W));
        lines.push(...formatParagraph(entry, 3, 5, W));
      } else {
        lines.push(...formatParagraph(colonJoin(label, entry), 1, 3, W));
      }
    }
  }

  const hasBlank = body.some((row) => row.some((c) => (c ?? '').trim() === ''));
  if (hasBlank && input.blankTnBrf?.trim()) {
    lines.push('');
    lines.push(...emitTnBlock(input.blankTnBrf, W));
  }

  lines.push('');
  return { brf: lines.join('\n').replace(/\n+$/, '\n'), format: 'listed', warnings, ok: true };
}

const STAIR_MARGINS: Array<[number, number]> = [
  [1, 1],
  [3, 3],
  [5, 5],
  [7, 7],
];

function layoutStairstep(input: BrailleTableInput, headings: string[], body: string[][], colCount: number): TableLayoutResult {
  const W = input.cellsPerRow;
  const warnings: string[] = [];
  if (colCount > 4) {
    return {
      brf: '',
      format: 'stairstep',
      warnings: ['Stairstep tables support at most 4 columns.'],
      ok: false,
    };
  }
  const lines: string[] = [];

  if (input.titleBrf?.trim()) {
    const t = input.titleBrf.trim();
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    lines.push(' '.repeat(pad) + t.slice(0, W));
    lines.push('');
  }

  const tnIntro = input.tnBrf?.trim() || DEFAULT_TN_STAIRSTEP;
  // Intro at 7-5, then stair of headings (closing TN after last heading).
  lines.push(...emitTnBlock(tnIntro, W));
  lines.push('');
  for (let c = 0; c < colCount; c++) {
    const [start, run] = STAIR_MARGINS[c];
    let text = headings[c]?.trim() || `col${c + 1}`;
    if (c === colCount - 1) {
      text = wrapTnAscii(text);
    }
    lines.push(...formatParagraph(text, start, run, W));
  }
  lines.push('');

  for (const row of body) {
    for (let c = 0; c < colCount; c++) {
      const [start, run] = STAIR_MARGINS[c];
      const raw = row[c] ?? '';
      const text = raw.trim() === '' ? BLANK_THREE : raw;
      lines.push(...formatParagraph(text, start, run, W));
    }
  }

  const hasBlank = body.some((row) => row.some((c) => (c ?? '').trim() === ''));
  if (hasBlank && input.blankTnBrf?.trim()) {
    lines.push('');
    lines.push(...emitTnBlock(input.blankTnBrf, W));
  }

  lines.push('');
  return { brf: lines.join('\n').replace(/\n+$/, '\n'), format: 'stairstep', warnings, ok: true };
}

function linearPunctuationConflict(cells: string[][]): boolean {
  for (const row of cells) {
    for (const cell of row) {
      if (cell.includes(':') || cell.includes(';')) return true;
    }
  }
  return false;
}

function layoutLinear(input: BrailleTableInput, headings: string[], body: string[][], colCount: number): TableLayoutResult {
  const W = input.cellsPerRow;
  const warnings: string[] = [];

  const lines: string[] = [];
  if (input.titleBrf?.trim()) {
    const t = input.titleBrf.trim();
    const pad = Math.max(0, Math.floor((W - t.length) / 2));
    lines.push(' '.repeat(pad) + t.slice(0, W));
    lines.push('');
  }

  const tnIntro = input.tnBrf?.trim() || DEFAULT_TN_LINEAR;
  lines.push(...emitTnBlock(tnIntro, W));
  lines.push('');

  const field = (text: string, isFirst: boolean, isLast: boolean): string => {
    const v = text.trim() === '' ? BLANK_THREE : text;
    if (isFirst) return `${v}:`;
    if (isLast) return ` ${v}`;
    return ` ${v};`;
  };

  const joinRow = (row: string[]): string => {
    let s = '';
    for (let c = 0; c < colCount; c++) {
      s += field(row[c] ?? '', c === 0, c === colCount - 1);
    }
    return s;
  };

  // Legend of headings
  const legendParts: string[] = [];
  for (let c = 0; c < colCount; c++) {
    const h = headings[c]?.trim() || `col${c + 1}`;
    if (c === 0) legendParts.push(`${h}:`);
    else if (c === colCount - 1) legendParts.push(` ${h}`);
    else legendParts.push(` ${h};`);
  }
  lines.push(...formatParagraph(legendParts.join(''), 1, 3, W));
  lines.push('');

  for (const row of body) {
    lines.push(...formatParagraph(joinRow(row), 1, 3, W));
  }

  const hasBlank = body.some((row) => row.some((c) => (c ?? '').trim() === ''));
  if (hasBlank && input.blankTnBrf?.trim()) {
    lines.push('');
    lines.push(...emitTnBlock(input.blankTnBrf, W));
  }

  lines.push('');
  return { brf: lines.join('\n').replace(/\n+$/, '\n'), format: 'linear', warnings, ok: true };
}

function looksNumberHeavy(body: string[][]): boolean {
  let total = 0;
  let numeric = 0;
  for (const row of body) {
    for (const cell of row) {
      const t = cell.trim();
      if (!t) continue;
      total++;
      // ASCII braille numbers often start with '#' (numeric indicator).
      if (/^#/.test(t) || /^[\d#\-.,]+$/.test(t)) numeric++;
    }
  }
  return total > 0 && numeric / total >= 0.6;
}

/**
 * Resolve Auto → concrete format using fit / column heuristics on braille cell widths.
 * Linear :/; conflict uses `printHeadings`/`printBody` when provided, else braille cells.
 */
export function resolveAutoFormat(
  headings: string[],
  body: string[][],
  colCount: number,
  gap: 1 | 2,
  width: number,
  printHeadings?: string[],
  printBody?: string[][]
): { format: ResolvedTableFormat; warnings: string[] } {
  const warnings: string[] = [];
  const punctHeadings = printHeadings ?? headings;
  const punctBody = printBody ?? body;
  const simpleFit = fitsSimple(headings, body, colCount, gap, width);
  if (simpleFit.ok) {
    return { format: 'simple', warnings };
  }
  warnings.push('Simple table does not fit; trying an alternate format.');

  if (colCount <= 4 && !looksNumberHeavy(body)) {
    return { format: 'stairstep', warnings };
  }

  // Prefer Listed when Simple does not fit; Linear only if punctuation allows and user picks it.
  if (linearPunctuationConflict([punctHeadings, ...punctBody])) {
    warnings.push('Falling back to listed table.');
  }
  return { format: 'listed', warnings };
}

export function layoutBrailleTable(input: BrailleTableInput): TableLayoutResult {
  const { headings, body, colCount } = splitHeadBody(input.cells, input.hasColumnHeadings);
  if (input.format === 'linear' && linearPunctuationConflict([headings, ...body])) {
    return {
      brf: '',
      format: 'linear',
      warnings: ['Linear tables cannot be used when cell text contains : or ;.'],
      ok: false,
    };
  }
  return layoutResolved({ ...input, format: input.format }, headings, body, colCount);
}

function layoutResolved(
  input: BrailleTableInput,
  headings: string[],
  body: string[][],
  colCount: number
): TableLayoutResult {
  switch (input.format) {
    case 'simple':
      return layoutSimple(input, headings, body, colCount);
    case 'listed':
      return layoutListed(input, headings, body, colCount);
    case 'stairstep':
      return layoutStairstep(input, headings, body, colCount);
    case 'linear':
      return layoutLinear(input, headings, body, colCount);
    default:
      return layoutSimple(input, headings, body, colCount);
  }
}

/**
 * Build BRF from a TableSpec whose print cells/notes have already been
 * mapped to ASCII braille (same indices). Resolves `auto` when needed.
 * Linear punctuation conflict is evaluated on **print** cells when provided.
 */
export function generateTableBrf(
  spec: Pick<TableSpec, 'hasColumnHeadings' | 'format' | 'columnGap' | 'guideDots'> & {
    /** Print cells for Linear :/; guard (preferred). */
    cells?: string[][];
  },
  translated: {
    cells: string[][];
    titleBrf?: string;
    tnBrf?: string;
    blankTnBrf?: string;
  },
  cellsPerRow: number
): TableLayoutResult {
  const { headings, body, colCount } = splitHeadBody(translated.cells, spec.hasColumnHeadings);
  const printSplit = spec.cells
    ? splitHeadBody(spec.cells, spec.hasColumnHeadings)
    : { headings, body, colCount };
  const warnings: string[] = [];
  let format: ResolvedTableFormat;

  if (spec.format === 'auto') {
    const resolved = resolveAutoFormat(
      headings,
      body,
      colCount,
      spec.columnGap,
      cellsPerRow,
      printSplit.headings,
      printSplit.body
    );
    format = resolved.format;
    warnings.push(...resolved.warnings);
  } else {
    format = spec.format;
  }

  if (format === 'linear' && linearPunctuationConflict([printSplit.headings, ...printSplit.body])) {
    return {
      brf: '',
      format: 'linear',
      warnings: ['Linear tables cannot be used when cell text contains : or ;.'],
      ok: false,
    };
  }

  const result = layoutResolved(
    {
      cells: translated.cells,
      hasColumnHeadings: spec.hasColumnHeadings,
      format,
      titleBrf: translated.titleBrf,
      tnBrf: translated.tnBrf,
      blankTnBrf: translated.blankTnBrf,
      columnGap: spec.columnGap,
      guideDots: spec.guideDots,
      cellsPerRow,
    },
    headings,
    body,
    colCount
  );
  return {
    ...result,
    warnings: [...warnings, ...result.warnings],
  };
}

/** Default print TN for a format (used by the modal before translation). */
export function defaultTnForFormat(format: ResolvedTableFormat | 'auto'): string {
  switch (format) {
    case 'listed':
      return DEFAULT_TN_LISTED;
    case 'stairstep':
      return DEFAULT_TN_STAIRSTEP;
    case 'linear':
      return DEFAULT_TN_LINEAR;
    default:
      return '';
  }
}

export function defaultBlankTnForFormat(format: ResolvedTableFormat | 'auto'): string {
  if (format === 'simple' || format === 'auto') return DEFAULT_TN_BLANK_SIMPLE;
  return DEFAULT_TN_BLANK_OTHER;
}

/** Fence the BRF for insertion into the editor. */
export function formatTableInsertBlock(brf: string): string {
  const body = brf.replace(/^\n+/, '').replace(/\n+$/, '');
  return `:::table\n${body}\n:::\n`;
}
