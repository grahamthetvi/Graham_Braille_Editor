import { describe, it, expect } from 'vitest';
import { formatPrintTableInsertBlock, parsePrintTableFence } from '../types/table';
import {
  generateTableBrf,
  layoutBrailleTable,
  resolveAutoFormat,
  formatTableInsertBlock,
  formatTableSpecToBrf,
  tableSpecToEditorBlock,
  wrapTnAscii,
  GUIDE_DOT,
  SEP_FILL,
  BLANK_THREE,
} from './tableBraille';

describe('wrapTnAscii', () => {
  it('wraps with TN indicators', () => {
    expect(wrapTnAscii('note')).toBe(",'note,'");
  });
});

describe('simple table layout', () => {
  it('emits headings, separation lines, and body', () => {
    const result = layoutBrailleTable({
      cells: [
        ['animal', 'size'],
        ['cat', 'sm'],
        ['dog', 'lg'],
      ],
      hasColumnHeadings: true,
      format: 'simple',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
    });
    expect(result.ok).toBe(true);
    const lines = result.brf.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^animal/);
    expect(lines[0]).toContain('size');
    // Separation: " + 3's
    expect(lines[1]).toContain(GUIDE_DOT + SEP_FILL);
    expect(lines[2]).toMatch(/^cat/);
    expect(lines[3]).toMatch(/^dog/);
  });

  it('fills blank cells with guide dots across column width', () => {
    const result = layoutBrailleTable({
      cells: [
        ['a', 'b'],
        ['x', ''],
      ],
      hasColumnHeadings: true,
      format: 'simple',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
      blankTnBrf: 'blank note',
    });
    const lines = result.brf.split('\n');
    const bodyLine = lines.find((l) => l.startsWith('x'));
    expect(bodyLine).toBeDefined();
    expect(bodyLine!).toContain(GUIDE_DOT);
    expect(result.brf).toContain(",'blank note,'");
  });
});

describe('listed table layout', () => {
  it('emits TN and cell-5 first pair', () => {
    const result = layoutBrailleTable({
      cells: [
        ['name', 'age'],
        ['ann', '12'],
      ],
      hasColumnHeadings: true,
      format: 'listed',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
      tnBrf: 'Print format is changed.',
    });
    expect(result.ok).toBe(true);
    expect(result.brf).toContain(",'Print format is changed.,'");
    // First pair indented to cell 5 (4 spaces)
    expect(result.brf).toMatch(/\n {4}name: ann/);
    expect(result.brf).toContain('age: 12');
  });

  it('uses three guide dots for blank entries', () => {
    const result = layoutBrailleTable({
      cells: [
        ['h1', 'h2'],
        ['a', ''],
      ],
      hasColumnHeadings: true,
      format: 'listed',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
      tnBrf: 'tn',
    });
    expect(result.brf).toContain(BLANK_THREE);
  });
});

describe('stairstep table layout', () => {
  it('stairs headings and body', () => {
    const result = layoutBrailleTable({
      cells: [
        ['c1', 'c2'],
        ['a', 'b'],
      ],
      hasColumnHeadings: true,
      format: 'stairstep',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
      tnBrf: 'Table changed as follows:',
    });
    expect(result.ok).toBe(true);
    // After TN, heading c1 at cell 1, c2 wrapped with TN at cell 3
    expect(result.brf).toContain('Table changed as follows:');
    expect(result.brf).toMatch(/^c1/m);
    expect(result.brf).toContain(",'c2,'");
    expect(result.brf).toMatch(/^a/m);
    expect(result.brf).toMatch(/^ {2}b/m);
  });

  it('rejects more than 4 columns', () => {
    const result = layoutBrailleTable({
      cells: [['a', 'b', 'c', 'd', 'e'], ['1', '2', '3', '4', '5']],
      hasColumnHeadings: true,
      format: 'stairstep',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
    });
    expect(result.ok).toBe(false);
  });
});

describe('linear table layout', () => {
  it('emits legend and colon/semicolon rows', () => {
    const result = layoutBrailleTable({
      cells: [
        ['h1', 'h2', 'h3'],
        ['a', 'b', 'c'],
      ],
      hasColumnHeadings: true,
      format: 'linear',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
      tnBrf: 'Columns follow one another in this order:',
    });
    expect(result.ok).toBe(true);
    expect(result.brf).toContain('h1: h2; h3');
    expect(result.brf).toContain('a: b; c');
  });

  it('rejects cells containing colon or semicolon', () => {
    const result = layoutBrailleTable({
      cells: [
        ['h1', 'h2'],
        ['a:b', 'c'],
      ],
      hasColumnHeadings: true,
      format: 'linear',
      columnGap: 2,
      guideDots: true,
      cellsPerRow: 40,
    });
    expect(result.ok).toBe(false);
  });
});

