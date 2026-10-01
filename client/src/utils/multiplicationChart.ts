/**
 * Tactile multiplication chart as ASCII BRF.
 *
 * Each number carries its own numeric indicator. Entries are right-aligned
 * so the ones place lines up, with a blank cell before the next vertical rule.
 * Horizontal rules are dots 2-5 (`3`). Vertical rules are dots 1-2-3 (`l`).
 * Joints are dots 1-2-3-5 (`r`). Strips repeat the row factors so a wide
 * chart still fits a braille line.
 */

import type { GraphicResult } from './graphicBraille';
import type { MathCode } from './mathBraille';

export const MULTIPLICATION_CHART_LIMITS = {
  minFactor: 0,
  maxFactor: 12,
} as const;

/** Blank cells between a number and the following vertical rule. */
export const CHART_GUTTER = 1;

/** Dots 2 and 5: horizontal rule. */
export const CHART_H_RULE = '3';
/** Dots 1, 2, and 3: vertical rule on the left side of the cell. */
export const CHART_V_RULE = 'l';
/** Dots 1, 2, 3, and 5: crossing of the two rules. */
export const CHART_JOINT = 'r';

const DEFAULT_CELLS_PER_ROW = 40;

export interface MultiplicationChartOptions {
  from: number;
  to: number;
  mathCode: MathCode;
  /** Pack each strip to this line length. Defaults to 40. */
  cellsPerRow?: number;
  /** When set, the summary notes a chart taller than one page. */
  linesPerPage?: number;
}

export interface MultiplicationChartValidation {
  ok: boolean;
  errors: string[];
}

/** UEB upper-cell digits: 1–9, 0 → a–i, j. Index 0 is the digit 0. */
const UEB_DIGITS = 'jabcdefghi';

