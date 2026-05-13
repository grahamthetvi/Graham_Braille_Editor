import { extractDots } from './braille';
import type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
import { addSolidBoxTriangles, addZCylinderTriangles, encodeBinaryStl } from './brailleStlMesh';
import { emitVectorPrintTextExtrusion, measureVectorPrintText, type VectorPrintFit } from './extrudeVectorPrintText';
import { LOGO_ALPHA_THRESHOLD, type SerializableLogoRaster } from './logoRaster';
import type { Font } from 'opentype.js';

export type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
export { defaultBanaBrailleDimensionsMm, BANA_DIMENSION_RANGES_MM } from './banaBrailleDimensions';
export type { SerializableLogoRaster } from './logoRaster';

/** Horizontal gap between logo relief and braille / large print (mm). */
const LOGO_SIDE_CLEARANCE_MM = 2;

export interface BuildBrailleStlOptions {
  /** Unicode braille lines (e.g. one formatted page from {@link formatBrfPages}). */
  unicodeLines: string[];
  dimensions: BanaBrailleDimensionsMm;
  /** Solid backing thickness below z = 0 (mm). */
  plateThicknessMm: number;
  /** Extra margin around the dot field on the plate (mm). */
  plateBorderMm: number;
  /** Facet count for each dot cylinder (8–16 typical). */
  cylinderSegments: number;
  printTextLine?: string;
  /**
   * Parsed Open Sans (or compatible) font for vector large-print relief.
   * When omitted with {@link printTextLine}, large print falls back to canvas raster prisms.
   */
  printFont?: Font;
  /**
   * Optional RGBA height-map (top-left on the plate). Opaque pixels become raised boxes to {@link BanaBrailleDimensionsMm.dotHeightMm}.
   * Braille and optional large print shift right/down to clear the logo.
   */
  logo?: SerializableLogoRaster;
  /** Millimeters per logo pixel (default ~0.18 keeps typical photos under ~70 mm wide after downscale). */
  logoPxToMm?: number;
}

/**
 * Dot centers relative to the cell’s dot-1 center (standard Braille positions).
 */
function dotOffsetMm(
  dotIndex: number,
  intra: number,
): { dx: number; dy: number } | null {
  switch (dotIndex) {
    case 0:
      return { dx: 0, dy: 0 };
    case 1:
      return { dx: 0, dy: intra };
    case 2:
      return { dx: 0, dy: 2 * intra };
    case 3:
      return { dx: intra, dy: 0 };
    case 4:
      return { dx: intra, dy: intra };
    case 5:
      return { dx: intra, dy: 2 * intra };
    case 6:
      return { dx: 0, dy: 3 * intra };
    case 7:
      return { dx: intra, dy: 3 * intra };
    default:
      return null;
  }
}

function collectOpaqueRunsOnRow(
  rgba: Uint8ClampedArray,
  extractW: number,
  y: number,
  alphaThreshold: number,
): { x0: number; x1: number }[] {
  const runs: { x0: number; x1: number }[] = [];
  let runStartX = -1;
  for (let x = 0; x < extractW; x++) {
    const idx = (y * extractW + x) * 4;
    const alpha = rgba[idx + 3]!;
    if (alpha > alphaThreshold) {
      if (runStartX === -1) runStartX = x;
    } else {
      if (runStartX !== -1) {
        runs.push({ x0: runStartX, x1: x });
        runStartX = -1;
      }
    }
  }
  if (runStartX !== -1) {
    runs.push({ x0: runStartX, x1: extractW });
  }
  return runs;
}

function runKey(r: { x0: number; x1: number }): string {
  return `${r.x0},${r.x1}`;
}

type VerticalStrip = { x0: number; x1: number; y0: number; lastY: number };

/**
 * Extrude opaque raster regions into solid prisms by merging horizontal runs vertically
 * when spans match, so filled areas become a few boxes instead of one thin prism per scanline.
 */
