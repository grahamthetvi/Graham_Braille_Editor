import { GridCanvas } from './chartBraille';
import type { Font } from 'opentype.js';
import { getCenterlineStrokes } from './centerlineFont';

/** Standard even-odd test: horizontal ray from (x,y) toward +∞ crosses polygon boundary. */
function pointInPolygonEvenOdd(x: number, y: number, verts: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;
    if ((yi > y) !== (yj > y)) {
      const xInt = xi + ((xj - xi) * (y - yi)) / (yj - yi + 1e-12);
      if (x < xInt) inside = !inside;
    }
  }
  return inside;
}

type OtPathCmd = {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

const BEZIER_SEGMENTS = 6;

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

export class GraphicCanvas extends GridCanvas {
  constructor(cellColumns: number, cellLines: number) {
    super(cellColumns, cellLines);
  }

  fillGlyphInterior(rings: { x: number; y: number }[][]) {
    if (rings.length === 0) return;
    const allVerts = rings.flat();
    const xs = allVerts.map(p => p.x);
    const ys = allVerts.map(p => p.y);
    let minX = Math.floor(Math.min(...xs));
    let maxX = Math.ceil(Math.max(...xs));
    let minY = Math.floor(Math.min(...ys));
    let maxY = Math.ceil(Math.max(...ys));
    minX = Math.max(0, minX);
    maxX = Math.min(this.width - 1, maxX);
    minY = Math.max(0, minY);
    maxY = Math.min(this.height - 1, maxY);

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        let inside = false;
        for (const ring of rings) {
          if (pointInPolygonEvenOdd(px, py, ring)) {
            inside = !inside;
          }
        }
        if (inside) {
          this.setPoint(x, y);
        }
      }
    }
  }

  drawVectorPrintTextToDots(
    font: Font,
    text: string,
    startX: number,
    startY: number,
    fontSize: number,
    filled: boolean,
  ): void {
    if (!text) return;
    const path = font.getPath(text, 0, 0, fontSize);
    const bbox = path.getBoundingBox();
    const dx = (bbox.x1 !== undefined && !isNaN(bbox.x1)) ? startX - bbox.x1 : startX;
    const dy = (bbox.y1 !== undefined && !isNaN(bbox.y1)) ? startY - bbox.y1 : startY;

    const rings: { x: number; y: number }[][] = [];
    let ring: { x: number; y: number }[] = [];
    let cx = 0;
    let cy = 0;

    const pushPt = (x: number, y: number): void => {
      const tx = x + dx;
      const ty = y + dy;
      if (ring.length >= 1 && ring[ring.length - 1].x === tx && ring[ring.length - 1].y === ty) return;
      ring.push({ x: tx, y: ty });
    };

    const commands = path.commands as OtPathCmd[];
    for (const cmd of commands) {
      const t = String(cmd.type).toUpperCase();
      if (t === 'M') {
        if (ring.length >= 3) rings.push(ring);
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
        if (ring.length >= 3) {
          const n = ring.length;
          if (ring[0].x === ring[n - 1].x && ring[0].y === ring[n - 1].y) {
            ring.pop();
          }
          rings.push(ring);
        }
        ring = [];
      }
    }
    if (ring.length >= 3) rings.push(ring);

    if (filled) {
      this.fillGlyphInterior(rings);
    }
    for (const r of rings) {
      if (r.length < 2) continue;
      for (let i = 0; i < r.length; i++) {
        const p1 = r[i];
        const p2 = r[(i + 1) % r.length];
        this.drawLine(p1.x, p1.y, p2.x, p2.y);
      }
    }
  }

  fillDisc(cx: number, cy: number, radius: number) {
    const r = radius;
    if (r <= 0) return;
    const r2 = r * r;
    const yMin = Math.ceil(cy - r);
    const yMax = Math.floor(cy + r);
    for (let y = yMin; y <= yMax; y++) {
      const dy = y - cy;
      const inner = r2 - dy * dy;
      if (inner < 0) continue;
      const w = Math.sqrt(inner);
      const x0 = Math.ceil(cx - w);
      const x1 = Math.floor(cx + w);
      for (let x = x0; x <= x1; x++) {
        this.setPoint(x, y);
      }
    }
  }

  /** Closed polygon (last vertex connects to first). Fills interior on the dot grid. */
  fillPolygonInterior(vertices: { x: number; y: number }[]) {
    if (vertices.length < 3) return;
    const xs = vertices.map(p => p.x);
    const ys = vertices.map(p => p.y);
    let minX = Math.floor(Math.min(...xs));
    let maxX = Math.ceil(Math.max(...xs));
    let minY = Math.floor(Math.min(...ys));
    let maxY = Math.ceil(Math.max(...ys));
    minX = Math.max(0, minX);
    maxX = Math.min(this.width - 1, maxX);
    minY = Math.max(0, minY);
    maxY = Math.min(this.height - 1, maxY);
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        if (pointInPolygonEvenOdd(px, py, vertices)) {
          this.setPoint(x, y);
        }
      }
    }
  }

  private heartVertices(cx: number, cy: number, radius: number): { x: number; y: number }[] {
    if (radius <= 0) return [];
    const scale = radius / 16;
    const steps = Math.max(48, Math.min(200, Math.ceil(radius * 4)));
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push({
        x: Math.round(cx + hx * scale),
        y: Math.round(cy - hy * scale),
      });
    }
    return out;
  }

  drawCircle(cx: number, cy: number, radius: number, filled = false) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    radius = Math.round(radius);
    if (filled) {
      this.fillDisc(cx, cy, radius);
    }
    let x = radius;
    let y = 0;
    let err = 0;

    while (x >= y) {
      this.setPoint(cx + x, cy + y);
      this.setPoint(cx + y, cy + x);
      this.setPoint(cx - y, cy + x);
      this.setPoint(cx - x, cy + y);
      this.setPoint(cx - x, cy - y);
      this.setPoint(cx - y, cy - x);
      this.setPoint(cx + y, cy - x);
      this.setPoint(cx + x, cy - y);

      if (err <= 0) {
        y += 1;
        err += 2 * y + 1;
      }
      if (err > 0) {
        x -= 1;
        err -= 2 * x + 1;
      }
    }
  }

  /**
   * Symmetric heart outline (parametric curve), apex upward on the braille grid.
   * `radius` controls horizontal half-extent (similar spirit to drawCircle radius).
   */
  drawHeart(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const verts = this.heartVertices(cx, cy, radius);
    if (filled) {
      this.fillPolygonInterior(verts);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  drawPolygon(cx: number, cy: number, radius: number, sides: number, angleDegrees: number, filled = false) {
    if (sides < 3) return;
    const points: { x: number; y: number }[] = [];
    const angleRad = (angleDegrees * Math.PI) / 180;
    for (let i = 0; i < sides; i++) {
      const theta = angleRad + (i * 2 * Math.PI) / sides;
      points.push({
        x: cx + radius * Math.cos(theta),
        y: cy + radius * Math.sin(theta),
      });
    }
    if (filled) {
      this.fillPolygonInterior(points);
    }
    for (let i = 0; i < sides; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % sides];
      this.drawLine(p1.x, p1.y, p2.x, p2.y);
    }
  }

  drawClock(cx: number, cy: number, radius: number, hours: number, minutes: number) {
    this.drawCircle(cx, cy, radius);
    // Draw tick marks
    for (let i = 0; i < 12; i++) {
      const theta = (i * 2 * Math.PI) / 12;
      const x1 = cx + radius * 0.8 * Math.cos(theta);
      const y1 = cy + radius * 0.8 * Math.sin(theta);
      const x2 = cx + radius * Math.cos(theta);
      const y2 = cy + radius * Math.sin(theta);
      this.drawLine(x1, y1, x2, y2);
    }
    // Minute hand
    const minTheta = (minutes * 2 * Math.PI) / 60 - Math.PI / 2;
    this.drawLine(cx, cy, cx + radius * 0.8 * Math.cos(minTheta), cy + radius * 0.8 * Math.sin(minTheta));
    // Hour hand
    const hourTheta = ((hours % 12 + minutes / 60) * 2 * Math.PI) / 12 - Math.PI / 2;
    this.drawLine(cx, cy, cx + radius * 0.5 * Math.cos(hourTheta), cy + radius * 0.5 * Math.sin(hourTheta));
  }

  drawFraction(cx: number, cy: number, radius: number, numerator: number, denominator: number) {
    if (denominator <= 0) return;
    this.drawCircle(cx, cy, radius);
    for (let i = 0; i < denominator; i++) {
      const theta = (i * 2 * Math.PI) / denominator - Math.PI / 2;
      this.drawLine(cx, cy, cx + radius * Math.cos(theta), cy + radius * Math.sin(theta));
    }
    // Fill numerator sectors with dots
    for (let i = 0; i < numerator; i++) {
      const theta1 = (i * 2 * Math.PI) / denominator - Math.PI / 2;
      const theta2 = ((i + 1) * 2 * Math.PI) / denominator - Math.PI / 2;
      const midTheta = (theta1 + theta2) / 2;
      for (let r = 2; r < radius - 1; r += 2) {
        this.setPoint(Math.round(cx + r * Math.cos(midTheta)), Math.round(cy + r * Math.sin(midTheta)));
      }
    }
  }

  drawBase10(x: number, y: number, hundreds: number, tens: number, ones: number) {
    let currentX = x;
    const blockH = 10;
    const blockW = 10;

    // Hundreds (10x10 squares)
    for (let i = 0; i < hundreds; i++) {
      this.drawPolygon(currentX + blockW / 2, y + blockH / 2, blockW / 2, 4, 45); // Approximate square
      currentX += blockW + 2;
    }

    // Tens (1x10 lines)
    for (let i = 0; i < tens; i++) {
      this.drawLine(currentX, y, currentX, y + blockH);
      currentX += 3;
    }

    // Ones (1x1 dots)
    for (let i = 0; i < ones; i++) {
      this.setPoint(currentX, y + blockH);
      currentX += 3;
    }
  }

  drawManipulatives(x: number, y: number, rows: number, cols: number, spacing: number) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.drawCircle(x + c * spacing, y + r * spacing, 2);
      }
    }
  }

  drawNumberLine(x: number, y: number, length: number, start: number, end: number, step: number, isVertical: boolean) {
    if (isVertical) {
      this.drawLine(x, y, x, y + length);
      const numTicks = Math.floor((end - start) / step) + 1;
      const tickSpacing = length / (numTicks - 1 || 1);
      for (let i = 0; i < numTicks; i++) {
        const tickY = y + i * tickSpacing;
        this.drawLine(x - 2, tickY, x + 2, tickY);
      }
    } else {
      this.drawLine(x, y, x + length, y);
      const numTicks = Math.floor((end - start) / step) + 1;
      const tickSpacing = length / (numTicks - 1 || 1);
      for (let i = 0; i < numTicks; i++) {
        const tickX = x + i * tickSpacing;
        this.drawLine(tickX, y - 2, tickX, y + 2);
      }
    }
  }

  drawImplicitShape(
    minX: number, maxX: number, minY: number, maxY: number,
    isInside: (x: number, y: number) => boolean,
    filled: boolean
  ) {
    const minXClamped = Math.max(0, Math.floor(minX));
    const maxXClamped = Math.min(this.width - 1, Math.ceil(maxX));
    const minYClamped = Math.max(0, Math.floor(minY));
    const maxYClamped = Math.min(this.height - 1, Math.ceil(maxY));

    for (let y = minYClamped; y <= maxYClamped; y++) {
      for (let x = minXClamped; x <= maxXClamped; x++) {
        if (isInside(x, y)) {
          if (filled) {
            this.setPoint(x, y);
          } else {
            // Outline: check if at least one 8-neighbor is outside
            let isBoundary = false;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height || !isInside(nx, ny)) {
                  isBoundary = true;
                  break;
                }
              }
              if (isBoundary) break;
            }
            if (isBoundary) {
              this.setPoint(x, y);
            }
          }
        }
      }
    }
  }

  drawCloud(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const isInsideCloud = (x: number, y: number): boolean => {
      const dx = x - cx;
      const dy = y - cy;
      const sx = dx / 1.3;
      const sy = dy;

      const centers = [
        { x: 0, y: -radius * 0.2, rad: radius * 0.5 },
        { x: -radius * 0.55, y: radius * 0.1, rad: radius * 0.38 },
        { x: radius * 0.55, y: radius * 0.1, rad: radius * 0.38 },
        { x: -radius * 0.28, y: -radius * 0.1, rad: radius * 0.45 },
        { x: radius * 0.28, y: -radius * 0.1, rad: radius * 0.45 },
        { x: 0, y: radius * 0.18, rad: radius * 0.42 }
      ];

      return centers.some(c => {
        const d2 = (sx - c.x) ** 2 + (sy - c.y) ** 2;
        return d2 <= c.rad ** 2;
      });
    };

    const minX = cx - radius * 1.35;
    const maxX = cx + radius * 1.35;
    const minY = cy - radius * 1.1;
    const maxY = cy + radius * 1.1;

    this.drawImplicitShape(minX, maxX, minY, maxY, isInsideCloud, filled);
  }

  drawCrescentMoon(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const isInsideMoon = (x: number, y: number): boolean => {
      const d1_2 = (x - (cx - radius * 0.1)) ** 2 + (y - cy) ** 2;
      const d2_2 = (x - (cx + radius * 0.35)) ** 2 + (y - (cy - radius * 0.1)) ** 2;
      return d1_2 <= radius ** 2 && d2_2 > (radius * 0.95) ** 2;
    };

    const minX = cx - radius * 1.2;
    const maxX = cx + radius * 1.2;
    const minY = cy - radius * 1.2;
    const maxY = cy + radius * 1.2;

    this.drawImplicitShape(minX, maxX, minY, maxY, isInsideMoon, filled);
  }

  drawLightningBolt(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const verts = [
      { x: cx + radius * 0.1, y: cy - radius },
      { x: cx + radius * 0.45, y: cy - radius * 0.2 },
      { x: cx + radius * 0.05, y: cy - radius * 0.25 }, // sharper cut-in
      { x: cx + radius * 0.5, y: cy + radius * 0.25 },
      { x: cx - radius * 0.2, y: cy + radius },
      { x: cx - radius * 0.05, y: cy + radius * 0.15 }, // sharper cut-in
      { x: cx - radius * 0.45, y: cy + radius * 0.1 }
    ];

    if (filled) {
      this.fillPolygonInterior(verts);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  drawCloudLightning(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const isInsideCloud = (x: number, y: number): boolean => {
      const cloudCy = cy - radius * 0.25;
      const dx = x - cx;
      const dy = y - cloudCy;
      const sx = dx / 1.3;
      const sy = dy;

      const centers = [
        { x: 0, y: -radius * 0.2, rad: radius * 0.5 },
        { x: -radius * 0.55, y: radius * 0.1, rad: radius * 0.38 },
        { x: radius * 0.55, y: radius * 0.1, rad: radius * 0.38 },
        { x: -radius * 0.28, y: -radius * 0.1, rad: radius * 0.45 },
        { x: radius * 0.28, y: -radius * 0.1, rad: radius * 0.45 },
        { x: 0, y: radius * 0.18, rad: radius * 0.42 }
      ];

      return centers.some(c => {
        const d2 = (sx - c.x) ** 2 + (sy - c.y) ** 2;
        return d2 <= c.rad ** 2;
      });
    };

    const minX = cx - radius * 1.35;
    const maxX = cx + radius * 1.35;
    const minY = cy - radius * 1.35;
    const maxY = cy + radius * 0.5;

    this.drawImplicitShape(minX, maxX, minY, maxY, isInsideCloud, true);

    const bx = cx - radius * 0.05;
    const by = cy + radius * 0.55;
    const br = radius * 0.6;

    const verts = [
      { x: bx + br * 0.1, y: by - br },
      { x: bx + br * 0.45, y: by - br * 0.2 },
      { x: bx + br * 0.05, y: by - br * 0.25 },
      { x: bx + br * 0.5, y: by + br * 0.25 },
      { x: bx - br * 0.2, y: by + br },
      { x: bx - br * 0.05, y: by + br * 0.15 },
      { x: bx - br * 0.45, y: by + br * 0.1 }
    ];

    if (filled) {
      this.fillPolygonInterior(verts);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  drawActingMask(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const drawSingleMask = (mcx: number, mcy: number, mr: number, isHappy: boolean) => {
      const isInsideMask = (x: number, y: number): boolean => {
        const dx = x - mcx;
        const dy = y - mcy;
        return (dx / 0.85) ** 2 + dy ** 2 <= mr ** 2;
      };

      const isInsideEyeLeft = (x: number, y: number): boolean => {
        const ex = mcx - mr * 0.35;
        const ey = mcy - mr * 0.25;
        return (x - ex) ** 2 + ((y - ey) / 0.6) ** 2 <= (mr * 0.16) ** 2;
      };

      const isInsideEyeRight = (x: number, y: number): boolean => {
        const ex = mcx + mr * 0.35;
        const ey = mcy - mr * 0.25;
        return (x - ex) ** 2 + ((y - ey) / 0.6) ** 2 <= (mr * 0.16) ** 2;
      };

      const isInsideMouth = (x: number, y: number): boolean => {
        const my = mcy + mr * 0.35;
        const mx = mcx;
        const dy = y - my;
        const dx = x - mx;
        if (isHappy) {
          const inOuter = (dx / 0.55) ** 2 + (dy / 0.35) ** 2 <= mr ** 2;
          const inInner = (dx / 0.55) ** 2 + ((dy + mr * 0.15) / 0.35) ** 2 <= mr ** 2;
          return inOuter && !inInner && y >= my - mr * 0.1;
        } else {
          const inOuter = (dx / 0.55) ** 2 + (dy / 0.35) ** 2 <= mr ** 2;
          const inInner = (dx / 0.55) ** 2 + ((dy - mr * 0.15) / 0.35) ** 2 <= mr ** 2;
          return inOuter && !inInner && y <= my + mr * 0.1;
        }
      };

      const isInsideMaskCombined = (x: number, y: number): boolean => {
        if (!isInsideMask(x, y)) return false;
        if (isInsideEyeLeft(x, y)) return false;
        if (isInsideEyeRight(x, y)) return false;
        if (isInsideMouth(x, y)) return false;
        return true;
      };

      const minX = mcx - mr * 1.1;
      const maxX = mcx + mr * 1.1;
      const minY = mcy - mr * 1.1;
      const maxY = mcy + mr * 1.1;

      this.drawImplicitShape(minX, maxX, minY, maxY, isInsideMaskCombined, filled);
    };

    const rMask = radius * 0.65;
    drawSingleMask(cx - radius * 0.45, cy - radius * 0.25, rMask, true);
    drawSingleMask(cx + radius * 0.45, cy + radius * 0.25, rMask, false);
  }

  drawBirdHouse(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    if (filled) {
      const isInsideBirdHouse = (x: number, y: number): boolean => {
        const rx = x - cx;
        const ry = y - cy;

        // Roof triangle
        if (ry >= -radius && ry <= -radius * 0.2) {
          const roofWidth = (ry + radius) * 0.8 / 0.8;
          if (Math.abs(rx) <= roofWidth) {
            return true;
          }
        }

        // Body rectangle
        if (ry > -radius * 0.2 && ry <= radius * 0.7 && Math.abs(rx) <= radius * 0.6) {
          const hx = rx;
          const hy = ry - radius * 0.15;
          const inHole = hx * hx + hy * hy <= (radius * 0.18) ** 2;
          return !inHole;
        }

        return false;
      };

      const minX = cx - radius * 0.9;
      const maxX = cx + radius * 0.9;
      const minY = cy - radius;
      const maxY = cy + radius * 0.7;

      this.drawImplicitShape(minX, maxX, minY, maxY, isInsideBirdHouse, true);

      // Draw pole & perch
      this.drawLine(cx, cy + radius * 0.7, cx, cy + radius * 1.3);
      this.drawLine(cx - radius * 0.15, cy + radius * 0.42, cx + radius * 0.15, cy + radius * 0.42);
    } else {
      // Outline mode
      // Roof
      this.drawLine(cx, cy - radius, cx - radius * 0.8, cy - radius * 0.2);
      this.drawLine(cx, cy - radius, cx + radius * 0.8, cy - radius * 0.2);
      this.drawLine(cx - radius * 0.8, cy - radius * 0.2, cx + radius * 0.8, cy - radius * 0.2);

      // Body walls & floor
      this.drawLine(cx - radius * 0.6, cy - radius * 0.2, cx - radius * 0.6, cy + radius * 0.7);
      this.drawLine(cx + radius * 0.6, cy - radius * 0.2, cx + radius * 0.6, cy + radius * 0.7);
      this.drawLine(cx - radius * 0.6, cy + radius * 0.7, cx + radius * 0.6, cy + radius * 0.7);

      // Entrance hole
      this.drawCircle(cx, cy + radius * 0.15, Math.round(radius * 0.18), false);

      // Perch
      this.drawLine(cx - radius * 0.15, cy + radius * 0.42, cx + radius * 0.15, cy + radius * 0.42);

      // Pole
      this.drawLine(cx, cy + radius * 0.7, cx, cy + radius * 1.3);
    }
  }

  drawBeach(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const rx = radius * 0.7;
    const ry = radius * 0.3;
    const baseY = cy + radius * 0.4;

    // 1. Draw the top curve of the half oval
    let prevX = cx - rx;
    let prevY = baseY;
    for (let x = cx - rx + 1; x <= cx + rx; x++) {
      const ratio = (x - cx) / rx;
      const y = baseY - ry * Math.sqrt(Math.max(0, 1 - ratio * ratio));
      this.drawLine(prevX, prevY, x, y);
      prevX = x;
      prevY = y;
    }
    // Draw flat bottom line of the half oval
    this.drawLine(cx - rx, baseY, cx + rx, baseY);

    // 2. Dots to represent the sand inside the half oval
    if (filled) {
      // Solid filled sand
      for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
        const ratio = (x - cx) / rx;
        const yTop = Math.round(baseY - ry * Math.sqrt(Math.max(0, 1 - ratio * ratio)));
        this.drawLine(x, yTop, x, Math.round(baseY));
      }
    } else {
      // A few dots to represent the sand in outline mode
      const sandOffsets = [
        { dx: -0.4, dy: -0.1 },
        { dx: -0.2, dy: -0.2 },
        { dx: 0, dy: -0.1 },
        { dx: 0.2, dy: -0.15 },
        { dx: 0.4, dy: -0.08 },
        { dx: -0.5, dy: -0.05 },
        { dx: 0.5, dy: -0.05 },
        { dx: -0.1, dy: -0.08 },
        { dx: 0.1, dy: -0.22 }
      ];
      for (const off of sandOffsets) {
        this.setPoint(Math.round(cx + radius * off.dx), Math.round(baseY + radius * off.dy));
      }
    }

    // 3. Palm tree growing on the sand
    const trunkX0 = cx - radius * 0.1;
    const trunkY0 = baseY - radius * 0.05;
    const trunkXt = cx - radius * 0.25;
    const trunkYt = cy - radius * 0.45;
    let prevTX = trunkX0;
    let prevTY = trunkY0;
    const tsteps = 8;
    for (let i = 1; i <= tsteps; i++) {
      const t = i / tsteps;
      const tx = (1 - t) * trunkX0 + t * trunkXt - radius * 0.08 * Math.sin(t * Math.PI);
      const ty = (1 - t) * trunkY0 + t * trunkYt;
      this.drawLine(prevTX, prevTY, tx, ty);
      prevTX = tx;
      prevTY = ty;
    }

    // Palm leaves (fronds) at trunk top
    const drawFrond = (fx: number, fy: number, tx: number, ty: number, controlYOffset: number) => {
      let px = fx;
      let py = fy;
      const fsteps = 6;
      for (let j = 1; j <= fsteps; j++) {
        const t = j / fsteps;
        const x = fx + (tx - fx) * t;
        const y = fy + (ty - fy) * t - controlYOffset * Math.sin(t * Math.PI);
        this.drawLine(px, py, x, y);
        px = x;
        py = y;
      }
    };

    drawFrond(trunkXt, trunkYt, trunkXt - radius * 0.4, trunkYt + radius * 0.1, radius * 0.1);
    drawFrond(trunkXt, trunkYt, trunkXt - radius * 0.3, trunkYt - radius * 0.15, radius * 0.15);
    drawFrond(trunkXt, trunkYt, trunkXt + radius * 0.25, trunkYt - radius * 0.2, radius * 0.18);
    drawFrond(trunkXt, trunkYt, trunkXt + radius * 0.4, trunkYt - radius * 0.02, radius * 0.12);
    drawFrond(trunkXt, trunkYt, trunkXt + radius * 0.28, trunkYt + radius * 0.18, radius * 0.05);

    // 4. Wave underneath the sand
    const waveYBase = cy + radius * 0.65;
    let prevWX = cx - radius * 0.8;
    let prevWY = waveYBase + Math.sin((-radius * 0.8) / (radius * 0.35 || 1)) * radius * 0.08;
    for (let x = cx - radius * 0.8 + 1; x <= cx + radius * 0.8; x++) {
      const wy = waveYBase + Math.sin((x - cx) / (radius * 0.35 || 1)) * radius * 0.08;
      this.drawLine(prevWX, prevWY, x, wy);
      prevWX = x;
      prevWY = wy;
    }

    const waveYBase2 = cy + radius * 0.8;
    let prevWX2 = cx - radius * 0.6;
    let prevWY2 = waveYBase2 + Math.sin((-radius * 0.6) / (radius * 0.35 || 1)) * radius * 0.08;
    for (let x = cx - radius * 0.6 + 1; x <= cx + radius * 0.6; x++) {
      const wy = waveYBase2 + Math.sin((x - cx) / (radius * 0.35 || 1)) * radius * 0.08;
      this.drawLine(prevWX2, prevWY2, x, wy);
      prevWX2 = x;
      prevWY2 = wy;
    }
  }

  drawMovieProjector(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    // Reel drawing helper
    const drawReel = (rcx: number, rcy: number, rr: number) => {
      if (filled) {
        this.fillDisc(Math.round(rcx), Math.round(rcy), Math.round(rr));
      } else {
        this.drawCircle(Math.round(rcx), Math.round(rcy), Math.round(rr), false);
        // Spokes
        this.drawLine(rcx - rr, rcy, rcx + rr, rcy);
        this.drawLine(rcx - rr * 0.7, rcy - rr * 0.7, rcx + rr * 0.7, rcy + rr * 0.7);
        this.drawLine(rcx - rr * 0.7, rcy + rr * 0.7, rcx + rr * 0.7, rcy - rr * 0.7);
      }
    };

    // 1. Reel centers and radii
    const leftReelCx = cx - radius * 0.45;
    const leftReelCy = cy - radius * 0.35;
    const leftReelR = radius * 0.28;

    const rightReelCx = cx + radius * 0.05;
    const rightReelCy = cy - radius * 0.4;
    const rightReelR = radius * 0.28;

    // 2. Arms
    this.drawLine(cx - radius * 0.25, cy + radius * 0.1, leftReelCx, leftReelCy);
    this.drawLine(cx, cy + radius * 0.1, rightReelCx, rightReelCy);

    // 3. Reels
    drawReel(leftReelCx, leftReelCy, leftReelR);
    drawReel(rightReelCx, rightReelCy, rightReelR);

    // 4. Projector Body
    const bx1 = cx - radius * 0.35;
    const bx2 = cx + radius * 0.1;
    const by1 = cy + radius * 0.1;
    const by2 = cy + radius * 0.55;

    if (filled) {
      const bodyVerts = [
        { x: bx1, y: by1 },
        { x: bx2, y: by1 },
        { x: bx2, y: by2 },
        { x: bx1, y: by2 }
      ];
      this.fillPolygonInterior(bodyVerts);
    } else {
      this.drawLine(bx1, by1, bx2, by1);
      this.drawLine(bx2, by1, bx2, by2);
      this.drawLine(bx2, by2, bx1, by2);
      this.drawLine(bx1, by2, bx1, by1);
    }

    // 5. Lens
    const lx1 = cx + radius * 0.1;
    const lx2 = cx + radius * 0.25;
    const ly1 = cy + radius * 0.2;
    const ly2 = cy + radius * 0.4;

    if (filled) {
      const lensVerts = [
        { x: lx1, y: ly1 },
        { x: lx2, y: ly1 },
        { x: lx2, y: ly2 },
        { x: lx1, y: ly2 }
      ];
      this.fillPolygonInterior(lensVerts);
    } else {
      this.drawLine(lx1, ly1, lx2, ly1);
      this.drawLine(lx2, ly1, lx2, ly2);
      this.drawLine(lx2, ly2, lx1, ly2);
      this.drawLine(lx1, ly2, lx1, ly1);
    }

    // 6. Light Cone (always outline/rays to feel like light)
    this.drawLine(cx + radius * 0.25, cy + radius * 0.25, cx + radius * 0.85, cy + radius * 0.05);
    this.drawLine(cx + radius * 0.25, cy + radius * 0.35, cx + radius * 0.85, cy + radius * 0.55);
    this.drawLine(cx + radius * 0.85, cy + radius * 0.05, cx + radius * 0.85, cy + radius * 0.55);

    // Inner ray lines
    this.drawLine(cx + radius * 0.25, cy + radius * 0.3, cx + radius * 0.85, cy + radius * 0.22);
    this.drawLine(cx + radius * 0.25, cy + radius * 0.3, cx + radius * 0.85, cy + radius * 0.38);

    // 7. Stand/Tripod (always outline)
    const jx = cx - radius * 0.12;
    const jy = cy + radius * 0.55;
    this.drawLine(jx, jy, jx, cy + radius * 0.95);
    this.drawLine(jx, jy, jx - radius * 0.26, cy + radius * 0.9);
    this.drawLine(jx, jy, jx + radius * 0.26, cy + radius * 0.9);
  }

  drawBowling(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    // Helper to clear a line of dots
    const clearLine = (x0: number, y0: number, x1: number, y1: number) => {
      x0 = Math.round(x0);
      y0 = Math.round(y0);
      x1 = Math.round(x1);
      y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      while (true) {
        if (x0 >= 0 && x0 < this.width && y0 >= 0 && y0 < this.height) {
          this.data[y0][x0] = false;
        }
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    };

    // Helper to get pin vertices
    const getPinVerts = (pcx: number, pcy: number, ph: number) => {
      return [
        { x: pcx, y: pcy - ph * 0.5 },
        { x: pcx + ph * 0.12, y: pcy - ph * 0.38 },
        { x: pcx + ph * 0.06, y: pcy - ph * 0.22 },
        { x: pcx + ph * 0.22, y: pcy + ph * 0.1 },
        { x: pcx + ph * 0.12, y: pcy + ph * 0.5 },
        { x: pcx - ph * 0.12, y: pcy + ph * 0.5 },
        { x: pcx - ph * 0.22, y: pcy + ph * 0.1 },
        { x: pcx - ph * 0.06, y: pcy - ph * 0.22 },
        { x: pcx - ph * 0.12, y: pcy - ph * 0.38 }
      ];
    };

    const drawSinglePin = (pcx: number, pcy: number, ph: number) => {
      const pinVerts = getPinVerts(pcx, pcy, ph);

      if (filled) {
        this.fillPolygonInterior(pinVerts);
        
        // Clear stripe
        const sy1 = Math.round(pcy - ph * 0.26);
        const sy2 = Math.round(pcy - ph * 0.20);
        for (let y = sy1; y <= sy2; y++) {
          const sxLeft = Math.round(pcx - ph * 0.1);
          const sxRight = Math.round(pcx + ph * 0.1);
          for (let x = sxLeft; x <= sxRight; x++) {
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
              this.data[y][x] = false;
            }
          }
        }
      } else {
        // Draw outline of the pin
        for (let i = 0; i < pinVerts.length; i++) {
          const a = pinVerts[i];
          const b = pinVerts[(i + 1) % pinVerts.length];
          this.drawLine(a.x, a.y, b.x, b.y);
        }
        // Draw stripe lines
        this.drawLine(pcx - ph * 0.08, pcy - ph * 0.26, pcx + ph * 0.08, pcy - ph * 0.26);
        this.drawLine(pcx - ph * 0.07, pcy - ph * 0.20, pcx + ph * 0.07, pcy - ph * 0.20);
      }
    };

    const clearPinInterior = (pcx: number, pcy: number, ph: number) => {
      const pinVerts = getPinVerts(pcx, pcy, ph);
      if (pinVerts.length < 3) return;
      const xs = pinVerts.map(p => p.x);
      const ys = pinVerts.map(p => p.y);
      let minX = Math.floor(Math.min(...xs));
      let maxX = Math.ceil(Math.max(...xs));
      let minY = Math.floor(Math.min(...ys));
      let maxY = Math.ceil(Math.max(...ys));
      minX = Math.max(0, minX - 1);
      maxX = Math.min(this.width - 1, maxX + 1);
      minY = Math.max(0, minY - 1);
      maxY = Math.min(this.height - 1, maxY + 1);
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          if (pointInPolygonEvenOdd(px, py, pinVerts)) {
            this.data[y][x] = false;
          }
        }
      }
    };

    const clearPinOutline = (pcx: number, pcy: number, ph: number) => {
      const pinVerts = getPinVerts(pcx, pcy, ph);
      for (let i = 0; i < pinVerts.length; i++) {
        const a = pinVerts[i];
        const b = pinVerts[(i + 1) % pinVerts.length];
        clearLine(a.x, a.y, b.x, b.y);
        clearLine(a.x - 1, a.y, b.x - 1, b.y);
        clearLine(a.x + 1, a.y, b.x + 1, b.y);
        clearLine(a.x, a.y - 1, b.x, b.y - 1);
        clearLine(a.x, a.y + 1, b.x, b.y + 1);
      }
    };

    // Pin 1 (Back-left)
    const p1cx = cx + radius * 0.22;
    const p1cy = cy - radius * 0.1;
    const p1h = radius * 0.8;

    // Pin 2 (Back-right)
    const p2cx = cx + radius * 0.58;
    const p2cy = cy - radius * 0.1;
    const p2h = radius * 0.8;

    // Pin 3 (Front-center)
    const p3cx = cx + radius * 0.4;
    const p3cy = cy + radius * 0.2;
    const p3h = radius * 0.8;

    // Draw the two back pins
    drawSinglePin(p1cx, p1cy, p1h);
    drawSinglePin(p2cx, p2cy, p2h);

    // Prepare space for front pin to create a clean depth separation
    if (filled) {
      clearPinOutline(p3cx, p3cy, p3h);
    } else {
      clearPinInterior(p3cx, p3cy, p3h);
    }

    // Draw the front pin
    drawSinglePin(p3cx, p3cy, p3h);

    // 2. Bowling Ball (on the left)
    const bcx = cx - radius * 0.4;
    const bcy = cy + radius * 0.2;
    const br = radius * 0.38;

    if (filled) {
      this.fillDisc(Math.round(bcx), Math.round(bcy), Math.round(br));

      // Clear 3 finger holes
      const holes = [
        { hx: bcx - br * 0.15, hy: bcy - br * 0.3 },
        { hx: bcx + br * 0.15, hy: bcy - br * 0.3 },
        { hx: bcx, hy: bcy - br * 0.05 }
      ];

      for (const h of holes) {
        const cx = Math.round(h.hx);
        const cy = Math.round(h.hy);
        const pts = [
          { x: cx, y: cy },
          { x: cx - 1, y: cy },
          { x: cx + 1, y: cy },
          { x: cx, y: cy - 1 },
          { x: cx, y: cy + 1 }
        ];
        for (const pt of pts) {
          if (pt.x >= 0 && pt.x < this.width && pt.y >= 0 && pt.y < this.height) {
            this.data[pt.y][pt.x] = false;
          }
        }
      }
    } else {
      this.drawCircle(Math.round(bcx), Math.round(bcy), Math.round(br), false);

      // Draw 3 finger holes as single dots
      this.setPoint(Math.round(bcx - br * 0.15), Math.round(bcy - br * 0.3));
      this.setPoint(Math.round(bcx + br * 0.15), Math.round(bcy - br * 0.3));
      this.setPoint(Math.round(bcx), Math.round(bcy - br * 0.05));
    }

    // 3. Motion lines
    this.drawLine(bcx - br * 1.3, bcy - br * 0.2, bcx - br * 1.0, bcy - br * 0.2);
    this.drawLine(bcx - br * 1.4, bcy + br * 0.1, bcx - br * 1.1, bcy + br * 0.1);
    this.drawLine(bcx - br * 1.2, bcy + br * 0.4, bcx - br * 0.9, bcy + br * 0.4);
  }

  drawStar(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const verts: { x: number; y: number }[] = [];
    const rInner = radius * 0.4;
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? radius : rInner;
      verts.push({
        x: cx + rad * Math.cos(angle),
        y: cy + rad * Math.sin(angle)
      });
    }

    if (filled) {
      this.fillPolygonInterior(verts);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  drawApple(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const isInsideAppleBody = (x: number, y: number): boolean => {
      const dLeft = (x - (cx - radius * 0.22)) ** 2 + (y - (cy + radius * 0.05)) ** 2;
      const dRight = (x - (cx + radius * 0.22)) ** 2 + (y - (cy + radius * 0.05)) ** 2;

      const inLobes = dLeft <= (radius * 0.75) ** 2 || dRight <= (radius * 0.75) ** 2;
      if (!inLobes) return false;

      const dTopIndent = (x - cx) ** 2 + (y - (cy - radius * 0.8)) ** 2;
      if (dTopIndent <= (radius * 0.32) ** 2) return false;

      const dBottomIndent = (x - cx) ** 2 + (y - (cy + radius * 0.85)) ** 2;
      if (dBottomIndent <= (radius * 0.28) ** 2) return false;

      return true;
    };

    const minX = cx - radius * 1.1;
    const maxX = cx + radius * 1.1;
    const minY = cy - radius * 1.1;
    const maxY = cy + radius * 1.1;

    this.drawImplicitShape(minX, maxX, minY, maxY, isInsideAppleBody, filled);

    // Stem
    this.drawLine(cx, cy - radius * 0.48, cx + radius * 0.15, cy - radius * 0.8);
  }

  drawCross(
    cx: number,
    cy: number,
    radius: number,
    lengthHorizontal: number,
    thicknessVertical: number,
    thicknessHorizontal: number,
    heightRatio: number,
    filled = false
  ) {
    if (radius <= 0) return;
    const rVert = radius;
    const rHoriz = Math.max(1, Math.round(lengthHorizontal / 2));
    const wVert = Math.max(1, Math.round(thicknessVertical));
    const wHoriz = Math.max(1, Math.round(thicknessHorizontal));

    const cyCrossbar = cy - rVert + 2 * rVert * heightRatio;

    const halfVertW = wVert / 2;
    const halfHorizH = wHoriz / 2;

    const verts = [
      { x: cx - halfVertW, y: cy - rVert },
      { x: cx + halfVertW, y: cy - rVert },
      { x: cx + halfVertW, y: cyCrossbar - halfHorizH },
      { x: cx + rHoriz, y: cyCrossbar - halfHorizH },
      { x: cx + rHoriz, y: cyCrossbar + halfHorizH },
      { x: cx + halfVertW, y: cyCrossbar + halfHorizH },
      { x: cx + halfVertW, y: cy + rVert },
      { x: cx - halfVertW, y: cy + rVert },
      { x: cx - halfVertW, y: cyCrossbar + halfHorizH },
      { x: cx - rHoriz, y: cyCrossbar + halfHorizH },
      { x: cx - rHoriz, y: cyCrossbar - halfHorizH },
      { x: cx - halfVertW, y: cyCrossbar - halfHorizH }
    ];

    if (filled) {
      this.fillPolygonInterior(verts);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  /**
   * Daisy-style flower: a round center ringed by distinct rounded petals,
   * sitting on a straight stem with two opposing leaves.
   * The flower head is centred above `cy`; the stem and leaves hang below.
   */
  drawFlower(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const headCy = cy - radius * 0.42;
    const petalCount = 6;
    const petalDist = radius * 0.6;
    const petalR = radius * 0.34;
    const centerR = radius * 0.3;

    const petalCenters: { x: number; y: number }[] = [];
    for (let i = 0; i < petalCount; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / petalCount;
      petalCenters.push({
        x: Math.round(cx + Math.cos(angle) * petalDist),
        y: Math.round(headCy + Math.sin(angle) * petalDist),
      });
    }

    if (filled) {
      // Solid bloom: every petal disc plus the central disc.
      for (const p of petalCenters) {
        this.fillDisc(p.x, p.y, petalR);
      }
      this.fillDisc(cx, headCy, centerR);
    } else {
      // Outline bloom: open petal rings with a solid filled centre disc.
      for (const p of petalCenters) {
        this.drawCircle(p.x, p.y, Math.round(petalR), false);
      }
      this.drawCircle(Math.round(cx), Math.round(headCy), Math.round(centerR), true);
    }

    // Stem: a gently curved line dropping from the bloom.
    const stemTop = headCy + radius * 0.92;
    const stemBottom = cy + radius * 1.4;
    const stemSteps = Math.max(8, Math.ceil(radius));
    let prevX = cx;
    let prevY = stemTop;
    for (let i = 1; i <= stemSteps; i++) {
      const t = i / stemSteps;
      const sx = cx + Math.sin(t * Math.PI) * radius * 0.12;
      const sy = stemTop + (stemBottom - stemTop) * t;
      this.drawLine(prevX, prevY, sx, sy);
      prevX = sx;
      prevY = sy;
    }

    // Two opposing leaves growing outward from the stem.
    const leaf = (attachX: number, attachY: number, dirX: number) => {
      const angle = Math.atan2(0.5, dirX); // tilt the leaf upward as it reaches out
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const a = radius * 0.3;
      const b = radius * 0.12;
      const leafCx = attachX + dirX * a * 0.9;
      const leafCy = attachY - a * 0.45;
      const isInsideLeaf = (x: number, y: number): boolean => {
        const dx = x - leafCx;
        const dy = y - leafCy;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;
        return (lx / a) ** 2 + (ly / b) ** 2 <= 1;
      };
      const pad = a + 1;
      this.drawImplicitShape(
        leafCx - pad, leafCx + pad, leafCy - pad, leafCy + pad,
        isInsideLeaf, filled
      );
    };

    leaf(cx, stemTop + (stemBottom - stemTop) * 0.4, -1);
    leaf(cx, stemTop + (stemBottom - stemTop) * 0.62, 1);
  }

  private drawSingleIceSkate(
    skateCx: number,
    skateCy: number,
    skateR: number,
    facingRight: boolean,
    filled: boolean
  ) {
    if (skateR <= 0) return;
    const s = facingRight ? 1 : -1;

    const bootVerts = [
      { x: skateCx + s * skateR * 0.12, y: skateCy - skateR * 0.92 },
      { x: skateCx + s * skateR * 0.38, y: skateCy - skateR * 0.88 },
      { x: skateCx + s * skateR * 0.46, y: skateCy - skateR * 0.42 },
      { x: skateCx + s * skateR * 0.5, y: skateCy - skateR * 0.05 },
      { x: skateCx + s * skateR * 0.48, y: skateCy + skateR * 0.12 },
      { x: skateCx + s * skateR * 0.1, y: skateCy + skateR * 0.14 },
      { x: skateCx - s * skateR * 0.34, y: skateCy + skateR * 0.12 },
      { x: skateCx - s * skateR * 0.38, y: skateCy - skateR * 0.18 },
      { x: skateCx - s * skateR * 0.3, y: skateCy - skateR * 0.72 },
      { x: skateCx - s * skateR * 0.18, y: skateCy - skateR * 0.9 },
    ];

    if (filled) {
      this.fillPolygonInterior(bootVerts);
    }
    for (let i = 0; i < bootVerts.length; i++) {
      const a = bootVerts[i];
      const b = bootVerts[(i + 1) % bootVerts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }

    const cuffY0 = skateCy - skateR * 0.9;
    const cuffY1 = skateCy - skateR * 0.62;
    this.drawLine(skateCx - s * skateR * 0.22, cuffY0, skateCx - s * skateR * 0.22, cuffY1);
    this.drawLine(skateCx + s * skateR * 0.08, cuffY0, skateCx + s * skateR * 0.08, cuffY1);

    const laceX0 = skateCx - s * skateR * 0.14;
    const laceX1 = skateCx + s * skateR * 0.28;
    for (let i = 0; i < 4; i++) {
      const ly = skateCy - skateR * (0.78 - i * 0.12);
      this.drawLine(laceX0, ly, laceX1, ly);
    }

    const bladeY = skateCy + skateR * 0.22;
    const bladeBack = skateCx - s * skateR * 0.3;
    const bladeFront = skateCx + s * skateR * 0.52;
    const bladeSteps = Math.max(8, Math.ceil(skateR * 0.5));
    for (let i = 0; i < bladeSteps; i++) {
      const t0 = i / bladeSteps;
      const t1 = (i + 1) / bladeSteps;
      const x0 = bladeBack + (bladeFront - bladeBack) * t0;
      const x1 = bladeBack + (bladeFront - bladeBack) * t1;
      const y0 = bladeY - skateR * 0.05 * Math.sin(t0 * Math.PI);
      const y1 = bladeY - skateR * 0.05 * Math.sin(t1 * Math.PI);
      this.drawLine(x0, y0, x1, y1);
    }

    const pickBase = skateCx + s * skateR * 0.48;
    const pickMid = skateCx + s * skateR * 0.54;
    const pickTip = skateCx + s * skateR * 0.58;
    this.drawLine(pickBase, bladeY, pickMid, bladeY - skateR * 0.08);
    this.drawLine(pickMid, bladeY - skateR * 0.08, pickTip, bladeY - skateR * 0.12);
    this.drawLine(pickTip, bladeY - skateR * 0.12, pickMid, bladeY - skateR * 0.05);
    this.drawLine(pickMid, bladeY - skateR * 0.05, pickBase, bladeY - skateR * 0.04);
    this.drawLine(pickBase, bladeY, pickBase, bladeY - skateR * 0.04);

    this.drawLine(skateCx - s * skateR * 0.32, skateCy + skateR * 0.14, skateCx - s * skateR * 0.32, bladeY);

    const runnerVerts = [
      { x: bladeBack, y: bladeY },
      { x: bladeFront, y: bladeY },
      { x: bladeFront, y: bladeY + skateR * 0.04 },
      { x: bladeBack, y: bladeY + skateR * 0.04 },
    ];
    if (filled) {
      this.fillPolygonInterior(runnerVerts);
    }
    for (let i = 0; i < runnerVerts.length; i++) {
      const a = runnerVerts[i];
      const b = runnerVerts[(i + 1) % runnerVerts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  /**
   * Pair of figure ice skates in side view, boots with lacing and blades with toe picks.
   */
  drawIceSkates(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const skateR = radius * 0.46;
    this.drawSingleIceSkate(cx - radius * 0.52, cy, skateR, true, filled);
    this.drawSingleIceSkate(cx + radius * 0.52, cy, skateR, false, filled);
  }

  /**
   * Vampire mouth: a curved upper gum line carrying a row of small teeth,
   * two prominent pointed fangs, and a blood drip falling from one fang.
   */
  drawVampireFangs(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const halfW = radius * 0.85;
    const gumTopY = cy - radius * 0.6;
    const gumBaseY = cy - radius * 0.28;

    // Upper gum: a shallow lip band whose lower edge dips in the middle (an open smile).
    const gumLowerY = (x: number): number => {
      const t = (x - cx) / halfW; // -1 .. 1
      return gumBaseY + radius * 0.16 * (1 - t * t);
    };
    const isInsideGum = (x: number, y: number): boolean => {
      if (x < cx - halfW || x > cx + halfW) return false;
      return y >= gumTopY && y <= gumLowerY(x);
    };
    this.drawImplicitShape(
      cx - halfW - 1, cx + halfW + 1, gumTopY - 1, gumBaseY + radius * 0.4,
      isInsideGum, filled
    );

    // All teeth hang from a common flat baseline so fangs and incisors are
    // properly lined up regardless of the curved gum contour.
    const teethTopY = gumBaseY + radius * 0.14;

    // A tapered tooth (or fang) hanging from the flat baseline.
    const drawTooth = (toothCx: number, topWidth: number, depth: number) => {
      const topY = teethTopY;
      const tipY = topY + depth;
      const verts = [
        { x: toothCx - topWidth, y: topY },
        { x: toothCx + topWidth, y: topY },
        { x: toothCx, y: tipY },
      ];
      if (filled) {
        this.fillPolygonInterior(verts);
      }
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        this.drawLine(a.x, a.y, b.x, b.y);
      }
      return tipY;
    };

    // Two small incisors tucked between the fangs.
    drawTooth(cx - radius * 0.15, radius * 0.08, radius * 0.3);
    drawTooth(cx + radius * 0.15, radius * 0.08, radius * 0.3);

    // The two long, sharp canine fangs.
    const fangTipY = drawTooth(cx - radius * 0.5, radius * 0.17, radius * 1.05);
    drawTooth(cx + radius * 0.5, radius * 0.17, radius * 1.05);

    // Blood drip falling from the left fang tip.
    const dripX = Math.round(cx - radius * 0.5);
    const dripTop = Math.round(fangTipY + radius * 0.06);
    const dripBottom = Math.round(fangTipY + radius * 0.34);
    this.drawLine(dripX, dripTop, dripX, dripBottom);
    this.setPoint(dripX - 1, dripBottom - 1);
    this.setPoint(dripX + 1, dripBottom - 1);
    this.setPoint(dripX, dripBottom + 1);
  }

  /**
   * Vertical paintbrush: a rounded wooden handle, a metal ferrule band,
   * and tapered bristles ending in a soft tip with a dab of paint.
   */
  drawPaintbrush(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const handleTopY = cy - radius * 1.3;
    const ferruleTopY = cy - radius * 0.05;
    const ferruleBotY = cy + radius * 0.28;
    const bristleTipY = cy + radius * 1.25;

    const capR = radius * 0.14;
    const handleTopHalf = radius * 0.14;
    const handleBotHalf = radius * 0.2;
    const ferruleHalf = radius * 0.32;
    const bristleTopHalf = radius * 0.3;

    // Half-width of the brush silhouette at a given y.
    const halfWidthAt = (y: number): number => {
      if (y < ferruleTopY) {
        const t = (y - handleTopY) / (ferruleTopY - handleTopY);
        const taper = handleTopHalf + (handleBotHalf - handleTopHalf) * t;
        if (y < handleTopY + capR) {
          const cap = Math.sqrt(Math.max(0, capR * capR - (y - (handleTopY + capR)) ** 2));
          return Math.min(taper, cap);
        }
        return taper;
      }
      if (y <= ferruleBotY) {
        return ferruleHalf;
      }
      const t = (y - ferruleBotY) / (bristleTipY - ferruleBotY);
      // Wider swell that curves more aggressively to a rounded tip.
      const swell = bristleTopHalf * (1 - t * t) + radius * 0.14 * Math.sin(t * Math.PI * 0.8);
      return Math.max(0, swell);
    };

    const isInsideBrush = (x: number, y: number): boolean => {
      if (y < handleTopY || y > bristleTipY) return false;
      return Math.abs(x - cx) <= halfWidthAt(y);
    };

    this.drawImplicitShape(
      cx - ferruleHalf - 1, cx + ferruleHalf + 1, handleTopY - 1, bristleTipY + 1,
      isInsideBrush, filled
    );

    // Ferrule band: top and bottom edges set the metal collar apart.
    this.drawLine(cx - ferruleHalf, ferruleTopY, cx + ferruleHalf, ferruleTopY);
    this.drawLine(cx - ferruleHalf, ferruleBotY, cx + ferruleHalf, ferruleBotY);

    // Bristle strands fanning toward the tip with a slight curve (outline mode only).
    if (!filled) {
      const strands = [-0.18, -0.06, 0.06, 0.18];
      const strandSteps = Math.max(6, Math.ceil(radius * 0.4));
      for (const s of strands) {
        const startX = cx + radius * s;
        const startY = ferruleBotY + radius * 0.05;
        const endX = cx + radius * s * 0.15;
        const endY = bristleTipY - radius * 0.06;
        let prevX = startX;
        let prevY = startY;
        for (let i = 1; i <= strandSteps; i++) {
          const t = i / strandSteps;
          const sx = startX + (endX - startX) * t + Math.sin(t * Math.PI) * radius * s * 0.3;
          const sy = startY + (endY - startY) * t;
          this.drawLine(prevX, prevY, sx, sy);
          prevX = sx;
          prevY = sy;
        }
      }
    }

    // A gently curving "already painted" line trailing below the bristle tip.
    const lineStartY = Math.round(bristleTipY + radius * 0.08);
    const lineEndY = Math.round(bristleTipY + radius * 0.65);
    const lineSteps = Math.max(8, Math.ceil(radius * 0.6));
    let prevPaintX = Math.round(cx);
    let prevPaintY = lineStartY;
    for (let i = 1; i <= lineSteps; i++) {
      const t = i / lineSteps;
      const px = Math.round(cx + Math.sin(t * Math.PI * 1.5) * radius * 0.18);
      const py = Math.round(lineStartY + (lineEndY - lineStartY) * t);
      this.drawLine(prevPaintX, prevPaintY, px, py);
      prevPaintX = px;
      prevPaintY = py;
    }
  }

  drawHiking(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    // Slope line going up from left to right (x increases, y decreases)
    const xLeft = cx - radius * 1.1;
    const yLeft = cy + radius * 0.8;
    const xRight = cx + radius * 1.1;
    const yRight = cy - radius * 0.3;
    this.drawLine(xLeft, yLeft, xRight, yRight);

    const getSlopeY = (x: number): number => {
      return yLeft - 0.5 * (x - xLeft);
    };

    // Draw little rock outlines or tufts on the ground
    const rock1X = cx - radius * 0.8;
    const rock1Y = getSlopeY(rock1X);
    this.drawLine(rock1X, rock1Y, rock1X - 1, rock1Y - 2);
    this.drawLine(rock1X - 1, rock1Y - 2, rock1X - 2, rock1Y);

    const rock2X = cx + radius * 0.8;
    const rock2Y = getSlopeY(rock2X);
    this.drawLine(rock2X, rock2Y, rock2X + 1, rock2Y - 2);
    this.drawLine(rock2X + 1, rock2Y - 2, rock2X + 2, rock2Y);

    // Draw one hiker centered
    const drawSingleHiker = (hc: number) => {
      const attachY = getSlopeY(hc);
      const hikerScale = 1.45;

      // Head (moved up slightly for a clear neck gap)
      const headCx = hc + radius * 0.08 * hikerScale;
      const headCy = attachY - radius * 0.72 * hikerScale;
      const headR = Math.max(1, Math.round(radius * 0.1 * hikerScale));
      this.drawCircle(Math.round(headCx), Math.round(headCy), headR, filled);

      // Torso/Body line
      const shX = hc + radius * 0.05 * hikerScale;
      const shY = attachY - radius * 0.52 * hikerScale;
      const hipX = hc - radius * 0.05 * hikerScale;
      const hipY = attachY - radius * 0.28 * hikerScale;
      this.drawLine(shX, shY, hipX, hipY);

      // Front leg (strongly bent/stepping forward)
      const kneeFrontX = hc + radius * 0.18 * hikerScale;
      const kneeFrontY = attachY - radius * 0.32 * hikerScale;
      const footFrontX = hc + radius * 0.22 * hikerScale;
      const footFrontY = getSlopeY(footFrontX);
      this.drawLine(hipX, hipY, kneeFrontX, kneeFrontY);
      this.drawLine(kneeFrontX, kneeFrontY, footFrontX, footFrontY);

      // Back leg (stretching behind)
      const kneeBackX = hc - radius * 0.18 * hikerScale;
      const kneeBackY = attachY - radius * 0.15 * hikerScale;
      const footBackX = hc - radius * 0.24 * hikerScale;
      const footBackY = getSlopeY(footBackX);
      this.drawLine(hipX, hipY, kneeBackX, kneeBackY);
      this.drawLine(kneeBackX, kneeBackY, footBackX, footBackY);

      // Arm holding walking stick
      const handX = hc + radius * 0.18 * hikerScale;
      const handY = attachY - radius * 0.38 * hikerScale;
      this.drawLine(shX, shY, handX, handY);

      // Walking stick (touches the slope)
      const stickTopX = hc + radius * 0.26 * hikerScale;
      const stickTopY = attachY - radius * 0.55 * hikerScale;
      const stickBotX = hc + radius * 0.14 * hikerScale;
      const stickBotY = getSlopeY(stickBotX);
      this.drawLine(stickTopX, stickTopY, stickBotX, stickBotY);

      // Backpack (shifted leftward to avoid merging completely with torso)
      const backpackVerts = [
        { x: hc - radius * 0.25 * hikerScale, y: attachY - radius * 0.48 * hikerScale },
        { x: hc - radius * 0.08 * hikerScale, y: attachY - radius * 0.46 * hikerScale },
        { x: hc - radius * 0.14 * hikerScale, y: attachY - radius * 0.28 * hikerScale },
        { x: hc - radius * 0.28 * hikerScale, y: attachY - radius * 0.30 * hikerScale }
      ];
      if (filled) {
        this.fillPolygonInterior(backpackVerts);
      }
      for (let i = 0; i < backpackVerts.length; i++) {
        const a = backpackVerts[i];
        const b = backpackVerts[(i + 1) % backpackVerts.length];
        this.drawLine(a.x, a.y, b.x, b.y);
      }
    };

    drawSingleHiker(cx);
  }

  drawAxe(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    // Handle coordinates (bottom-left to top-right)
    const xGrip = cx - radius * 0.4;
    const yGrip = cy + radius * 0.8;
    const xTop = cx + radius * 0.2;
    const yTop = cy - radius * 0.5;

    // Draw double lines for handle thickness
    this.drawLine(xGrip, yGrip, xTop, yTop);
    this.drawLine(xGrip + 1, yGrip, xTop + 1, yTop);

    // Knob at the end of the grip
    this.drawLine(xGrip - 2, yGrip + 1, xGrip + 2, yGrip - 1);

    // Head connection point near top of handle
    const headCx = cx + radius * 0.15;
    const headCy = cy - radius * 0.45;

    // Define the axe head vertices with a flared blade and curved bit
    const headVerts = [
      { x: headCx - radius * 0.35, y: headCy - radius * 0.35 }, // top-left butt corner
      { x: headCx + radius * 0.25, y: headCy - radius * 0.35 }, // top blade transition
      { x: headCx + radius * 0.65, y: headCy - radius * 0.45 }, // top blade tip (flared up)
      { x: headCx + radius * 0.72, y: headCy - radius * 0.2 },  // upper cutting edge
      { x: headCx + radius * 0.75, y: headCy },                 // middle apex of cutting edge
      { x: headCx + radius * 0.72, y: headCy + radius * 0.2 },  // lower cutting edge
      { x: headCx + radius * 0.6, y: headCy + radius * 0.4 },   // bottom blade tip (bearded)
      { x: headCx + radius * 0.25, y: headCy + radius * 0.15 }, // bottom blade transition
      { x: headCx - radius * 0.35, y: headCy + radius * 0.15 }  // bottom-left butt corner
    ];

    if (filled) {
      this.fillPolygonInterior(headVerts);
    }
    for (let i = 0; i < headVerts.length; i++) {
      const a = headVerts[i];
      const b = headVerts[(i + 1) % headVerts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  drawCandle(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    // Body dimensions
    const yTop = cy - radius * 0.1;
    const yBottom = cy + radius * 0.9;
    const xLeft = cx - radius * 0.35;
    const xRight = cx + radius * 0.35;

    // Candle body
    const bodyVerts = [
      { x: xLeft, y: yTop },
      { x: xRight, y: yTop },
      { x: xRight, y: yBottom },
      { x: xLeft, y: yBottom }
    ];

    if (filled) {
      this.fillPolygonInterior(bodyVerts);
    }
    // Draw body outline
    this.drawLine(xLeft, yTop, xRight, yTop);
    this.drawLine(xRight, yTop, xRight, yBottom);
    this.drawLine(xRight, yBottom, xLeft, yBottom);
    this.drawLine(xLeft, yBottom, xLeft, yTop);

    // Wick
    const wickTopY = yTop - radius * 0.2;
    this.drawLine(cx, yTop, cx, wickTopY);

    // Flame (teardrop shape above wick)
    const flameCenterY = yTop - radius * 0.45;
    const flameVerts = [
      { x: cx, y: yTop - radius * 0.75 },                      // tip
      { x: cx - radius * 0.2, y: flameCenterY },               // left swell
      { x: cx - radius * 0.1, y: yTop - radius * 0.25 },       // bottom left
      { x: cx, y: yTop - radius * 0.2 },                       // bottom center indent
      { x: cx + radius * 0.1, y: yTop - radius * 0.25 },       // bottom right
      { x: cx + radius * 0.2, y: flameCenterY }                // right swell
    ];

    if (filled) {
      this.fillPolygonInterior(flameVerts);
    }
    for (let i = 0; i < flameVerts.length; i++) {
      const a = flameVerts[i];
      const b = flameVerts[(i + 1) % flameVerts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }

    // Wax drips down the candle body
    this.drawLine(xLeft + 2, yTop, xLeft + 2, yTop + radius * 0.3);
    this.drawLine(cx - radius * 0.1, yTop, cx - radius * 0.1, yTop + radius * 0.45);
    this.drawLine(xRight - 2, yTop, xRight - 2, yTop + radius * 0.2);

    // Plate/Base
    const plateY = yBottom;
    const plateLeftX = cx - radius * 1.0;
    const plateRightX = cx + radius * 1.0;
    this.drawLine(plateLeftX, plateY, plateRightX, plateY);
    this.drawLine(plateLeftX, plateY, plateLeftX, plateY - radius * 0.1);
    this.drawLine(plateRightX, plateY, plateRightX, plateY - radius * 0.1);

    // Handle finger loop on the right side of the plate
    const handleCx = cx + radius * 1.15;
    const handleCy = plateY - radius * 0.1;
    const handleR = Math.max(1, Math.round(radius * 0.18));
    this.drawCircle(Math.round(handleCx), Math.round(handleCy), handleR, false);
  }

  drawMustache(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const bezier = (
      p0: { x: number; y: number },
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
      t: number
    ) => {
      const mt = 1 - t;
      const x = mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x;
      const y = mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y;
      return { x, y };
    };

    const steps = Math.max(15, Math.min(60, Math.ceil(radius * 1.5)));
    const topLobe: { x: number; y: number }[] = [];
    const p0_1 = { x: 0, y: 0.06 };
    const cp1_1 = { x: 0.15, y: -0.22 };
    const cp2_1 = { x: 0.45, y: -0.22 };
    const p3_1 = { x: 0.65, y: -0.05 };
    for (let i = 0; i <= steps; i++) {
      topLobe.push(bezier(p0_1, cp1_1, cp2_1, p3_1, i / steps));
    }

    const innerHook: { x: number; y: number }[] = [];
    const p0_2 = p3_1;
    const cp1_2 = { x: 0.72, y: -0.1 };
    const cp2_2 = { x: 0.78, y: -0.2 };
    const p3_2 = { x: 0.85, y: -0.18 };
    for (let i = 1; i <= steps; i++) {
      innerHook.push(bezier(p0_2, cp1_2, cp2_2, p3_2, i / steps));
    }

    const tipWrap: { x: number; y: number }[] = [];
    const p0_3 = p3_2;
    const cp1_3 = { x: 0.88, y: -0.16 };
    const cp2_3 = { x: 0.86, y: -0.08 };
    const p3_3 = { x: 0.8, y: -0.12 };
    for (let i = 1; i <= steps; i++) {
      tipWrap.push(bezier(p0_3, cp1_3, cp2_3, p3_3, i / steps));
    }

    const outerHook: { x: number; y: number }[] = [];
    const p0_4 = p3_3;
    const cp1_4 = { x: 0.88, y: -0.34 };
    const cp2_4 = { x: 1.15, y: -0.34 };
    const p3_4 = { x: 1.12, y: -0.15 };
    for (let i = 1; i <= steps; i++) {
      outerHook.push(bezier(p0_4, cp1_4, cp2_4, p3_4, i / steps));
    }

    const swoopBottom: { x: number; y: number }[] = [];
    const p0_5 = p3_4;
    const cp1_5 = { x: 1.1, y: 0.05 };
    const cp2_5 = { x: 1.02, y: 0.08 };
    const p3_5 = { x: 0.95, y: 0.08 };
    for (let i = 1; i <= steps; i++) {
      swoopBottom.push(bezier(p0_5, cp1_5, cp2_5, p3_5, i / steps));
    }

    const bottomLobe: { x: number; y: number }[] = [];
    const p0_6 = p3_5;
    const cp1_6 = { x: 0.8, y: 0.35 };
    const cp2_6 = { x: 0.4, y: 0.38 };
    const p3_6 = { x: 0, y: 0.12 };
    for (let i = 1; i <= steps; i++) {
      bottomLobe.push(bezier(p0_6, cp1_6, cp2_6, p3_6, i / steps));
    }

    const rightHalf = [
      ...topLobe,
      ...innerHook,
      ...tipWrap,
      ...outerHook,
      ...swoopBottom,
      ...bottomLobe
    ];

    const leftHalf = rightHalf.map(p => ({ x: -p.x, y: p.y })).reverse();

    const combined = [
      ...leftHalf,
      ...rightHalf.slice(1)
    ];

    const verts = combined.map(p => ({
      x: Math.round(cx + p.x * radius),
      y: Math.round(cy + p.y * radius)
    }));

    if (filled) {
      this.fillPolygonInterior(verts);
    } else {
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        this.drawLine(a.x, a.y, b.x, b.y);
      }
    }
  }

  drawDog(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const r = radius;

    // Body coordinates
    const bodyVerts = [
      { x: cx - r * 0.4, y: cy - r * 0.1 },
      { x: cx + r * 0.4, y: cy - r * 0.1 },
      { x: cx + r * 0.4, y: cy + r * 0.3 },
      { x: cx - r * 0.4, y: cy + r * 0.3 }
    ];

    // Head parameters
    const headCx = cx - r * 0.5;
    const headCy = cy - r * 0.4;
    const headR = r * 0.22;

    // Snout
    const snoutVerts = [
      { x: headCx - headR * 0.6, y: headCy - headR * 0.3 },
      { x: headCx - headR * 1.5, y: headCy - headR * 0.1 },
      { x: headCx - headR * 1.5, y: headCy + headR * 0.5 },
      { x: headCx - headR * 0.3, y: headCy + headR * 0.8 }
    ];

    // Ear
    const earVerts = [
      { x: headCx + headR * 0.2, y: headCy - headR * 0.8 },
      { x: headCx + headR * 0.8, y: headCy - headR * 0.3 },
      { x: headCx + headR * 0.5, y: headCy + headR * 0.4 },
      { x: headCx + headR * 0.0, y: headCy - headR * 0.2 }
    ];

    if (filled) {
      this.fillPolygonInterior(bodyVerts);
      this.fillDisc(Math.round(headCx), Math.round(headCy), Math.round(headR));
      this.fillPolygonInterior(snoutVerts);
      this.fillPolygonInterior(earVerts);

      // Tail
      const tailVerts = [
        { x: cx + r * 0.35, y: cy - r * 0.1 },
        { x: cx + r * 0.65, y: cy - r * 0.5 },
        { x: cx + r * 0.7, y: cy - r * 0.45 },
        { x: cx + r * 0.4, y: cy - r * 0.05 }
      ];
      this.fillPolygonInterior(tailVerts);

      // Legs
      const legWidth = Math.max(1, Math.round(r * 0.1));
      const drawLegFilled = (lx: number) => {
        const legVerts = [
          { x: lx, y: cy + r * 0.3 },
          { x: lx + legWidth, y: cy + r * 0.3 },
          { x: lx + legWidth, y: cy + r * 0.85 },
          { x: lx, y: cy + r * 0.85 }
        ];
        this.fillPolygonInterior(legVerts);
      };
      drawLegFilled(cx - r * 0.35);
      drawLegFilled(cx - r * 0.15);
      drawLegFilled(cx + r * 0.15);
      drawLegFilled(cx + r * 0.28);
    } else {
      // Outline mode
      // Body outline
      for (let i = 0; i < bodyVerts.length; i++) {
        this.drawLine(bodyVerts[i].x, bodyVerts[i].y, bodyVerts[(i + 1) % bodyVerts.length].x, bodyVerts[(i + 1) % bodyVerts.length].y);
      }
      // Head circle
      this.drawCircle(Math.round(headCx), Math.round(headCy), Math.round(headR), false);
      // Snout outline
      for (let i = 0; i < snoutVerts.length; i++) {
        this.drawLine(snoutVerts[i].x, snoutVerts[i].y, snoutVerts[(i + 1) % snoutVerts.length].x, snoutVerts[(i + 1) % snoutVerts.length].y);
      }
      // Ear outline
      for (let i = 0; i < earVerts.length; i++) {
        this.drawLine(earVerts[i].x, earVerts[i].y, earVerts[(i + 1) % earVerts.length].x, earVerts[(i + 1) % earVerts.length].y);
      }
      // Tail line
      this.drawLine(cx + r * 0.38, cy - r * 0.08, cx + r * 0.7, cy - r * 0.48);

      // Legs
      const legWidth = Math.max(1, Math.round(r * 0.1));
      const drawLegOutline = (lx: number) => {
        this.drawLine(lx, cy + r * 0.3, lx, cy + r * 0.85);
        this.drawLine(lx + legWidth, cy + r * 0.3, lx + legWidth, cy + r * 0.85);
        this.drawLine(lx, cy + r * 0.85, lx + legWidth, cy + r * 0.85);
      };
      drawLegOutline(cx - r * 0.35);
      drawLegOutline(cx - r * 0.15);
      drawLegOutline(cx + r * 0.15);
      drawLegOutline(cx + r * 0.28);
    }
  }

  drawCat(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const r = radius;

    // Head
    const headCx = cx;
    const headCy = cy - r * 0.35;
    const headR = r * 0.25;

    // Body
    const bodyVerts = [
      { x: cx - r * 0.15, y: cy - r * 0.15 },
      { x: cx + r * 0.15, y: cy - r * 0.15 },
      { x: cx + r * 0.35, y: cy + r * 0.3 },
      { x: cx + r * 0.35, y: cy + r * 0.8 },
      { x: cx - r * 0.35, y: cy + r * 0.8 },
      { x: cx - r * 0.45, y: cy + r * 0.3 }
    ];

    // Ears
    const earL = [
      { x: headCx - headR * 0.8, y: headCy - headR * 0.4 },
      { x: headCx - headR * 0.9, y: headCy - headR * 1.5 },
      { x: headCx - headR * 0.2, y: headCy - headR * 0.95 }
    ];

    const earR = [
      { x: headCx + headR * 0.2, y: headCy - headR * 0.95 },
      { x: headCx + headR * 0.9, y: headCy - headR * 1.5 },
      { x: headCx + headR * 0.8, y: headCy - headR * 0.4 }
    ];

    // Tail curve path for outline
    const tailPoints = [
      { x: cx - r * 0.35, y: cy + r * 0.7 },
      { x: cx - r * 0.55, y: cy + r * 0.65 },
      { x: cx - r * 0.7, y: cy + r * 0.4 },
      { x: cx - r * 0.65, y: cy + r * 0.15 },
      { x: cx - r * 0.5, y: cy + r * 0.2 }
    ];

    if (filled) {
      this.fillPolygonInterior(bodyVerts);
      this.fillDisc(Math.round(headCx), Math.round(headCy), Math.round(headR));
      this.fillPolygonInterior(earL);
      this.fillPolygonInterior(earR);

      // Tail as filled polygon
      const tailVerts = [
        { x: cx - r * 0.35, y: cy + r * 0.75 },
        { x: cx - r * 0.58, y: cy + r * 0.7 },
        { x: cx - r * 0.75, y: cy + r * 0.42 },
        { x: cx - r * 0.7, y: cy + r * 0.1 },
        { x: cx - r * 0.6, y: cy + r * 0.08 },
        { x: cx - r * 0.6, y: cy + r * 0.2 },
        { x: cx - r * 0.65, y: cy + r * 0.38 },
        { x: cx - r * 0.52, y: cy + r * 0.58 },
        { x: cx - r * 0.35, y: cy + r * 0.62 }
      ];
      this.fillPolygonInterior(tailVerts);
    } else {
      // Body outline
      for (let i = 0; i < bodyVerts.length; i++) {
        this.drawLine(bodyVerts[i].x, bodyVerts[i].y, bodyVerts[(i + 1) % bodyVerts.length].x, bodyVerts[(i + 1) % bodyVerts.length].y);
      }
      // Head outline
      this.drawCircle(Math.round(headCx), Math.round(headCy), Math.round(headR), false);
      // Ears outlines
      for (let i = 0; i < 3; i++) {
        this.drawLine(earL[i].x, earL[i].y, earL[(i + 1) % 3].x, earL[(i + 1) % 3].y);
        this.drawLine(earR[i].x, earR[i].y, earR[(i + 1) % 3].x, earR[(i + 1) % 3].y);
      }
      // Tail line
      for (let i = 0; i < tailPoints.length - 1; i++) {
        this.drawLine(tailPoints[i].x, tailPoints[i].y, tailPoints[i + 1].x, tailPoints[i + 1].y);
      }
    }

    // Whiskers (always drawn)
    const wY1 = headCy + headR * 0.1;
    const wY2 = headCy + headR * 0.25;
    const wY3 = headCy + headR * 0.4;
    // Left
    this.drawLine(headCx - headR * 0.5, wY1, headCx - headR * 1.8, wY1 - r * 0.05);
    this.drawLine(headCx - headR * 0.5, wY2, headCx - headR * 1.9, wY2);
    this.drawLine(headCx - headR * 0.5, wY3, headCx - headR * 1.8, wY3 + r * 0.05);
    // Right
    this.drawLine(headCx + headR * 0.5, wY1, headCx + headR * 1.8, wY1 - r * 0.05);
    this.drawLine(headCx + headR * 0.5, wY2, headCx + headR * 1.9, wY2);
    this.drawLine(headCx + headR * 0.5, wY3, headCx + headR * 1.8, wY3 + r * 0.05);
  }

  drawHouse(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const r = radius;

    // Body
    const bx1 = cx - r * 0.65;
    const bx2 = cx + r * 0.65;
    const by1 = cy - r * 0.15;
    const by2 = cy + r * 0.85;

    // Roof
    const rx1 = cx - r * 0.75;
    const rx2 = cx + r * 0.75;
    const ry1 = cy - r * 0.15;
    const ry2 = cy - r * 0.85;

    const roofVerts = [
      { x: rx1, y: ry1 },
      { x: cx, y: ry2 },
      { x: rx2, y: ry1 }
    ];

    // Chimney
    const chx1 = cx - r * 0.52;
    const chx2 = cx - r * 0.35;
    const chy1 = cy - r * 0.4;
    const chy2 = cy - r * 0.75;

    // Door
    const dx1 = cx - r * 0.18;
    const dx2 = cx + r * 0.18;
    const dy1 = cy + r * 0.4;
    const dy2 = cy + r * 0.85;

    // Windows
    const w1x1 = cx - r * 0.48;
    const w1x2 = cx - r * 0.22;
    const wy1 = cy + r * 0.1;
    const wy2 = cy + r * 0.32;

    const w2x1 = cx + r * 0.22;
    const w2x2 = cx + r * 0.48;

    if (filled) {
      // Fill roof
      this.fillPolygonInterior(roofVerts);

      // Fill body
      const bodyVerts = [
        { x: bx1, y: by1 },
        { x: bx2, y: by1 },
        { x: bx2, y: by2 },
        { x: bx1, y: by2 }
      ];
      this.fillPolygonInterior(bodyVerts);

      // Fill chimney
      const chVerts = [
        { x: chx1, y: chy1 },
        { x: chx1, y: chy2 },
        { x: chx2, y: chy2 },
        { x: chx2, y: chy1 }
      ];
      this.fillPolygonInterior(chVerts);

      // Clear door and windows
      const clearBox = (xStart: number, xEnd: number, yStart: number, yEnd: number) => {
        const xS = Math.round(Math.min(xStart, xEnd));
        const xE = Math.round(Math.max(xStart, xEnd));
        const yS = Math.round(Math.min(yStart, yEnd));
        const yE = Math.round(Math.max(yStart, yEnd));
        for (let y = yS; y <= yE; y++) {
          for (let x = xS; x <= xE; x++) {
            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
              this.data[y][x] = false;
            }
          }
        }
      };

      clearBox(dx1, dx2, dy1, dy2);
      clearBox(w1x1, w1x2, wy1, wy2);
      clearBox(w2x1, w2x2, wy1, wy2);

      // Draw outlines over cleared shapes to maintain detail
      this.drawLine(dx1, dy1, dx2, dy1);
      this.drawLine(dx2, dy1, dx2, dy2);
      this.drawLine(dx1, dy1, dx1, dy2);

      const drawWinOutline = (x1: number, x2: number) => {
        this.drawLine(x1, wy1, x2, wy1);
        this.drawLine(x2, wy1, x2, wy2);
        this.drawLine(x2, wy2, x1, wy2);
        this.drawLine(x1, wy2, x1, wy1);
        // Window pane cross
        const midX = (x1 + x2) / 2;
        const midY = (wy1 + wy2) / 2;
        this.drawLine(midX, wy1, midX, wy2);
        this.drawLine(x1, midY, x2, midY);
      };
      drawWinOutline(w1x1, w1x2);
      drawWinOutline(w2x1, w2x2);

      // Doorknob
      this.setPoint(Math.round(cx + r * 0.1), Math.round(cy + r * 0.62));
    } else {
      // Outline mode
      // Roof
      this.drawLine(rx1, ry1, cx, ry2);
      this.drawLine(cx, ry2, rx2, ry1);
      this.drawLine(rx2, ry1, rx1, ry1);

      // Body walls & floor
      this.drawLine(bx1, by1, bx1, by2);
      this.drawLine(bx2, by1, bx2, by2);
      this.drawLine(bx1, by2, bx2, by2);

      // Chimney
      this.drawLine(chx1, cy - r * 0.4, chx1, chy2);
      this.drawLine(chx1, chy2, chx2, chy2);
      this.drawLine(chx2, chy2, chx2, cy - r * 0.55);

      // Door
      this.drawLine(dx1, dy1, dx2, dy1);
      this.drawLine(dx2, dy1, dx2, dy2);
      this.drawLine(dx1, dy1, dx1, dy2);

      // Doorknob
      this.setPoint(Math.round(cx + r * 0.1), Math.round(cy + r * 0.62));

      // Windows
      const drawWinOutline = (x1: number, x2: number) => {
        this.drawLine(x1, wy1, x2, wy1);
        this.drawLine(x2, wy1, x2, wy2);
        this.drawLine(x2, wy2, x1, wy2);
        this.drawLine(x1, wy2, x1, wy1);
        // Window pane cross
        const midX = (x1 + x2) / 2;
        const midY = (wy1 + wy2) / 2;
        this.drawLine(midX, wy1, midX, wy2);
        this.drawLine(x1, midY, x2, midY);
      };
      drawWinOutline(w1x1, w1x2);
      drawWinOutline(w2x1, w2x2);
    }
  }

  drawBed(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const r = radius;

    // Headboard
    const hx1 = cx - r * 0.8;
    const hx2 = cx - r * 0.68;
    const hy1 = cy - r * 0.6;
    const hy2 = cy + r * 0.85;

    // Footboard
    const fx1 = cx + r * 0.68;
    const fx2 = cx + r * 0.8;
    const fy1 = cy - r * 0.2;
    const fy2 = cy + r * 0.85;

    // Mattress/Frame
    const mx1 = cx - r * 0.68;
    const mx2 = cx + r * 0.68;
    const my1 = cy + r * 0.15;
    const my2 = cy + r * 0.55;

    // Pillow
    const px1 = cx - r * 0.62;
    const px2 = cx - r * 0.32;
    const py1 = cy - r * 0.02;
    const py2 = cy + r * 0.15;

    if (filled) {
      // Headboard
      const headVerts = [{ x: hx1, y: hy1 }, { x: hx2, y: hy1 }, { x: hx2, y: hy2 }, { x: hx1, y: hy2 }];
      this.fillPolygonInterior(headVerts);

      // Footboard
      const footVerts = [{ x: fx1, y: fy1 }, { x: fx2, y: fy1 }, { x: fx2, y: fy2 }, { x: fx1, y: fy2 }];
      this.fillPolygonInterior(footVerts);

      // Mattress
      const mattVerts = [{ x: mx1, y: my1 }, { x: mx2, y: my1 }, { x: mx2, y: my2 }, { x: mx1, y: my2 }];
      this.fillPolygonInterior(mattVerts);

      // Pillow
      const pillVerts = [{ x: px1, y: py1 }, { x: px2, y: py1 }, { x: px2, y: py2 }, { x: px1, y: py2 }];
      this.fillPolygonInterior(pillVerts);

      // Draw separation lines by clearing
      // 1. Vertical lines separating wood from mattress
      for (let y = Math.round(my1); y <= Math.round(my2); y++) {
        const xHead = Math.round(hx2);
        const xFoot = Math.round(fx1);
        if (xHead >= 0 && xHead < this.width && y >= 0 && y < this.height) this.data[y][xHead] = false;
        if (xFoot >= 0 && xFoot < this.width && y >= 0 && y < this.height) this.data[y][xFoot] = false;
      }
      // 2. Horizontal line under pillow
      for (let x = Math.round(px1); x <= Math.round(px2); x++) {
        const yPill = Math.round(py2);
        if (x >= 0 && x < this.width && yPill >= 0 && yPill < this.height) this.data[yPill][x] = false;
      }

      // Re-draw outer boundaries to keep it neat
      this.drawLine(hx1, hy1, hx2, hy1);
      this.drawLine(hx1, hy1, hx1, hy2);
      this.drawLine(hx2, hy1, hx2, hy2);
      this.drawLine(fx1, fy1, fx2, fy1);
      this.drawLine(fx1, fy1, fx1, fy2);
      this.drawLine(fx2, fy1, fx2, fy2);
      this.drawLine(mx1, my2, mx2, my2);
      // Pillow outline
      this.drawLine(px1, py1, px2, py1);
      this.drawLine(px1, py1, px1, py2);
      this.drawLine(px2, py1, px2, py2);
    } else {
      // Outline mode
      // Headboard
      this.drawLine(hx1, hy1, hx2, hy1);
      this.drawLine(hx1, hy1, hx1, hy2);
      this.drawLine(hx2, hy1, hx2, hy2);

      // Footboard
      this.drawLine(fx1, fy1, fx2, fy1);
      this.drawLine(fx1, fy1, fx1, fy2);
      this.drawLine(fx2, fy1, fx2, fy2);

      // Mattress frame
      this.drawLine(mx1, my1, mx2, my1);
      this.drawLine(mx1, my2, mx2, my2);

      // Pillow outline
      this.drawLine(px1, py1, px2, py1);
      this.drawLine(px1, py1, px1, py2);
      this.drawLine(px2, py1, px2, py2);


      // Blanket crease/fold line
      const foldX = cx + r * 0.1;
      this.drawLine(foldX, my1, foldX, my2);
    }
  }

  /** Stroke a closed polygon; optionally fill first. */
  private strokeClosedPoly(verts: { x: number; y: number }[], filled: boolean) {
    if (verts.length < 2) return;
    if (filled) this.fillPolygonInterior(verts);
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }
  }

  // ── Educational inventory shapes (middle-school science / history / math) ──

  drawAtom(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const nucleusR = Math.max(2, Math.round(radius * 0.18));
    this.drawCircle(Math.round(cx), Math.round(cy), nucleusR, filled);
    const orbits = [
      { a: radius * 0.95, b: radius * 0.38, rot: 0 },
      { a: radius * 0.95, b: radius * 0.38, rot: Math.PI / 3 },
      { a: radius * 0.95, b: radius * 0.38, rot: -Math.PI / 3 },
    ];
    for (const o of orbits) {
      const steps = Math.max(36, Math.ceil(radius * 4));
      let prevX = 0;
      let prevY = 0;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * 2 * Math.PI;
        const lx = o.a * Math.cos(t);
        const ly = o.b * Math.sin(t);
        const x = cx + lx * Math.cos(o.rot) - ly * Math.sin(o.rot);
        const y = cy + lx * Math.sin(o.rot) + ly * Math.cos(o.rot);
        if (i > 0) this.drawLine(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
      // Electron dot on each orbit
      const ex = cx + o.a * Math.cos(o.rot);
      const ey = cy + o.a * Math.sin(o.rot);
      this.drawCircle(Math.round(ex), Math.round(ey), Math.max(1, Math.round(radius * 0.08)), true);
    }
  }

  drawDna(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const halfH = radius * 1.15;
    const amp = radius * 0.45;
    const turns = 2.5;
    const steps = Math.max(40, Math.ceil(radius * 5));
    let p1x = 0, p1y = 0, p2x = 0, p2y = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = cy - halfH + t * 2 * halfH;
      const phase = t * turns * 2 * Math.PI;
      const x1 = cx + amp * Math.sin(phase);
      const x2 = cx - amp * Math.sin(phase);
      if (i > 0) {
        this.drawLine(p1x, p1y, x1, y);
        this.drawLine(p2x, p2y, x2, y);
      }
      // Ladder rungs every few steps
      if (i % Math.max(4, Math.floor(steps / 8)) === 0) {
        this.drawLine(x1, y, x2, y);
        if (filled) {
          this.setPoint(Math.round((x1 + x2) / 2), Math.round(y));
        }
      }
      p1x = x1; p1y = y; p2x = x2; p2y = y;
    }
  }

  drawLeaf(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const a = radius * 0.95;
    const b = radius * 0.48;
    const isInside = (x: number, y: number): boolean => {
      const dx = x - cx;
      const dy = y - cy;
      // Tip points upward slightly rotated
      const lx = dx * 0.95 + dy * 0.3;
      const ly = -dx * 0.3 + dy * 0.95;
      return (lx / a) ** 2 + (ly / b) ** 2 <= 1;
    };
    this.drawImplicitShape(cx - radius * 1.1, cx + radius * 1.1, cy - radius * 1.1, cy + radius * 1.1, isInside, filled);
    // Midrib
    this.drawLine(cx - radius * 0.15, cy + radius * 0.85, cx + radius * 0.55, cy - radius * 0.75);
    // Side veins
    this.drawLine(cx + radius * 0.05, cy + radius * 0.2, cx - radius * 0.45, cy - radius * 0.05);
    this.drawLine(cx + radius * 0.2, cy - radius * 0.15, cx - radius * 0.2, cy - radius * 0.45);
  }

  drawFish(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const body = [
      { x: cx + radius * 0.85, y: cy },
      { x: cx + radius * 0.45, y: cy - radius * 0.45 },
      { x: cx - radius * 0.15, y: cy - radius * 0.5 },
      { x: cx - radius * 0.55, y: cy - radius * 0.25 },
      { x: cx - radius * 0.55, y: cy + radius * 0.25 },
      { x: cx - radius * 0.15, y: cy + radius * 0.5 },
      { x: cx + radius * 0.45, y: cy + radius * 0.45 },
    ];
    this.strokeClosedPoly(body, filled);
    // Tail
    const tail = [
      { x: cx - radius * 0.55, y: cy },
      { x: cx - radius * 0.95, y: cy - radius * 0.45 },
      { x: cx - radius * 0.75, y: cy },
      { x: cx - radius * 0.95, y: cy + radius * 0.45 },
    ];
    this.strokeClosedPoly(tail, filled);
    // Eye
    this.drawCircle(Math.round(cx + radius * 0.45), Math.round(cy - radius * 0.08), Math.max(1, Math.round(radius * 0.08)), true);
    // Fin
    this.drawLine(cx - radius * 0.05, cy - radius * 0.5, cx + radius * 0.1, cy - radius * 0.85);
    this.drawLine(cx + radius * 0.1, cy - radius * 0.85, cx + radius * 0.25, cy - radius * 0.45);
  }

  drawButterfly(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const wing = (sx: number) => {
      const upper = [
        { x: cx, y: cy - radius * 0.15 },
        { x: cx + sx * radius * 0.55, y: cy - radius * 0.95 },
        { x: cx + sx * radius * 0.95, y: cy - radius * 0.45 },
        { x: cx + sx * radius * 0.7, y: cy - radius * 0.05 },
        { x: cx + sx * radius * 0.2, y: cy },
      ];
      const lower = [
        { x: cx, y: cy + radius * 0.05 },
        { x: cx + sx * radius * 0.25, y: cy + radius * 0.05 },
        { x: cx + sx * radius * 0.7, y: cy + radius * 0.35 },
        { x: cx + sx * radius * 0.55, y: cy + radius * 0.85 },
        { x: cx + sx * radius * 0.15, y: cy + radius * 0.45 },
      ];
      this.strokeClosedPoly(upper, filled);
      this.strokeClosedPoly(lower, filled);
    };
    wing(1);
    wing(-1);
    // Body
    this.drawLine(cx, cy - radius * 0.55, cx, cy + radius * 0.7);
    this.drawCircle(Math.round(cx), Math.round(cy - radius * 0.55), Math.max(1, Math.round(radius * 0.1)), filled);
    // Antennae
    this.drawLine(cx, cy - radius * 0.55, cx - radius * 0.25, cy - radius * 0.95);
    this.drawLine(cx, cy - radius * 0.55, cx + radius * 0.25, cy - radius * 0.95);
  }

  drawEarth(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawCircle(Math.round(cx), Math.round(cy), Math.round(radius), filled);
    // Equator
    this.drawLine(cx - radius, cy, cx + radius, cy);
    // Tropics
    const trop = radius * 0.45;
    this.drawLine(cx - Math.sqrt(Math.max(0, radius * radius - trop * trop)), cy - trop,
      cx + Math.sqrt(Math.max(0, radius * radius - trop * trop)), cy - trop);
    this.drawLine(cx - Math.sqrt(Math.max(0, radius * radius - trop * trop)), cy + trop,
      cx + Math.sqrt(Math.max(0, radius * radius - trop * trop)), cy + trop);
    // Meridians (ellipses approximated)
    for (const scale of [0.55, 0.9]) {
      const a = radius * scale;
      const b = radius;
      const steps = Math.max(24, Math.ceil(radius * 3));
      let px = 0, py = 0;
      for (let i = 0; i <= steps; i++) {
        const t = -Math.PI / 2 + (i / steps) * Math.PI;
        const x = cx + a * Math.sin(t);
        const y = cy + b * Math.cos(t);
        if (i > 0) this.drawLine(px, py, x, y);
        px = x; py = y;
      }
    }
  }

  drawSun(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const coreR = Math.round(radius * 0.45);
    this.drawCircle(Math.round(cx), Math.round(cy), coreR, filled);
    const rays = 8;
    for (let i = 0; i < rays; i++) {
      const theta = (i * 2 * Math.PI) / rays - Math.PI / 2;
      const x1 = cx + Math.cos(theta) * radius * 0.58;
      const y1 = cy + Math.sin(theta) * radius * 0.58;
      const x2 = cx + Math.cos(theta) * radius;
      const y2 = cy + Math.sin(theta) * radius;
      this.drawLine(x1, y1, x2, y2);
    }
  }

  drawVolcano(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const mountain = [
      { x: cx - radius, y: cy + radius * 0.85 },
      { x: cx - radius * 0.25, y: cy - radius * 0.15 },
      { x: cx + radius * 0.25, y: cy - radius * 0.15 },
      { x: cx + radius, y: cy + radius * 0.85 },
    ];
    this.strokeClosedPoly(mountain, filled);
    // Crater lip
    this.drawLine(cx - radius * 0.25, cy - radius * 0.15, cx + radius * 0.25, cy - radius * 0.15);
    // Eruption plume
    const plume = [
      { x: cx - radius * 0.08, y: cy - radius * 0.15 },
      { x: cx - radius * 0.35, y: cy - radius * 0.55 },
      { x: cx - radius * 0.15, y: cy - radius * 0.7 },
      { x: cx, y: cy - radius * 0.95 },
      { x: cx + radius * 0.2, y: cy - radius * 0.65 },
      { x: cx + radius * 0.35, y: cy - radius * 0.5 },
      { x: cx + radius * 0.08, y: cy - radius * 0.15 },
    ];
    this.strokeClosedPoly(plume, filled);
  }

  drawMagnet(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const outer = [
      { x: cx - radius * 0.7, y: cy - radius * 0.85 },
      { x: cx - radius * 0.35, y: cy - radius * 0.85 },
      { x: cx - radius * 0.35, y: cy + radius * 0.15 },
      { x: cx + radius * 0.35, y: cy + radius * 0.15 },
      { x: cx + radius * 0.35, y: cy - radius * 0.85 },
      { x: cx + radius * 0.7, y: cy - radius * 0.85 },
      { x: cx + radius * 0.7, y: cy + radius * 0.45 },
      { x: cx, y: cy + radius * 0.95 },
      { x: cx - radius * 0.7, y: cy + radius * 0.45 },
    ];
    this.strokeClosedPoly(outer, filled);
    // Inner U cutout (outline only when filled: clear a channel)
    if (filled) {
      const clearInner = (x: number, y: number) => {
        const ix = Math.round(x);
        const iy = Math.round(y);
        if (ix >= 0 && ix < this.width && iy >= 0 && iy < this.height) this.data[iy][ix] = false;
      };
      for (let y = Math.round(cy - radius * 0.75); y <= Math.round(cy + radius * 0.05); y++) {
        for (let x = Math.round(cx - radius * 0.2); x <= Math.round(cx + radius * 0.2); x++) {
          clearInner(x, y);
        }
      }
      // redraw outer edges near cut
      this.drawLine(cx - radius * 0.35, cy - radius * 0.85, cx - radius * 0.35, cy + radius * 0.15);
      this.drawLine(cx + radius * 0.35, cy - radius * 0.85, cx + radius * 0.35, cy + radius * 0.15);
      this.drawLine(cx - radius * 0.35, cy + radius * 0.15, cx + radius * 0.35, cy + radius * 0.15);
    } else {
      this.drawLine(cx - radius * 0.35, cy - radius * 0.85, cx - radius * 0.35, cy + radius * 0.15);
      this.drawLine(cx + radius * 0.35, cy - radius * 0.85, cx + radius * 0.35, cy + radius * 0.15);
      this.drawLine(cx - radius * 0.35, cy + radius * 0.15, cx + radius * 0.35, cy + radius * 0.15);
    }
    // N / S tick marks on poles
    this.drawLine(cx - radius * 0.55, cy - radius * 0.7, cx - radius * 0.5, cy - radius * 0.55);
    this.drawLine(cx + radius * 0.55, cy - radius * 0.7, cx + radius * 0.5, cy - radius * 0.55);
  }

  drawThermometer(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const bulbR = Math.max(2, Math.round(radius * 0.28));
    const tubeW = Math.max(1, Math.round(radius * 0.14));
    const top = cy - radius * 0.95;
    const bulbCy = cy + radius * 0.65;
    const tubeBottom = bulbCy - bulbR * 0.5;
    // Tube
    const tube = [
      { x: cx - tubeW, y: top },
      { x: cx + tubeW, y: top },
      { x: cx + tubeW, y: tubeBottom },
      { x: cx - tubeW, y: tubeBottom },
    ];
    this.strokeClosedPoly(tube, filled);
    // Bulb is always filled so the reservoir reads clearly by touch.
    this.drawCircle(Math.round(cx), Math.round(bulbCy), bulbR, true);
    // Mercury column
    this.drawLine(cx, bulbCy - bulbR, cx, cy + radius * 0.05);
    // Tick marks
    for (let i = 0; i < 5; i++) {
      const y = top + (tubeBottom - top) * (0.15 + i * 0.15);
      this.drawLine(cx + tubeW, y, cx + tubeW + radius * 0.18, y);
    }
  }

  drawBeaker(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const verts = [
      { x: cx - radius * 0.55, y: cy - radius * 0.85 },
      { x: cx - radius * 0.7, y: cy - radius * 0.7 },
      { x: cx - radius * 0.7, y: cy + radius * 0.85 },
      { x: cx + radius * 0.7, y: cy + radius * 0.85 },
      { x: cx + radius * 0.7, y: cy - radius * 0.7 },
      { x: cx + radius * 0.55, y: cy - radius * 0.85 },
    ];
    this.strokeClosedPoly(verts, false);
    // Liquid level
    const liquidY = cy + radius * 0.15;
    if (filled) {
      const liquid = [
        { x: cx - radius * 0.7, y: liquidY },
        { x: cx + radius * 0.7, y: liquidY },
        { x: cx + radius * 0.7, y: cy + radius * 0.85 },
        { x: cx - radius * 0.7, y: cy + radius * 0.85 },
      ];
      this.fillPolygonInterior(liquid);
      this.strokeClosedPoly(verts, false);
    } else {
      this.drawLine(cx - radius * 0.7, liquidY, cx + radius * 0.7, liquidY);
    }
    // Graduation marks
    for (let i = 0; i < 3; i++) {
      const y = cy - radius * 0.35 + i * radius * 0.35;
      this.drawLine(cx - radius * 0.7, y, cx - radius * 0.45, y);
    }
  }

  drawMicroscope(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Base
    const base = [
      { x: cx - radius * 0.7, y: cy + radius * 0.75 },
      { x: cx + radius * 0.7, y: cy + radius * 0.75 },
      { x: cx + radius * 0.7, y: cy + radius * 0.95 },
      { x: cx - radius * 0.7, y: cy + radius * 0.95 },
    ];
    this.strokeClosedPoly(base, filled);
    // Arm / stand
    this.drawLine(cx + radius * 0.35, cy + radius * 0.75, cx + radius * 0.35, cy - radius * 0.35);
    this.drawLine(cx + radius * 0.35, cy - radius * 0.35, cx, cy - radius * 0.55);
    // Eyepiece tube
    const tube = [
      { x: cx - radius * 0.12, y: cy - radius * 0.95 },
      { x: cx + radius * 0.12, y: cy - radius * 0.95 },
      { x: cx + radius * 0.12, y: cy - radius * 0.35 },
      { x: cx - radius * 0.12, y: cy - radius * 0.35 },
    ];
    this.strokeClosedPoly(tube, filled);
    // Objective / nose
    this.drawCircle(Math.round(cx), Math.round(cy - radius * 0.15), Math.max(2, Math.round(radius * 0.14)), filled);
    // Stage
    this.drawLine(cx - radius * 0.45, cy + radius * 0.15, cx + radius * 0.45, cy + radius * 0.15);
    // Stage clip posts
    this.drawLine(cx - radius * 0.35, cy + radius * 0.15, cx - radius * 0.35, cy + radius * 0.75);
  }

  drawPyramid(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const baseL = { x: cx - radius, y: cy + radius * 0.75 };
    const baseR = { x: cx + radius * 0.55, y: cy + radius * 0.75 };
    const apex = { x: cx - radius * 0.1, y: cy - radius * 0.9 };
    const ridge = { x: cx + radius * 0.35, y: cy - radius * 0.15 };
    // Front face
    this.strokeClosedPoly([baseL, apex, baseR], filled);
    // Side face
    this.strokeClosedPoly([apex, ridge, baseR], filled);
    this.drawLine(apex.x, apex.y, ridge.x, ridge.y);
  }

  drawGreekColumn(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Capital
    const capital = [
      { x: cx - radius * 0.7, y: cy - radius * 0.95 },
      { x: cx + radius * 0.7, y: cy - radius * 0.95 },
      { x: cx + radius * 0.7, y: cy - radius * 0.7 },
      { x: cx - radius * 0.7, y: cy - radius * 0.7 },
    ];
    this.strokeClosedPoly(capital, filled);
    // Shaft
    const shaft = [
      { x: cx - radius * 0.35, y: cy - radius * 0.7 },
      { x: cx + radius * 0.35, y: cy - radius * 0.7 },
      { x: cx + radius * 0.4, y: cy + radius * 0.65 },
      { x: cx - radius * 0.4, y: cy + radius * 0.65 },
    ];
    this.strokeClosedPoly(shaft, filled);
    // Fluting lines
    this.drawLine(cx - radius * 0.12, cy - radius * 0.65, cx - radius * 0.15, cy + radius * 0.6);
    this.drawLine(cx + radius * 0.12, cy - radius * 0.65, cx + radius * 0.15, cy + radius * 0.6);
    // Base
    const base = [
      { x: cx - radius * 0.75, y: cy + radius * 0.65 },
      { x: cx + radius * 0.75, y: cy + radius * 0.65 },
      { x: cx + radius * 0.75, y: cy + radius * 0.95 },
      { x: cx - radius * 0.75, y: cy + radius * 0.95 },
    ];
    this.strokeClosedPoly(base, filled);
  }

  drawCastle(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Main keep
    const keep = [
      { x: cx - radius * 0.55, y: cy - radius * 0.2 },
      { x: cx + radius * 0.55, y: cy - radius * 0.2 },
      { x: cx + radius * 0.55, y: cy + radius * 0.85 },
      { x: cx - radius * 0.55, y: cy + radius * 0.85 },
    ];
    this.strokeClosedPoly(keep, filled);
    // Battlements
    for (let i = -2; i <= 2; i++) {
      const bx = cx + i * radius * 0.22;
      this.drawLine(bx - radius * 0.08, cy - radius * 0.2, bx - radius * 0.08, cy - radius * 0.4);
      this.drawLine(bx + radius * 0.08, cy - radius * 0.2, bx + radius * 0.08, cy - radius * 0.4);
      this.drawLine(bx - radius * 0.08, cy - radius * 0.4, bx + radius * 0.08, cy - radius * 0.4);
    }
    // Towers
    const tower = (tx: number) => {
      const t = [
        { x: tx - radius * 0.22, y: cy - radius * 0.55 },
        { x: tx + radius * 0.22, y: cy - radius * 0.55 },
        { x: tx + radius * 0.22, y: cy + radius * 0.85 },
        { x: tx - radius * 0.22, y: cy + radius * 0.85 },
      ];
      this.strokeClosedPoly(t, filled);
      this.drawLine(tx - radius * 0.22, cy - radius * 0.55, tx, cy - radius * 0.9);
      this.drawLine(tx + radius * 0.22, cy - radius * 0.55, tx, cy - radius * 0.9);
    };
    tower(cx - radius * 0.75);
    tower(cx + radius * 0.75);
    // Gate
    this.drawLine(cx - radius * 0.18, cy + radius * 0.85, cx - radius * 0.18, cy + radius * 0.25);
    this.drawLine(cx + radius * 0.18, cy + radius * 0.85, cx + radius * 0.18, cy + radius * 0.25);
    this.drawLine(cx - radius * 0.18, cy + radius * 0.25, cx + radius * 0.18, cy + radius * 0.25);
  }

  drawShipSail(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Hull
    const hull = [
      { x: cx - radius * 0.95, y: cy + radius * 0.35 },
      { x: cx + radius * 0.95, y: cy + radius * 0.35 },
      { x: cx + radius * 0.65, y: cy + radius * 0.85 },
      { x: cx - radius * 0.65, y: cy + radius * 0.85 },
    ];
    this.strokeClosedPoly(hull, filled);
    // Mast
    this.drawLine(cx, cy + radius * 0.35, cx, cy - radius * 0.95);
    // Mainsail
    const sail = [
      { x: cx, y: cy - radius * 0.85 },
      { x: cx + radius * 0.7, y: cy - radius * 0.15 },
      { x: cx, y: cy + radius * 0.25 },
    ];
    this.strokeClosedPoly(sail, filled);
    // Foresail
    const fore = [
      { x: cx, y: cy - radius * 0.55 },
      { x: cx - radius * 0.55, y: cy + radius * 0.05 },
      { x: cx, y: cy + radius * 0.25 },
    ];
    this.strokeClosedPoly(fore, filled);
  }

  drawCompassRose(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawCircle(Math.round(cx), Math.round(cy), Math.round(radius * 0.35), false);
    const dirs = [
      { angle: -Math.PI / 2, major: true },  // N
      { angle: 0, major: true },             // E
      { angle: Math.PI / 2, major: true },   // S
      { angle: Math.PI, major: true },       // W
      { angle: -Math.PI / 4, major: false },
      { angle: Math.PI / 4, major: false },
      { angle: (3 * Math.PI) / 4, major: false },
      { angle: (-3 * Math.PI) / 4, major: false },
    ];
    for (const d of dirs) {
      const len = d.major ? radius : radius * 0.65;
      const tipX = cx + Math.cos(d.angle) * len;
      const tipY = cy + Math.sin(d.angle) * len;
      const perp = d.angle + Math.PI / 2;
      const halfW = d.major ? radius * 0.14 : radius * 0.08;
      const base = radius * 0.2;
      const bx = cx + Math.cos(d.angle) * base;
      const by = cy + Math.sin(d.angle) * base;
      const left = { x: bx + Math.cos(perp) * halfW, y: by + Math.sin(perp) * halfW };
      const right = { x: bx - Math.cos(perp) * halfW, y: by - Math.sin(perp) * halfW };
      this.strokeClosedPoly([{ x: tipX, y: tipY }, left, right], filled && d.major);
    }
    // North marker tick
    this.drawLine(cx, cy - radius * 0.35, cx, cy - radius * 0.5);
  }

  drawScroll(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Main parchment rectangle
    const page = [
      { x: cx - radius * 0.55, y: cy - radius * 0.7 },
      { x: cx + radius * 0.55, y: cy - radius * 0.7 },
      { x: cx + radius * 0.55, y: cy + radius * 0.7 },
      { x: cx - radius * 0.55, y: cy + radius * 0.7 },
    ];
    this.strokeClosedPoly(page, filled);
    // Top roll
    this.drawCircle(Math.round(cx - radius * 0.55), Math.round(cy - radius * 0.7), Math.max(2, Math.round(radius * 0.18)), filled);
    this.drawCircle(Math.round(cx + radius * 0.55), Math.round(cy - radius * 0.7), Math.max(2, Math.round(radius * 0.18)), filled);
    this.drawLine(cx - radius * 0.55, cy - radius * 0.88, cx + radius * 0.55, cy - radius * 0.88);
    this.drawLine(cx - radius * 0.55, cy - radius * 0.52, cx + radius * 0.55, cy - radius * 0.52);
    // Bottom roll
    this.drawCircle(Math.round(cx - radius * 0.55), Math.round(cy + radius * 0.7), Math.max(2, Math.round(radius * 0.18)), filled);
    this.drawCircle(Math.round(cx + radius * 0.55), Math.round(cy + radius * 0.7), Math.max(2, Math.round(radius * 0.18)), filled);
    this.drawLine(cx - radius * 0.55, cy + radius * 0.52, cx + radius * 0.55, cy + radius * 0.52);
    this.drawLine(cx - radius * 0.55, cy + radius * 0.88, cx + radius * 0.55, cy + radius * 0.88);
    // Text lines
    for (let i = 0; i < 3; i++) {
      const y = cy - radius * 0.25 + i * radius * 0.25;
      this.drawLine(cx - radius * 0.35, y, cx + radius * 0.35, y);
    }
  }

  drawLibertyBell(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Yoke / hanger
    this.drawLine(cx - radius * 0.35, cy - radius * 0.85, cx + radius * 0.35, cy - radius * 0.85);
    this.drawLine(cx, cy - radius * 0.95, cx, cy - radius * 0.7);
    // Bell body
    const bell = [
      { x: cx - radius * 0.35, y: cy - radius * 0.7 },
      { x: cx + radius * 0.35, y: cy - radius * 0.7 },
      { x: cx + radius * 0.75, y: cy + radius * 0.55 },
      { x: cx + radius * 0.65, y: cy + radius * 0.75 },
      { x: cx - radius * 0.65, y: cy + radius * 0.75 },
      { x: cx - radius * 0.75, y: cy + radius * 0.55 },
    ];
    this.strokeClosedPoly(bell, filled);
    // Crack
    this.drawLine(cx + radius * 0.05, cy - radius * 0.35, cx + radius * 0.2, cy + radius * 0.55);
    this.drawLine(cx + radius * 0.2, cy + radius * 0.55, cx + radius * 0.05, cy + radius * 0.75);
    // Clapper hint
    this.drawLine(cx, cy + radius * 0.75, cx, cy + radius * 0.95);
    this.drawCircle(Math.round(cx), Math.round(cy + radius * 0.95), Math.max(1, Math.round(radius * 0.08)), true);
  }

  drawFlag(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Pole
    this.drawLine(cx - radius * 0.7, cy - radius * 0.95, cx - radius * 0.7, cy + radius * 0.95);
    // Flag cloth
    const cloth = [
      { x: cx - radius * 0.7, y: cy - radius * 0.85 },
      { x: cx + radius * 0.85, y: cy - radius * 0.7 },
      { x: cx + radius * 0.7, y: cy + radius * 0.15 },
      { x: cx - radius * 0.7, y: cy },
    ];
    this.strokeClosedPoly(cloth, filled);
    // Stripe
    this.drawLine(cx - radius * 0.7, cy - radius * 0.4, cx + radius * 0.78, cy - radius * 0.28);
  }

  drawTimeline(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // Main axis
    this.drawLine(cx - radius, cy, cx + radius, cy);
    // Arrow heads
    this.drawLine(cx + radius, cy, cx + radius * 0.85, cy - radius * 0.15);
    this.drawLine(cx + radius, cy, cx + radius * 0.85, cy + radius * 0.15);
    // Event ticks + markers
    const ticks = [-0.7, -0.25, 0.25, 0.7];
    for (let i = 0; i < ticks.length; i++) {
      const x = cx + ticks[i] * radius;
      this.drawLine(x, cy - radius * 0.25, x, cy + radius * 0.25);
      const markerR = Math.max(1, Math.round(radius * 0.1));
      const my = i % 2 === 0 ? cy - radius * 0.55 : cy + radius * 0.55;
      this.drawCircle(Math.round(x), Math.round(my), markerR, filled || true);
      this.drawLine(x, i % 2 === 0 ? cy - radius * 0.25 : cy + radius * 0.25, x, my);
    }
  }

  drawTriangle(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawPolygon(cx, cy, radius, 3, -90, filled);
  }

  drawSquare(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawPolygon(cx, cy, radius, 4, 45, filled);
  }

  drawHexagon(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawPolygon(cx, cy, radius, 6, 0, filled);
  }

  drawCube(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const s = radius * 0.7;
    const dx = radius * 0.35;
    const dy = radius * 0.28;
    // Front face
    const f = [
      { x: cx - s, y: cy - s * 0.3 },
      { x: cx + s * 0.4, y: cy - s * 0.3 },
      { x: cx + s * 0.4, y: cy + s * 0.9 },
      { x: cx - s, y: cy + s * 0.9 },
    ];
    this.strokeClosedPoly(f, filled);
    // Top face
    const t = [
      { x: cx - s, y: cy - s * 0.3 },
      { x: cx - s + dx, y: cy - s * 0.3 - dy },
      { x: cx + s * 0.4 + dx, y: cy - s * 0.3 - dy },
      { x: cx + s * 0.4, y: cy - s * 0.3 },
    ];
    this.strokeClosedPoly(t, false);
    // Side face
    const side = [
      { x: cx + s * 0.4, y: cy - s * 0.3 },
      { x: cx + s * 0.4 + dx, y: cy - s * 0.3 - dy },
      { x: cx + s * 0.4 + dx, y: cy + s * 0.9 - dy },
      { x: cx + s * 0.4, y: cy + s * 0.9 },
    ];
    this.strokeClosedPoly(side, false);
  }

  drawCone(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const apex = { x: cx, y: cy - radius };
    const left = { x: cx - radius * 0.75, y: cy + radius * 0.55 };
    const right = { x: cx + radius * 0.75, y: cy + radius * 0.55 };
    this.drawLine(apex.x, apex.y, left.x, left.y);
    this.drawLine(apex.x, apex.y, right.x, right.y);
    // Base ellipse
    const a = radius * 0.75;
    const b = radius * 0.28;
    const steps = Math.max(24, Math.ceil(radius * 3));
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const x = cx + a * Math.cos(t);
      const y = cy + radius * 0.55 + b * Math.sin(t);
      if (i > 0) this.drawLine(px, py, x, y);
      px = x; py = y;
    }
    if (filled) {
      this.fillPolygonInterior([apex, left, right]);
    }
  }

  drawCylinder(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const a = radius * 0.7;
    const b = radius * 0.25;
    const topY = cy - radius * 0.7;
    const botY = cy + radius * 0.7;
    // Side lines
    this.drawLine(cx - a, topY, cx - a, botY);
    this.drawLine(cx + a, topY, cx + a, botY);
    // Top ellipse
    let px = 0, py = 0;
    const steps = Math.max(24, Math.ceil(radius * 3));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const x = cx + a * Math.cos(t);
      const y = topY + b * Math.sin(t);
      if (i > 0) this.drawLine(px, py, x, y);
      px = x; py = y;
    }
    // Bottom ellipse (full)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const x = cx + a * Math.cos(t);
      const y = botY + b * Math.sin(t);
      if (i > 0) this.drawLine(px, py, x, y);
      px = x; py = y;
    }
    if (filled) {
      for (let y = Math.round(topY); y <= Math.round(botY); y++) {
        this.drawLine(cx - a + 1, y, cx + a - 1, y);
      }
    }
  }

  drawRightTriangle(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const verts = [
      { x: cx - radius * 0.85, y: cy + radius * 0.7 },
      { x: cx + radius * 0.85, y: cy + radius * 0.7 },
      { x: cx - radius * 0.85, y: cy - radius * 0.7 },
    ];
    this.strokeClosedPoly(verts, filled);
    // Right-angle square mark
    const s = radius * 0.18;
    this.drawLine(cx - radius * 0.85 + s, cy + radius * 0.7, cx - radius * 0.85 + s, cy + radius * 0.7 - s);
    this.drawLine(cx - radius * 0.85 + s, cy + radius * 0.7 - s, cx - radius * 0.85, cy + radius * 0.7 - s);
  }

  drawAngle(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    const vertex = { x: cx - radius * 0.6, y: cy + radius * 0.5 };
    this.drawLine(vertex.x, vertex.y, cx + radius * 0.9, cy + radius * 0.5);
    this.drawLine(vertex.x, vertex.y, cx + radius * 0.55, cy - radius * 0.85);
    // Arc
    const arcR = radius * 0.4;
    const start = 0;
    const end = -Math.PI * 0.55;
    const steps = 16;
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const t = start + (end - start) * (i / steps);
      const x = vertex.x + arcR * Math.cos(t);
      const y = vertex.y + arcR * Math.sin(t);
      if (i > 0) this.drawLine(px, py, x, y);
      px = x; py = y;
    }
    if (filled) {
      // Small wedge fill
      const mid = (start + end) / 2;
      for (let r = 2; r < arcR; r += 2) {
        this.setPoint(
          Math.round(vertex.x + r * Math.cos(mid)),
          Math.round(vertex.y + r * Math.sin(mid))
        );
      }
    }
  }

  drawCoordinateAxes(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    // X axis
    this.drawLine(cx - radius, cy, cx + radius, cy);
    this.drawLine(cx + radius, cy, cx + radius * 0.85, cy - radius * 0.12);
    this.drawLine(cx + radius, cy, cx + radius * 0.85, cy + radius * 0.12);
    // Y axis
    this.drawLine(cx, cy + radius, cx, cy - radius);
    this.drawLine(cx, cy - radius, cx - radius * 0.12, cy - radius * 0.85);
    this.drawLine(cx, cy - radius, cx + radius * 0.12, cy - radius * 0.85);
    // Tick marks
    for (const t of [-0.5, 0.5]) {
      this.drawLine(cx + t * radius, cy - radius * 0.1, cx + t * radius, cy + radius * 0.1);
      this.drawLine(cx - radius * 0.1, cy + t * radius, cx + radius * 0.1, cy + t * radius);
    }
    if (filled) {
      this.drawCircle(Math.round(cx), Math.round(cy), Math.max(1, Math.round(radius * 0.08)), true);
    } else {
      this.setPoint(Math.round(cx), Math.round(cy));
    }
  }

  drawPieChart(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;
    this.drawCircle(Math.round(cx), Math.round(cy), Math.round(radius), false);
    // Three sectors: 50% / 30% / 20%
    const cuts = [-Math.PI / 2, -Math.PI / 2 + Math.PI, -Math.PI / 2 + Math.PI * 1.6];
    for (const theta of cuts) {
      this.drawLine(cx, cy, cx + radius * Math.cos(theta), cy + radius * Math.sin(theta));
    }
    if (filled) {
      // Dot-fill first sector (largest)
      const mid = -Math.PI / 2 + Math.PI / 2;
      for (let r = 2; r < radius - 1; r += 2) {
        this.setPoint(Math.round(cx + r * Math.cos(mid)), Math.round(cy + r * Math.sin(mid)));
        this.setPoint(Math.round(cx + r * Math.cos(mid + 0.35)), Math.round(cy + r * Math.sin(mid + 0.35)));
        this.setPoint(Math.round(cx + r * Math.cos(mid - 0.35)), Math.round(cy + r * Math.sin(mid - 0.35)));
      }
    }
  }
}

export interface GraphicResult {

  brf: string;
  summary: string;
}

export function generateClock(radius: number, hours: number, minutes: number): GraphicResult {
  const cellsW = Math.ceil((radius * 2) / 2) + 2;
  const cellsH = Math.ceil((radius * 2) / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawClock(cellsW, cellsH * 1.5, radius, hours, minutes);
  
  return {
    brf: canvas.renderToBRF(),
    summary: `Clock showing ${hours}:${minutes.toString().padStart(2, '0')}`
  };
}

export function generateFraction(radius: number, numerator: number, denominator: number): GraphicResult {
  const cellsW = Math.ceil((radius * 2) / 2) + 2;
  const cellsH = Math.ceil((radius * 2) / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawFraction(cellsW, cellsH * 1.5, radius, numerator, denominator);
  
  return {
    brf: canvas.renderToBRF(),
    summary: `Fraction circle showing ${numerator} out of ${denominator}`
  };
}

export function generateNumberLine(length: number, start: number, end: number, step: number, isVertical: boolean): GraphicResult {
  let cellsW = 2;
  let cellsH = 2;
  if (isVertical) {
    cellsH = Math.ceil(length / 3) + 2;
    cellsW = 4;
  } else {
    cellsW = Math.ceil(length / 2) + 2;
    cellsH = 4;
  }
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawNumberLine(2, 2, length, start, end, step, isVertical);
  
  return {
    brf: canvas.renderToBRF(),
    summary: `Number line from ${start} to ${end} with steps of ${step}`
  };
}

export function generateBase10(hundreds: number, tens: number, ones: number): GraphicResult {
  const widthDots = hundreds * 12 + tens * 3 + ones * 3 + 2;
  const heightDots = 12;
  const cellsW = Math.ceil(widthDots / 2) + 2;
  const cellsH = Math.ceil(heightDots / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawBase10(2, 2, hundreds, tens, ones);
  
  return {
    brf: canvas.renderToBRF(),
    summary: `Base-10 blocks showing ${hundreds} hundreds, ${tens} tens, and ${ones} ones`
  };
}

export function generateManipulatives(rows: number, cols: number, spacing: number): GraphicResult {
  const widthDots = cols * spacing + 4;
  const heightDots = rows * spacing + 4;
  const cellsW = Math.ceil(widthDots / 2) + 2;
  const cellsH = Math.ceil(heightDots / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawManipulatives(2, 2, rows, cols, spacing);
  
  return {
    brf: canvas.renderToBRF(),
    summary: `Array of manipulatives with ${rows} rows and ${cols} columns`
  };
}

export type InventoryShapeKind =
  | 'actingMask'
  | 'angle'
  | 'apple'
  | 'atom'
  | 'axe'
  | 'beach'
  | 'beaker'
  | 'bed'
  | 'birdHouse'
  | 'bowling'
  | 'butterfly'
  | 'candle'
  | 'castle'
  | 'cat'
  | 'circle'
  | 'cloud'
  | 'cloudLightning'
  | 'compassRose'
  | 'cone'
  | 'coordinateAxes'
  | 'cross'
  | 'cube'
  | 'cylinder'
  | 'dna'
  | 'dog'
  | 'earth'
  | 'fish'
  | 'flag'
  | 'flower'
  | 'greekColumn'
  | 'heart'
  | 'hexagon'
  | 'hiking'
  | 'house'
  | 'iceSkates'
  | 'leaf'
  | 'libertyBell'
  | 'lightning'
  | 'magnet'
  | 'microscope'
  | 'moon'
  | 'movieProjector'
  | 'mustache'
  | 'paintbrush'
  | 'pieChart'
  | 'pyramid'
  | 'rightTriangle'
  | 'scroll'
  | 'shipSail'
  | 'square'
  | 'star'
  | 'sun'
  | 'thermometer'
  | 'timeline'
  | 'triangle'
  | 'vampireFangs'
  | 'volcano';

function clampRadius(radius: number): number {
  const r = Math.round(Number(radius));
  return Number.isFinite(r) && r > 0 ? r : 1;
}

function clampSides(sides: number): number {
  const n = Math.round(Number(sides));
  return Number.isFinite(n) && n >= 3 ? n : 3;
}

export function generateInventoryShape(
  kind: InventoryShapeKind,
  radius: number,
  filled: boolean,
  crossParams?: {
    lengthHorizontal: number;
    thicknessVertical: number;
    thicknessHorizontal: number;
    heightRatio: number;
  }
): GraphicResult {
  const r = clampRadius(radius);
  let spanX = r * 2;
  let spanY = r * 2;

  if (kind === 'actingMask') {
    spanX = r * 2.4;
    spanY = r * 2.4;
  } else if (kind === 'apple') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'axe') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'beach') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'bed') {
    spanX = r * 2.4;
    spanY = r * 2.0;
  } else if (kind === 'birdHouse') {
    spanX = r * 1.8;
    spanY = r * 2.6;
  } else if (kind === 'bowling') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'candle') {
    spanX = r * 2.4;
    spanY = r * 2.6;
  } else if (kind === 'cat') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'cloud') {
    spanX = r * 2.6;
    spanY = r * 2.0;
  } else if (kind === 'cloudLightning') {
    spanX = r * 2.8;
    spanY = r * 2.8;
  } else if (kind === 'cross') {
    const lenHoriz = crossParams?.lengthHorizontal ?? 30;
    const rHoriz = Math.max(1, Math.round(lenHoriz / 2));
    spanX = rHoriz * 2;
    spanY = r * 2;
  } else if (kind === 'dog') {
    spanX = r * 2.2;
    spanY = r * 2.0;
  } else if (kind === 'flower') {
    spanX = r * 2.2;
    spanY = r * 2.6;
  } else if (kind === 'heart') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'hiking') {
    spanX = r * 2.4;
    spanY = r * 2.4;
  } else if (kind === 'house') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'iceSkates') {
    spanX = r * 2.8;
    spanY = r * 2.6;
  } else if (kind === 'moon') {
    spanX = r * 2.4;
    spanY = r * 2.2;
  } else if (kind === 'movieProjector') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'mustache') {
    spanX = r * 2.4;
    spanY = r * 1.8;
  } else if (kind === 'paintbrush') {
    spanX = r * 1.8;
    spanY = r * 3.6;
  } else if (kind === 'vampireFangs') {
    spanX = r * 2.2;
    spanY = r * 2.8;
  } else if (kind === 'atom' || kind === 'earth' || kind === 'sun' || kind === 'compassRose' || kind === 'pieChart'
    || kind === 'triangle' || kind === 'square' || kind === 'hexagon' || kind === 'cube' || kind === 'cone'
    || kind === 'cylinder' || kind === 'rightTriangle' || kind === 'angle' || kind === 'coordinateAxes'
    || kind === 'magnet' || kind === 'leaf' || kind === 'fish' || kind === 'butterfly' || kind === 'volcano'
    || kind === 'beaker' || kind === 'microscope' || kind === 'pyramid' || kind === 'castle' || kind === 'shipSail'
    || kind === 'scroll' || kind === 'libertyBell' || kind === 'flag') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'dna' || kind === 'thermometer' || kind === 'greekColumn') {
    spanX = r * 1.8;
    spanY = r * 2.6;
  } else if (kind === 'timeline') {
    spanX = r * 2.4;
    spanY = r * 1.8;
  }

  const cellsW = Math.ceil(spanX / 2) + 2;
  const cellsH = Math.ceil(spanY / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  const cx = cellsW;
  const cy = cellsH * 1.5;

  let label = '';
  switch (kind) {
    case 'actingMask':
      canvas.drawActingMask(cx, cy, r, filled);
      label = 'Acting Mask';
      break;
    case 'beach':
      canvas.drawBeach(cx, cy, r, filled);
      label = 'Beach';
      break;
    case 'bed':
      canvas.drawBed(cx, cy, r, filled);
      label = 'Bed';
      break;
    case 'birdHouse':
      canvas.drawBirdHouse(cx, cy, r, filled);
      label = 'Bird House';
      break;
    case 'bowling':
      canvas.drawBowling(cx, cy, r, filled);
      label = 'Bowling';
      break;
    case 'movieProjector':
      canvas.drawMovieProjector(cx, cy, r, filled);
      label = 'Movie Projector';
      break;
    case 'apple':
      canvas.drawApple(cx, cy, r, filled);
      label = 'Apple';
      break;
    case 'axe':
      canvas.drawAxe(cx, cy, r, filled);
      label = 'Axe';
      break;
    case 'candle':
      canvas.drawCandle(cx, cy, r, filled);
      label = 'Candle';
      break;
    case 'cat':
      canvas.drawCat(cx, cy, r, filled);
      label = 'Cat';
      break;
    case 'circle':
      canvas.drawCircle(cx, cy, r, filled);
      label = 'Circle';
      break;
    case 'cloud':
      canvas.drawCloud(cx, cy, r, filled);
      label = 'Cloud';
      break;
    case 'cloudLightning':
      canvas.drawCloudLightning(cx, cy, r, filled);
      label = 'Cloud with Lightning Bolt';
      break;
    case 'cross': {
      const lenHoriz = crossParams?.lengthHorizontal ?? 30;
      const thickVert = crossParams?.thicknessVertical ?? 6;
      const thickHoriz = crossParams?.thicknessHorizontal ?? 6;
      const hRatio = crossParams?.heightRatio ?? 0.35;
      canvas.drawCross(cx, cy, r, lenHoriz, thickVert, thickHoriz, hRatio, filled);
      label = 'Cross';
      break;
    }
    case 'dog':
      canvas.drawDog(cx, cy, r, filled);
      label = 'Dog';
      break;
    case 'flower':
      canvas.drawFlower(cx, cy, r, filled);
      label = 'Flower';
      break;
    case 'heart':
      canvas.drawHeart(cx, cy, r, filled);
      label = 'Heart';
      break;
    case 'hiking':
      canvas.drawHiking(cx, cy, r, filled);
      label = 'Hiking';
      break;
    case 'house':
      canvas.drawHouse(cx, cy, r, filled);
      label = 'House';
      break;
    case 'iceSkates':
      canvas.drawIceSkates(cx, cy, r, filled);
      label = 'Ice Skating Skates';
      break;
    case 'lightning':
      canvas.drawLightningBolt(cx, cy, r, filled);
      label = 'Lightning Bolt';
      break;
    case 'moon':
      canvas.drawCrescentMoon(cx, cy, r, filled);
      label = 'Crescent Moon';
      break;
    case 'mustache':
      canvas.drawMustache(cx, cy, r, filled);
      label = 'Mustache';
      break;
    case 'paintbrush':
      canvas.drawPaintbrush(cx, cy, r, filled);
      label = 'Paintbrush';
      break;
    case 'star':
      canvas.drawStar(cx, cy, r, filled);
      label = 'Star (5-Pointed)';
      break;
    case 'vampireFangs':
      canvas.drawVampireFangs(cx, cy, r, filled);
      label = 'Vampire Fangs';
      break;
    case 'atom':
      canvas.drawAtom(cx, cy, r, filled);
      label = 'Atom';
      break;
    case 'dna':
      canvas.drawDna(cx, cy, r, filled);
      label = 'DNA Helix';
      break;
    case 'leaf':
      canvas.drawLeaf(cx, cy, r, filled);
      label = 'Leaf';
      break;
    case 'fish':
      canvas.drawFish(cx, cy, r, filled);
      label = 'Fish';
      break;
    case 'butterfly':
      canvas.drawButterfly(cx, cy, r, filled);
      label = 'Butterfly';
      break;
    case 'earth':
      canvas.drawEarth(cx, cy, r, filled);
      label = 'Earth / Globe';
      break;
    case 'sun':
      canvas.drawSun(cx, cy, r, filled);
      label = 'Sun';
      break;
    case 'volcano':
      canvas.drawVolcano(cx, cy, r, filled);
      label = 'Volcano';
      break;
    case 'magnet':
      canvas.drawMagnet(cx, cy, r, filled);
      label = 'Horseshoe Magnet';
      break;
    case 'thermometer':
      canvas.drawThermometer(cx, cy, r, filled);
      label = 'Thermometer';
      break;
    case 'beaker':
      canvas.drawBeaker(cx, cy, r, filled);
      label = 'Lab Beaker';
      break;
    case 'microscope':
      canvas.drawMicroscope(cx, cy, r, filled);
      label = 'Microscope';
      break;
    case 'pyramid':
      canvas.drawPyramid(cx, cy, r, filled);
      label = 'Pyramid';
      break;
    case 'greekColumn':
      canvas.drawGreekColumn(cx, cy, r, filled);
      label = 'Greek Column';
      break;
    case 'castle':
      canvas.drawCastle(cx, cy, r, filled);
      label = 'Castle';
      break;
    case 'shipSail':
      canvas.drawShipSail(cx, cy, r, filled);
      label = 'Sailing Ship';
      break;
    case 'compassRose':
      canvas.drawCompassRose(cx, cy, r, filled);
      label = 'Compass Rose';
      break;
    case 'scroll':
      canvas.drawScroll(cx, cy, r, filled);
      label = 'Scroll';
      break;
    case 'libertyBell':
      canvas.drawLibertyBell(cx, cy, r, filled);
      label = 'Liberty Bell';
      break;
    case 'flag':
      canvas.drawFlag(cx, cy, r, filled);
      label = 'Flag';
      break;
    case 'timeline':
      canvas.drawTimeline(cx, cy, r, filled);
      label = 'Timeline';
      break;
    case 'triangle':
      canvas.drawTriangle(cx, cy, r, filled);
      label = 'Triangle';
      break;
    case 'square':
      canvas.drawSquare(cx, cy, r, filled);
      label = 'Square';
      break;
    case 'hexagon':
      canvas.drawHexagon(cx, cy, r, filled);
      label = 'Hexagon';
      break;
    case 'cube':
      canvas.drawCube(cx, cy, r, filled);
      label = 'Cube';
      break;
    case 'cone':
      canvas.drawCone(cx, cy, r, filled);
      label = 'Cone';
      break;
    case 'cylinder':
      canvas.drawCylinder(cx, cy, r, filled);
      label = 'Cylinder';
      break;
    case 'rightTriangle':
      canvas.drawRightTriangle(cx, cy, r, filled);
      label = 'Right Triangle';
      break;
    case 'angle':
      canvas.drawAngle(cx, cy, r, filled);
      label = 'Angle';
      break;
    case 'coordinateAxes':
      canvas.drawCoordinateAxes(cx, cy, r, filled);
      label = 'Coordinate Axes';
      break;
    case 'pieChart':
      canvas.drawPieChart(cx, cy, r, filled);
      label = 'Pie Chart';
      break;
  }

  const fillNote = filled ? ', filled' : ', outline';
  let summary = `${label} (size ${r}${fillNote})`;
  if (kind === 'cross' && crossParams) {
    summary = `Cross (height ${r * 2}, width ${crossParams.lengthHorizontal}, vertical thickness ${crossParams.thicknessVertical}, horizontal thickness ${crossParams.thicknessHorizontal}${fillNote})`;
  }

  return {
    brf: canvas.renderToBRF(),
    summary,
  };
}