export function formatChartNumber(n: number, mathCode: MathCode): string {
  const digits = String(n);
  switch (mathCode) {
    case 'ueb': {
      let out = '#';
      for (const ch of digits) {
        out += UEB_DIGITS[Number(ch)] ?? '';
      }
      return out;
    }
    case 'nemeth':
      return `#${digits}`;
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}

/** UEB × is dots 5 + dots 236 (`"8`). Nemeth × is dots 4 + dots 16 (`@*`). */
export function multiplicationSign(mathCode: MathCode): string {
  switch (mathCode) {
    case 'ueb':
      return '"8';
    case 'nemeth':
      return '@*';
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}

function mathCodeLabel(mathCode: MathCode): string {
  switch (mathCode) {
    case 'ueb':
      return 'UEB';
    case 'nemeth':
      return 'Nemeth';
    default: {
      const _exhaustive: never = mathCode;
      return _exhaustive;
    }
  }
}

export function validateMultiplicationChart(from: number, to: number): MultiplicationChartValidation {
  const errors: string[] = [];
  const { minFactor, maxFactor } = MULTIPLICATION_CHART_LIMITS;
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    errors.push('Enter whole-number factors.');
  } else {
    if (from < minFactor || from > maxFactor || to < minFactor || to > maxFactor) {
      errors.push(`Factors must be from ${minFactor} through ${maxFactor}.`);
    }
    if (from > to) {
      errors.push('The first factor must be less than or equal to the last factor.');
    }
  }
  return { ok: errors.length === 0, errors };
}

function factorsInclusive(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

function renderEntry(text: string, width: number): string {
  const inner = width - CHART_GUTTER;
  if (inner >= text.length) {
    return text.padStart(inner, ' ') + ' '.repeat(CHART_GUTTER);
  }
  return text.padStart(width, ' ');
}

function stripWidth(stubWidth: number, colWidths: number[]): number {
  return stubWidth + colWidths.reduce((sum, w) => sum + w, 0) + colWidths.length + 2;
}

/** Column index groups. A column that cannot fit alone stays on its own strip. */
function packChartStrips(colWidths: number[], stubWidth: number, cellsPerRow: number): number[][] {
  const strips: number[][] = [];
  let current: number[] = [];

  const widthOf = (indices: number[]) =>
    stripWidth(
      stubWidth,
      indices.map((i) => colWidths[i] ?? 0),
    );

  for (let i = 0; i < colWidths.length; i++) {
    const trial = [...current, i];
    if (current.length > 0 && widthOf(trial) > cellsPerRow) {
      strips.push(current);
      current = [i];
    } else {
      current = trial;
    }
  }
  if (current.length > 0) strips.push(current);
  return strips;
}

function ruleLine(widths: number[]): string {
  let line = '';
  for (const width of widths) {
    line += CHART_JOINT + CHART_H_RULE.repeat(width);
  }
  return line + CHART_JOINT;
}

function contentLine(cells: string[], widths: number[]): string {
  let line = '';
  for (let i = 0; i < cells.length; i++) {
    line += CHART_V_RULE + renderEntry(cells[i] ?? '', widths[i] ?? 0);
  }
  return line + CHART_V_RULE;
}

function columnRangeLabel(axis: number[], indices: number[]): string {
  const first = axis[indices[0] ?? 0] ?? 0;
  const last = axis[indices[indices.length - 1] ?? 0] ?? first;
  return first === last ? String(first) : `${first} through ${last}`;
}

export function generateMultiplicationChart(options: MultiplicationChartOptions): GraphicResult {
  const { from, to, mathCode } = options;
  const validation = validateMultiplicationChart(from, to);
  if (!validation.ok) {
    return { brf: '', summary: validation.errors.join('\n') };
  }

  const cellsPerRow =
    options.cellsPerRow !== undefined && Number.isFinite(options.cellsPerRow)
      ? Math.max(1, Math.floor(options.cellsPerRow))
      : DEFAULT_CELLS_PER_ROW;
  const linesPerPage =
    options.linesPerPage !== undefined && Number.isFinite(options.linesPerPage)
      ? Math.max(1, Math.floor(options.linesPerPage))
      : undefined;

  const axis = factorsInclusive(from, to);
  const sign = multiplicationSign(mathCode);
  const labels = axis.map((n) => formatChartNumber(n, mathCode));
  const maxLabelLen = Math.max(sign.length, ...labels.map((label) => label.length));
  const stubWidth = maxLabelLen + CHART_GUTTER;
  const colWidths = axis.map((colFactor, colIndex) => {
    let maxLen = labels[colIndex]?.length ?? 0;
    for (const rowFactor of axis) {
      maxLen = Math.max(maxLen, formatChartNumber(rowFactor * colFactor, mathCode).length);
    }
    return maxLen + CHART_GUTTER;
  });

  const strips = packChartStrips(colWidths, stubWidth, cellsPerRow);
  const blocks: string[] = [];
  let widest = 0;

  for (const indices of strips) {
    const stripColWidths = indices.map((i) => colWidths[i] ?? 0);
    const widths = [stubWidth, ...stripColWidths];
    const lines: string[] = [ruleLine(widths)];
    lines.push(contentLine([sign, ...indices.map((i) => labels[i] ?? '')], widths));
    for (let row = 0; row < axis.length; row++) {
      const rowFactor = axis[row] ?? 0;
      const products = indices.map((col) => formatChartNumber(rowFactor * (axis[col] ?? 0), mathCode));
      lines.push(ruleLine(widths));
      lines.push(contentLine([labels[row] ?? '', ...products], widths));
    }
    lines.push(ruleLine(widths));
    widest = Math.max(widest, lines[0]?.length ?? 0);
    blocks.push(lines.join('\n'));
  }

  const brf = blocks.join('\n\n');
  const totalLines = brf.length === 0 ? 0 : brf.split('\n').length;
  const summaryLines = [
    `Multiplication chart from ${from} through ${to} (${mathCodeLabel(mathCode)}).`,
    'The left column is the row factor and the top row is the column factor. The cell where they meet is the product.',
    'Each number begins with a numeric indicator. Shorter numbers sit to the right so the ones place lines up, and a blank cell separates each number from the next vertical line.',
    'Horizontal lines use dots 2 and 5. Vertical lines use dots 1, 2, and 3.',
  ];
  if (strips.length > 1) {
    summaryLines.push(
      `The chart is stacked in ${strips.length} strips so each strip fits in ${cellsPerRow} cells. Row factors repeat on every strip.`,
    );
    strips.forEach((indices, index) => {
      summaryLines.push(`Strip ${index + 1}: columns ${columnRangeLabel(axis, indices)}.`);
    });
  }
  summaryLines.push(`Size: ${widest} cells wide by ${totalLines} lines.`);
  if (widest > cellsPerRow) {
    summaryLines.push(`Emboss each strip on a line of at least ${widest} cells.`);
  }
  if (linesPerPage !== undefined && totalLines > linesPerPage) {
    summaryLines.push(`The chart continues past one ${linesPerPage}-line page.`);
  }

  return { brf, summary: summaryLines.join('\n') };
}
