/**
 * chartBraille.ts
 * Generates ASCII BRF strings representing data charts mapped to a 6-dot braille cell grid.
 *
 * Axis ticks: short hash marks at min / mid / max on each axis (numeric labels stay in plain-text summary).
 *
 * Line charts connect points in ascending X order (ties broken by Y). Bar charts draw columns in that same order.
 */

import type { ChartSpec } from '../types/chart';

// Mapping of ASCII BRF characters [0x20-0x5F] to their Unicode Braille pattern offsets (0-63)
const BRF_TO_UNICODE_OFFSETS = [
    0x00, 0x2E, 0x10, 0x3C, 0x2B, 0x29, 0x2F, 0x04,
    0x37, 0x3E, 0x21, 0x2C, 0x20, 0x24, 0x28, 0x0C,
    0x34, 0x02, 0x06, 0x12, 0x32, 0x22, 0x16, 0x36,
    0x26, 0x14, 0x31, 0x30, 0x23, 0x3F, 0x1C, 0x39,
    0x08, 0x01, 0x03, 0x09, 0x19, 0x11, 0x0B, 0x1B,
    0x13, 0x0A, 0x1A, 0x05, 0x07, 0x0D, 0x1D, 0x15,
    0x0F, 0x1F, 0x17, 0x0E, 0x1E, 0x25, 0x27, 0x3A,
    0x2D, 0x3D, 0x35, 0x2A, 0x33, 0x3B, 0x18, 0x38
];

// Inverted map: from Unicode dot offset (0-63) to ASCII BRF character code
const UNICODE_OFFSET_TO_ASCII = new Array(64).fill(0x20); // space is 0x20
for (let i = 0; i < BRF_TO_UNICODE_OFFSETS.length; i++) {
    UNICODE_OFFSET_TO_ASCII[BRF_TO_UNICODE_OFFSETS[i]] = 0x20 + i;
}
// Override 0x33 (dots 1-2-5-6) to map to 0x7C ('|') instead of 0x5C ('\')
UNICODE_OFFSET_TO_ASCII[0x33] = 0x7C;

export class GridCanvas {
    public width: number;
    public height: number;
    public data: boolean[][];

    constructor(cellColumns: number, cellLines: number) {
        // Each braille cell is 2 dots wide, 3 dots high
        this.width = cellColumns * 2;
        this.height = cellLines * 3;
        // initialized to false (empty)
        this.data = Array.from({ length: this.height }, () => Array(this.width).fill(false));
    }