export function generateCustomShape(radius: number, sides: number, angle: number, filled: boolean): GraphicResult {
  const r = clampRadius(radius);
  const n = clampSides(sides);
  const cellsW = Math.ceil((r * 2) / 2) + 2;
  const cellsH = Math.ceil((r * 2) / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawPolygon(cellsW, cellsH * 1.5, r, n, angle, filled);

  const fillNote = filled ? ', filled' : ', outline';
  return {
    brf: canvas.renderToBRF(),
    summary: `Polygon with ${n} sides (size ${r}${fillNote})`,
  };
}

export function generateRaisedPrintTextGraphic(
  font: Font,
  text: string,
  fontSize: number,
  filled: boolean,
  letterType: 'bubble' | 'thin' = 'bubble'
): GraphicResult {
  const fSize = Math.max(4, Number(fontSize) || 12);

  if (letterType === 'thin') {
    const centerline = getCenterlineStrokes(text, fSize);
    const startX = 4;
    const startY = 4;

    const cellsW = Math.max(2, Math.ceil((centerline.width + startX * 2) / 2));
    const cellsH = Math.max(2, Math.ceil((centerline.height + startY * 2) / 3));

    const canvas = new GraphicCanvas(cellsW, cellsH);
    for (const s of centerline.strokes) {
      canvas.drawLine(s.x1 + startX, s.y1 + startY, s.x2 + startX, s.y2 + startY);
    }

    return {
      brf: canvas.renderToBRF(),
      summary: `Raised print text "${text}" (font size ${fSize}, thin letters)`,
    };
  }

  const path = font.getPath(text, 0, 0, fSize);
  const bbox = path.getBoundingBox();

  const textW = (bbox.x2 !== undefined && !isNaN(bbox.x2) && bbox.x1 !== undefined && !isNaN(bbox.x1)) ? (bbox.x2 - bbox.x1) : 0;
  const textH = (bbox.y2 !== undefined && !isNaN(bbox.y2) && bbox.y1 !== undefined && !isNaN(bbox.y1)) ? (bbox.y2 - bbox.y1) : 0;

  const startX = 4;
  const startY = 4;

  const cellsW = Math.max(2, Math.ceil((textW + startX * 2) / 2));
  const cellsH = Math.max(2, Math.ceil((textH + startY * 2) / 3));

  const canvas = new GraphicCanvas(cellsW, cellsH);
  canvas.drawVectorPrintTextToDots(font, text, startX, startY, fSize, filled);

  const fillNote = filled ? ', filled' : ', outline';
  return {
    brf: canvas.renderToBRF(),
    summary: `Raised print text "${text}" (font size ${fSize}${fillNote})`,
  };
}
