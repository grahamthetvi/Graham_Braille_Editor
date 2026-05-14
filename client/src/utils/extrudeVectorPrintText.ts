/**
 * Large-print relief for STL: OpenType glyph outlines → 2D triangulation (earcut) → Z extrusion.
 * Avoids per-scanline raster boxes so curved letters stay low-poly.
 */

import earcut from 'earcut';
import type { Font } from 'opentype.js';
import { pushStlTriangle } from './brailleStlMesh';

/** Minimal shape of opentype.js path commands used for outline flattening. */
type OtPathCmd = {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

export const VECTOR_PRINT_FONT_PX = 100;
export const VECTOR_PRINT_TEXT_BAND_PX = 150;
const BEZIER_SEGMENTS = 6;
const AREA_EPS = 1e-4;

function cubicPoint(
  t: number,
  ax: number,
  ay: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * ax + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * bx,
    y: mt * mt * mt * ay + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * by,
  };
}

function quadPoint(
  t: number,
  ax: number,
  ay: number,
  x1: number,
  y1: number,
  bx: number,
  by: number,
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * ax + 2 * mt * t * x1 + t * t * bx,
    y: mt * mt * ay + 2 * mt * t * y1 + t * t * by,
  };
}

function flattenCubic(
  ax: number,
  ay: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= BEZIER_SEGMENTS; i++) {
    out.push(cubicPoint(i / BEZIER_SEGMENTS, ax, ay, x1, y1, x2, y2, bx, by));
  }
  return out;
}

function flattenQuad(ax: number, ay: number, x1: number, y1: number, bx: number, by: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= BEZIER_SEGMENTS; i++) {
    out.push(quadPoint(i / BEZIER_SEGMENTS, ax, ay, x1, y1, bx, by));
  }
  return out;
}

function commandsToRings(commands: OtPathCmd[]): number[][] {
  const rings: number[][] = [];
  let ring: number[] = [];
  let cx = 0;
  let cy = 0;

  const pushPt = (x: number, y: number): void => {
    if (ring.length >= 2 && ring[ring.length - 2] === x && ring[ring.length - 1] === y) return;
    ring.push(x, y);
  };

  for (const cmd of commands) {
    const t = String(cmd.type).toUpperCase();
    if (t === 'M') {
      if (ring.length >= 6) rings.push(ring);
      ring = [];
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
      pushPt(cx, cy);
    } else if (t === 'L') {
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
      pushPt(cx, cy);
    } else if (t === 'C') {
      const pts = flattenCubic(cx, cy, cmd.x1 ?? 0, cmd.y1 ?? 0, cmd.x2 ?? 0, cmd.y2 ?? 0, cmd.x ?? 0, cmd.y ?? 0);
      for (let i = 1; i < pts.length; i++) {
        pushPt(pts[i]!.x, pts[i]!.y);
      }
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
    } else if (t === 'Q') {
      const pts = flattenQuad(cx, cy, cmd.x1 ?? 0, cmd.y1 ?? 0, cmd.x ?? 0, cmd.y ?? 0);
      for (let i = 1; i < pts.length; i++) {
        pushPt(pts[i]!.x, pts[i]!.y);
      }
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
    } else if (t === 'Z') {
      if (ring.length >= 6) {
        const n = ring.length;
        if (ring[0] === ring[n - 2] && ring[1] === ring[n - 1]) {
          ring.pop();
          ring.pop();
        }
        rings.push(ring);
      }
      ring = [];
    }
  }
  if (ring.length >= 6) rings.push(ring);
  return rings;
}

function signedArea(ring: number[]): number {
  let a = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = ring[i * 2]!;
    const yi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const yj = ring[j * 2 + 1]!;
    a += xi * yj - xj * yi;
  }
  return a * 0.5;
}

function centroid(ring: number[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    sx += ring[i * 2]!;
    sy += ring[i * 2 + 1]!;
  }
  return { x: sx / n, y: sy / n };
}

