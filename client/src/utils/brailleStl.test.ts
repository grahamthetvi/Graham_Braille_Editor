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

  it('adds geometry when a top-left logo raster is provided', () => {
    const w = 6;
    const h = 6;
    const rgba = new Uint8ClampedArray(w * h * 4);
    rgba[3] = 255;

    const withLogo = buildBrailleStlBinary({
      unicodeLines: ['\u2801'],
      dimensions: defaultBanaBrailleDimensionsMm(),
      plateThicknessMm: 1,
      plateBorderMm: 1,
      cylinderSegments: 8,
      logo: {
        width: w,
        height: h,
        data: rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength),
      },
      logoPxToMm: 0.5,
    });
    const withoutLogo = buildBrailleStlBinary({
      unicodeLines: ['\u2801'],
      dimensions: defaultBanaBrailleDimensionsMm(),
      plateThicknessMm: 1,
      plateBorderMm: 1,
      cylinderSegments: 8,
    });
    const dvL = new DataView(withLogo);
    const dv0 = new DataView(withoutLogo);
    expect(dvL.getUint32(80, true)).toBeGreaterThan(dv0.getUint32(80, true));
  });
});
