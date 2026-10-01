import { describe, expect, it } from 'vitest';
import { GraphicCanvas } from './graphicBraille';
import {
  CHART_GUTTER,
  CHART_H_RULE,
  CHART_JOINT,
  CHART_V_RULE,
  formatChartNumber,
  generateMultiplicationChart,
  multiplicationSign,
} from './multiplicationChart';
import type { MathCode } from './mathBraille';

function dotsOf(ch: string): boolean[] {
  const canvas = new GraphicCanvas(1, 1);
  canvas.paintBrailleCell(0, 0, ch);
  return [
    canvas.data[0]![0]!,
    canvas.data[1]![0]!,
    canvas.data[2]![0]!,
    canvas.data[0]![1]!,
    canvas.data[1]![1]!,
    canvas.data[2]![1]!,
  ];
}

function decodeChartNumber(field: string, mathCode: MathCode): number {
  const trimmed = field.trim();
  expect(trimmed.startsWith('#')).toBe(true);
  const body = trimmed.slice(1);
  switch (mathCode) {
    case 'nemeth':
      return Number(body);
    case 'ueb': {
      let digits = '';
      for (const ch of body) {
        digits += ch === 'j' ? '0' : String(ch.charCodeAt(0) - 'a'.charCodeAt(0) + 1);
      }
      return Number(digits);
    }
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}

function contentFields(line: string): string[] {
  const parts = line.split(CHART_V_RULE);
  expect(parts[0]).toBe('');
  expect(parts[parts.length - 1]).toBe('');
  return parts.slice(1, -1);
}

describe('multiplication chart tactile graphic', () => {
  it('uses rule cells whose dots form continuous lines', () => {
    expect(dotsOf(CHART_H_RULE)).toEqual([false, true, false, false, true, false]);
    expect(dotsOf(CHART_V_RULE)).toEqual([true, true, true, false, false, false]);
    expect(dotsOf(CHART_JOINT)).toEqual([true, true, true, false, true, false]);
    expect(dotsOf('#')).toEqual([false, false, true, true, true, true]);
    expect(dotsOf('"')).toEqual([false, false, false, false, true, false]);
    expect(dotsOf('8')).toEqual([false, true, true, false, false, true]);
    expect(dotsOf('@')).toEqual([false, false, false, true, false, false]);
    expect(dotsOf('*')).toEqual([true, false, false, false, false, true]);
  });

  it('formats UEB and Nemeth numbers with a numeric indicator', () => {
    expect(formatChartNumber(0, 'ueb')).toBe('#j');
    expect(formatChartNumber(4, 'ueb')).toBe('#d');
    expect(formatChartNumber(10, 'ueb')).toBe('#aj');
    expect(formatChartNumber(100, 'ueb')).toBe('#ajj');
    expect(formatChartNumber(0, 'nemeth')).toBe('#0');
    expect(formatChartNumber(4, 'nemeth')).toBe('#4');
    expect(formatChartNumber(100, 'nemeth')).toBe('#100');
    expect(multiplicationSign('ueb')).toBe('"8');
    expect(multiplicationSign('nemeth')).toBe('@*');
  });

  it('draws a 2 through 3 UEB chart with a gutter before each vertical rule', () => {
    const result = generateMultiplicationChart({ from: 2, to: 3, mathCode: 'ueb', cellsPerRow: 40 });
    expect(result.brf).toBe(
      [
        'r333r333r333r',
        'l"8 l#b l#c l',
        'r333r333r333r',
        'l#b l#d l#f l',
        'r333r333r333r',
        'l#c l#f l#i l',
        'r333r333r333r',
      ].join('\n'),
    );
    expect(result.summary).toContain('Multiplication chart from 2 through 3 (UEB).');
    expect(result.summary).toContain('Size: 13 cells wide by 7 lines.');
  });

  it('draws the same grid in Nemeth lower-cell digits', () => {
    const result = generateMultiplicationChart({ from: 2, to: 3, mathCode: 'nemeth', cellsPerRow: 40 });
    expect(result.brf).toBe(
      [
        'r333r333r333r',
        'l@* l#2 l#3 l',
        'r333r333r333r',
        'l#2 l#4 l#6 l',
        'r333r333r333r',
        'l#3 l#6 l#9 l',
        'r333r333r333r',
      ].join('\n'),
    );
  });

  it('checks every product for a 1 through 4 chart in both codes', () => {
    for (const mathCode of ['ueb', 'nemeth'] as const) {
      const result = generateMultiplicationChart({
        from: 1,
        to: 4,
        mathCode,
        cellsPerRow: 40,
        linesPerPage: 10,
      });
      const strips = result.brf.split('\n\n');
      expect(strips).toHaveLength(1);
      const content = strips[0]!.split('\n').filter((line) => line.startsWith(CHART_V_RULE));
      const header = contentFields(content[0]!);
      expect(header[0]!.trim()).toBe(multiplicationSign(mathCode));
      const columns = header.slice(1).map((field) => decodeChartNumber(field, mathCode));
      expect(columns).toEqual([1, 2, 3, 4]);

      const rows = content.slice(1).map((line) => contentFields(line).map((field) => decodeChartNumber(field, mathCode)));
      expect(rows.map((row) => row[0])).toEqual([1, 2, 3, 4]);
      for (const row of rows) {
        const factor = row[0]!;
        expect(row.slice(1)).toEqual(columns.map((col) => factor * col));
      }
      expect(result.summary).toContain('continues past one 10-line page.');
    }
  });

  it('right-aligns ones digits and splits 1 through 10 to the line length', () => {
    const result = generateMultiplicationChart({ from: 1, to: 10, mathCode: 'ueb', cellsPerRow: 40 });
    const strips = result.brf.split('\n\n');
    expect(strips.length).toBeGreaterThan(1);
    for (const strip of strips) {
      const lines = strip.split('\n');
      const width = lines[0]!.length;
      expect(width).toBeLessThanOrEqual(40);
      expect(lines.every((line) => line.length === width)).toBe(true);
      const content = lines.filter((line) => line.startsWith(CHART_V_RULE));
      const fields = content.map(contentFields);
      const columnCount = fields[0]!.length;
      for (let col = 1; col < columnCount; col++) {
        const ones = fields.map((row) => row[col]!.trimEnd().length - 1);
        expect(new Set(ones).size).toBe(1);
        expect(fields.every((row) => row[col]!.endsWith(' '.repeat(CHART_GUTTER)))).toBe(true);
      }
    }
    const flat = strips.join('\n');
    expect(flat).toContain('#ajj');
    expect(result.summary).toContain('Row factors repeat on every strip.');
    expect(result.summary).toContain('Strip 1:');
  });

  it('keeps a small chart on one strip when the line is wide enough', () => {
    const result = generateMultiplicationChart({ from: 1, to: 5, mathCode: 'ueb', cellsPerRow: 40 });
    expect(result.brf).not.toContain('\n\n');
    const lines = result.brf.split('\n');
    expect(lines[0]!.length).toBeLessThanOrEqual(40);
    expect(result.summary).not.toContain('stacked');
  });

  it('includes the zero row', () => {
    const ueb = generateMultiplicationChart({ from: 0, to: 2, mathCode: 'ueb', cellsPerRow: 40 });
    const nemeth = generateMultiplicationChart({ from: 0, to: 2, mathCode: 'nemeth', cellsPerRow: 40 });
    expect(ueb.brf).toContain('#j ');
    expect(nemeth.brf).toContain('#0 ');
    const row = ueb.brf.split('\n').find((line) => line.startsWith('l#j'));
    expect(row).toBe('l#j l#j l#j l#j l');
  });

  it('rejects ranges outside the chart limits', () => {
    expect(generateMultiplicationChart({ from: 3, to: 1, mathCode: 'ueb' }).brf).toBe('');
    expect(generateMultiplicationChart({ from: 1.5, to: 3, mathCode: 'ueb' }).summary).toContain('whole-number');
    expect(generateMultiplicationChart({ from: -1, to: 4, mathCode: 'ueb' }).summary).toContain('0 through 12');
    expect(generateMultiplicationChart({ from: 1, to: 13, mathCode: 'nemeth' }).brf).toBe('');
  });
});