function pointInRing(x: number, y: number, ring: number[]): boolean {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2]!;
    const yi = ring[i * 2 + 1]!;
    const xj = ring[j * 2]!;
    const yj = ring[j * 2 + 1]!;
    const inter = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (inter) inside = !inside;
  }
  return inside;
}

function findParentRingIndex(rings: number[][], areas: number[], i: number): number | null {
  const c = centroid(rings[i]!);
  const absAi = Math.abs(areas[i]!);
  let best: number | null = null;
  let bestArea = Infinity;
  for (let j = 0; j < rings.length; j++) {
    if (i === j) continue;
    const absAj = Math.abs(areas[j]!);
    if (absAj <= absAi + AREA_EPS) continue;
    if (!pointInRing(c.x, c.y, rings[j]!)) continue;
    if (absAj < bestArea) {
      bestArea = absAj;
      best = j;
    }
  }
  return best;
}

/** One earcut input: flat [x,y,...] and hole start vertex indices for earcut(). */
type EarcutGroup = { verts: number[]; holeVertexIndices: number[] };

function buildEarcutGroupsForGlyph(rings: number[][]): EarcutGroup[] {
  const filtered = rings.filter(r => r.length >= 6 && Math.abs(signedArea(r)) > AREA_EPS);
  if (filtered.length === 0) return [];

  const areas = filtered.map(r => signedArea(r));
  const parents = filtered.map((_, i) => findParentRingIndex(filtered, areas, i));

  const roots: number[] = [];
  for (let i = 0; i < filtered.length; i++) {
    if (parents[i] === null) roots.push(i);
  }

  const groups: EarcutGroup[] = [];
  for (const r of roots) {
    const holeVertexIndices: number[] = [];
    const verts: number[] = [];
    const outer = filtered[r]!;
    verts.push(...outer);
    let vCount = outer.length / 2;

    for (let i = 0; i < filtered.length; i++) {
      if (parents[i] === r) {
        holeVertexIndices.push(vCount);
        const hole = filtered[i]!;
        verts.push(...hole);
        vCount += hole.length / 2;
      }
    }
    groups.push({ verts, holeVertexIndices });
  }
  return groups;
}

function emitExtrudedGroup(
  tris: number[],
  verts: number[],
  triIdx: number[],
  holeVertexIndices: number[],
  z0: number,
  z1: number,
  contentMaxY: number,
  xyBump: number,
): void {
  const xw = (vi: number): number => xyBump + verts[vi * 2]!;
  const yw = (vi: number): number => xyBump + (contentMaxY - verts[vi * 2 + 1]!);

  for (let t = 0; t < triIdx.length; t += 3) {
    const ia = triIdx[t]!;
    const ib = triIdx[t + 1]!;
    const ic = triIdx[t + 2]!;
    pushStlTriangle(tris, 0, 0, 1, xw(ia), yw(ia), z1, xw(ib), yw(ib), z1, xw(ic), yw(ic), z1);
    pushStlTriangle(tris, 0, 0, -1, xw(ia), yw(ia), z0, xw(ic), yw(ic), z0, xw(ib), yw(ib), z0);
  }

  const emitWall = (ia: number, ib: number): void => {
    const ax = xw(ia);
    const ay = yw(ia);
    const bx = xw(ib);
    const by = yw(ib);
    const dx = bx - ax;
    const dy = by - ay;
    const nx = dy;
    const ny = -dx;
    const nl = Math.hypot(nx, ny) || 1;
    const nnx = nx / nl;
    const nny = ny / nl;
    pushStlTriangle(tris, nnx, nny, 0, ax, ay, z0, bx, by, z0, bx, by, z1);
    pushStlTriangle(tris, nnx, nny, 0, ax, ay, z0, bx, by, z1, ax, ay, z1);
  };

  const totalVerts = verts.length / 2;
  const starts = [0, ...holeVertexIndices, totalVerts];
  for (let s = 0; s + 1 < starts.length; s++) {
    const v0 = starts[s]!;
    const v1 = starts[s + 1]!;
    const count = v1 - v0;
    for (let i = 0; i < count; i++) {
      const ia = v0 + i;
      const ib = v0 + ((i + 1) % count);
      emitWall(ia, ib);
    }
  }
}

