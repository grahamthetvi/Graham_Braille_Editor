import {
  GraphicCanvas,
  paintInventoryShape,
  type GraphicResult,
  type InventoryShapeKind,
} from './graphicBraille';

export type StampObject = {
  id: string;
  kind: 'stamp';
  shape: InventoryShapeKind;
  cx: number;
  cy: number;
  size: number;
  filled: boolean;
  crossParams: {
    lengthHorizontal: number;
    thicknessVertical: number;
    thicknessHorizontal: number;
    heightRatio: number;
  };
};

export type LabelObject = {
  id: string;
  kind: 'label';
  cellX: number;
  cellY: number;
  sourceText: string;
  brfAscii: string;
  table: string;
};

export type LeaderObject = {
  id: string;
  kind: 'leader';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type RaisedStampObject = {
  id: string;
  kind: 'raisedStamp';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  filled: boolean;
  letterType: 'bubble' | 'thin';
};

export type CanvasObject = StampObject | LabelObject | LeaderObject | RaisedStampObject;

export function compositeDesignScene(
  widthCells: number,
  heightCells: number,
  drawingGrid: boolean[][],
  objects: CanvasObject[],
  raisedPaint?: (canvas: GraphicCanvas, obj: RaisedStampObject) => void,
): GraphicResult {
  const canvas = new GraphicCanvas(widthCells, heightCells);
  const rows = heightCells * 3;
  const cols = widthCells * 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (drawingGrid[y]?.[x]) canvas.setPoint(x, y);
    }
  }

  for (const obj of objects) {
    if (obj.kind === 'stamp') {
      paintInventoryShape(
        canvas,
        obj.shape,
        obj.cx,
        obj.cy,
        obj.size,
        obj.filled,
        obj.crossParams,
      );
    } else if (obj.kind === 'leader') {
      canvas.drawLine(obj.x0, obj.y0, obj.x1, obj.y1);
    } else if (obj.kind === 'label') {
      canvas.paintBrailleString(obj.cellX, obj.cellY, obj.brfAscii);
    } else if (obj.kind === 'raisedStamp' && raisedPaint) {
      raisedPaint(canvas, obj);
    }
  }

  return {
    brf: canvas.renderToBRF(),
    summary: `Tactile Design (${widthCells} cells × ${heightCells} lines)`,
  };
}

/** Mask of dots that belong to braille label cells (for preview coloring). */
export function buildLabelDotMask(
  widthCells: number,
  heightCells: number,
  objects: CanvasObject[],
): boolean[][] {
  const canvas = new GraphicCanvas(widthCells, heightCells);
  for (const obj of objects) {
    if (obj.kind === 'label') {
      canvas.paintBrailleString(obj.cellX, obj.cellY, obj.brfAscii);
    }
  }
  return canvas.data.map((row) => row.map((v) => v));
}