    setPoint(x: number, y: number) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.data[y][x] = true;
        }
    }

    clearPoint(x: number, y: number) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            this.data[y][x] = false;
        }
    }

    /**
     * Paint a single braille cell (ASCII BRF or Unicode U+2800–U+28FF) at cell coordinates.
     * Dot layout matches renderToBRF (dots 1–6 in a 2×3 block).
     */
    paintBrailleCell(cellX: number, cellY: number, asciiOrUnicode: string): void {
        const charWidth = Math.floor(this.width / 2);
        const charHeight = Math.floor(this.height / 3);
        if (cellX < 0 || cellY < 0 || cellX >= charWidth || cellY >= charHeight) return;
        if (!asciiOrUnicode) return;

        const ch = asciiOrUnicode[0];
        let codePoint = ch.charCodeAt(0);

        // Map ASCII/BRF (incl. lowercase) to Unicode braille offset
        if (codePoint >= 0x20 && codePoint <= 0x7F) {
            let mapped = codePoint;
            if (mapped >= 0x60 && mapped <= 0x7F) mapped -= 0x20;
            const index = mapped - 0x20;
            if (index >= 0 && index < 64) {
                codePoint = 0x2800 + BRF_TO_UNICODE_OFFSETS[index];
            }
        }

        if (codePoint < 0x2800 || codePoint > 0x28FF) {
            // Space / empty: clear the cell
            if (ch === ' ' || codePoint === 0x20) {
                const bx = cellX * 2;
                const by = cellY * 3;
                this.clearPoint(bx, by);
                this.clearPoint(bx, by + 1);
                this.clearPoint(bx, by + 2);
                this.clearPoint(bx + 1, by);
                this.clearPoint(bx + 1, by + 1);
                this.clearPoint(bx + 1, by + 2);
            }
            return;
        }

        const offset = codePoint - 0x2800;
        const bx = cellX * 2;
        const by = cellY * 3;
        // Set or clear each of the 6 dots so labels overwrite cleanly
        const d1 = (offset & 0x01) !== 0;
        const d2 = (offset & 0x02) !== 0;
        const d3 = (offset & 0x04) !== 0;
        const d4 = (offset & 0x08) !== 0;
        const d5 = (offset & 0x10) !== 0;
        const d6 = (offset & 0x20) !== 0;
        if (d1) this.setPoint(bx, by); else this.clearPoint(bx, by);
        if (d2) this.setPoint(bx, by + 1); else this.clearPoint(bx, by + 1);
        if (d3) this.setPoint(bx, by + 2); else this.clearPoint(bx, by + 2);
        if (d4) this.setPoint(bx + 1, by); else this.clearPoint(bx + 1, by);
        if (d5) this.setPoint(bx + 1, by + 1); else this.clearPoint(bx + 1, by + 1);
        if (d6) this.setPoint(bx + 1, by + 2); else this.clearPoint(bx + 1, by + 2);
    }

    /**
     * Paint a horizontal ASCII BRF (or Unicode braille) string starting at cell (cellX, cellY).
     * Newlines advance to the next cell row. Stops at canvas bounds unless maxCells wraps lines.
     */
    paintBrailleString(
        cellX: number,
        cellY: number,
        asciiBrf: string,
        opts?: { maxCells?: number },
    ): { cellsWide: number; linesUsed: number } {
        const charWidth = Math.floor(this.width / 2);
        const charHeight = Math.floor(this.height / 3);
        const maxCells = opts?.maxCells && opts.maxCells > 0 ? opts.maxCells : charWidth - cellX;
        let x = cellX;
        let y = cellY;
        let lineStartX = cellX;
        let cellsWide = 0;
        let linesUsed = 1;
        let colOnLine = 0;

        for (let i = 0; i < asciiBrf.length; i++) {
            const ch = asciiBrf[i];
            if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && asciiBrf[i + 1] === '\n') i++;
                y += 1;
                x = lineStartX;
                colOnLine = 0;
                linesUsed += 1;
                if (y >= charHeight) break;
                continue;
            }
            if (y < 0 || y >= charHeight) break;
            if (colOnLine >= maxCells || x >= charWidth) {
                y += 1;
                x = lineStartX;
                colOnLine = 0;
                linesUsed += 1;
                if (y >= charHeight) break;
            }
            this.paintBrailleCell(x, y, ch);
            x += 1;
            colOnLine += 1;
            cellsWide = Math.max(cellsWide, colOnLine);
        }

        return { cellsWide, linesUsed: Math.min(linesUsed, Math.max(0, charHeight - cellY)) };
    }

    drawLine(x0: number, y0: number, x1: number, y1: number) {
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
            this.setPoint(x0, y0);
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
    }

    /**
     * Renders the 2D boolean grid into standard ASCII BRF text.
     */
    renderToBRF(): string {
        const lines: string[] = [];
        const charWidth = Math.floor(this.width / 2);
        const charHeight = Math.floor(this.height / 3);

        for (let cy = 0; cy < charHeight; cy++) {
            let rowStr = '';
            for (let cx = 0; cx < charWidth; cx++) {
                let offset = 0;
                
                // Read 6 logical dots for this 2x3 cell block
                if (this.data[cy * 3][cx * 2])         offset += 0x01; // Dot 1 (top-left)
                if (this.data[cy * 3 + 1][cx * 2])     offset += 0x02; // Dot 2 (middle-left)
                if (this.data[cy * 3 + 2][cx * 2])     offset += 0x04; // Dot 3 (bottom-left)
                if (this.data[cy * 3][cx * 2 + 1])     offset += 0x08; // Dot 4 (top-right)
                if (this.data[cy * 3 + 1][cx * 2 + 1]) offset += 0x10; // Dot 5 (middle-right)
                if (this.data[cy * 3 + 2][cx * 2 + 1]) offset += 0x20; // Dot 6 (bottom-right)

                const asciiCode = UNICODE_OFFSET_TO_ASCII[offset];
                rowStr += String.fromCharCode(asciiCode);
            }
            lines.push(rowStr);
        }

        return lines.join('\n');
    }
}

function domainMinMax(data: number[]): { min: number; max: number } {
    const min = Math.min(...data);
    let max = Math.max(...data);
    if (min === max) {
        max = min + 1;
    }
    return { min, max };
}

function scaleXtoPixel(x: number, xMin: number, xMax: number, drawW: number): number {
    if (xMax === xMin) {
        return 1 + Math.floor(drawW / 2);
    }
    return 1 + Math.round(((x - xMin) / (xMax - xMin)) * drawW);
}