function addAlphaRasterPrismsMerged(
  tris: number[],
  rgba: Uint8ClampedArray,
  extractW: number,
  extractH: number,
  pxToMm: number,
  originMarginX: number,
  originMarginY: number,
  contentMaxY: number,
  prismHeightMm: number,
  alphaThreshold: number,
  xyBump: number,
): void {
  const active = new Map<string, VerticalStrip>();

  const emitStrip = (s: VerticalStrip): void => {
    const x0 = xyBump + originMarginX + s.x0 * pxToMm;
    const x1 = xyBump + originMarginX + s.x1 * pxToMm;
    const y0Raw = originMarginY + s.y0 * pxToMm;
    const y1Raw = originMarginY + (s.lastY + 1) * pxToMm;
    const y0 = xyBump + (contentMaxY - y1Raw);
    const y1 = xyBump + (contentMaxY - y0Raw);
    addSolidBoxTriangles(tris, x0, y0, 0, x1, y1, prismHeightMm);
  };

  for (let y = 0; y < extractH; y++) {
    const runsY = collectOpaqueRunsOnRow(rgba, extractW, y, alphaThreshold);
    const keysY = new Set(runsY.map(runKey));

    for (const [key, strip] of [...active.entries()]) {
      const connected = keysY.has(key) && strip.lastY === y - 1;
      if (!connected) {
        emitStrip(strip);
        active.delete(key);
      }
    }

    for (const run of runsY) {
      const key = runKey(run);
      const existing = active.get(key);
      if (existing && existing.lastY === y - 1) {
        existing.lastY = y;
      } else {
        active.set(key, { x0: run.x0, x1: run.x1, y0: y, lastY: y });
      }
    }
  }

  for (const strip of active.values()) {
    emitStrip(strip);
  }
}

/**
 * Builds a binary STL (little-endian) for one or more logical line blocks.
 * Z = 0 is the top of the plate; dots extend to z = dotHeight.
 */
