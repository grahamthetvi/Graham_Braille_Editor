import { describe, it, expect } from 'vitest';
import { GridCanvas } from './chartBraille';
import { GraphicCanvas } from './graphicBraille';
import { asciiToUnicodeBraille } from './braille';

describe('paintBrailleCell / paintBrailleString', () => {
  it('round-trips ASCII letter A through renderToBRF', () => {
    const canvas = new GridCanvas(4, 2);
    canvas.paintBrailleCell(0, 0, 'A');
    const brf = canvas.renderToBRF();
    const firstCell = brf.split('\n')[0][0];
    expect(firstCell).toBe('A');
  });

  it('round-trips Unicode braille cell', () => {
    const canvas = new GridCanvas(4, 2);
    const unicodeA = asciiToUnicodeBraille('A');
    canvas.paintBrailleCell(1, 0, unicodeA);
    const row = canvas.renderToBRF().split('\n')[0];
    expect(row[1]).toBe('A');
  });

  it('paints a horizontal string without clobbering later cells incorrectly', () => {
    const canvas = new GridCanvas(10, 3);
    canvas.paintBrailleString(2, 1, 'STEM');
    const lines = canvas.renderToBRF().split('\n');
    expect(lines[1].slice(2, 6)).toBe('STEM');
    // Cells before the label stay blank (space)
    expect(lines[1][0]).toBe(' ');
    expect(lines[1][1]).toBe(' ');
  });

  it('respects canvas bounds and does not throw off-canvas', () => {
    const canvas = new GridCanvas(3, 2);
    expect(() => canvas.paintBrailleCell(10, 10, 'A')).not.toThrow();
    expect(() => canvas.paintBrailleString(2, 0, 'ABCDEFGH')).not.toThrow();
    const row = canvas.renderToBRF().split('\n')[0];
    expect(row.length).toBe(3);
  });

  it('wraps when maxCells is smaller than the string', () => {
    const canvas = new GridCanvas(8, 4);
    const { cellsWide, linesUsed } = canvas.paintBrailleString(0, 0, 'ABCDEF', { maxCells: 3 });
    expect(cellsWide).toBe(3);
    expect(linesUsed).toBeGreaterThanOrEqual(2);
    const lines = canvas.renderToBRF().split('\n');
    expect(lines[0].slice(0, 3)).toBe('ABC');
    expect(lines[1].slice(0, 3)).toBe('DEF');
  });

  it('works on GraphicCanvas subclass', () => {
    const canvas = new GraphicCanvas(6, 3);
    canvas.paintBrailleString(0, 0, 'ROOT');
    expect(canvas.renderToBRF().split('\n')[0].startsWith('ROOT')).toBe(true);
  });

  it('space clears an occupied cell', () => {
    const canvas = new GridCanvas(4, 2);
    canvas.paintBrailleCell(0, 0, 'A');
    canvas.paintBrailleCell(0, 0, ' ');
    expect(canvas.renderToBRF().split('\n')[0][0]).toBe(' ');
  });
});
