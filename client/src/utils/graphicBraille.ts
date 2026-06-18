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

    const startX = Math.round(cx - radius);
    const endX = Math.round(cx + radius);

    // Shoreline function
    const getShoreY = (x: number): number => {
      return cy + radius * 0.1 + (x - cx) * 0.4 + Math.sin((x - cx) / (radius * 0.3 || 1)) * radius * 0.08;
    };

    if (filled) {
      // Fill sand (below shoreline)
      for (let x = startX; x <= endX; x++) {
        const yShore = Math.round(getShoreY(x));
        const yBottom = Math.round(cy + radius);
        if (yShore <= yBottom) {
          this.drawLine(x, yShore, x, yBottom);
        }
      }

      // Fill sun
      const sunCx = cx + radius * 0.5;
      const sunCy = cy - radius * 0.5;
      const sunR = radius * 0.24;
      this.fillDisc(Math.round(sunCx), Math.round(sunCy), Math.round(sunR));
    } else {
      // Outline mode: draw shoreline line
      let prevSX = startX;
      let prevSY = Math.round(getShoreY(prevSX));
      for (let x = startX + 1; x <= endX; x++) {
        const yShore = Math.round(getShoreY(x));
        this.drawLine(prevSX, prevSY, x, yShore);
        prevSX = x;
        prevSY = yShore;
      }

      // Draw sun circle
      const sunCx = cx + radius * 0.5;
      const sunCy = cy - radius * 0.5;
      const sunR = radius * 0.24;
      this.drawCircle(Math.round(sunCx), Math.round(sunCy), Math.round(sunR), false);

      // Draw sun rays
      const rayAngles = [135, 180, 225, 270];
      const rayStart = sunR + 1;
      const rayEnd = sunR + radius * 0.15;
      for (const angleDeg of rayAngles) {
        const rad = (angleDeg * Math.PI) / 180;
        this.drawLine(
          sunCx + rayStart * Math.cos(rad),
          sunCy + rayStart * Math.sin(rad),
          sunCx + rayEnd * Math.cos(rad),
          sunCy + rayEnd * Math.sin(rad)
        );
      }
    }

    // Always draw waves in the water area
    const drawWave = (wx: number, wy: number, wlen: number) => {
      let prevX = wx;
      let prevY = wy;
      const wsteps = 6;
      for (let i = 1; i <= wsteps; i++) {
        const t = i / wsteps;
        const x = wx + wlen * t;
        const y = wy + Math.sin(t * Math.PI * 2) * (radius * 0.05);
        this.drawLine(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
    };

    drawWave(cx + radius * 0.1, cy + radius * 0.1, radius * 0.4);
    drawWave(cx + radius * 0.4, cy - radius * 0.1, radius * 0.35);

    // Always draw Palm tree
    // Curved trunk
    const steps = 10;
    let prevX = cx - radius * 0.6;
    let prevY = cy + radius * 0.7;
    const trunkEndX = cx - radius * 0.3;
    const trunkEndY = cy - radius * 0.15;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Curved path
      const tx = (1 - t) ** 2 * (cx - radius * 0.6) + 2 * (1 - t) * t * (cx - radius * 0.65) + t ** 2 * trunkEndX;
      const ty = (1 - t) ** 2 * (cy + radius * 0.7) + 2 * (1 - t) * t * (cy + radius * 0.3) + t ** 2 * trunkEndY;
      this.drawLine(prevX, prevY, tx, ty);
      prevX = tx;
      prevY = ty;
    }

    // Palm leaves (fronds)
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

    drawFrond(trunkEndX, trunkEndY, trunkEndX - radius * 0.45, trunkEndY + radius * 0.1, radius * 0.1);
    drawFrond(trunkEndX, trunkEndY, trunkEndX - radius * 0.3, trunkEndY - radius * 0.15, radius * 0.15);
    drawFrond(trunkEndX, trunkEndY, trunkEndX + radius * 0.25, trunkEndY - radius * 0.2, radius * 0.18);
    drawFrond(trunkEndX, trunkEndY, trunkEndX + radius * 0.4, trunkEndY - radius * 0.02, radius * 0.12);
    drawFrond(trunkEndX, trunkEndY, trunkEndX + radius * 0.28, trunkEndY + radius * 0.18, radius * 0.05);
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

export type InventoryShapeKind = 'actingMask' | 'apple' | 'axe' | 'beach' | 'birdHouse' | 'candle' | 'circle' | 'cloud' | 'cloudLightning' | 'cross' | 'flower' | 'heart' | 'hiking' | 'iceSkates' | 'lightning' | 'moon' | 'paintbrush' | 'star' | 'vampireFangs';

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
  } else if (kind === 'birdHouse') {
    spanX = r * 1.8;
    spanY = r * 2.6;
  } else if (kind === 'candle') {
    spanX = r * 2.4;
    spanY = r * 2.6;
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
  } else if (kind === 'flower') {
    spanX = r * 2.2;
    spanY = r * 2.6;
  } else if (kind === 'heart') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'hiking') {
    spanX = r * 2.4;
    spanY = r * 2.4;
  } else if (kind === 'iceSkates') {
    spanX = r * 2.8;
    spanY = r * 2.6;
  } else if (kind === 'moon') {
    spanX = r * 2.4;
    spanY = r * 2.2;
  } else if (kind === 'paintbrush') {
    spanX = r * 1.8;
    spanY = r * 3.6;
  } else if (kind === 'vampireFangs') {
    spanX = r * 2.2;
    spanY = r * 2.8;
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
    case 'birdHouse':
      canvas.drawBirdHouse(cx, cy, r, filled);
      label = 'Bird House';
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
