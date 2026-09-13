/**
 * Structured table data for the Braille Formats table editor.
 * Editor fences store print (untranslated) cells; the preview worker
 * translates them to ASCII BRF and applies Braille Formats layout.
 */

export type TableFormat = 'auto' | 'simple' | 'listed' | 'stairstep' | 'linear';

export interface TableSpec {
  /** Print (untranslated) cell text; row-major. */
  cells: string[][];
  /** When true, row 0 is column headings. */
  hasColumnHeadings: boolean;
  format: TableFormat;
  /** Optional centered table title (print). */
  title?: string;
  /**
   * Editable format-change / blank-cell TN prose (print).
   * Empty string means use the default for the resolved format.
   */
  transcriberNote?: string;
  /** Blank-cell TN prose; empty means use default when blanks exist. */
  blankCellNote?: string;
  /** Gap between simple-table columns (cells). */
  columnGap: 1 | 2;
  /** Whether to insert guide dots in simple tables. */
  guideDots: boolean;
}

export const TABLE_LIMITS = {
  minRows: 1,
  maxRows: 200,
  minCols: 1,
  maxCols: 20,
} as const;

export interface TableValidationResult {
  ok: boolean;
  errors: string[];
}

export const DEFAULT_TN_LISTED =
  'Print format is changed. Row headings are blocked in cell 5; column headings begin in cell 1. All headings are repeated for clarity. A colon separates headings from table entries.';

export const DEFAULT_TN_STAIRSTEP = 'Table changed as follows:';

export const DEFAULT_TN_LINEAR = 'Columns follow one another in this order:';

export const DEFAULT_TN_BLANK_SIMPLE =
  'A series of guide dots across the width of a column indicates a blank space.';

export const DEFAULT_TN_BLANK_OTHER =
  'A series of three guide dots indicates a blank entry.';

/** ASCII BRF: UEB transcriber's note indicators (dots 6, 3). */
export const TN_INDICATOR_ASCII = ",'";

export function createEmptyGrid(rows: number, cols: number): string[][] {
  const r = Math.max(TABLE_LIMITS.minRows, Math.min(TABLE_LIMITS.maxRows, rows));
  const c = Math.max(TABLE_LIMITS.minCols, Math.min(TABLE_LIMITS.maxCols, cols));
  return Array.from({ length: r }, () => Array.from({ length: c }, () => ''));
}

export function resizeGrid(cells: string[][], rows: number, cols: number): string[][] {
  const r = Math.max(TABLE_LIMITS.minRows, Math.min(TABLE_LIMITS.maxRows, rows));
  const c = Math.max(TABLE_LIMITS.minCols, Math.min(TABLE_LIMITS.maxCols, cols));
  const next: string[][] = [];
  for (let i = 0; i < r; i++) {
    const row: string[] = [];
    for (let j = 0; j < c; j++) {
      row.push(cells[i]?.[j] ?? '');
    }
    next.push(row);
  }
  return next;
}

export function defaultTableSpec(rows = 3, cols = 3): TableSpec {
  return {
    cells: createEmptyGrid(rows, cols),
    hasColumnHeadings: true,
    format: 'auto',
    columnGap: 2,
    guideDots: true,
  };
}

export function validateTableSpec(spec: TableSpec): TableValidationResult {
  const errors: string[] = [];
  const rowCount = spec.cells.length;
  if (rowCount < TABLE_LIMITS.minRows || rowCount > TABLE_LIMITS.maxRows) {
    errors.push(`Rows must be between ${TABLE_LIMITS.minRows} and ${TABLE_LIMITS.maxRows}.`);
  }
  const colCount = rowCount > 0 ? Math.max(...spec.cells.map((r) => r.length)) : 0;
  if (colCount < TABLE_LIMITS.minCols || colCount > TABLE_LIMITS.maxCols) {
    errors.push(`Columns must be between ${TABLE_LIMITS.minCols} and ${TABLE_LIMITS.maxCols}.`);
  }
  if (spec.hasColumnHeadings && rowCount < 2) {
    errors.push('Add at least one body row when the first row is column headings.');
  }
  if (spec.format === 'stairstep' && colCount > 4) {
    errors.push('Stairstep tables support at most 4 columns.');
  }
  if (spec.format === 'linear') {
    const hasPunct = spec.cells.some((row) =>
      row.some((cell) => cell.includes(':') || cell.includes(';'))
    );
    if (hasPunct) {
      errors.push('Linear tables cannot be used when cell text contains : or ;.');
    }
  }
  if (spec.columnGap !== 1 && spec.columnGap !== 2) {
    errors.push('Column gap must be 1 or 2 cells.');
  }
  return { ok: errors.length === 0, errors };
}

