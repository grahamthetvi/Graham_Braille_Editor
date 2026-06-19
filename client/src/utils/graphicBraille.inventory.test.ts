import { describe, expect, it } from 'vitest';
import { generateInventoryShape, GraphicCanvas, type InventoryShapeKind } from './graphicBraille';

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
