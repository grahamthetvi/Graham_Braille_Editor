import { extractDots } from './braille';
import type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
import { addAlphaRasterReliefTriangles, addSolidBoxTriangles, addZCylinderTriangles, encodeBinaryStl, triangleCount } from './brailleStlMesh';
import { LOGO_ALPHA_THRESHOLD, type SerializableLogoRaster } from './logoRaster';
import type { Font } from 'opentype.js';
import {
  emitVectorPrintTextExtrusion,
  measureVectorPrintText,
  VECTOR_PRINT_TEXT_BAND_PX,
} from './extrudeVectorPrintText';

export type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
export { defaultBanaBrailleDimensionsMm, BANA_DIMENSION_RANGES_MM } from './banaBrailleDimensions';
export type { SerializableLogoRaster } from './logoRaster';

/** Horizontal gap between logo relief and braille / large print (mm). */
const LOGO_SIDE_CLEARANCE_MM = 2;

export type StlReliefQuality = 'standard' | 'high' | 'ultra';

type ReliefSettings = {
  samplesPerMm: number;
  printTextHeightMm: number;
  maxRasterPixels: number;
  maxTriangles: number;
};

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
   * When set with {@link printTextLine} on a single-line plate, glyph outlines are extruded as vector
   * geometry instead of canvas raster relief (lower triangle count on curves).
   */
  printFont?: Font;
  /**
   * Optional RGBA height-map (top-left on the plate). Opaque pixels become raised relief to
   * {@link BanaBrailleDimensionsMm.dotHeightMm}. Braille and optional large print shift right/down to clear the logo.
   */
  logo?: SerializableLogoRaster;
  /** Millimeters per logo pixel (default ~0.18 keeps typical photos under ~70 mm wide after downscale). */
  logoPxToMm?: number;
  /** Controls raster sampling for raised print letters and logo/image relief. */
  reliefQuality?: StlReliefQuality;
  /** Optional override for print-letter cap height. Defaults to 15 mm. */
  printTextHeightMm?: number;
  /** Optional override for raster samples per millimeter. */
  reliefSamplesPerMm?: number;
  /** Safety cap for any raised relief raster. */
  maxReliefRasterPixels?: number;
  /** Safety cap for generated STL triangles. */
  maxTriangles?: number;
}

export function reliefSamplesPerMmForQuality(quality: StlReliefQuality): number {
  switch (quality) {
    case 'ultra':
      return 24;
    case 'high':
      return 16;
    case 'standard':
    default:
      return 8;
  }
}

export function maxLogoEdgePxForReliefQuality(quality: StlReliefQuality, targetWidthMm: number): number {
  const samples = reliefSamplesPerMmForQuality(quality);
  const edge = Math.ceil(Math.max(4, targetWidthMm) * samples);
  switch (quality) {
    case 'ultra':
      return Math.min(4096, Math.max(768, edge));
    case 'high':
      return Math.min(2048, Math.max(512, edge));
    case 'standard':
    default:
      return Math.min(1024, Math.max(384, edge));
  }
}