export function buildBrailleStlBinary(options: BuildBrailleStlOptions): ArrayBuffer {
  const {
    unicodeLines,
    dimensions: dim,
    plateThicknessMm,
    plateBorderMm,
    cylinderSegments,
    printTextLine,
    printFont,
    logo,
    logoPxToMm: logoPxToMmOpt,
  } = options;

  const tris: number[] = [];
  /** Shift all XY so the plate’s outer corner sits at the origin (flat rectangle from (0,0) in plan). */
  const xyBump = plateBorderMm;
  const r = dim.dotBaseDiameterMm / 2;
  const h = dim.dotHeightMm;
  const intra = dim.intraCellCenterMm;
  const inter = dim.interCellCenterMm;
  const linePitch = dim.lineCenterMm;

  const margin = plateBorderMm + r;

  let maxCols = 0;
  for (const line of unicodeLines) {
    maxCols = Math.max(maxCols, [...line].length);
  }
  const numLines = unicodeLines.length;

  const cellFootprintY = 3 * intra + r;
  const lastCol = Math.max(0, maxCols - 1);

  let logoW = 0;
  let logoH = 0;
  let logoRgba: Uint8ClampedArray | null = null;
  const logoPxToMm = logoPxToMmOpt ?? 0.18;
  if (logo && logo.width > 0 && logo.height > 0 && logo.data.byteLength >= logo.width * logo.height * 4) {
    logoW = logo.width;
    logoH = logo.height;
    logoRgba = new Uint8ClampedArray(logo.data);
  }
  const logoPhysicalW = logoRgba ? logoW * logoPxToMm : 0;
  const logoPhysicalH = logoRgba ? logoH * logoPxToMm : 0;
  const reservedLogoX = logoRgba ? logoPhysicalW + LOGO_SIDE_CLEARANCE_MM : 0;

  const brailleContentMaxX = margin + reservedLogoX + lastCol * inter + intra + r;
  const brailleContentMaxY = margin + Math.max(0, numLines - 1) * linePitch + cellFootprintY;

  let brailleBaseYOffset = 0;
  let textPhysicalWidth = 0;
  let textPhysicalHeight = 0;
  let textImgData: ImageData | null = null;
  let extractW = 0;
  let extractH = 0;
  const pxTextToMm = 15.0 / 100.0; // scale 100px font to 15mm tall
  let vectorPrintFit: VectorPrintFit | null = null;

  if (printTextLine && numLines === 1) {
    if (printFont) {
      const fit = measureVectorPrintText(printFont, printTextLine, pxTextToMm);
      textPhysicalWidth = fit.textPhysicalWidth;
      textPhysicalHeight = fit.textPhysicalHeight;
      vectorPrintFit = fit;
    } else {
      const canvas = new OffscreenCanvas(8192, 256);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = 'bold 100px sans-serif';
        ctx.textBaseline = 'top';
        const textMetrics = ctx.measureText(printTextLine);
        const textWidthPx = Math.ceil(textMetrics.width);
        ctx.fillStyle = 'black';
        ctx.fillText(printTextLine, 0, 0);

        extractW = Math.min(8192, textWidthPx + 20);
        extractH = 150;
        textImgData = ctx.getImageData(0, 0, extractW, extractH);

        textPhysicalWidth = extractW * pxTextToMm;
        textPhysicalHeight = extractH * pxTextToMm;
      }
    }
  }

  const topBandMm = Math.max(
    printTextLine && numLines === 1 ? textPhysicalHeight : 0,
    logoRgba ? logoPhysicalH : 0,
  );
  if (topBandMm > 0) {
    brailleBaseYOffset = topBandMm + 10;
  }

  const contentMaxX = Math.max(
    brailleContentMaxX,
    margin + reservedLogoX + textPhysicalWidth,
    margin + logoPhysicalW,
  );
  const contentMaxY = brailleContentMaxY + brailleBaseYOffset;

  if (logoRgba) {
    addAlphaRasterPrismsMerged(
      tris,
      logoRgba,
      logoW,
      logoH,
      logoPxToMm,
      margin,
      margin,
      contentMaxY,
      h,
      LOGO_ALPHA_THRESHOLD,
      xyBump,
    );
  }

  if (vectorPrintFit && printFont && printTextLine) {
    const textOriginX = margin + reservedLogoX;
    emitVectorPrintTextExtrusion(
      tris,
      printFont,
      printTextLine,
      vectorPrintFit,
      textOriginX,
      margin,
      contentMaxY,
      h,
      xyBump,
    );
  } else if (textImgData) {
    const textOriginX = margin + reservedLogoX;
    addAlphaRasterPrismsMerged(
      tris,
      textImgData.data,
      extractW,
      extractH,
      pxTextToMm,
      textOriginX,
      margin,
      contentMaxY,
      h,
      LOGO_ALPHA_THRESHOLD,
      xyBump,
    );
  }

  for (let row = 0; row < numLines; row++) {
    const line = unicodeLines[row];
    const chars = [...line];
    for (let col = 0; col < chars.length; col++) {
      const ch = chars[col];
      const dots = extractDots(ch);
      const baseX = margin + reservedLogoX + col * inter;
      const baseY = margin + row * linePitch + brailleBaseYOffset;

      for (let d = 0; d < 8; d++) {
        if (!dots[d]) continue;
        const off = dotOffsetMm(d, intra);
        if (!off) continue;
        const cx = baseX + off.dx;
        
        // Flip Y axis for the dot center
        const cy = contentMaxY - (baseY + off.dy);
        
        addZCylinderTriangles(tris, cx + xyBump, cy + xyBump, 0, h, r, cylinderSegments);
      }
    }
  }

  const x0 = xyBump - plateBorderMm;
  const y0 = xyBump - plateBorderMm;
  const x1 = xyBump + contentMaxX + plateBorderMm;
  const y1 = xyBump + contentMaxY + plateBorderMm;
  const z0 = -plateThicknessMm;
  const z1 = 0;

  addSolidBoxTriangles(tris, x0, y0, z0, x1, y1, z1);

  return encodeBinaryStl(tris);
}

/** Default download name for STL exports. */
export function defaultStlFilename(pageIndex1Based?: number): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  if (pageIndex1Based !== undefined) {
    return `braille-page-${pageIndex1Based}-${stamp}.stl`;
  }
  return `braille-${stamp}.stl`;
}