describe('resolveAutoFormat', () => {
  it('prefers simple when content fits', () => {
    const r = resolveAutoFormat(['a', 'b'], [['x', 'y']], 2, 2, 40);
    expect(r.format).toBe('simple');
  });

  it('falls back when simple cannot fit wide cells', () => {
    const wide = 'x'.repeat(30);
    const r = resolveAutoFormat(
      ['h1', 'h2', 'h3'],
      [[wide, wide, wide]],
      3,
      2,
      40
    );
    expect(r.format).not.toBe('simple');
  });
});

describe('generateTableBrf + insert block', () => {
  it('resolves auto and fences output', () => {
    const result = generateTableBrf(
      { hasColumnHeadings: true, format: 'auto', columnGap: 2, guideDots: true },
      {
        cells: [
          ['a', 'b'],
          ['1', '2'],
        ],
      },
      40
    );
    expect(result.format).toBe('simple');
    const block = formatTableInsertBlock(result.brf);
    expect(block.startsWith(':::table\n')).toBe(true);
    expect(block.trimEnd().endsWith(':::')).toBe(true);
  });
});

describe('tableSpecToEditorBlock', () => {
  it('fences print cells, not translated BRF', async () => {
    const block = tableSpecToEditorBlock({
      cells: [
        ['Animal', 'Size'],
        ['cat', 'small'],
      ],
      hasColumnHeadings: true,
      format: 'auto',
      columnGap: 2,
      guideDots: true,
    });
    expect(block.startsWith(':::table print ')).toBe(true);
    expect(block).toContain('Animal\tSize');
    expect(block).toContain('cat\tsmall');
    expect(block).toContain('format=auto');
    expect(block.trimEnd().endsWith(':::')).toBe(true);
    expect(block.includes('"3')).toBe(false);
  });

  it('keeps print cell text instead of a translator mapping', () => {
    const block = tableSpecToEditorBlock({
      cells: [
        ['A', 'B'],
        ['one', 'two'],
      ],
      hasColumnHeadings: true,
      format: 'simple',
      columnGap: 2,
      guideDots: false,
    });
    expect(block).toContain('one\ttwo');
    expect(block.includes('ONE')).toBe(false);
  });

  it('round-trips print fence metadata and TSV', () => {
    const spec = {
      cells: [
        ['Quarter', 'Event', 'Day', 'Date'],
        ['First Quarter', 'End of Quarter', 'Thursday', 'October 15, 2026'],
      ],
      hasColumnHeadings: true,
      format: 'listed' as const,
      columnGap: 2 as const,
      guideDots: true,
      title: 'Moon phases',
      transcriberNote: 'Print format is changed.',
    };
    const block = formatPrintTableInsertBlock(spec);
    const openEnd = block.indexOf('\n');
    const close = block.lastIndexOf('\n:::');
    const params = block.slice(':::table'.length, openEnd);
    const body = block.slice(openEnd + 1, close);
    const parsed = parsePrintTableFence(params, body);
    expect(parsed).not.toBeNull();
    expect(parsed!.cells[0][0]).toBe('Quarter');
    expect(parsed!.cells[1][3]).toBe('October 15, 2026');
    expect(parsed!.format).toBe('listed');
    expect(parsed!.title).toBe('Moon phases');
    expect(parsed!.transcriberNote).toBe('Print format is changed.');
    expect(parsed!.hasColumnHeadings).toBe(true);
  });
});

describe('formatTableSpecToBrf', () => {
  it('translates print cells for braille layout', async () => {
    const result = await formatTableSpecToBrf(
      {
        cells: [
          ['Quarter', 'Event'],
          ['First Quarter', 'End of Quarter'],
        ],
        hasColumnHeadings: true,
        format: 'simple',
        columnGap: 2,
        guideDots: false,
      },
      (s) => s.toUpperCase(),
      40,
    );
    expect(result.ok).toBe(true);
    expect(result.brf).toContain('QUARTER');
    expect(result.brf).toContain('FIRST QUARTER');
    expect(result.brf.includes('First Quarter')).toBe(false);
  });
});
