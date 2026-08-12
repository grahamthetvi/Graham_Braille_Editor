/**
 * Structured table data for the Braille Formats table editor.
 * Layout runs from TableSpec after cells are translated to ASCII BRF.
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
  const lines = rawLines.filter((l, idx) => {
    if (l.trim().length > 0) return true;
    // Keep interior blank lines only if surrounded by content (rare); drop leading/trailing empties.
    return false;
  });

  if (lines.length === 0) {
    return { cells: [], rowCount: 0, columnCount: 0, error: 'No data found in CSV.' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const parsed = lines.map((line) => parseCsvLine(line, delimiter));
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