export function tableHasBlankCells(spec: TableSpec): boolean {
  const start = spec.hasColumnHeadings ? 1 : 0;
  for (let i = start; i < spec.cells.length; i++) {
    for (const cell of spec.cells[i]) {
      if (cell.trim() === '') return true;
    }
  }
  return false;
}

/**
 * Detect dominant delimiter among comma, semicolon, and tab by counting
 * unquoted occurrences on the first non-empty line.
 */
function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ',') commas++;
    else if (ch === ';') semis++;
    else if (ch === '\t') tabs++;
  }
  if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/**
 * Parse one CSV line with RFC-style double-quote escaping.
 */
export function parseCsvLine(line: string, delimiter: ',' | ';' | '\t'): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Fold Word/PDF "copy as text" wrap lines into the previous row when the
 * first cell is empty and a previous row exists — typical of indented wrapped columns.
 */
export function mergeTabContinuationRows(rows: string[][]): string[][] {
  const out: string[][] = [];
  for (const row of rows) {
    const first = (row[0] ?? '').trim();
    const hasLater = row.slice(1).some((c) => (c ?? '').trim() !== '');
    if (out.length > 0 && first === '' && (hasLater || row.length === 1)) {
      const prev = out[out.length - 1];
      const width = Math.max(prev.length, row.length);
      while (prev.length < width) prev.push('');
      for (let i = 0; i < row.length; i++) {
        const piece = (row[i] ?? '').trim();
        if (!piece) continue;
        prev[i] = prev[i].trim() ? `${prev[i].trim()} ${piece}` : piece;
      }
      continue;
    }
    out.push(row.slice());
  }
  return out;
}

export interface ParseTableCsvResult {
  cells: string[][];
  rowCount: number;
  columnCount: number;
  error?: string;
}

/**
 * Parse CSV / TSV / semicolon text into a string grid.
 * Pads ragged rows to the max column count. Enforces TABLE_LIMITS.
 */
export function parseTableCsv(csv: string): ParseTableCsvResult {
  const rawLines = csv.split(/\r?\n/);
  const lines = rawLines.filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { cells: [], rowCount: 0, columnCount: 0, error: 'No data found in CSV.' };
  }

  const delimiter = detectDelimiter(lines[0]);
  let parsed = lines.map((line) => parseCsvLine(line, delimiter));
  // Word/PDF "copy as text" wraps cells onto following lines, often with leading
  // tabs (empty leading columns). Fold those continuation lines into the prior row.
  if (delimiter === '\t') {
    parsed = mergeTabContinuationRows(parsed);
  }
  const columnCount = Math.max(...parsed.map((r) => r.length));

  if (columnCount > TABLE_LIMITS.maxCols) {
    return {
      cells: [],
      rowCount: parsed.length,
      columnCount,
      error: `Too many columns (maximum ${TABLE_LIMITS.maxCols}).`,
    };
  }
  if (parsed.length > TABLE_LIMITS.maxRows) {
    return {
      cells: [],
      rowCount: parsed.length,
      columnCount,
      error: `Too many rows (maximum ${TABLE_LIMITS.maxRows}).`,
    };
  }

  const cells = parsed.map((row) => {
    const padded = row.slice();
    while (padded.length < columnCount) padded.push('');
    return padded.slice(0, columnCount);
  });

  return {
    cells,
    rowCount: cells.length,
    columnCount,
  };
}

/** Serialize a print grid as TSV (tabs in cells become spaces). */
export function tableGridToTsv(grid: string[][]): string {
  return grid
    .map((row) => row.map((cell) => cell.replace(/\t/g, ' ').trim()).join('\t'))
    .join('\n');
}

