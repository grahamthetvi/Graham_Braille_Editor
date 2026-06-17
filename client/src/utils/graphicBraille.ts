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
      { x: cx + radius * 0.2, y: cy - radius },
      { x: cx + radius * 0.4, y: cy - radius * 0.2 },
      { x: cx + radius * 0.1, y: cy - radius * 0.2 },
      { x: cx + radius * 0.5, y: cy + radius * 0.3 },
      { x: cx - radius * 0.3, y: cy + radius },
      { x: cx - radius * 0.1, y: cy + radius * 0.1 },
      { x: cx - radius * 0.4, y: cy + radius * 0.1 }
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
   * Six-petal flower with layered petals, textured center, curved stem, and opposing leaves.
   */
  drawFlower(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const petalCount = 6;
    const isInsideFlowerHead = (x: number, y: number): boolean => {
      const dx = x - cx;
      const dy = y - cy;

      const checkPetalLayer = (offsetAngle: number, distMul: number, aMul: number, bMul: number) => {
        for (let i = 0; i < petalCount; i++) {
          const angle = -Math.PI / 2 + offsetAngle + (i * 2 * Math.PI) / petalCount;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const lx = dx * cosA + dy * sinA;
          const ly = -dx * sinA + dy * cosA;
          const px = lx - radius * distMul;
          const a = radius * aMul;
          const b = radius * bMul;
          if ((px / a) ** 2 + (ly / b) ** 2 <= 1) return true;
        }
        return false;
      };

      if (checkPetalLayer(0, 0.36, 0.44, 0.26)) return true;
      if (checkPetalLayer(Math.PI / petalCount, 0.22, 0.28, 0.18)) return true;

      const centerR = radius * 0.17;
      if (dx * dx + dy * dy <= centerR * centerR) return true;

      const ringR = radius * 0.24;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= centerR * 0.85 && dist <= ringR) return true;

      return false;
    };

    const headPad = radius * 1.05;
    this.drawImplicitShape(
      cx - headPad, cx + headPad, cy - headPad, cy + headPad * 0.55,
      isInsideFlowerHead, filled
    );

    const stemTop = cy + radius * 0.42;
    const stemBottom = cy + radius * 1.05;
    const stemMidX = cx + radius * 0.04;
    this.drawLine(cx, stemTop, stemMidX, stemBottom);

    const leaf = (leafCx: number, leafCy: number, angle: number) => {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const isInsideLeaf = (x: number, y: number): boolean => {
        const dx = x - leafCx;
        const dy = y - leafCy;
        const lx = dx * cosA + dy * sinA;
        const ly = -dx * sinA + dy * cosA;
        const a = radius * 0.22;
        const b = radius * 0.1;
        return (lx / a) ** 2 + (ly / b) ** 2 <= 1;
      };
      const pad = radius * 0.28;
      this.drawImplicitShape(
        leafCx - pad, leafCx + pad, leafCy - pad, leafCy + pad,
        isInsideLeaf, filled
      );
      this.drawLine(leafCx, leafCy, leafCx + cosA * radius * 0.18, leafCy + sinA * radius * 0.18);
    };

    const stemAttachY = stemTop + radius * 0.28;
    leaf(cx - radius * 0.12, stemAttachY, Math.PI * 0.72);
    leaf(cx + radius * 0.12, stemAttachY + radius * 0.12, -Math.PI * 0.28);
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
   * Vampire fangs with curved lip, gum band, and sharp canine teeth.
   */
  drawVampireFangs(cx: number, cy: number, radius: number, filled = false) {
    if (radius <= 0) return;

    const lipPoints: { x: number; y: number }[] = [];
    const lipSteps = Math.max(32, Math.ceil(radius * 2.5));
    for (let i = 0; i <= lipSteps; i++) {
      const t = i / lipSteps;
      const angle = Math.PI + t * Math.PI;
      const lipR = radius * 0.72;
      const cupidDip = radius * 0.06 * Math.pow(Math.sin(t * Math.PI), 2);
      lipPoints.push({
        x: Math.round(cx + lipR * Math.cos(angle)),
        y: Math.round(cy - radius * 0.15 + lipR * 0.22 * Math.sin(angle) + cupidDip),
      });
    }
    for (let i = 0; i < lipPoints.length - 1; i++) {
      this.drawLine(lipPoints[i].x, lipPoints[i].y, lipPoints[i + 1].x, lipPoints[i + 1].y);
    }

    const gumVerts = [
      { x: cx - radius * 0.55, y: cy - radius * 0.08 },
      { x: cx + radius * 0.55, y: cy - radius * 0.08 },
      { x: cx + radius * 0.48, y: cy + radius * 0.06 },
      { x: cx - radius * 0.48, y: cy + radius * 0.06 },
    ];
    if (filled) {
      this.fillPolygonInterior(gumVerts);
    }
    for (let i = 0; i < gumVerts.length; i++) {
      const a = gumVerts[i];
      const b = gumVerts[(i + 1) % gumVerts.length];
      this.drawLine(a.x, a.y, b.x, b.y);
    }

    const drawFang = (fangCx: number, outerX: number, innerX: number, tipX: number) => {
      const verts = [
        { x: outerX, y: cy + radius * 0.04 },
        { x: innerX, y: cy + radius * 0.04 },
        { x: tipX, y: cy + radius * 0.92 },
        { x: fangCx + (outerX - fangCx) * 0.35, y: cy + radius * 0.55 },
        { x: fangCx, y: cy + radius * 0.72 },
      ];
      if (filled) {
        this.fillPolygonInterior(verts);
      }
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        this.drawLine(a.x, a.y, b.x, b.y);
      }
      this.drawLine(fangCx, Math.round(cy + radius * 0.92), tipX, Math.round(cy + radius * 0.92));
    };

    drawFang(
      cx - radius * 0.28,
      cx - radius * 0.42,
      cx - radius * 0.17,
      cx - radius * 0.25
    );
    drawFang(
      cx + radius * 0.28,
      cx + radius * 0.42,
      cx + radius * 0.17,
      cx + radius * 0.25
    );

    const dripX = cx - radius * 0.25;
    const dripTop = Math.round(cy + radius * 0.94);
    this.drawLine(dripX, dripTop, dripX, Math.round(cy + radius * 1.02));
    this.setPoint(dripX, Math.round(cy + radius * 1.04));
    this.setPoint(dripX - 1, Math.round(cy + radius * 1.02));
    this.setPoint(dripX + 1, Math.round(cy + radius * 1.02));
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

