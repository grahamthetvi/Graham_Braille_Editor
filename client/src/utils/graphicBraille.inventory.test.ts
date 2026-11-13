import { describe, expect, it } from 'vitest';
import { generateInventoryShape, GraphicCanvas, paintInventoryShape, type InventoryShapeKind } from './graphicBraille';

function countInteriorDiscDots(
  canvas: GraphicCanvas,
  cx: number,
  cy: number,
  radius: number
): number {
  let count = 0;
  const innerR = Math.max(0, radius - 1);
  for (let y = Math.ceil(cy - innerR); y <= Math.floor(cy + innerR); y++) {
    for (let x = Math.ceil(cx - innerR); x <= Math.floor(cx + innerR); x++) {
      if (canvas.data[y]?.[x]) count++;
    }
  }
  return count;
}

const NEW_SHAPES: InventoryShapeKind[] = ['flower', 'iceSkates', 'vampireFangs', 'paintbrush', 'hiking', 'axe', 'beach', 'birdHouse', 'bowling', 'movieProjector', 'candle', 'cloudLightning', 'actingMask', 'mustache', 'dog', 'cat', 'house', 'bed'];

const EDUCATIONAL_SHAPES: InventoryShapeKind[] = [
  'atom', 'dna', 'leaf', 'fish', 'butterfly', 'earth', 'sun', 'volcano', 'magnet', 'thermometer', 'beaker', 'microscope',
  'interphase', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis',
  'pyramid', 'greekColumn', 'castle', 'shipSail', 'compassRose', 'scroll', 'libertyBell', 'flag', 'timeline',
  'triangle', 'square', 'hexagon', 'cube', 'cone', 'cylinder', 'rightTriangle', 'angle', 'coordinateAxes', 'pieChart',
];

describe('inventory shapes — flower, ice skates, vampire fangs, paintbrush, hiking, axe, candle', () => {
  it('flower outline mode fills the centre disc but leaves petals as rings', () => {
    const r = 15;
    const cellsW = Math.ceil((r * 2.2) / 2) + 2;
    const cellsH = Math.ceil((r * 2.6) / 3) + 2;
    const cx = cellsW;
    const cy = cellsH * 1.5;
    const headCy = Math.round(cy - r * 0.42);
    const centerR = Math.round(r * 0.3);

    const flower = new GraphicCanvas(cellsW, cellsH);
    flower.drawFlower(cx, cy, r, false);

    const outlineCenter = new GraphicCanvas(cellsW, cellsH);
    outlineCenter.drawCircle(cx, headCy, centerR, false);

    expect(countInteriorDiscDots(flower, cx, headCy, centerR)).toBeGreaterThan(
      countInteriorDiscDots(outlineCenter, cx, headCy, centerR)
    );
  });

  for (const kind of NEW_SHAPES) {
    it(`generates non-empty BRF for ${kind} (outline)`, () => {
      const result = generateInventoryShape(kind, 15, false);
      expect(result.brf.length).toBeGreaterThan(0);
      expect(result.brf.replace(/\s/g, '').length).toBeGreaterThan(0);
      expect(result.summary).toContain('size 15');
    });

    it(`generates non-empty BRF for ${kind} (filled)`, () => {
      const result = generateInventoryShape(kind, 15, true);
      expect(result.brf.length).toBeGreaterThan(0);
      expect(result.summary).toContain('filled');
    });
  }
});

describe('educational inventory shapes — science, history, math', () => {
  for (const kind of EDUCATIONAL_SHAPES) {
    it(`generates non-empty BRF for ${kind} (outline)`, () => {
      const result = generateInventoryShape(kind, 15, false);
      expect(result.brf.length).toBeGreaterThan(0);
      expect(result.brf.replace(/\s/g, '').length).toBeGreaterThan(0);
      expect(result.summary).toContain('size 15');
    });

    it(`generates non-empty BRF for ${kind} (filled)`, () => {
      const result = generateInventoryShape(kind, 15, true);
      expect(result.brf.length).toBeGreaterThan(0);
      expect(result.summary).toContain('filled');
    });
  }
});

const MITOSIS_STAGES: InventoryShapeKind[] = ['interphase', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis'];

function paintStage(kind: InventoryShapeKind, r: number, filled: boolean): GraphicCanvas {
  const cellsW = Math.ceil((r * 2.2) / 2) + 2;
  const cellsH = Math.ceil((r * 2.2) / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  paintInventoryShape(canvas, kind, cellsW, cellsH * 1.5, r, filled);
  return canvas;
}

function dotCount(canvas: GraphicCanvas): number {
  return canvas.data.flat().filter(Boolean).length;
}

describe('mitosis stage shapes', () => {
  it('each stage draws a different picture', () => {
    const pictures = MITOSIS_STAGES.map(k => generateInventoryShape(k, 20, false).brf);
    expect(new Set(pictures).size).toBe(MITOSIS_STAGES.length);
  });

  it('labels name the stage so the document summary identifies it', () => {
    for (const kind of MITOSIS_STAGES) {
      const { summary } = generateInventoryShape(kind, 15, false);
      expect(summary.toLowerCase()).toContain(kind);
      expect(summary).toContain('Mitosis');
    }
  });

  it('filled mode adds dots (solid chromosomes) but never fills the whole cell', () => {
    for (const kind of MITOSIS_STAGES) {
      const outline = paintStage(kind, 20, false);
      const solid = paintStage(kind, 20, true);
      expect(dotCount(solid)).toBeGreaterThan(dotCount(outline));
      // A filled disc of the same size would have ~pi*r^2 dots; stages must stay far sparser.
      expect(dotCount(solid)).toBeLessThan(Math.PI * 20 * 20 * 0.5);
    }
  });

  it('keeps every dot inside the canvas margin at several sizes', () => {
    for (const kind of MITOSIS_STAGES) {
      for (const r of [10, 15, 20, 30]) {
        const canvas = paintStage(kind, r, true);
        let edgeDots = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const nearEdge = x < 1 || y < 1 || x >= canvas.width - 1 || y >= canvas.height - 1;
            if (nearEdge && canvas.data[y][x]) edgeDots++;
          }
        }
        expect(edgeDots).toBe(0);
      }
    }
  });

  it('telophase pinches: the waist column has far fewer dots than a full-height cell wall', () => {
    const r = 20;
    const canvas = paintStage('telophase', r, false);
    const midX = Math.round(canvas.width / 2);
    let waist = 0;
    for (let y = 0; y < canvas.height; y++) {
      if (canvas.data[y][midX] || canvas.data[y][midX - 1]) waist++;
    }
    // Only the top and bottom pinch points cross the centre line (no wall passes through it).
    expect(waist).toBeLessThanOrEqual(6);
  });
});
