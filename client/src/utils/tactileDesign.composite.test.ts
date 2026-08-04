import { describe, it, expect } from 'vitest';
import { compositeDesignScene } from './tactileDesign';

describe('compositeDesignScene', () => {
  it('composites freehand dots with a braille label into one BRF', () => {
    const grid = Array.from({ length: 9 }, () => Array(16).fill(false));
    grid[1][1] = true;
    const result = compositeDesignScene(8, 3, grid, [
      {
        id: '1',
        kind: 'label',
        cellX: 2,
        cellY: 1,
        sourceText: 'STEM',
        brfAscii: 'STEM',
        table: 'en-ueb-g1.ctb',
      },
    ]);
    const lines = result.brf.split('\n');
    expect(lines[1].includes('STEM')).toBe(true);
    expect(result.summary).toContain('Tactile Design');
  });

  it('draws leader lines between points', () => {
    const grid = Array.from({ length: 12 }, () => Array(20).fill(false));
    const result = compositeDesignScene(10, 4, grid, [
      { id: 'l1', kind: 'leader', x0: 0, y0: 0, x1: 10, y1: 0 },
    ]);
    expect(result.brf.length).toBeGreaterThan(0);
    expect(result.brf.split('\n')[0].trim().length).toBeGreaterThan(0);
  });
});