export type InventoryShapeKind = 'circle' | 'heart' | 'cloud' | 'moon' | 'lightning' | 'star' | 'apple' | 'cross' | 'flower' | 'iceSkates' | 'vampireFangs';

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

  if (kind === 'heart') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'cloud') {
    spanX = r * 2.6;
    spanY = r * 2.0;
  } else if (kind === 'moon') {
    spanX = r * 2.4;
    spanY = r * 2.2;
  } else if (kind === 'apple') {
    spanX = r * 2.2;
    spanY = r * 2.2;
  } else if (kind === 'cross') {
    const lenHoriz = crossParams?.lengthHorizontal ?? 30;
    const rHoriz = Math.max(1, Math.round(lenHoriz / 2));
    spanX = rHoriz * 2;
    spanY = r * 2;
  } else if (kind === 'flower') {
    spanX = r * 2.2;
    spanY = r * 2.6;
  } else if (kind === 'iceSkates') {
    spanX = r * 2.8;
    spanY = r * 2.6;
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
    case 'circle':
      canvas.drawCircle(cx, cy, r, filled);
      label = 'Circle';
      break;
    case 'heart':
      canvas.drawHeart(cx, cy, r, filled);
      label = 'Heart';
      break;
    case 'cloud':
      canvas.drawCloud(cx, cy, r, filled);
      label = 'Cloud';
      break;
    case 'moon':
      canvas.drawCrescentMoon(cx, cy, r, filled);
      label = 'Crescent Moon';
      break;
    case 'lightning':
      canvas.drawLightningBolt(cx, cy, r, filled);
      label = 'Lightning Bolt';
      break;
    case 'star':
      canvas.drawStar(cx, cy, r, filled);
      label = 'Star (5-Pointed)';
      break;
    case 'apple':
      canvas.drawApple(cx, cy, r, filled);
      label = 'Apple';
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
    case 'iceSkates':
      canvas.drawIceSkates(cx, cy, r, filled);
      label = 'Ice Skating Skates';
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