/** Map data Y to plot pixel row (inclusive of drawable band y ∈ [1, canvasHeight − 2]). */
function scaleYValueToPixel(
    val: number,
    yMin: number,
    yMax: number,
    drawH: number,
    canvasHeight: number
): number {
    if (yMax === yMin) {
        return canvasHeight - 2 - Math.floor(drawH / 2);
    }
    const yNorm = (val - yMin) / (yMax - yMin);
    return canvasHeight - 2 - Math.round(yNorm * drawH);
}

function dedupeNearbyPixels(positions: number[], minSep: number): number[] {
    const sorted = [...positions].sort((a, b) => a - b);
    const out: number[] = [];
    for (const p of sorted) {
        if (out.length === 0 || p - out[out.length - 1] >= minSep) {
            out.push(p);
        }
    }
    return out;
}

/** Hash marks inward from the L-shaped axes (does not add numeric glyphs). */
function drawAxisTicks(
    canvas: GridCanvas,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    drawW: number,
    drawH: number
): void {
    const h = canvas.height;
    const w = canvas.width;
    const tickLen = Math.min(3, Math.max(2, Math.floor(Math.min(w, h) / 14)));

    const xPx = dedupeNearbyPixels(
        [
            scaleXtoPixel(minX, minX, maxX, drawW),
            scaleXtoPixel((minX + maxX) / 2, minX, maxX, drawW),
            scaleXtoPixel(maxX, minX, maxX, drawW),
        ],
        2
    );

    for (const tx of xPx) {
        const x = Math.max(1, Math.min(w - 2, tx));
        const yBottom = h - 2;
        const yTop = Math.max(1, yBottom - tickLen);
        canvas.drawLine(x, yBottom, x, yTop);
    }

    const yPy = dedupeNearbyPixels(
        [
            scaleYValueToPixel(maxY, minY, maxY, drawH, h),
            scaleYValueToPixel((minY + maxY) / 2, minY, maxY, drawH, h),
            scaleYValueToPixel(minY, minY, maxY, drawH, h),
        ],
        2
    );

    for (const ty of yPy) {
        const y = Math.max(1, Math.min(h - 2, ty));
        const xLeft = 1;
        const xRight = Math.min(w - 2, xLeft + tickLen);
        canvas.drawLine(xLeft, y, xRight, y);
    }
}

function drawChartAxes(canvas: GridCanvas): void {
    canvas.drawLine(0, 0, 0, canvas.height - 1);
    canvas.drawLine(0, canvas.height - 1, canvas.width - 1, canvas.height - 1);
}

/** Full chart BRF from a validated ChartSpec (single series). */
export function generateChartBrf(spec: ChartSpec): string {
    if (spec.kind === 'line') {
        return generateLineChart(
            spec.xValues,
            spec.values,
            spec.cellsWidth,
            spec.cellsHeight
        );
    }
    return generateBarChart(spec.xValues, spec.values, spec.cellsWidth, spec.cellsHeight);
}

/**
 * Plain-English summary and value list for screen readers and embossing clarity.
 * Insert above the :::chart block; the editor translates this text with the active table.
 */
export function buildChartSummaryPlainText(spec: ChartSpec): string {
    const v = spec.values;
    if (v.length === 0) return '';

    const kindLabel = spec.kind === 'line' ? 'Line chart' : 'Bar chart';
    const lines: string[] = [];

    const head = spec.title?.trim()
        ? `${kindLabel}: ${spec.title.trim()}`
        : `${kindLabel}`;
    lines.push(head);
    lines.push(
        `Grid ${spec.cellsWidth} cells wide by ${spec.cellsHeight} lines tall. ` +
            `${v.length} point${v.length === 1 ? '' : 's'}.`
    );

    const min = Math.min(...v);
    const max = Math.max(...v);
    lines.push(`Range: minimum ${min}, maximum ${max}.`);

    if (spec.xAxisLabel?.trim() || spec.yAxisLabel?.trim()) {
        const xl = spec.xAxisLabel?.trim();
        const yl = spec.yAxisLabel?.trim();
        const parts: string[] = [];
        if (yl) parts.push(`Y-axis: ${yl}`);
        if (xl) parts.push(`X-axis: ${xl}`);
        lines.push(parts.join('. ') + '.');
    }

    const xv = spec.xValues;
    lines.push('Values (x, y):');
    v.forEach((n, i) => {
        lines.push(`  ${xv[i]}: ${n}`);
    });

    return lines.join('\n');
}

/**
 * Nemeth-oriented summary: literary lines for kind and title; each numeric / mathy
 * sentence and each (x, y) pair in its own `$$…$$` block (matches toolbar Nemeth rules).
 */
