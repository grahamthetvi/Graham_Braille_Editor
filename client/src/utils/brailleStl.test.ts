import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'opentype.js';
import { buildBrailleStlBinary, maxLogoEdgePxForReliefQuality, reliefSamplesPerMmForQuality } from './brailleStl';
import { defaultBanaBrailleDimensionsMm } from './banaBrailleDimensions';

function loadTestPrintFont() {
  const woffPath = path.join(
    fileURLToPath(new URL('.', import.meta.url)),
    '..',
    '..',
    '..',
    'node_modules',
    '@fontsource',
    'open-sans',
    'files',
    'open-sans-latin-700-normal.woff',
  );
  return parse(readFileSync(woffPath).buffer);
}

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

  it('builds solid logo raster as boundary relief instead of per-pixel boxes', () => {
    const w = 24;
    const h = 24;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;

    const buf = buildBrailleStlBinary({
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
    const dv = new DataView(buf);
    const triCount = dv.getUint32(80, true);
    // Per-pixel boxes would add 24 * 24 * 12 = 6912 triangles for the logo alone.
    expect(triCount).toBeLessThan(400);
  });

  it('rejects relief rasters above the configured pixel budget', () => {
    const w = 12;
    const h = 12;
    const rgba = new Uint8ClampedArray(w * h * 4);

    expect(() =>
      buildBrailleStlBinary({
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
        maxReliefRasterPixels: 100,
      }),
    ).toThrow(/too detailed/);
  });

  it('rejects STL output above the configured triangle budget', () => {
    expect(() =>
      buildBrailleStlBinary({
        unicodeLines: ['\u2801'],
        dimensions: defaultBanaBrailleDimensionsMm(),
        plateThicknessMm: 1,
        plateBorderMm: 1,
        cylinderSegments: 8,
        maxTriangles: 10,
      }),
    ).toThrow(/too detailed/);
  });

  it('maps relief quality to increasing logo raster caps', () => {
    expect(reliefSamplesPerMmForQuality('standard')).toBeLessThan(reliefSamplesPerMmForQuality('high'));
    expect(reliefSamplesPerMmForQuality('high')).toBeLessThan(reliefSamplesPerMmForQuality('ultra'));
    expect(maxLogoEdgePxForReliefQuality('standard', 22)).toBeLessThan(maxLogoEdgePxForReliefQuality('high', 22));
    expect(maxLogoEdgePxForReliefQuality('high', 22)).toBeLessThan(maxLogoEdgePxForReliefQuality('ultra', 22));
  });

  it('vector large print keeps triangle count modest for curved letters', () => {
    const font = loadTestPrintFont();
    const buf = buildBrailleStlBinary({
      unicodeLines: ['\u2801'],
      dimensions: defaultBanaBrailleDimensionsMm(),
      plateThicknessMm: 1,
      plateBorderMm: 1,
      cylinderSegments: 8,
      printTextLine: 'o',
      printFont: font,
    });
    const triVector = new DataView(buf).getUint32(80, true);
    expect(triVector).toBeGreaterThan(40);
    expect(triVector).toBeLessThan(900);
  });
});
