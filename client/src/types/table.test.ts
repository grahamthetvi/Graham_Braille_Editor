import { describe, it, expect } from 'vitest';
import {
  parseTableCsv,
  parseCsvLine,
  validateTableSpec,
  defaultTableSpec,
  resizeGrid,
  createEmptyGrid,
  tableHasBlankCells,
  TABLE_LIMITS,
} from './table';

describe('parseCsvLine', () => {
  it('splits on commas', () => {
    expect(parseCsvLine('a, b, c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsvLine('a,"b, c",d', ',')).toEqual(['a', 'b, c', 'd']);
  });

  it('handles escaped quotes', () => {
    expect(parseCsvLine('"say ""hi""",x', ',')).toEqual(['say "hi"', 'x']);
  });

  it('splits on tabs', () => {
    expect(parseCsvLine('a\tb\tc', '\t')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseTableCsv', () => {
  it('parses comma-separated grid', () => {
    const r = parseTableCsv('Animal,Size\ncat,small\ndog,large');
    expect(r.error).toBeUndefined();
    expect(r.rowCount).toBe(3);
    expect(r.columnCount).toBe(2);
    expect(r.cells).toEqual([
      ['Animal', 'Size'],
      ['cat', 'small'],
      ['dog', 'large'],
    ]);
  });

  it('parses semicolon delimiter when dominant', () => {
    const r = parseTableCsv('a;b;c\n1;2;3');
    expect(r.error).toBeUndefined();
    expect(r.cells).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('parses TSV', () => {
    const r = parseTableCsv('a\tb\n1\t2');
    expect(r.error).toBeUndefined();
    expect(r.cells).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('pads ragged rows', () => {
    const r = parseTableCsv('a,b,c\n1,2');
    expect(r.error).toBeUndefined();
    expect(r.cells[1]).toEqual(['1', '2', '']);
  });

  it('handles quoted commas', () => {
    const r = parseTableCsv('name,note\n"Smith, Jane",ok');
    expect(r.cells[1]).toEqual(['Smith, Jane', 'ok']);
  });

  it('rejects empty input', () => {
    const r = parseTableCsv('  \n  ');
    expect(r.error).toBeDefined();
    expect(r.cells).toEqual([]);
  });

  it('rejects too many columns', () => {
    const cols = Array.from({ length: TABLE_LIMITS.maxCols + 1 }, (_, i) => `c${i}`).join(',');
    const r = parseTableCsv(cols);
    expect(r.error).toMatch(/Too many columns/);
  });

  it('rejects too many rows', () => {
    const rows = Array.from({ length: TABLE_LIMITS.maxRows + 1 }, (_, i) => `r${i}`).join('\n');
    const r = parseTableCsv(rows);
    expect(r.error).toMatch(/Too many rows/);
  });
});

describe('validateTableSpec', () => {
  it('accepts default spec', () => {
    expect(validateTableSpec(defaultTableSpec()).ok).toBe(true);
  });

  it('rejects stairstep with >4 columns', () => {
    const spec = defaultTableSpec(2, 5);
    spec.format = 'stairstep';
    expect(validateTableSpec(spec).ok).toBe(false);
  });

  it('rejects headings with only one row', () => {
    const spec = defaultTableSpec(1, 2);
    spec.hasColumnHeadings = true;
    expect(validateTableSpec(spec).ok).toBe(false);
  });
});

describe('grid helpers', () => {
  it('createEmptyGrid fills empty strings', () => {
    const g = createEmptyGrid(2, 3);
    expect(g).toEqual([
      ['', '', ''],
      ['', '', ''],
    ]);
  });

  it('resizeGrid preserves existing cells', () => {
    const g = resizeGrid(
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
      3,
      3
    );
    expect(g[0][0]).toBe('a');
    expect(g[2][2]).toBe('');
  });

  it('tableHasBlankCells detects body blanks', () => {
    const spec = defaultTableSpec(2, 2);
    spec.cells = [
      ['H1', 'H2'],
      ['a', ''],
    ];
    expect(tableHasBlankCells(spec)).toBe(true);
    spec.cells[1][1] = 'b';
    expect(tableHasBlankCells(spec)).toBe(false);
  });
});