export function buildChartSummaryNemethPlainText(spec: ChartSpec): string {
    const v = spec.values;
    if (v.length === 0) return '';

    const kindLabel = spec.kind === 'line' ? 'Line chart' : 'Bar chart';
    const lines: string[] = [];

    lines.push(`${kindLabel}:`);
    const title = spec.title?.trim();
    if (title) {
        lines.push(title);
    }

    lines.push(
        `$$Grid ${spec.cellsWidth} cells wide by ${spec.cellsHeight} lines tall. ` +
            `${v.length} point${v.length === 1 ? '' : 's'}.$$`
    );

    const min = Math.min(...v);
    const max = Math.max(...v);
    lines.push(`$$Range: minimum ${min}, maximum ${max}.$$`);

    if (spec.xAxisLabel?.trim() || spec.yAxisLabel?.trim()) {
        const xl = spec.xAxisLabel?.trim();
        const yl = spec.yAxisLabel?.trim();
        const parts: string[] = [];
        if (yl) parts.push(`Y-axis: ${yl}`);
        if (xl) parts.push(`X-axis: ${xl}`);
        lines.push('$$' + parts.join('. ') + '.$$');
    }

    const xv = spec.xValues;
    lines.push('Values (x, y):');
    v.forEach((n, i) => {
        lines.push(`  $$${xv[i]}: ${n}$$`);
    });

    return lines.join('\n');
}

export function generateLineChart(
    xData: number[],
    yData: number[],
    cellsWidth: number,
    cellsHeight: number
): string {
    if (yData.length === 0 || xData.length !== yData.length) return '';
    // Use a minimum of 2x2 cells
    cellsWidth = Math.max(2, cellsWidth);
    cellsHeight = Math.max(2, cellsHeight);

    const canvas = new GridCanvas(cellsWidth, cellsHeight);

    const { min: minYield, max: maxYield } = domainMinMax(yData);
    const { min: minX, max: maxX } = domainMinMax(xData);

    const drawW = canvas.width - 2;
    const drawH = canvas.height - 2;

    drawChartAxes(canvas);
    drawAxisTicks(canvas, minX, maxX, minYield, maxYield, drawW, drawH);

    const pairs = xData.map((x, i) => ({ x, y: yData[i] }));
    pairs.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

    const points = pairs.map(({ x: xv, y: val }) => {
        const x = scaleXtoPixel(xv, minX, maxX, drawW);
        const y = scaleYValueToPixel(val, minYield, maxYield, drawH, canvas.height);
        return { x, y };
    });

    for (let i = 0; i < points.length - 1; i++) {
        canvas.drawLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }

    return canvas.renderToBRF();
}

export function generateBarChart(
    xData: number[],
    yData: number[],
    cellsWidth: number,
    cellsHeight: number
): string {
    if (yData.length === 0 || xData.length !== yData.length) return '';
    cellsWidth = Math.max(2, cellsWidth);
    cellsHeight = Math.max(2, cellsHeight);

    const canvas = new GridCanvas(cellsWidth, cellsHeight);

    const maxYield = Math.max(...yData, 1);
    const minYBar = 0;
    const maxYBar = maxYield;

    const drawW = canvas.width - 2;
    const drawH = canvas.height - 2;

    const { min: minX, max: maxX } = domainMinMax(xData);

    drawChartAxes(canvas);
    drawAxisTicks(canvas, minX, maxX, minYBar, maxYBar, drawW, drawH);

    const pairs = xData.map((x, i) => ({ x, y: yData[i] }));
    pairs.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

    const xPixels = pairs.map((p) => scaleXtoPixel(p.x, minX, maxX, drawW));
    const sortedPx = [...xPixels].sort((a, b) => a - b);
    let minGap = drawW;
    for (let i = 1; i < sortedPx.length; i++) {
        minGap = Math.min(minGap, sortedPx[i] - sortedPx[i - 1]);
    }
    if (sortedPx.length <= 1) minGap = drawW;
    const n = pairs.length;
    const barWidth = Math.max(1, Math.floor(Math.min(drawW / (2 * n), minGap * 0.45)));

    pairs.forEach(({ x: xv, y: val }) => {
        const cx = scaleXtoPixel(xv, minX, maxX, drawW);
        const xStart = Math.max(1, cx - Math.floor(barWidth / 2));
        const xEnd = Math.min(canvas.width - 2, xStart + barWidth - 1);
        const yNorm = Math.max(0, val / maxYield);
        const barH = Math.round(yNorm * drawH);
        const yEnd = canvas.height - 2;
        const yStart = yEnd - barH;

        for (let x = xStart; x <= xEnd; x++) {
            canvas.drawLine(x, yStart, x, yEnd);
        }
    });

    return canvas.renderToBRF();
}