/** Opening-line token that marks a `:::table` fence as print source (not pre-translated BRF). */
export const PRINT_TABLE_FENCE_MARK = 'print';

export function isPrintTableFenceParams(params: string): boolean {
  const attrs = parseFenceAttrs(params);
  return attrs.print !== undefined || attrs.source === 'print';
}

function parseFenceAttrs(params: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(params))) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? '1';
  }
  return out;
}

function tableFormatToken(format: TableFormat): string {
  switch (format) {
    case 'auto':
    case 'simple':
    case 'listed':
    case 'stairstep':
    case 'linear':
      return format;
    default: {
      const _never: never = format;
      return _never;
    }
  }
}

function parseTableFormatAttr(raw: string | undefined): TableFormat {
  switch (raw) {
    case 'simple':
      return 'simple';
    case 'listed':
      return 'listed';
    case 'stairstep':
      return 'stairstep';
    case 'linear':
      return 'linear';
    case 'auto':
    case undefined:
    case '':
      return 'auto';
    default:
      return 'auto';
  }
}

function escapeFenceMeta(s: string): string {
  return s.replace(/\r?\n/g, ' ').trim();
}

/**
 * Encode a print TableSpec as a `:::table print …` editor fence (TSV body).
 * The braille worker translates this on preview; the left pane stays readable.
 */
export function formatPrintTableInsertBlock(spec: TableSpec): string {
  const headings = spec.hasColumnHeadings ? 1 : 0;
  const dots = spec.guideDots ? 1 : 0;
  const header = `:::table ${PRINT_TABLE_FENCE_MARK} format=${tableFormatToken(spec.format)} headings=${headings} gap=${spec.columnGap} dots=${dots}`;
  const meta: string[] = [];
  if (spec.title?.trim()) meta.push(`@title ${escapeFenceMeta(spec.title)}`);
  if (spec.transcriberNote?.trim()) meta.push(`@tn ${escapeFenceMeta(spec.transcriberNote)}`);
  if (spec.blankCellNote?.trim()) meta.push(`@blank ${escapeFenceMeta(spec.blankCellNote)}`);
  const tsv = tableGridToTsv(spec.cells);
  const body = [...meta, tsv].filter((line) => line.length > 0).join('\n');
  return `${header}\n${body}\n:::\n`;
}

/**
 * Parse a print-source table fence. Returns null when the opener is not print
 * (legacy pre-translated BRF) or the body is not a usable grid.
 */
export function parsePrintTableFence(params: string, body: string): TableSpec | null {
  if (!isPrintTableFenceParams(params)) return null;
  const attrs = parseFenceAttrs(params);
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let title: string | undefined;
  let transcriberNote: string | undefined;
  let blankCellNote: string | undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@title ')) {
      title = line.slice('@title '.length).trim() || undefined;
      i += 1;
      continue;
    }
    if (line.startsWith('@tn ')) {
      transcriberNote = line.slice('@tn '.length).trim() || undefined;
      i += 1;
      continue;
    }
    if (line.startsWith('@blank ')) {
      blankCellNote = line.slice('@blank '.length).trim() || undefined;
      i += 1;
      continue;
    }
    break;
  }
  const tsv = lines.slice(i).join('\n');
  const parsed = parseTableCsv(tsv);
  if (parsed.error || parsed.cells.length === 0) return null;

  const gapRaw = Number.parseInt(attrs.gap ?? '2', 10);
  const spec: TableSpec = {
    cells: parsed.cells,
    hasColumnHeadings: attrs.headings !== '0',
    format: parseTableFormatAttr(attrs.format),
    columnGap: gapRaw === 1 ? 1 : 2,
    guideDots: attrs.dots !== '0',
    ...(title ? { title } : {}),
    ...(transcriberNote ? { transcriberNote } : {}),
    ...(blankCellNote ? { blankCellNote } : {}),
  };
  if (!validateTableSpec(spec).ok) {
    spec.hasColumnHeadings = false;
    if (!validateTableSpec(spec).ok) return null;
  }
  return spec;
}
