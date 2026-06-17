import { describe, expect, it } from 'vitest';
import { generateInventoryShape, type InventoryShapeKind } from './graphicBraille';

const NEW_SHAPES: InventoryShapeKind[] = ['flower', 'iceSkates', 'vampireFangs', 'paintbrush'];

describe('inventory shapes — flower, ice skates, vampire fangs, paintbrush', () => {
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
