import { extractDots } from './braille';
import type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
import { addSolidBoxTriangles, addZCylinderTriangles, encodeBinaryStl } from './brailleStlMesh';

export type { BanaBrailleDimensionsMm } from './banaBrailleDimensions';
export { defaultBanaBrailleDimensionsMm, BANA_DIMENSION_RANGES_MM } from './banaBrailleDimensions';

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
  } = options;

  const tris: number[] = [];
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
  const brailleContentMaxX = margin + lastCol * inter + intra + r;
  const brailleContentMaxY = margin + Math.max(0, numLines - 1) * linePitch + cellFootprintY;

  let brailleBaseYOffset = 0;
  let textPhysicalWidth = 0;
  let textPhysicalHeight = 0;
  let textImgData: ImageData | null = null;
  let extractW = 0;
  let extractH = 0;
  const pxToMm = 15.0 / 100.0; // scale 100px font to 15mm tall

  if (printTextLine && numLines === 1) {
    const canvas = new OffscreenCanvas(8192, 256);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 100px sans-serif';
      ctx.textBaseline = 'top';
      const textMetrics = ctx.measureText(printTextLine);
      const textWidthPx = Math.ceil(textMetrics.width);
      ctx.fillStyle = 'black';
      ctx.fillText(printTextLine, 0, 0);

      // Safe bounds to extract
      extractW = Math.min(8192, textWidthPx + 20);
      extractH = 150;
      textImgData = ctx.getImageData(0, 0, extractW, extractH);
      
      textPhysicalWidth = extractW * pxToMm;
      textPhysicalHeight = extractH * pxToMm;

      // Add a 10mm gap between the text and the braille dots
      brailleBaseYOffset = textPhysicalHeight + 10;
    }
  }

  const contentMaxX = Math.max(brailleContentMaxX, margin + textPhysicalWidth);
  const contentMaxY = brailleContentMaxY + brailleBaseYOffset;

  if (textImgData) {
    const data = textImgData.data;
    for (let y = 0; y < extractH; y++) {
      let runStartX = -1;
      for (let x = 0; x < extractW; x++) {
        const idx = (y * extractW + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 128) {
          if (runStartX === -1) runStartX = x;
        } else {
          if (runStartX !== -1) {
            const x0 = margin + runStartX * pxToMm;
            const x1 = margin + x * pxToMm;
            const y0_raw = margin + y * pxToMm;
            const y1_raw = margin + (y + 1) * pxToMm;
            
            // Flip Y axis
            const y0 = contentMaxY - y1_raw;
            const y1 = contentMaxY - y0_raw;

            addSolidBoxTriangles(tris, x0, y0, 0, x1, y1, h);
            runStartX = -1;
          }
        }
      }
      if (runStartX !== -1) {
        const x0 = margin + runStartX * pxToMm;
        const x1 = margin + extractW * pxToMm;
        const y0_raw = margin + y * pxToMm;
        const y1_raw = margin + (y + 1) * pxToMm;
        
        // Flip Y axis
        const y0 = contentMaxY - y1_raw;
        const y1 = contentMaxY - y0_raw;

        addSolidBoxTriangles(tris, x0, y0, 0, x1, y1, h);
      }
    }
  }

  for (let row = 0; row < numLines; row++) {
    const line = unicodeLines[row];
    const chars = [...line];
    for (let col = 0; col < chars.length; col++) {
      const ch = chars[col];
      const dots = extractDots(ch);
      const baseX = margin + col * inter;
      const baseY = margin + row * linePitch + brailleBaseYOffset;

      for (let d = 0; d < 8; d++) {
        if (!dots[d]) continue;
        const off = dotOffsetMm(d, intra);
        if (!off) continue;
        const cx = baseX + off.dx;
        
        // Flip Y axis for the dot center
        const cy = contentMaxY - (baseY + off.dy);
        
        addZCylinderTriangles(tris, cx, cy, 0, h, r, cylinderSegments);
      }
    }
  }

  const x0 = -plateBorderMm;
  const y0 = -plateBorderMm;
  const x1 = contentMaxX + plateBorderMm;
  const y1 = contentMaxY + plateBorderMm;
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
