import { GridCanvas } from './chartBraille';

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

export class GraphicCanvas extends GridCanvas {
  constructor(cellColumns: number, cellLines: number) {
    super(cellColumns, cellLines);
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

export type SimpleShapeKind = 'circle' | 'heart';

function clampRadius(radius: number): number {
  const r = Math.round(Number(radius));
  return Number.isFinite(r) && r > 0 ? r : 1;
}

function clampSides(sides: number): number {
  const n = Math.round(Number(sides));
  return Number.isFinite(n) && n >= 3 ? n : 3;
}

export function generateSimpleShape(kind: SimpleShapeKind, radius: number, filled: boolean): GraphicResult {
  const r = clampRadius(radius);
  const span = kind === 'heart' ? r * 2.2 : r * 2;
  const cellsW = Math.ceil(span / 2) + 2;
  const cellsH = Math.ceil(span / 3) + 2;
  const canvas = new GraphicCanvas(cellsW, cellsH);
  const cx = cellsW;
  const cy = cellsH * 1.5;
  if (kind === 'circle') {
    canvas.drawCircle(cx, cy, r, filled);
  } else {
    canvas.drawHeart(cx, cy, r, filled);
  }
  const label = kind === 'circle' ? 'Circle' : 'Heart';
  const fillNote = filled ? ', filled' : ', outline';
  return {
    brf: canvas.renderToBRF(),
    summary: `${label} (size ${r}${fillNote})`,
  };
}

export function generatePolygon(radius: number, sides: number, angle: number, filled: boolean): GraphicResult {
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
