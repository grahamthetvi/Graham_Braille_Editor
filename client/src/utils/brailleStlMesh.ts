/**
 * Low-level triangle soup + binary STL encoder (millimeters).
 * Avoids heavy CSG libraries so full pages stay responsive.
 */

export type Vec3 = [number, number, number];

const STL_HEADER_BYTES = 80;
const FLOATS_PER_TRIANGLE = 12;

function pushTri(
  tris: number[],
  n: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
): void {
  tris.push(
    n[0], n[1], n[2],
    a[0], a[1], a[2],
    b[0], b[1], b[2],
    c[0], c[1], c[2],
  );
}

/** Push one STL triangle using scalar coordinates (matches {@link encodeBinaryStl} layout). */
export function pushStlTriangle(
  tris: number[],
  nx: number,
  ny: number,
  nz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): void {
  pushTri(tris, [nx, ny, nz], [ax, ay, az], [bx, by, bz], [cx, cy, cz]);
}

function pushQuad(tris: number[], n: Vec3, a: Vec3, b: Vec3, c: Vec3, d: Vec3): void {
  pushTri(tris, n, a, b, c);
  pushTri(tris, n, a, c, d);
}

export function triangleCount(tris: number[]): number {
  return Math.floor(tris.length / FLOATS_PER_TRIANGLE);
}

/** Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1] with outward normals. */
export function addSolidBoxTriangles(
  tris: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): void {
  // +X face
  pushTri(tris, [1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
  pushTri(tris, [1, 0, 0], [x1, y0, z0], [x1, y1, z1], [x1, y0, z1]);
  // -X face
  pushTri(tris, [-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
  pushTri(tris, [-1, 0, 0], [x0, y0, z0], [x0, y1, z1], [x0, y1, z0]);
  // +Y face
  pushTri(tris, [0, 1, 0], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1]);
  pushTri(tris, [0, 1, 0], [x0, y1, z0], [x1, y1, z1], [x0, y1, z1]);
  // -Y face
  pushTri(tris, [0, -1, 0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]);
  pushTri(tris, [0, -1, 0], [x0, y0, z0], [x1, y0, z1], [x1, y0, z0]);
  // +Z face
  pushTri(tris, [0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]);
  pushTri(tris, [0, 0, 1], [x0, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  // -Z face
  pushTri(tris, [0, 0, -1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  pushTri(tris, [0, 0, -1], [x0, y0, z0], [x1, y1, z0], [x1, y0, z0]);
}

/**
 * Right circular cylinder along +Z from zBottom to zTop (inclusive heights),
 * centerline at (cx, cy).
 */
export function addZCylinderTriangles(
  tris: number[],
  cx: number,
  cy: number,
  zBottom: number,
  zTop: number,
  radius: number,
  segments: number,
): void {
  if (radius <= 0 || zTop <= zBottom || segments < 3) return;

  const nSeg = segments | 0;
  const twoPi = Math.PI * 2;

  for (let i = 0; i < nSeg; i++) {
    const t0 = (twoPi * i) / nSeg;
    const t1 = (twoPi * (i + 1)) / nSeg;
    const x0 = cx + radius * Math.cos(t0);
    const y0 = cy + radius * Math.sin(t0);
    const x1 = cx + radius * Math.cos(t1);
    const y1 = cy + radius * Math.sin(t1);
    const mx = (x0 + x1) * 0.5 - cx;
    const my = (y0 + y1) * 0.5 - cy;
    const ml = Math.hypot(mx, my) || 1;
    const nx = mx / ml;
    const ny = my / ml;
    pushTri(tris, [nx, ny, 0], [x0, y0, zBottom], [x1, y1, zBottom], [x1, y1, zTop]);
    pushTri(tris, [nx, ny, 0], [x0, y0, zBottom], [x1, y1, zTop], [x0, y0, zTop]);
  }

  // Bottom cap (normal -Z)
  for (let i = 0; i < nSeg; i++) {
    const t0 = (twoPi * i) / nSeg;
    const t1 = (twoPi * (i + 1)) / nSeg;
    const x0 = cx + radius * Math.cos(t0);
    const y0 = cy + radius * Math.sin(t0);
    const x1 = cx + radius * Math.cos(t1);
    const y1 = cy + radius * Math.sin(t1);
    pushTri(tris, [0, 0, -1], [cx, cy, zBottom], [x1, y1, zBottom], [x0, y0, zBottom]);
  }

  // Top cap (normal +Z)
  for (let i = 0; i < nSeg; i++) {
    const t0 = (twoPi * i) / nSeg;
    const t1 = (twoPi * (i + 1)) / nSeg;
    const x0 = cx + radius * Math.cos(t0);
    const y0 = cy + radius * Math.sin(t0);
    const x1 = cx + radius * Math.cos(t1);
    const y1 = cy + radius * Math.sin(t1);
    pushTri(tris, [0, 0, 1], [cx, cy, zTop], [x0, y0, zTop], [x1, y1, zTop]);
  }
}

export interface AlphaRasterReliefOptions {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  pxToMm: number;
  originMarginX: number;
  originMarginY: number;
  contentMaxY: number;
  reliefHeightMm: number;
  alphaThreshold: number;
  xyBump: number;
  /**
   * When true, mirrors raster rows along the horizontal axis (layout Y) so canvas/print rows
   * match braille + STL world Y the same way as vector large-print extrusion.
   */
  flipLayoutY?: boolean;
}

/**
 * Extrudes opaque raster pixels as one relief mesh: merged top strips plus only
 * boundary side walls. This preserves fine raster detail without creating a
 * complete box, including hidden faces, for every scanline or pixel.
 */
export function addAlphaRasterReliefTriangles(tris: number[], options: AlphaRasterReliefOptions): void {
  const {
    rgba,
    width,
    height,
    pxToMm,
    originMarginX,
    originMarginY,
    contentMaxY,
    reliefHeightMm,
    alphaThreshold,
    xyBump,
    flipLayoutY,
  } = options;

  if (width <= 0 || height <= 0 || pxToMm <= 0 || reliefHeightMm <= 0) return;

  const solidAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const idx = (y * width + x) * 4;
    return (rgba[idx + 3] ?? 0) > alphaThreshold;
  };

  const xAt = (x: number): number => xyBump + originMarginX + x * pxToMm;
  /** Horizontal line index 0…height (image pixel grid boundaries) → layout Y (mm). */
  const layoutYmmAtImageBoundary = (boundaryIdx: number): number => {
    const line = flipLayoutY ? height - boundaryIdx : boundaryIdx;
    return originMarginY + line * pxToMm;
  };
  const yAtRaw = (boundaryIdx: number): number =>
    xyBump + (contentMaxY - layoutYmmAtImageBoundary(boundaryIdx));
  const z0 = 0;
  const z1 = reliefHeightMm;

  for (let y = 0; y < height; y++) {
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const solid = x < width && solidAt(x, y);
      if (solid && runStart === -1) {
        runStart = x;
      } else if (!solid && runStart !== -1) {
        const x0 = xAt(runStart);
        const x1 = xAt(x);
        const y0 = yAtRaw(y + 1);
        const y1 = yAtRaw(y);
        pushQuad(tris, [0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
        runStart = -1;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solidAt(x, y)) continue;

      const x0 = xAt(x);
      const x1 = xAt(x + 1);
      const y0 = yAtRaw(y + 1);
      const y1 = yAtRaw(y);

      if (!solidAt(x - 1, y)) {
        pushQuad(tris, [-1, 0, 0], [x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
      }
      if (!solidAt(x + 1, y)) {
        pushQuad(tris, [1, 0, 0], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
      }
      if (!solidAt(x, y - 1)) {
        pushQuad(tris, [0, 1, 0], [x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]);
      }
      if (!solidAt(x, y + 1)) {
        pushQuad(tris, [0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      }
    }
  }
}

/** `tris` stores 12 floats per triangle: nx,ny,nz, v1xyz, v2xyz, v3xyz */
export function encodeBinaryStl(tris: number[]): ArrayBuffer {
  const triCount = triangleCount(tris);
  const out = new ArrayBuffer(STL_HEADER_BYTES + 4 + triCount * 50);
  const dv = new DataView(out);
  const header = new Uint8Array(out, 0, STL_HEADER_BYTES);
  const enc = new TextEncoder();
  header.set(enc.encode('Braille plate STL — units millimeters.').slice(0, STL_HEADER_BYTES));

  dv.setUint32(STL_HEADER_BYTES, triCount, true);
  let off = STL_HEADER_BYTES + 4;
  for (let t = 0; t < triCount; t++) {
    const base = t * FLOATS_PER_TRIANGLE;
    for (let k = 0; k < 12; k++) {
      dv.setFloat32(off, tris[base + k], true);
      off += 4;
    }
    dv.setUint16(off, 0, true);
    off += 2;
  }
  return out;
}