function transformRingToLayoutMm(
  ring: number[],
  bbox: { x1: number; y1: number; x2: number; y2: number },
  scale: number,
  textOriginXMM: number,
  originMarginYMM: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    const xOt = ring[i]!;
    const yOt = ring[i + 1]!;
    const rawX = textOriginXMM + (xOt - bbox.x1) * scale;
    // Map OT outline (y up) into layout +Y down to match braille/dot + STL world Y after contentMaxY flip.
    const rawY = originMarginYMM + (yOt - bbox.y1) * scale;
    out.push(rawX, rawY);
  }
  return out;
}

export type VectorPrintFit = {
  textPhysicalWidth: number;
  textPhysicalHeight: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  scale: number;
};

export function measureVectorPrintText(font: Font, printTextLine: string, pxTextToMm: number): VectorPrintFit {
  const fullPath = font.getPath(printTextLine, 0, 0, VECTOR_PRINT_FONT_PX);
  const bbox = fullPath.getBoundingBox();
  const bh = Math.max(1e-6, bbox.y2 - bbox.y1);
  const scale = (VECTOR_PRINT_TEXT_BAND_PX * pxTextToMm) / bh;
  return {
    textPhysicalWidth: (bbox.x2 - bbox.x1) * scale + 0.6,
    textPhysicalHeight: VECTOR_PRINT_TEXT_BAND_PX * pxTextToMm,
    bbox,
    scale,
  };
}

function reverseRingVertexOrder(verts: number[], vStart: number, vCount: number): void {
  const pairs: [number, number][] = [];
  for (let i = 0; i < vCount; i++) {
    pairs.push([verts[(vStart + i) * 2]!, verts[(vStart + i) * 2 + 1]!]);
  }
  pairs.reverse();
  for (let i = 0; i < vCount; i++) {
    verts[(vStart + i) * 2] = pairs[i]![0];
    verts[(vStart + i) * 2 + 1] = pairs[i]![1];
  }
}

function triangulateGroupVerts(verts: number[], holeVertexIndices: number[]): number[] {
  const holes = holeVertexIndices.length ? holeVertexIndices : undefined;
  let tri = earcut(verts, holes, 2);
  if (tri.length || !holes) return tri;
  for (let hi = 0; hi < holeVertexIndices.length; hi++) {
    const v0 = holeVertexIndices[hi]!;
    const v1 = hi + 1 < holeVertexIndices.length ? holeVertexIndices[hi + 1]! : verts.length / 2;
    reverseRingVertexOrder(verts, v0, v1 - v0);
  }
  tri = earcut(verts, holes, 2);
  return tri;
}

/**
 * Emit triangulated + extruded large print after layout height {@link contentMaxY} is known.
 */
export function emitVectorPrintTextExtrusion(
  tris: number[],
  font: Font,
  printTextLine: string,
  fit: VectorPrintFit,
  textOriginXMM: number,
  originMarginYMM: number,
  contentMaxY: number,
  prismHeightMm: number,
  xyBump: number,
): void {
  const { bbox, scale } = fit;
  const glyphPaths = font.getPaths(printTextLine, 0, 0, VECTOR_PRINT_FONT_PX);
  const z0 = 0;
  const z1 = prismHeightMm;

  for (const gPath of glyphPaths) {
    const ringsOt = commandsToRings(gPath.commands as OtPathCmd[]);
    const ringsMm = ringsOt.map(r => transformRingToLayoutMm(r, bbox, scale, textOriginXMM, originMarginYMM));
    const groups = buildEarcutGroupsForGlyph(ringsMm);
    for (const g of groups) {
      if (g.verts.length < 6) continue;
      const verts = g.verts.slice();
      const triIdx = triangulateGroupVerts(verts, g.holeVertexIndices);
      if (!triIdx.length) continue;
      emitExtrudedGroup(tris, verts, triIdx, g.holeVertexIndices, z0, z1, contentMaxY, xyBump);
    }
  }
}
