import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraphicCanvas,
  paintInventoryShape,
  type GraphicResult,
  type InventoryShapeKind,
} from '../utils/graphicBraille';
import {
  SHAPE_CATEGORY_LABELS,
  shapesInCategory,
} from '../utils/shapeCatalog';
import { asciiToUnicodeBraille } from '../utils/braille';
import { BrailleCell } from './BrailleCell';
import { useBraille, type MathCode } from '../hooks/useBraille';
import { DEFAULT_TABLE } from '../utils/tableRegistry';
import {
  buildLabelDotMask,
  compositeDesignScene,
  type CanvasObject,
  type RaisedStampObject,
} from '../utils/tactileDesign';

export type DesignTool =
  | 'pointer'
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'leader'
  | 'stamp'
  | 'label'
  | 'raisedStamp';

const DRAFT_KEY = 'graham-tactile-design-draft';

type DraftPayload = {
  widthCells: number;
  heightCells: number;
  drawingGrid: boolean[][];
  objects: CanvasObject[];
  photoImage: string | null;
  photoOpacity: number;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
};

function createBlankGrid(wCells: number, hCells: number): boolean[][] {
  return Array.from({ length: hCells * 3 }, () => Array(wCells * 2).fill(false));
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneGrid(grid: boolean[][]): boolean[][] {
  return grid.map((row) => [...row]);
}

interface TactileDesignCanvasProps {
  defaultCellsPerRow: number;
  defaultLinesPerPage: number;
  brailleTable?: string;
  mathCode?: MathCode;
  onPreviewChange: (preview: GraphicResult) => void;
}

export function TactileDesignCanvas({
  defaultCellsPerRow,
  defaultLinesPerPage,
  brailleTable = DEFAULT_TABLE,
  mathCode = 'nemeth',
  onPreviewChange,
}: TactileDesignCanvasProps) {
  const { t } = useTranslation();
  const { translateAsync, workerReady } = useBraille();

  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [widthCells, setWidthCells] = useState(defaultCellsPerRow);
  const [heightCells, setHeightCells] = useState(defaultLinesPerPage);
  const [photoOpacity, setPhotoOpacity] = useState(0.5);
  const [photoScale, setPhotoScale] = useState(100);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [tool, setTool] = useState<DesignTool>('pencil');
  const [brushSize, setBrushSize] = useState(1);
  const [stampShape, setStampShape] = useState<InventoryShapeKind>('flower');
  const [stampSize, setStampSize] = useState(8);
  const [stampFilled, setStampFilled] = useState(false);
  const [stampCrossParams, setStampCrossParams] = useState({
    lengthHorizontal: 10,
    thicknessVertical: 2,
    thicknessHorizontal: 2,
    heightRatio: 0.35,
  });
  const [gridVisible, setGridVisible] = useState(true);
  const [drawingGrid, setDrawingGrid] = useState(() =>
    createBlankGrid(defaultCellsPerRow, defaultLinesPerPage),
  );
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');
  const [labelPendingBrf, setLabelPendingBrf] = useState<string | null>(null);
  const [labelStatus, setLabelStatus] = useState<string | null>(null);
  const [raisedText, setRaisedText] = useState('ABC');
  const [raisedFontSize, setRaisedFontSize] = useState(18);
  const [thresholdAssist, setThresholdAssist] = useState(140);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(true);
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [mouseHover, setMouseHover] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [printFont, setPrintFont] = useState<import('opentype.js').Font | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draftReadyRef = useRef(false);

  // Load Open Sans for raised-print stamps
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { parse } = await import('opentype.js');
        const fontUrl = (await import('@fontsource/open-sans/files/open-sans-latin-700-normal.woff?url')).default;
        const ab = await fetch(fontUrl).then((r) => r.arrayBuffer());
        if (!cancelled) setPrintFont(parse(ab));
      } catch (err) {
        console.error('Failed to load raised-print font', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore draft once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftPayload;
        if (draft?.drawingGrid && Array.isArray(draft.objects)) {
          setWidthCells(draft.widthCells || defaultCellsPerRow);
          setHeightCells(draft.heightCells || defaultLinesPerPage);
          setDrawingGrid(draft.drawingGrid);
          setObjects(draft.objects);
          setPhotoImage(draft.photoImage);
          setPhotoOpacity(draft.photoOpacity ?? 0.5);
          setPhotoScale(draft.photoScale ?? 100);
          setPhotoOffsetX(draft.photoOffsetX ?? 0);
          setPhotoOffsetY(draft.photoOffsetY ?? 0);
        }
      }
    } catch {
      /* ignore corrupt draft */
    }
    draftReadyRef.current = true;
  }, [defaultCellsPerRow, defaultLinesPerPage]);

  // Persist draft
  useEffect(() => {
    if (!draftReadyRef.current) return;
    const payload: DraftPayload = {
      widthCells,
      heightCells,
      drawingGrid,
      objects,
      photoImage,
      photoOpacity,
      photoScale,
      photoOffsetX,
      photoOffsetY,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {
      /* quota */
    }
  }, [
    widthCells,
    heightCells,
    drawingGrid,
    objects,
    photoImage,
    photoOpacity,
    photoScale,
    photoOffsetX,
    photoOffsetY,
  ]);

  useEffect(() => {
    setDrawingGrid((current) => {
      const newH = heightCells * 3;
      const newW = widthCells * 2;
      const next = Array.from({ length: newH }, () => Array(newW).fill(false));
      for (let y = 0; y < Math.min(current.length, newH); y++) {
        for (let x = 0; x < Math.min(current[0]?.length ?? 0, newW); x++) {
          next[y][x] = current[y][x];
        }
      }
      return next;
    });
  }, [widthCells, heightCells]);

  const raisedPaint = useCallback(
    (canvas: GraphicCanvas, obj: RaisedStampObject) => {
      if (!printFont) return;
      canvas.drawVectorPrintTextToDots(
        printFont,
        obj.text,
        obj.x,
        obj.y,
        obj.fontSize,
        obj.letterType === 'thin' ? false : obj.filled,
      );
    },
    [printFont],
  );

  const preview = useMemo(
    () => compositeDesignScene(widthCells, heightCells, drawingGrid, objects, raisedPaint),
    [widthCells, heightCells, drawingGrid, objects, raisedPaint],
  );

  const labelMask = useMemo(
    () => buildLabelDotMask(widthCells, heightCells, objects),
    [widthCells, heightCells, objects],
  );

  useEffect(() => {
    onPreviewChange(preview);
  }, [preview, onPreviewChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;
    const updateSize = (width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    updateSize(parent.clientWidth, parent.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const applyBrush = (grid: boolean[][], gridX: number, gridY: number, val: boolean) => {
    const cols = widthCells * 2;
    const rows = heightCells * 3;
    const radius = (brushSize - 1) / 2;
    for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
        if (dx * dx + dy * dy <= radius * radius + 0.1) {
          const tx = gridX + dx;
          const ty = gridY + dy;
          if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) grid[ty][tx] = val;
        }
      }
    }
  };

  const drawLineOnGrid = (
    grid: boolean[][],
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    val: boolean,
  ) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    while (true) {
      applyBrush(grid, cx, cy, val);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  };

  // HTML canvas paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cols = widthCells * 2;
    const rows = heightCells * 3;
    const cellWidth = rect.width / cols;
    const cellHeight = rect.height / rows;

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (gridVisible) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!drawingGrid[y]?.[x] && !labelMask[y]?.[x]) {
            const cx = (x + 0.5) * cellWidth;
            const cy = (y + 0.5) * cellHeight;
            ctx.beginPath();
            ctx.arc(cx, cy, 1.2, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }

    // Composite graphic (non-label) dots for cyan preview
    const gScene = (() => {
      const c = new GraphicCanvas(widthCells, heightCells);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (drawingGrid[y]?.[x]) c.setPoint(x, y);
        }
      }
      for (const obj of objects) {
        if (obj.kind === 'stamp') {
          paintInventoryShape(c, obj.shape, obj.cx, obj.cy, obj.size, obj.filled, obj.crossParams);
        } else if (obj.kind === 'leader') {
          c.drawLine(obj.x0, obj.y0, obj.x1, obj.y1);
        } else if (obj.kind === 'raisedStamp') {
          raisedPaint(c, obj);
        }
      }
      return c;
    })();

    ctx.fillStyle = '#00a8ff';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (gScene.data[y]?.[x] && !labelMask[y]?.[x]) {
          const cx = (x + 0.5) * cellWidth;
          const cy = (y + 0.5) * cellHeight;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(cellWidth, cellHeight) * 0.35, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Braille label dots in a distinct color
    ctx.fillStyle = '#7CFC00';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (labelMask[y]?.[x]) {
          const cx = (x + 0.5) * cellWidth;
          const cy = (y + 0.5) * cellHeight;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(cellWidth, cellHeight) * 0.35, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Selection highlight for labels / stamps / leaders
    if (selectedId) {
      const sel = objects.find((o) => o.id === selectedId);
      if (sel) {
        ctx.strokeStyle = 'rgba(255, 220, 50, 0.95)';
        ctx.lineWidth = 2;
        if (sel.kind === 'label') {
          const w = Math.max(1, sel.brfAscii.replace(/\n/g, '').length);
          ctx.strokeRect(
            sel.cellX * 2 * cellWidth,
            sel.cellY * 3 * cellHeight,
            w * 2 * cellWidth,
            3 * cellHeight,
          );
        } else if (sel.kind === 'stamp') {
          const r = sel.size + 2;
          ctx.strokeRect(
            (sel.cx - r) * cellWidth,
            (sel.cy - r) * cellHeight,
            r * 2 * cellWidth,
            r * 2 * cellHeight,
          );
        } else if (sel.kind === 'leader') {
          ctx.beginPath();
          ctx.moveTo((sel.x0 + 0.5) * cellWidth, (sel.y0 + 0.5) * cellHeight);
          ctx.lineTo((sel.x1 + 0.5) * cellWidth, (sel.y1 + 0.5) * cellHeight);
          ctx.stroke();
        } else if (sel.kind === 'raisedStamp') {
          ctx.strokeRect(
            sel.x * cellWidth,
            sel.y * cellHeight,
            sel.fontSize * 2 * cellWidth,
            sel.fontSize * cellHeight,
          );
        }
      }
    }

    if ((tool === 'line' || tool === 'leader') && lineStart && mouseHover) {
      ctx.strokeStyle = tool === 'leader' ? 'rgba(124, 252, 0, 0.8)' : 'rgba(255, 0, 0, 0.7)';
      ctx.lineWidth = tool === 'leader' ? 1.5 : brushSize;
      ctx.beginPath();
      ctx.moveTo((lineStart.x + 0.5) * cellWidth, (lineStart.y + 0.5) * cellHeight);
      ctx.lineTo((mouseHover.x + 0.5) * cellWidth, (mouseHover.y + 0.5) * cellHeight);
      ctx.stroke();
    }

    if (tool === 'stamp' && mouseHover) {
      const previewCanvas = new GraphicCanvas(widthCells, heightCells);
      paintInventoryShape(
        previewCanvas,
        stampShape,
        mouseHover.x,
        mouseHover.y,
        stampSize,
        stampFilled,
        stampCrossParams,
      );
      ctx.fillStyle = 'rgba(255, 75, 75, 0.5)';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (previewCanvas.data[y]?.[x]) {
            ctx.beginPath();
            ctx.arc(
              (x + 0.5) * cellWidth,
              (y + 0.5) * cellHeight,
              Math.min(cellWidth, cellHeight) * 0.35,
              0,
              2 * Math.PI,
            );
            ctx.fill();
          }
        }
      }
    }

    if (tool === 'label' && mouseHover && labelPendingBrf) {
      const previewCanvas = new GraphicCanvas(widthCells, heightCells);
      const cellX = Math.floor(mouseHover.x / 2);
      const cellY = Math.floor(mouseHover.y / 3);
      previewCanvas.paintBrailleString(cellX, cellY, labelPendingBrf);
      ctx.fillStyle = 'rgba(124, 252, 0, 0.55)';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (previewCanvas.data[y]?.[x]) {
            ctx.beginPath();
            ctx.arc(
              (x + 0.5) * cellWidth,
              (y + 0.5) * cellHeight,
              Math.min(cellWidth, cellHeight) * 0.35,
              0,
              2 * Math.PI,
            );
            ctx.fill();
          }
        }
      }
    }
  }, [
    drawingGrid,
    widthCells,
    heightCells,
    gridVisible,
    tool,
    lineStart,
    mouseHover,
    stampShape,
    stampSize,
    stampFilled,
    stampCrossParams,
    brushSize,
    canvasSize,
    objects,
    selectedId,
    labelMask,
    labelPendingBrf,
    raisedPaint,
  ]);

  const getGridCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX - rect.left;
      clientY = e.touches[0].clientY - rect.top;
    } else {
      clientX = e.clientX - rect.left;
      clientY = e.clientY - rect.top;
    }
    const cols = widthCells * 2;
    const rows = heightCells * 3;
    const gridX = Math.floor((clientX / rect.width) * cols);
    const gridY = Math.floor((clientY / rect.height) * rows);
    return {
      x: Math.max(0, Math.min(cols - 1, gridX)),
      y: Math.max(0, Math.min(rows - 1, gridY)),
    };
  };

  const hitTest = (dotX: number, dotY: number): CanvasObject | null => {
    // Prefer later objects (on top)
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.kind === 'label') {
        const len = Math.max(1, obj.brfAscii.replace(/\n/g, '').length);
        const x0 = obj.cellX * 2;
        const y0 = obj.cellY * 3;
        const x1 = x0 + len * 2 - 1;
        const y1 = y0 + 2;
        if (dotX >= x0 && dotX <= x1 && dotY >= y0 && dotY <= y1) return obj;
      } else if (obj.kind === 'stamp') {
        const r = obj.size + 1;
        if (Math.abs(dotX - obj.cx) <= r && Math.abs(dotY - obj.cy) <= r) return obj;
      } else if (obj.kind === 'leader') {
        // Rough distance to segment
        const dx = obj.x1 - obj.x0;
        const dy = obj.y1 - obj.y0;
        const len2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((dotX - obj.x0) * dx + (dotY - obj.y0) * dy) / len2));
        const px = obj.x0 + t * dx;
        const py = obj.y0 + t * dy;
        if ((dotX - px) ** 2 + (dotY - py) ** 2 <= 9) return obj;
      } else if (obj.kind === 'raisedStamp') {
        if (
          dotX >= obj.x &&
          dotX <= obj.x + obj.fontSize * 2 &&
          dotY >= obj.y &&
          dotY <= obj.y + obj.fontSize
        ) {
          return obj;
        }
      }
    }
    return null;
  };

  const prepareLabel = async () => {
    const text = labelText.trim();
    if (!text) {
      setLabelPendingBrf(null);
      setLabelStatus(t('graphics.tactile.labelEmpty'));
      return;
    }
    if (!workerReady) {
      setLabelStatus(t('graphics.tactile.labelWaiting'));
      return;
    }
    try {
      setLabelStatus(t('graphics.tactile.labelTranslating'));
      const brf = await translateAsync(text, brailleTable, mathCode);
      const singleLine = brf.replace(/\r?\n/g, ' ').trim();
      setLabelPendingBrf(singleLine || text);
      setLabelStatus(t('graphics.tactile.labelReady'));
    } catch (err) {
      console.error(err);
      setLabelStatus(t('graphics.tactile.labelError'));
    }
  };

  useEffect(() => {
    if (tool !== 'label') return;
    const handle = window.setTimeout(() => {
      void prepareLabel();
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelText, tool, brailleTable, mathCode, workerReady]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedId) return;
      setObjects((list) =>
        list.map((obj) => {
          if (obj.id !== selectedId) return obj;
          if (obj.kind === 'label') {
            return {
              ...obj,
              cellX: Math.max(0, obj.cellX + dx),
              cellY: Math.max(0, obj.cellY + dy),
            };
          }
          if (obj.kind === 'stamp') {
            return { ...obj, cx: obj.cx + dx * 2, cy: obj.cy + dy * 3 };
          }
          if (obj.kind === 'leader') {
            return {
              ...obj,
              x0: obj.x0 + dx * 2,
              y0: obj.y0 + dy * 3,
              x1: obj.x1 + dx * 2,
              y1: obj.y1 + dy * 3,
            };
          }
          if (obj.kind === 'raisedStamp') {
            return { ...obj, x: obj.x + dx * 2, y: obj.y + dy * 3 };
          }
          return obj;
        }),
      );
    },
    [selectedId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (selectedId) {
          e.preventDefault();
          setObjects((list) => list.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      } else if (e.key === 'ArrowLeft') {
        if (selectedId && tool === 'pointer') {
          e.preventDefault();
          nudgeSelected(-1, 0);
        }
      } else if (e.key === 'ArrowRight') {
        if (selectedId && tool === 'pointer') {
          e.preventDefault();
          nudgeSelected(1, 0);
        }
      } else if (e.key === 'ArrowUp') {
        if (selectedId && tool === 'pointer') {
          e.preventDefault();
          nudgeSelected(0, -1);
        }
      } else if (e.key === 'ArrowDown') {
        if (selectedId && tool === 'pointer') {
          e.preventDefault();
          nudgeSelected(0, 1);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, tool, nudgeSelected]);

  const handlePointerDown = (coords: { x: number; y: number }) => {
    if (tool === 'pointer') {
      const hit = hitTest(coords.x, coords.y);
      setSelectedId(hit?.id ?? null);
      if (hit) {
        if (hit.kind === 'label') {
          setDragOffset({
            dx: coords.x - hit.cellX * 2,
            dy: coords.y - hit.cellY * 3,
          });
        } else if (hit.kind === 'stamp') {
          setDragOffset({ dx: coords.x - hit.cx, dy: coords.y - hit.cy });
        } else if (hit.kind === 'raisedStamp') {
          setDragOffset({ dx: coords.x - hit.x, dy: coords.y - hit.y });
        } else if (hit.kind === 'leader') {
          setDragOffset({ dx: coords.x - hit.x0, dy: coords.y - hit.y0 });
        }
        setIsDrawing(true);
      }
      return;
    }

    if (tool === 'stamp') {
      setObjects((list) => [
        ...list,
        {
          id: newId(),
          kind: 'stamp',
          shape: stampShape,
          cx: coords.x,
          cy: coords.y,
          size: stampSize,
          filled: stampFilled,
          crossParams: { ...stampCrossParams },
        },
      ]);
      return;
    }

    if (tool === 'label') {
      if (!labelPendingBrf) {
        setLabelStatus(t('graphics.tactile.labelNeedText'));
        return;
      }
      const cellX = Math.floor(coords.x / 2);
      const cellY = Math.floor(coords.y / 3);
      setObjects((list) => [
        ...list,
        {
          id: newId(),
          kind: 'label',
          cellX,
          cellY,
          sourceText: labelText.trim(),
          brfAscii: labelPendingBrf,
          table: brailleTable,
        },
      ]);
      setSelectedId(null);
      return;
    }

    if (tool === 'raisedStamp') {
      setObjects((list) => [
        ...list,
        {
          id: newId(),
          kind: 'raisedStamp',
          text: raisedText || 'A',
          x: coords.x,
          y: coords.y,
          fontSize: raisedFontSize,
          filled: true,
          letterType: 'bubble',
        },
      ]);
      return;
    }

    if (tool === 'line' || tool === 'leader') {
      setIsDrawing(true);
      setLineStart(coords);
      return;
    }

    setIsDrawing(true);
    const mode = tool === 'pencil';
    setDrawMode(mode);
    setDrawingGrid((current) => {
      const grid = cloneGrid(current);
      applyBrush(grid, coords.x, coords.y, mode);
      return grid;
    });
  };

  const handlePointerMove = (coords: { x: number; y: number }) => {
    setMouseHover(coords);
    if (!isDrawing) return;

    if (tool === 'pointer' && selectedId && dragOffset) {
      setObjects((list) =>
        list.map((obj) => {
          if (obj.id !== selectedId) return obj;
          if (obj.kind === 'label') {
            return {
              ...obj,
              cellX: Math.max(0, Math.floor((coords.x - dragOffset.dx) / 2)),
              cellY: Math.max(0, Math.floor((coords.y - dragOffset.dy) / 3)),
            };
          }
          if (obj.kind === 'stamp') {
            return {
              ...obj,
              cx: coords.x - dragOffset.dx,
              cy: coords.y - dragOffset.dy,
            };
          }
          if (obj.kind === 'raisedStamp') {
            return {
              ...obj,
              x: coords.x - dragOffset.dx,
              y: coords.y - dragOffset.dy,
            };
          }
          if (obj.kind === 'leader') {
            const ndx = coords.x - dragOffset.dx - obj.x0;
            const ndy = coords.y - dragOffset.dy - obj.y0;
            return {
              ...obj,
              x0: obj.x0 + ndx,
              y0: obj.y0 + ndy,
              x1: obj.x1 + ndx,
              y1: obj.y1 + ndy,
            };
          }
          return obj;
        }),
      );
      return;
    }

    if (tool === 'pencil' || tool === 'eraser') {
      setDrawingGrid((current) => {
        const grid = cloneGrid(current);
        applyBrush(grid, coords.x, coords.y, drawMode);
        return grid;
      });
    }
  };

  const handlePointerUp = (coords: { x: number; y: number } | null) => {
    if (!isDrawing) return;
    if ((tool === 'line' || tool === 'leader') && lineStart && coords) {
      if (tool === 'line') {
        setDrawingGrid((current) => {
          const grid = cloneGrid(current);
          drawLineOnGrid(grid, lineStart.x, lineStart.y, coords.x, coords.y, true);
          return grid;
        });
      } else {
        setObjects((list) => [
          ...list,
          {
            id: newId(),
            kind: 'leader',
            x0: lineStart.x,
            y0: lineStart.y,
            x1: coords.x,
            y1: coords.y,
          },
        ]);
      }
    }
    setIsDrawing(false);
    setLineStart(null);
    setDragOffset(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const pdfjsLib = await loadPdfJs();
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const offscreen = document.createElement('canvas');
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const context = offscreen.getContext('2d');
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          setPhotoImage(offscreen.toDataURL('image/png'));
          setPhotoScale(100);
          setPhotoOffsetX(0);
          setPhotoOffsetY(0);
        }
      } catch (err) {
        console.error(err);
        window.alert(t('graphics.tactile.pdfError'));
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setPhotoImage(event.target.result);
        setPhotoScale(100);
        setPhotoOffsetX(0);
        setPhotoOffsetY(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    if (!window.confirm(t('graphics.tactile.clearConfirm'))) return;
    setDrawingGrid(createBlankGrid(widthCells, heightCells));
    setObjects([]);
    setSelectedId(null);
  };

  const handleInvert = () => {
    setDrawingGrid((current) => current.map((row) => row.map((cell) => !cell)));
  };

  /** Sample the guide photo into freehand dots using a brightness threshold. */
  const handleTracePhoto = async () => {
    if (!photoImage) {
      window.alert(t('graphics.tactile.traceNeedPhoto'));
      return;
    }
    const img = new Image();
    img.src = photoImage;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    const cols = widthCells * 2;
    const rows = heightCells * 3;
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cols, rows);
    // Approximate contain fit
    const scale = Math.min(cols / img.width, rows / img.height) * (photoScale / 100);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (cols - dw) / 2 + photoOffsetX * (cols / Math.max(1, canvasSize.w || cols));
    const dy = (rows - dh) / 2 + photoOffsetY * (rows / Math.max(1, canvasSize.h || rows));
    ctx.drawImage(img, dx, dy, dw, dh);
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const next = createBlankGrid(widthCells, heightCells);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const bright = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (bright < thresholdAssist) next[y][x] = true;
      }
    }
    setDrawingGrid(next);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    handleClear();
    setPhotoImage(null);
  };

  const toolOptions: { id: DesignTool; labelKey: string }[] = [
    { id: 'pointer', labelKey: 'graphics.tactile.tools.pointer' },
    { id: 'pencil', labelKey: 'graphics.tactile.tools.pencil' },
    { id: 'eraser', labelKey: 'graphics.tactile.tools.eraser' },
    { id: 'line', labelKey: 'graphics.tactile.tools.line' },
    { id: 'leader', labelKey: 'graphics.tactile.tools.leader' },
    { id: 'stamp', labelKey: 'graphics.tactile.tools.stamp' },
    { id: 'label', labelKey: 'graphics.tactile.tools.label' },
    { id: 'raisedStamp', labelKey: 'graphics.tactile.tools.raisedStamp' },
  ];

  return (
    <div style={{ flex: 1, padding: '1rem', display: 'flex', gap: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.5rem',
            border: '1px solid var(--border-color)',
            padding: '0.5rem',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            fontSize: '0.8rem',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {t('graphics.tactile.photo')}
            </span>
            <input type="file" accept="image/*,.pdf" onChange={handlePhotoUpload} style={{ fontSize: '0.75rem', width: '120px' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>{t('graphics.tactile.opacity')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={photoOpacity}
              onChange={(e) => setPhotoOpacity(Number(e.target.value))}
              style={{ width: '70px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 'bold' }}>{t('graphics.tactile.tool')}</span>
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value as DesignTool);
                setLineStart(null);
              }}
              style={{ padding: '1px 3px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}
            >
              {toolOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {(tool === 'pencil' || tool === 'eraser' || tool === 'line') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 'bold' }}>
                {t('graphics.tactile.brush')}: {brushSize}
              </span>
              <input
                type="range"
                min={1}
                max={5}
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                style={{ width: '55px', height: '14px', margin: 0 }}
              />
            </div>
          )}

          {tool === 'stamp' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              <select
                value={stampShape}
                onChange={(e) => setStampShape(e.target.value as InventoryShapeKind)}
                style={{ padding: '1px 3px', fontSize: '0.75rem', maxWidth: '90px' }}
              >
                {(['basics', 'science', 'history', 'math', 'everyday'] as const).map((cat) => (
                  <optgroup key={cat} label={SHAPE_CATEGORY_LABELS[cat]}>
                    {shapesInCategory(cat).map((s) => (
                      <option key={s.kind} value={s.kind}>
                        {s.shortLabel}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <input
                type="number"
                min={2}
                max={30}
                value={stampSize}
                onChange={(e) => setStampSize(parseInt(e.target.value, 10) || 5)}
                style={{ width: '30px', fontSize: '0.75rem' }}
                title={t('graphics.tactile.stampSize')}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem' }}>
                <input type="checkbox" checked={stampFilled} onChange={(e) => setStampFilled(e.target.checked)} />
                {t('graphics.tactile.fill')}
              </label>
            </div>
          )}

          {tool === 'stamp' && stampShape === 'cross' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label>
                H-Len:{' '}
                <input
                  type="number"
                  min={2}
                  value={stampCrossParams.lengthHorizontal}
                  onChange={(e) =>
                    setStampCrossParams((p) => ({
                      ...p,
                      lengthHorizontal: parseInt(e.target.value, 10) || 10,
                    }))
                  }
                  style={{ width: '32px', fontSize: '0.7rem' }}
                />
              </label>
              <label>
                V-Thick:{' '}
                <input
                  type="number"
                  min={1}
                  value={stampCrossParams.thicknessVertical}
                  onChange={(e) =>
                    setStampCrossParams((p) => ({
                      ...p,
                      thicknessVertical: parseInt(e.target.value, 10) || 2,
                    }))
                  }
                  style={{ width: '32px', fontSize: '0.7rem' }}
                />
              </label>
              <label>
                H-Thick:{' '}
                <input
                  type="number"
                  min={1}
                  value={stampCrossParams.thicknessHorizontal}
                  onChange={(e) =>
                    setStampCrossParams((p) => ({
                      ...p,
                      thicknessHorizontal: parseInt(e.target.value, 10) || 2,
                    }))
                  }
                  style={{ width: '32px', fontSize: '0.7rem' }}
                />
              </label>
            </div>
          )}

          {tool === 'label' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'bold' }}>{t('graphics.tactile.labelText')}</span>
                <input
                  type="text"
                  value={labelText}
                  onChange={(e) => setLabelText(e.target.value)}
                  placeholder={t('graphics.tactile.labelPlaceholder')}
                  style={{ flex: 1, minWidth: '120px', padding: '2px 6px', fontSize: '0.8rem' }}
                />
                <button type="button" className="toolbar-btn" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => void prepareLabel()}>
                  {t('graphics.tactile.translate')}
                </button>
              </div>
              {labelStatus && <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>{labelStatus}</span>}
            </div>
          )}

          {tool === 'raisedStamp' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={raisedText}
                onChange={(e) => setRaisedText(e.target.value)}
                style={{ width: '80px', fontSize: '0.75rem' }}
              />
              <label>
                {t('graphics.tactile.fontSize')}{' '}
                <input
                  type="number"
                  min={8}
                  max={60}
                  value={raisedFontSize}
                  onChange={(e) => setRaisedFontSize(Number(e.target.value) || 18)}
                  style={{ width: '40px', fontSize: '0.75rem' }}
                />
              </label>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>{t('graphics.tactile.grid')}</span>
            <input
              type="number"
              min={10}
              max={60}
              value={widthCells}
              onChange={(e) => setWidthCells(parseInt(e.target.value, 10) || 40)}
              style={{ width: '52px', fontSize: '0.75rem' }}
            />
            <span>×</span>
            <input
              type="number"
              min={5}
              max={40}
              value={heightCells}
              onChange={(e) => setHeightCells(parseInt(e.target.value, 10) || 20)}
              style={{ width: '52px', fontSize: '0.75rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            <button type="button" className="toolbar-btn" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => setGridVisible((v) => !v)}>
              {gridVisible ? t('graphics.tactile.hideGrid') : t('graphics.tactile.showGrid')}
            </button>
            <button type="button" className="toolbar-btn" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={handleClear}>
              {t('graphics.tactile.clear')}
            </button>
            <button type="button" className="toolbar-btn" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={handleInvert}>
              {t('graphics.tactile.invert')}
            </button>
            <button type="button" className="toolbar-btn" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={() => void handleTracePhoto()}>
              {t('graphics.tactile.tracePhoto')}
            </button>
            <button type="button" className="toolbar-btn" style={{ padding: '2px 6px', fontSize: '0.75rem' }} onClick={clearDraft}>
              {t('graphics.tactile.clearDraft')}
            </button>
          </div>

          {photoImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 'bold' }}>{t('graphics.tactile.threshold')}</span>
              <input
                type="range"
                min={40}
                max={220}
                value={thresholdAssist}
                onChange={(e) => setThresholdAssist(Number(e.target.value))}
                style={{ width: '80px' }}
              />
              <span>{thresholdAssist}</span>
            </div>
          )}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {t('graphics.tactile.hint')} · {t('graphics.tactile.defaultLayout', { cells: defaultCellsPerRow, lines: defaultLinesPerPage })}
        </div>

        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            flex: 1,
            minHeight: 0,
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: '#333',
            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
          }}
        >
          {photoImage && (
            <img
              src={photoImage}
              alt=""
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                opacity: photoOpacity,
                transform: `translate(${photoOffsetX}px, ${photoOffsetY}px) scale(${photoScale / 100})`,
                pointerEvents: 'none',
                transformOrigin: 'center center',
              }}
            />
          )}
          <canvas
            ref={canvasRef}
            onMouseDown={(e) => {
              const c = getGridCoords(e);
              if (c) handlePointerDown(c);
            }}
            onMouseMove={(e) => {
              const c = getGridCoords(e);
              if (c) handlePointerMove(c);
            }}
            onMouseUp={(e) => handlePointerUp(getGridCoords(e))}
            onMouseLeave={() => handlePointerUp(mouseHover)}
            onTouchStart={(e) => {
              e.preventDefault();
              const c = getGridCoords(e);
              if (c) handlePointerDown(c);
            }}
            onTouchMove={(e) => {
              e.preventDefault();
              const c = getGridCoords(e);
              if (c) handlePointerMove(c);
            }}
            onTouchEnd={() => handlePointerUp(mouseHover)}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: tool === 'pointer' ? 'default' : 'crosshair',
              display: 'block',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
        <h4 style={{ margin: 0, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
          <span>{t('graphics.tactile.preview')}</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {widthCells * 2} × {heightCells * 3} {t('graphics.tactile.dots')}
          </span>
        </h4>
        <div
          style={{
            flex: 1,
            border: '1px solid var(--border-color)',
            padding: '1rem',
            background: '#fff',
            color: '#000',
            overflow: 'auto',
            borderRadius: '6px',
          }}
        >
          <div style={{ fontFamily: 'sans-serif', marginBottom: '1rem', fontWeight: 'bold', fontSize: '0.9rem' }}>
            {preview.summary}
          </div>
          <div
            className="brf-pages-container"
            style={
              {
                '--braille-cell-height': '28px',
                '--braille-cell-width': '18px',
                '--braille-cell-gap': '6px',
                '--braille-dot-size-active': '6px',
                '--braille-dot-size-inactive': '1.6px',
                '--braille-line-gap': '10px',
                overflow: 'visible',
                maxHeight: 'none',
              } as React.CSSProperties
            }
          >
            {asciiToUnicodeBraille(preview.brf)
              .split('\n')
              .map((line, lineIdx) => (
                <div key={lineIdx} className="brf-page-line" style={{ whiteSpace: 'nowrap' }}>
                  {[...line].map((ch, chIdx) => (
                    <BrailleCell key={chIdx} char={ch} showEmptyDots={true} />
                  ))}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type PdfJsLib = {
  getDocument: (src: { data: ArrayBuffer } | Uint8Array) => {
    promise: Promise<{
      getPage: (n: number) => Promise<{
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
  GlobalWorkerOptions: { workerSrc: string };
};

const loadPdfJs = (): Promise<PdfJsLib> => {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as { pdfjsLib?: PdfJsLib }).pdfjsLib;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
};