function resolveReliefSettings(options: BuildBrailleStlOptions): ReliefSettings {
  const quality = options.reliefQuality ?? 'standard';
  return {
    samplesPerMm: options.reliefSamplesPerMm ?? reliefSamplesPerMmForQuality(quality),
    printTextHeightMm: options.printTextHeightMm ?? 15,
    maxRasterPixels: options.maxReliefRasterPixels ?? 2_500_000,
    maxTriangles: options.maxTriangles ?? 2_000_000,
  };
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

function rasterHasOpaquePixels(rgba: Uint8ClampedArray, width: number, height: number, alphaThreshold: number): boolean {
  for (let y = 0; y < height; y++) {
    if (collectOpaqueRunsOnRow(rgba, width, y, alphaThreshold).length > 0) return true;
  }
  return false;
}

function assertRasterWithinBudget(label: string, width: number, height: number, settings: ReliefSettings): void {
  const pixels = width * height;
  if (pixels > settings.maxRasterPixels) {
    throw new Error(
      `${label} is too detailed for STL export (${width}x${height} px). Choose a lower relief quality or smaller physical size.`,
    );
  }
}

function assertTriangleBudget(tris: number[], settings: ReliefSettings): void {
  const count = triangleCount(tris);
  if (count > settings.maxTriangles) {
    throw new Error(
      `STL is too detailed to generate safely (${count.toLocaleString()} triangles). Choose a lower relief quality or smaller logo.`,
    );
  }
}

function renderPrintTextRaster(
  text: string,
  settings: ReliefSettings,
): { data: Uint8ClampedArray; width: number; height: number; pxToMm: number; physicalWidthMm: number; physicalHeightMm: number } | null {
  if (!text) return null;

  const fontPx = Math.max(16, Math.round(settings.printTextHeightMm * settings.samplesPerMm));
  const padPx = Math.max(4, Math.ceil(fontPx * 0.12));
  const probe = new OffscreenCanvas(1, 1);
  const probeCtx = probe.getContext('2d');
  if (!probeCtx) return null;

  probeCtx.font = `bold ${fontPx}px sans-serif`;
  probeCtx.textBaseline = 'top';
  const metrics = probeCtx.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width + padPx * 2));
  const height = Math.max(1, Math.ceil(fontPx * 1.35 + padPx * 2));
  assertRasterWithinBudget('Print letters', width, height, settings);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'black';
  ctx.fillText(text, padPx, padPx);

  const img = ctx.getImageData(0, 0, width, height);
  if (!rasterHasOpaquePixels(img.data, width, height, LOGO_ALPHA_THRESHOLD)) return null;

  const pxToMm = settings.printTextHeightMm / fontPx;
  return {
    data: img.data,
    width,
    height,
    pxToMm,
    physicalWidthMm: width * pxToMm,
    physicalHeightMm: height * pxToMm,
  };
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
  const reliefSettings = resolveReliefSettings(options);

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
    assertRasterWithinBudget('Logo', logo.width, logo.height, reliefSettings);
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
  let textRaster: ReturnType<typeof renderPrintTextRaster> = null;
  let vectorPrintFit: ReturnType<typeof measureVectorPrintText> | null = null;

  if (printTextLine && numLines === 1) {
    if (printFont) {
      const pxTextToMm = reliefSettings.printTextHeightMm / VECTOR_PRINT_TEXT_BAND_PX;
      vectorPrintFit = measureVectorPrintText(printFont, printTextLine, pxTextToMm);
      textPhysicalWidth = vectorPrintFit.textPhysicalWidth;
      textPhysicalHeight = vectorPrintFit.textPhysicalHeight;
    } else {
      textRaster = renderPrintTextRaster(printTextLine, reliefSettings);
      textPhysicalWidth = textRaster?.physicalWidthMm ?? 0;
      textPhysicalHeight = textRaster?.physicalHeightMm ?? 0;
    }
  }

  const topBandMm = Math.max(vectorPrintFit || textRaster ? textPhysicalHeight : 0, logoRgba ? logoPhysicalH : 0);
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
    addAlphaRasterReliefTriangles(tris, {
      rgba: logoRgba,
      width: logoW,
      height: logoH,
      pxToMm: logoPxToMm,
      originMarginX: margin,
      originMarginY: margin,
      contentMaxY,
      reliefHeightMm: h,
      alphaThreshold: LOGO_ALPHA_THRESHOLD,
      xyBump,
    });
    assertTriangleBudget(tris, reliefSettings);
  }

  if (textRaster) {
    const textOriginX = margin + reservedLogoX;
    addAlphaRasterReliefTriangles(tris, {
      rgba: textRaster.data,
      width: textRaster.width,
      height: textRaster.height,
      pxToMm: textRaster.pxToMm,
      originMarginX: textOriginX,
      originMarginY: margin,
      contentMaxY,
      reliefHeightMm: h,
      alphaThreshold: LOGO_ALPHA_THRESHOLD,
      xyBump,
    });
    assertTriangleBudget(tris, reliefSettings);
  } else if (vectorPrintFit && printFont && printTextLine) {
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
    assertTriangleBudget(tris, reliefSettings);
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

  assertTriangleBudget(tris, reliefSettings);

  const x0 = xyBump - plateBorderMm;
  const y0 = xyBump - plateBorderMm;
  const x1 = xyBump + contentMaxX + plateBorderMm;
  const y1 = xyBump + contentMaxY + plateBorderMm;
  const z0 = -plateThicknessMm;
  const z1 = 0;

  addSolidBoxTriangles(tris, x0, y0, z0, x1, y1, z1);
  assertTriangleBudget(tris, reliefSettings);

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
