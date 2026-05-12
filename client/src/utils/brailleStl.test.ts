import { describe, expect, it } from 'vitest';
import { buildBrailleStlBinary } from './brailleStl';
import { defaultBanaBrailleDimensionsMm } from './banaBrailleDimensions';

describe('buildBrailleStlBinary', () => {
  it('produces a non-empty binary STL with one dot', () => {
    // U+2801 = dot 1 only
    const buf = buildBrailleStlBinary({
      unicodeLines: ['\u2801'],
      dimensions: defaultBanaBrailleDimensionsMm(),
      plateThicknessMm: 1,
      plateBorderMm: 1,
      cylinderSegments: 8,
    });
    expect(buf.byteLength).toBeGreaterThan(84);
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    expect(triCount).toBeGreaterThan(4);
  });
});
