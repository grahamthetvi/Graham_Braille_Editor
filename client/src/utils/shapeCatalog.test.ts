import { describe, expect, it } from 'vitest';
import {
  SHAPE_CATALOG,
  searchGraphicsCatalog,
  shapesInCategory,
} from './shapeCatalog';

describe('shapeCatalog', () => {
  it('excludes axe from the public catalog while keeping other everyday shapes', () => {
    expect(SHAPE_CATALOG.some(s => s.kind === 'axe')).toBe(false);
    expect(SHAPE_CATALOG.some(s => s.kind === 'apple')).toBe(true);
  });

  it('keeps math quick shapes only in the math category', () => {
    const mathKinds = shapesInCategory('math').map(s => s.kind);
    expect(mathKinds).toContain('triangle');
    expect(mathKinds).toContain('pieChart');
    expect(shapesInCategory('basics').some(s => s.category === 'math')).toBe(false);
  });

  it('search finds tools and shapes with category chips', () => {
    const volcano = searchGraphicsCatalog('volcano');
    expect(volcano.some(h => h.kind === 'shape' && h.shape.kind === 'volcano')).toBe(true);

    const cube = searchGraphicsCatalog('cube');
    expect(cube.some(h => h.kind === 'mathQuickShape' && h.shape.kind === 'cube')).toBe(true);

    const fraction = searchGraphicsCatalog('fraction');
    expect(fraction.some(h => h.kind === 'mathTool' && h.tool.id === 'fraction')).toBe(true);

    expect(searchGraphicsCatalog('axe')).toEqual([]);
    expect(searchGraphicsCatalog('axes').some(h => h.kind === 'mathQuickShape' && h.shape.kind === 'coordinateAxes')).toBe(true);
  });
});
