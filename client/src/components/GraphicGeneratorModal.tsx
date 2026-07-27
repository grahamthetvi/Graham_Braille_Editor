import { useState, useMemo, useEffect, useRef } from 'react';
import { ChartGenerator } from './ChartGenerator';
import type { MathCode } from '../hooks/useBraille';
import {
  generateClock,
  generateFraction,
  generateNumberLine,
  generateBase10,
  generateManipulatives,
  generateCustomShape,
  generateInventoryShape,
  generateRaisedPrintTextGraphic,
  GraphicCanvas,
  type GraphicResult,
  type InventoryShapeKind
} from '../utils/graphicBraille';
import { generateEquationGraph } from '../utils/graphEquation';
import { asciiToUnicodeBraille } from '../utils/braille';
import { BrailleCell } from './BrailleCell';
import { parse } from 'opentype.js';
import fontUrl from '@fontsource/open-sans/files/open-sans-latin-700-normal.woff?url';

interface GraphicGeneratorModalProps {
  mathCode: MathCode;
  onMathCodeChange: (code: MathCode) => void;
  defaultCellsPerRow: number;
  defaultLinesPerPage: number;
  onInsert: (block: string) => void;
  onClose: () => void;
}

type GraphicType =
  | 'clock'
  | 'fraction'
  | 'numberLine'
  | 'base10'
  | 'manipulatives'
  | 'customShape'
  | 'shapeInventory'
  | 'photo'
  | 'raisedPrintText'
  | 'graph'
  | 'chart';

export function GraphicGeneratorModal({
  mathCode,
  onMathCodeChange,
  defaultCellsPerRow,
  defaultLinesPerPage,
  onInsert,
  onClose
}: GraphicGeneratorModalProps) {
  const [graphicType, setGraphicType] = useState<GraphicType>('clock');

  // Clock state
  const [clockRadius, setClockRadius] = useState(20);
  const [clockHours, setClockHours] = useState(3);
  const [clockMinutes, setClockMinutes] = useState(0);

  // Fraction state
  const [fractionRadius, setFractionRadius] = useState(20);
  const [fractionNum, setFractionNum] = useState(1);
  const [fractionDen, setFractionDen] = useState(2);

  // Number Line state
  const [nlLength, setNlLength] = useState(40);
  const [nlStart, setNlStart] = useState(0);
  const [nlEnd, setNlEnd] = useState(10);
  const [nlStep, setNlStep] = useState(1);
  const [nlVertical, setNlVertical] = useState(false);

  // Base-10 state
  const [b10Hundreds, setB10Hundreds] = useState(1);
  const [b10Tens, setB10Tens] = useState(2);
  const [b10Ones, setB10Ones] = useState(3);

  // Manipulatives state
  const [manRows, setManRows] = useState(2);
  const [manCols, setManCols] = useState(3);
  const [manSpacing, setManSpacing] = useState(5);

  // Shape Inventory state — size is radius in braille dots
  const [inventoryShape, setInventoryShape] = useState<InventoryShapeKind>('circle');
  const [inventorySize, setInventorySize] = useState(15);
  const [inventoryFilled, setInventoryFilled] = useState(false);

  // Cross-specific state
  const [crossLengthHorizontal, setCrossLengthHorizontal] = useState(30);
  const [crossThicknessVertical, setCrossThicknessVertical] = useState(6);
  const [crossThicknessHorizontal, setCrossThicknessHorizontal] = useState(6);
  const [crossHeightRatio, setCrossHeightRatio] = useState(0.35);

  // Graph (equation) state
  const [eqInput, setEqInput] = useState('sin(x)');
  const [eqXMin, setEqXMin] = useState(-10);
  const [eqXMax, setEqXMax] = useState(10);
  const [eqYMinManual, setEqYMinManual] = useState('');
  const [eqYMaxManual, setEqYMaxManual] = useState('');
  const [eqCellsW, setEqCellsW] = useState(40);
  const [eqCellsH, setEqCellsH] = useState(20);
  const [eqSamples, setEqSamples] = useState(200);
  const [eqXTick, setEqXTick] = useState(0);
  const [eqYTick, setEqYTick] = useState(0);
  const [eqTitle, setEqTitle] = useState('');

  // Custom Shape state
  const [customSize, setCustomSize] = useState(15);
  const [customSides, setCustomSides] = useState(3);
  const [customAngle, setCustomAngle] = useState(0);
  const [customFilled, setCustomFilled] = useState(false);

  // Raised Print Text state
  const [printText, setPrintText] = useState('ABC');
  const [printFontSize, setPrintFontSize] = useState(24);
  const [printTextFilled, setPrintTextFilled] = useState(false);
  const [printLetterType, setPrintLetterType] = useState<'bubble' | 'thin'>('bubble');
  const [printFont, setPrintFont] = useState<import('opentype.js').Font | null>(null);
  const [fontLoading, setFontLoading] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  useEffect(() => {
    if (graphicType === 'raisedPrintText' && !printFont && !fontLoading) {
      setFontLoading(true);
      fetch(fontUrl)
        .then(r => {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        })
        .then(ab => {
          setPrintFont(parse(ab));
          setFontLoading(false);
        })
        .catch(err => {
          console.error('Failed to load print font', err);
          setFontError('Failed to load font file.');
          setFontLoading(false);
        });
    }
  }, [graphicType, printFont, fontLoading]);

  // Photo state
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoWidthCells, setPhotoWidthCells] = useState(defaultCellsPerRow);
  const [photoHeightCells, setPhotoHeightCells] = useState(defaultLinesPerPage);
  const [photoOpacity, setPhotoOpacity] = useState(0.5);
  const [photoScale, setPhotoScale] = useState(100);
  const [photoOffsetX, setPhotoOffsetX] = useState(0);
  const [photoOffsetY, setPhotoOffsetY] = useState(0);
  const [photoTool, setPhotoTool] = useState<'pencil' | 'eraser' | 'line' | 'stamp'>('pencil');
  const [photoBrushSize, setPhotoBrushSize] = useState(1);
  const [photoStampShape, setPhotoStampShape] = useState<InventoryShapeKind>('circle');
  const [photoStampSize, setPhotoStampSize] = useState(5);
  const [photoStampFilled, setPhotoStampFilled] = useState(false);
  const [photoStampCrossParams, setPhotoStampCrossParams] = useState({
    lengthHorizontal: 10,
    thicknessVertical: 2,
    thicknessHorizontal: 2,
    heightRatio: 0.35,
  });
  const [gridVisible, setGridVisible] = useState(true);
  const [photoDrawingGrid, setPhotoDrawingGrid] = useState<boolean[][]>(() =>
    Array.from({ length: defaultLinesPerPage * 3 }, () => Array(defaultCellsPerRow * 2).fill(false))
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(true); // true = draw, false = erase
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [mouseHoverGrid, setMouseHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const createBlankGrid = (wCells: number, hCells: number) => {
    return Array.from({ length: hCells * 3 }, () => Array(wCells * 2).fill(false));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const pdfjsLib = await loadPdfJs();
        const reader = new FileReader();
        reader.onload = async (event) => {
          if (!event.target?.result) return;
          const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
          try {
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
              await page.render({ canvasContext: context, viewport }).promise;
              const imgDataUrl = canvas.toDataURL('image/png');
              setPhotoImage(imgDataUrl);
              setPhotoScale(100);
              setPhotoOffsetX(0);
              setPhotoOffsetY(0);
            }
          } catch (pdfErr) {
            console.error('Error rendering PDF page', pdfErr);
            alert('Failed to parse PDF file.');
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error('Failed to load PDF library', err);
        alert('Failed to load PDF library.');
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoImage(event.target.result as string);
          setPhotoScale(100);
          setPhotoOffsetX(0);
          setPhotoOffsetY(0);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearCanvas = () => {
    if (window.confirm("Are you sure you want to clear your drawing?")) {
      setPhotoDrawingGrid(createBlankGrid(photoWidthCells, photoHeightCells));
    }
  };

  const handleInvertCanvas = () => {
    setPhotoDrawingGrid(current => current.map(row => row.map(cell => !cell)));
  };

  // Resize drawing grid when dimensions change
  useEffect(() => {
    setPhotoDrawingGrid(current => {
      const newHDots = photoHeightCells * 3;
      const newWDots = photoWidthCells * 2;
      const newGrid = Array.from({ length: newHDots }, () => Array(newWDots).fill(false));
      const oldHDots = current.length;
      const oldWDots = oldHDots > 0 ? current[0].length : 0;
      
      for (let y = 0; y < Math.min(oldHDots, newHDots); y++) {
        for (let x = 0; x < Math.min(oldWDots, newWDots); x++) {
          newGrid[y][x] = current[y][x];
        }
      }
      return newGrid;
    });
  }, [photoWidthCells, photoHeightCells]);

  // Keep canvas backing store in sync with the (now flexible) overlay size
  useEffect(() => {
    if (graphicType !== 'photo') return;
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent) return;

    const updateSize = (width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      setCanvasSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    updateSize(parent.clientWidth, parent.clientHeight);
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [graphicType]);

  const applyBrush = (grid: boolean[][], gridX: number, gridY: number, val: boolean) => {
    const cols = photoWidthCells * 2;
    const rows = photoHeightCells * 3;
    const radius = (photoBrushSize - 1) / 2;
    
    for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy++) {
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx++) {
        if (dx * dx + dy * dy <= radius * radius + 0.1) {
          const tx = gridX + dx;
          const ty = gridY + dy;
          if (tx >= 0 && tx < cols && ty >= 0 && ty < rows) {
            grid[ty][tx] = val;
          }
        }
      }
    }
  };

  const drawLineOnGrid = (grid: boolean[][], x0: number, y0: number, x1: number, y1: number, val: boolean) => {
    const cols = photoWidthCells * 2;
    const rows = photoHeightCells * 3;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;

    while (true) {
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
        applyBrush(grid, cx, cy, val);
      }
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

  // Canvas drawing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cols = photoWidthCells * 2;
    const rows = photoHeightCells * 3;
    const cellWidth = rect.width / cols;
    const cellHeight = rect.height / rows;

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (gridVisible) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (!photoDrawingGrid[y] || !photoDrawingGrid[y][x]) {
            const cx = (x + 0.5) * cellWidth;
            const cy = (y + 0.5) * cellHeight;
            ctx.beginPath();
            ctx.arc(cx, cy, 1.2, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }

    ctx.fillStyle = '#00a8ff';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (photoDrawingGrid[y] && photoDrawingGrid[y][x]) {
          const cx = (x + 0.5) * cellWidth;
          const cy = (y + 0.5) * cellHeight;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(cellWidth, cellHeight) * 0.35, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    if (photoTool === 'line' && lineStart && mouseHoverGrid) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.lineWidth = photoBrushSize;
      
      const x0 = (lineStart.x + 0.5) * cellWidth;
      const y0 = (lineStart.y + 0.5) * cellHeight;
      const x1 = (mouseHoverGrid.x + 0.5) * cellWidth;
      const y1 = (mouseHoverGrid.y + 0.5) * cellHeight;
      
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    if (photoTool === 'stamp' && mouseHoverGrid) {
      const previewCanvas = new GraphicCanvas(Math.ceil(cols / 2), Math.ceil(rows / 3));
      const cx = mouseHoverGrid.x;
      const cy = mouseHoverGrid.y;
      const size = photoStampSize;
      const filled = photoStampFilled;
      
      switch (photoStampShape) {
        case 'actingMask': previewCanvas.drawActingMask(cx, cy, size, filled); break;
        case 'apple': previewCanvas.drawApple(cx, cy, size, filled); break;
        case 'axe': previewCanvas.drawAxe(cx, cy, size, filled); break;
        case 'beach': previewCanvas.drawBeach(cx, cy, size, filled); break;
        case 'bed': previewCanvas.drawBed(cx, cy, size, filled); break;
        case 'birdHouse': previewCanvas.drawBirdHouse(cx, cy, size, filled); break;
        case 'bowling': previewCanvas.drawBowling(cx, cy, size, filled); break;
        case 'candle': previewCanvas.drawCandle(cx, cy, size, filled); break;
        case 'cat': previewCanvas.drawCat(cx, cy, size, filled); break;
        case 'circle': previewCanvas.drawCircle(cx, cy, size, filled); break;
        case 'cloud': previewCanvas.drawCloud(cx, cy, size, filled); break;
        case 'cloudLightning': previewCanvas.drawCloudLightning(cx, cy, size, filled); break;
        case 'moon': previewCanvas.drawCrescentMoon(cx, cy, size, filled); break;
        case 'cross':
          previewCanvas.drawCross(
            cx,
            cy,
            size,
            photoStampCrossParams.lengthHorizontal,
            photoStampCrossParams.thicknessVertical,
            photoStampCrossParams.thicknessHorizontal,
            photoStampCrossParams.heightRatio,
            filled
          );
          break;
        case 'dog': previewCanvas.drawDog(cx, cy, size, filled); break;
        case 'flower': previewCanvas.drawFlower(cx, cy, size, filled); break;
        case 'heart': previewCanvas.drawHeart(cx, cy, size, filled); break;
        case 'hiking': previewCanvas.drawHiking(cx, cy, size, filled); break;
        case 'house': previewCanvas.drawHouse(cx, cy, size, filled); break;
        case 'iceSkates': previewCanvas.drawIceSkates(cx, cy, size, filled); break;
        case 'lightning': previewCanvas.drawLightningBolt(cx, cy, size, filled); break;
        case 'movieProjector': previewCanvas.drawMovieProjector(cx, cy, size, filled); break;
        case 'mustache': previewCanvas.drawMustache(cx, cy, size, filled); break;
        case 'paintbrush': previewCanvas.drawPaintbrush(cx, cy, size, filled); break;
        case 'star': previewCanvas.drawStar(cx, cy, size, filled); break;
        case 'vampireFangs': previewCanvas.drawVampireFangs(cx, cy, size, filled); break;
      }
      
      ctx.fillStyle = 'rgba(255, 75, 75, 0.5)';
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (previewCanvas.data[y] && previewCanvas.data[y][x]) {
            const dotCx = (x + 0.5) * cellWidth;
            const dotCy = (y + 0.5) * cellHeight;
            ctx.beginPath();
            ctx.arc(dotCx, dotCy, Math.min(cellWidth, cellHeight) * 0.35, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }
  }, [
    photoDrawingGrid,
    photoWidthCells,
    photoHeightCells,
    gridVisible,
    photoTool,
    lineStart,
    mouseHoverGrid,
    photoStampShape,
    photoStampSize,
    photoStampFilled,
    photoStampCrossParams,
    photoBrushSize,
    canvasSize,
  ]);

  const getGridCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
    
    const cols = photoWidthCells * 2;
    const rows = photoHeightCells * 3;
    const gridX = Math.floor((clientX / rect.width) * cols);
    const gridY = Math.floor((clientY / rect.height) * rows);
    
    return {
      x: Math.max(0, Math.min(cols - 1, gridX)),
      y: Math.max(0, Math.min(rows - 1, gridY))
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getGridCoords(e);
    if (!coords) return;
    
    if (photoTool === 'stamp') {
      setPhotoDrawingGrid(current => 
        stampShapeOnGrid(
          current, 
          coords.x, 
          coords.y, 
          photoStampShape, 
          photoStampSize, 
          photoStampFilled, 
          photoStampCrossParams
        )
      );
      return;
    }
    
    setIsDrawing(true);
    if (photoTool === 'line') {
      setLineStart(coords);
      return;
    }
    
    const mode = photoTool === 'pencil';
    setIsDrawingMode(mode);
    setPhotoDrawingGrid(current => {
      const grid = current.map(row => [...row]);
      applyBrush(grid, coords.x, coords.y, mode);
      return grid;
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getGridCoords(e);
    if (!coords) return;
    
    setMouseHoverGrid(coords);
    if (!isDrawing) return;
    
    if (photoTool === 'pencil' || photoTool === 'eraser') {
      setPhotoDrawingGrid(current => {
        const grid = current.map(row => [...row]);
        applyBrush(grid, coords.x, coords.y, isDrawingMode);
        return grid;
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    if (photoTool === 'line' && lineStart) {
      const coords = getGridCoords(e) || mouseHoverGrid;
      if (coords) {
        setPhotoDrawingGrid(current => {
          const grid = current.map(row => [...row]);
          drawLineOnGrid(grid, lineStart.x, lineStart.y, coords.x, coords.y, true);
          return grid;
        });
      }
    }
    setIsDrawing(false);
    setLineStart(null);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getGridCoords(e);
    if (!coords) return;
    
    if (photoTool === 'stamp') {
      setPhotoDrawingGrid(current => 
        stampShapeOnGrid(
          current, 
          coords.x, 
          coords.y, 
          photoStampShape, 
          photoStampSize, 
          photoStampFilled, 
          photoStampCrossParams
        )
      );
      return;
    }
    
    setIsDrawing(true);
    if (photoTool === 'line') {
      setLineStart(coords);
      return;
    }
    
    const mode = photoTool === 'pencil';
    setIsDrawingMode(mode);
    setPhotoDrawingGrid(current => {
      const grid = current.map(row => [...row]);
      applyBrush(grid, coords.x, coords.y, mode);
      return grid;
    });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getGridCoords(e);
    if (!coords) return;
    
    setMouseHoverGrid(coords);
    if (!isDrawing) return;
    
    if (photoTool === 'pencil' || photoTool === 'eraser') {
      setPhotoDrawingGrid(current => {
        const grid = current.map(row => [...row]);
        applyBrush(grid, coords.x, coords.y, isDrawingMode);
        return grid;
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    
    if (photoTool === 'line' && lineStart) {
      const coords = mouseHoverGrid;
      if (coords) {
        setPhotoDrawingGrid(current => {
          const grid = current.map(row => [...row]);
          drawLineOnGrid(grid, lineStart.x, lineStart.y, coords.x, coords.y, true);
          return grid;
        });
      }
    }
    setIsDrawing(false);
    setLineStart(null);
  };

  // Graph equation preview (memoised so it only re-evaluates when inputs change)
  const graphPreview = useMemo(() => {
    if (graphicType !== 'graph') return null;
    const yMinParsed = eqYMinManual.trim() ? parseFloat(eqYMinManual) : undefined;
    const yMaxParsed = eqYMaxManual.trim() ? parseFloat(eqYMaxManual) : undefined;
    return generateEquationGraph({
      equation: eqInput,
      xMin: eqXMin,
      xMax: eqXMax,
      cellsWidth: eqCellsW,
      cellsHeight: eqCellsH,
      samplePoints: eqSamples,
      yMin: Number.isFinite(yMinParsed!) ? yMinParsed : undefined,
      yMax: Number.isFinite(yMaxParsed!) ? yMaxParsed : undefined,
      xTickDistance: eqXTick,
      yTickDistance: eqYTick,
      title: eqTitle || undefined,
    });
  }, [graphicType, eqInput, eqXMin, eqXMax, eqYMinManual, eqYMaxManual, eqCellsW, eqCellsH, eqSamples, eqXTick, eqYTick, eqTitle]);

  // Compute preview during render
  let preview: GraphicResult = { brf: '', summary: '' };
  if (graphicType === 'graph') {
    if (graphPreview && !graphPreview.error) {
      preview = graphPreview;
    }
  } else if (graphicType !== 'chart') {
    switch (graphicType) {
      case 'clock':
        preview = generateClock(clockRadius, clockHours, clockMinutes);
        break;
      case 'fraction':
        preview = generateFraction(fractionRadius, fractionNum, fractionDen);
        break;
      case 'numberLine':
        preview = generateNumberLine(nlLength, nlStart, nlEnd, nlStep, nlVertical);
        break;
      case 'base10':
        preview = generateBase10(b10Hundreds, b10Tens, b10Ones);
        break;
      case 'manipulatives':
        preview = generateManipulatives(manRows, manCols, manSpacing);
        break;
      case 'shapeInventory':
        preview = generateInventoryShape(inventoryShape, inventorySize, inventoryFilled, {
          lengthHorizontal: crossLengthHorizontal,
          thicknessVertical: crossThicknessVertical,
          thicknessHorizontal: crossThicknessHorizontal,
          heightRatio: crossHeightRatio
        });
        break;
      case 'customShape':
        preview = generateCustomShape(customSize, customSides, customAngle, customFilled);
        break;
      case 'photo': {
        const rows = photoDrawingGrid.length;
        const cols = rows > 0 ? photoDrawingGrid[0].length : 0;
        const cellsW = Math.ceil(cols / 2);
        const cellsH = Math.ceil(rows / 3);
        const canvas = new GraphicCanvas(cellsW, cellsH);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (photoDrawingGrid[y] && photoDrawingGrid[y][x]) {
              canvas.setPoint(x, y);
            }
          }
        }
        preview = {
          brf: canvas.renderToBRF(),
          summary: `Photo Overlay Drawing (${photoWidthCells} cells × ${photoHeightCells} lines)`
        };
        break;
      }
      case 'raisedPrintText':
        if (printFont) {
          preview = generateRaisedPrintTextGraphic(printFont, printText, printFontSize, printTextFilled, printLetterType);
        } else {
          preview = { brf: '', summary: fontError ? `Error: ${fontError}` : (fontLoading ? 'Loading font...' : 'Font not loaded.') };
        }
        break;
    }
  }

  const handleInsert = () => {
    const block = `${preview.summary}\n\n:::graphic\n${preview.brf}\n:::\n`;
    onInsert(block);
  };

  return (
    <div className="welcome-overlay" onClick={onClose}>
      <div 
        className="welcome-modal" 
        onClick={e => e.stopPropagation()} 
        style={{
          maxWidth: graphicType === 'photo' ? 'min(1400px, 98vw)' : '1000px',
          width: graphicType === 'photo' ? '98vw' : undefined,
          maxHeight: graphicType === 'photo' ? '96dvh' : undefined,
          height: graphicType === 'photo' ? '96dvh' : undefined,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header className="welcome-header">
          <h2>Tactile Graphics Generator</h2>
          <button className="welcome-close" onClick={onClose}>✕</button>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: graphicType === 'photo' ? 0 : '400px', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: '200px', borderRight: '1px solid var(--border-color)', padding: '1rem', overflowY: 'auto', flexShrink: 0 }}>
            <h3 style={{ marginTop: 0 }}>Graphic Type</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(
                [
                  'clock',
                  'fraction',
                  'numberLine',
                  'base10',
                  'manipulatives',
                  'customShape',
                  'shapeInventory',
                  'photo',
                  'raisedPrintText',
                  'graph',
                  'chart'
                ] as GraphicType[]
              ).map(type => {
                let label = type.replace(/([A-Z])/g, ' $1').trim();
                if (type === 'customShape') {
                  label = 'Custom Shapes';
                } else if (type === 'shapeInventory') {
                  label = 'Shape Inventory';
                } else if (type === 'graph') {
                  label = 'Graphs';
                } else if (type === 'photo') {
                  label = 'Photo Overlay';
                }
                return (
                  <button
                    key={type}
                    className={`toolbar-btn ${graphicType === type ? 'toolbar-btn--active' : ''}`}
                    onClick={() => setGraphicType(type)}
                    style={{ textAlign: 'left', textTransform: 'capitalize' }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Area */}
          {graphicType === 'chart' ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <ChartGenerator 
                mathCode={mathCode}
                onMathCodeChange={onMathCodeChange}
                onInsert={onInsert}
                onClose={onClose}
                inline
              />
            </div>
          ) : graphicType === 'graph' ? (
            <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              {/* Equation Input */}
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }} htmlFor="eq-input">
                  Equation (in terms of x)
                </label>
                <input
                  id="eq-input"
                  type="text"
                  value={eqInput}
                  onChange={e => setEqInput(e.target.value)}
                  placeholder="e.g. sin(x), x^2, 2x+3, sqrt(x)"
                  aria-describedby="eq-input-hint"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    fontSize: '1rem',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                  }}
                />
                <p id="eq-input-hint" style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.75 }}>
                  Supports: sin, cos, tan, sqrt, abs, log, ln, exp, pi, e, ^, and more. Shortcuts like "sinx" and "2x" work.
                </p>
              </div>

              {/* Error display */}
              {graphPreview?.error && (
                <div role="alert" style={{
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                  color: '#e55',
                  fontSize: '0.9rem',
                }}>
                  {graphPreview.error}
                </div>
              )}

              {/* Range and grid controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label>X Min: <input type="number" value={eqXMin} onChange={e => setEqXMin(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>X Max: <input type="number" value={eqXMax} onChange={e => setEqXMax(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Y Min (auto if empty): <input type="text" value={eqYMinManual} onChange={e => setEqYMinManual(e.target.value)} placeholder="auto" style={{ width: '80px' }} /></label>
                <label>Y Max (auto if empty): <input type="text" value={eqYMaxManual} onChange={e => setEqYMaxManual(e.target.value)} placeholder="auto" style={{ width: '80px' }} /></label>
                <label>X Tick Distance (0 = auto): <input type="number" min={0} step="any" value={eqXTick} onChange={e => setEqXTick(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Y Tick Distance (0 = auto): <input type="number" min={0} step="any" value={eqYTick} onChange={e => setEqYTick(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Grid Width (cells): <input type="number" min={5} max={80} value={eqCellsW} onChange={e => setEqCellsW(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Grid Height (lines): <input type="number" min={5} max={40} value={eqCellsH} onChange={e => setEqCellsH(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Sample Points: <input type="number" min={10} max={2000} value={eqSamples} onChange={e => setEqSamples(Number(e.target.value))} style={{ width: '80px' }} /></label>
                <label>Title (optional): <input type="text" value={eqTitle} onChange={e => setEqTitle(e.target.value)} placeholder={`y = ${eqInput}`} style={{ width: '160px' }} /></label>
              </div>

              {/* Preview */}
              {preview.brf && (
                <div style={{ flex: 1, border: '1px solid var(--border-color)', padding: '1rem', background: '#fff', color: '#000', overflow: 'auto', borderRadius: '4px' }}>
                  <div style={{ fontFamily: 'sans-serif', marginBottom: '0.75rem', fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{preview.summary}</div>
                  <div
                    className="brf-pages-container"
                    style={{
                      '--braille-cell-height': '16px',
                      '--braille-cell-width': '10px',
                      '--braille-cell-gap': '4px',
                      '--braille-dot-size-active': '3.5px',
                      '--braille-dot-size-inactive': '0px',
                      '--braille-line-gap': '6px',
                      overflow: 'visible',
                      maxHeight: 'none',
                    } as React.CSSProperties}
                  >
                    {asciiToUnicodeBraille(preview.brf).split('\n').map((line, lineIdx) => (
                      <div key={lineIdx} className="brf-page-line" style={{ whiteSpace: 'nowrap' }}>
                        {[...line].map((ch, chIdx) => (
                          <BrailleCell key={chIdx} char={ch} showEmptyDots={false} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : graphicType === 'photo' ? (
            <div style={{ flex: 1, padding: '1rem', display: 'flex', gap: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
              {/* Left Column: Controls & Canvas */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
                
                {/* Condensed Control Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-card)', fontSize: '0.8rem', flexShrink: 0 }}>
                  {/* File Upload */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Photo:</span>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      onChange={handlePhotoUpload} 
                      style={{ fontSize: '0.75rem', width: '120px' }}
                    />
                  </div>

                  {/* Opacity slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Opacity: {(photoOpacity * 100).toFixed(0)}%</span>
                    <input 
                      type="range" 
                      min={0} 
                      max={1} 
                      step={0.05} 
                      value={photoOpacity} 
                      onChange={e => setPhotoOpacity(parseFloat(e.target.value))}
                      style={{ width: '70px', height: '14px', margin: 0 }}
                    />
                  </div>

                  {/* Scale & Offsets (only if photo is uploaded) */}
                  {photoImage && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Scale: {photoScale}%</span>
                        <input 
                          type="range" 
                          min={10} 
                          max={300} 
                          value={photoScale} 
                          onChange={e => setPhotoScale(parseInt(e.target.value, 10))}
                          style={{ width: '60px', height: '14px', margin: 0 }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Offsets:</span>
                        <input 
                          type="number" 
                          value={photoOffsetX} 
                          onChange={e => setPhotoOffsetX(parseInt(e.target.value, 10) || 0)}
                          style={{ width: '35px', padding: '1px 2px', fontSize: '0.75rem' }}
                          title="X Offset"
                        />
                        <span>,</span>
                        <input 
                          type="number" 
                          value={photoOffsetY} 
                          onChange={e => setPhotoOffsetY(parseInt(e.target.value, 10) || 0)}
                          style={{ width: '35px', padding: '1px 2px', fontSize: '0.75rem' }}
                          title="Y Offset"
                        />
                      </div>
                    </>
                  )}

                  {/* Drawing Tool */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Tool:</span>
                    <select
                      value={photoTool}
                      onChange={e => {
                        setPhotoTool(e.target.value as any);
                        setLineStart(null);
                      }}
                      style={{ padding: '1px 3px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)' }}
                    >
                      <option value="pencil">Pencil</option>
                      <option value="eraser">Eraser</option>
                      <option value="line">Line</option>
                      <option value="stamp">Stamp</option>
                    </select>
                  </div>

                  {/* Tool Config (Brush Size / Stamp details) */}
                  {(photoTool === 'pencil' || photoTool === 'eraser' || photoTool === 'line') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>Brush: {photoBrushSize}</span>
                      <input 
                        type="range" 
                        min={1} 
                        max={5} 
                        value={photoBrushSize} 
                        onChange={e => setPhotoBrushSize(parseInt(e.target.value, 10))}
                        style={{ width: '55px', height: '14px', margin: 0 }}
                      />
                    </div>
                  )}

                  {photoTool === 'stamp' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <select
                        value={photoStampShape}
                        onChange={e => setPhotoStampShape(e.target.value as InventoryShapeKind)}
                        style={{ padding: '1px 3px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', maxWidth: '90px' }}
                      >
                        <optgroup label="Basics">
                          <option value="circle">Circle</option>
                          <option value="heart">Heart</option>
                          <option value="star">Star</option>
                          <option value="cross">Cross</option>
                          <option value="moon">Moon</option>
                          <option value="cloud">Cloud</option>
                          <option value="cloudLightning">Cloud+Lt</option>
                          <option value="lightning">Lightning</option>
                        </optgroup>
                        <optgroup label="Science">
                          <option value="atom">Atom</option>
                          <option value="dna">DNA</option>
                          <option value="leaf">Leaf</option>
                          <option value="fish">Fish</option>
                          <option value="butterfly">Butterfly</option>
                          <option value="earth">Earth</option>
                          <option value="sun">Sun</option>
                          <option value="volcano">Volcano</option>
                          <option value="magnet">Magnet</option>
                          <option value="thermometer">Therm.</option>
                          <option value="beaker">Beaker</option>
                          <option value="microscope">Micro.</option>
                        </optgroup>
                        <optgroup label="History">
                          <option value="pyramid">Pyramid</option>
                          <option value="greekColumn">Column</option>
                          <option value="castle">Castle</option>
                          <option value="shipSail">Ship</option>
                          <option value="compassRose">Compass</option>
                          <option value="scroll">Scroll</option>
                          <option value="libertyBell">Bell</option>
                          <option value="flag">Flag</option>
                          <option value="timeline">Timeline</option>
                        </optgroup>
                        <optgroup label="Math">
                          <option value="triangle">Triangle</option>
                          <option value="square">Square</option>
                          <option value="hexagon">Hexagon</option>
                          <option value="cube">Cube</option>
                          <option value="cone">Cone</option>
                          <option value="cylinder">Cylinder</option>
                          <option value="rightTriangle">Rt Tri</option>
                          <option value="angle">Angle</option>
                          <option value="coordinateAxes">Axes</option>
                          <option value="pieChart">Pie</option>
                        </optgroup>
                        <optgroup label="Everyday">
                          <option value="actingMask">Mask</option>
                          <option value="apple">Apple</option>
                          <option value="axe">Axe</option>
                          <option value="beach">Beach</option>
                          <option value="bed">Bed</option>
                          <option value="birdHouse">Bird H.</option>
                          <option value="bowling">Bowling</option>
                          <option value="candle">Candle</option>
                          <option value="cat">Cat</option>
                          <option value="dog">Dog</option>
                          <option value="flower">Flower</option>
                          <option value="hiking">Hiking</option>
                          <option value="house">House</option>
                          <option value="iceSkates">Skates</option>
                          <option value="movieProjector">Proj.</option>
                          <option value="mustache">Mustache</option>
                          <option value="paintbrush">Brush</option>
                          <option value="vampireFangs">Fangs</option>
                        </optgroup>
                      </select>
                      <input 
                        type="number" 
                        min={2} 
                        max={30} 
                        value={photoStampSize} 
                        onChange={e => setPhotoStampSize(parseInt(e.target.value, 10) || 5)}
                        style={{ width: '30px', padding: '1px 2px', fontSize: '0.75rem' }}
                        title="Stamp Size"
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.75rem', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={photoStampFilled} 
                          onChange={e => setPhotoStampFilled(e.target.checked)}
                          style={{ margin: 0 }}
                        />
                        Fill
                      </label>
                    </div>
                  )}

                  {/* Width & Height */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontWeight: 'bold' }}>Grid:</span>
                    <input 
                      type="number" 
                      min={10} 
                      max={60} 
                      value={photoWidthCells} 
                      onChange={e => setPhotoWidthCells(parseInt(e.target.value, 10) || 40)}
                      style={{ width: '52px', padding: '1px 2px 1px 4px', fontSize: '0.75rem' }}
                      title="Width (cells)"
                    />
                    <span>×</span>
                    <input 
                      type="number" 
                      min={5} 
                      max={40} 
                      value={photoHeightCells} 
                      onChange={e => setPhotoHeightCells(parseInt(e.target.value, 10) || 20)}
                      style={{ width: '52px', padding: '1px 2px 1px 4px', fontSize: '0.75rem' }}
                      title="Height (lines)"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                    <button 
                      type="button" 
                      className="toolbar-btn" 
                      onClick={() => setGridVisible(v => !v)}
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    >
                      {gridVisible ? 'Hide Grid' : 'Show Grid'}
                    </button>
                    <button 
                      type="button" 
                      className="toolbar-btn" 
                      onClick={handleClearCanvas}
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    >
                      Clear
                    </button>
                    <button 
                      type="button" 
                      className="toolbar-btn" 
                      onClick={handleInvertCanvas}
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    >
                      Invert
                    </button>
                  </div>
                </div>

                {/* Subtitle / Extra Parameters Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.25rem', padding: '0 0.25rem', flexShrink: 0 }}>
                  <div>
                    Default layout size: {defaultCellsPerRow} cells × {defaultLinesPerPage} lines
                  </div>
                  {photoTool === 'stamp' && photoStampShape === 'cross' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold' }}>Cross:</span>
                      <label>H-Len: <input type="number" min={2} value={photoStampCrossParams.lengthHorizontal} onChange={e => setPhotoStampCrossParams(p => ({ ...p, lengthHorizontal: parseInt(e.target.value, 10) || 10 }))} style={{ width: '25px', fontSize: '0.7rem' }} /></label>
                      <label>V-Thick: <input type="number" min={1} value={photoStampCrossParams.thicknessVertical} onChange={e => setPhotoStampCrossParams(p => ({ ...p, thicknessVertical: parseInt(e.target.value, 10) || 2 }))} style={{ width: '25px', fontSize: '0.7rem' }} /></label>
                      <label>H-Thick: <input type="number" min={1} value={photoStampCrossParams.thicknessHorizontal} onChange={e => setPhotoStampCrossParams(p => ({ ...p, thicknessHorizontal: parseInt(e.target.value, 10) || 2 }))} style={{ width: '25px', fontSize: '0.7rem' }} /></label>
                      <label>H-Ratio: <input type="number" step={0.05} min={0.1} max={0.9} value={photoStampCrossParams.heightRatio} onChange={e => setPhotoStampCrossParams(p => ({ ...p, heightRatio: parseFloat(e.target.value) || 0.35 }))} style={{ width: '35px', fontSize: '0.7rem' }} /></label>
                    </div>
                  )}
                </div>

                {/* Drawing Canvas Container */}
                <div style={{ position: 'relative', overflow: 'hidden', width: '100%', flex: 1, minHeight: 0, border: '1px solid var(--border-color)', borderRadius: '6px', background: '#333', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)' }}>
                  {photoImage && (
                    <img 
                      src={photoImage} 
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
                      alt="Overlay guide"
                    />
                  )}
                  <canvas 
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      cursor: photoTool === 'stamp' ? 'crosshair' : 'pencil',
                      display: 'block'
                    }}
                  />
                </div>
              </div>

              {/* Right Column: Preview */}
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 0, minHeight: 0 }}>
                <h4 style={{ margin: 0, fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Braille Preview</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{photoWidthCells * 2} × {photoHeightCells * 3} dots</span>
                </h4>
                <div style={{ flex: 1, border: '1px solid var(--border-color)', padding: '1rem', background: '#fff', color: '#000', overflow: 'auto', borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                  <div style={{ fontFamily: 'sans-serif', marginBottom: '1rem', fontWeight: 'bold', fontSize: '0.9rem' }}>{preview.summary}</div>
                  <div
                    className="brf-pages-container"
                    style={{
                      '--braille-cell-height': '28px',
                      '--braille-cell-width': '18px',
                      '--braille-cell-gap': '6px',
                      '--braille-dot-size-active': '6px',
                      '--braille-dot-size-inactive': '1.6px',
                      '--braille-line-gap': '10px',
                      overflow: 'visible',
                      maxHeight: 'none',
                    } as React.CSSProperties}
                  >
                    {asciiToUnicodeBraille(preview.brf).split('\n').map((line, lineIdx) => (
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
          ) : (
            <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              {/* Inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {graphicType === 'clock' && (
                <>
                  <label>Radius: <input type="number" value={clockRadius} onChange={e => setClockRadius(Number(e.target.value))} /></label>
                  <label>Hours: <input type="number" value={clockHours} onChange={e => setClockHours(Number(e.target.value))} /></label>
                  <label>Minutes: <input type="number" value={clockMinutes} onChange={e => setClockMinutes(Number(e.target.value))} /></label>
                </>
              )}
              {graphicType === 'fraction' && (
                <>
                  <label>Radius: <input type="number" value={fractionRadius} onChange={e => setFractionRadius(Number(e.target.value))} /></label>
                  <label>Numerator: <input type="number" value={fractionNum} onChange={e => setFractionNum(Number(e.target.value))} /></label>
                  <label>Denominator: <input type="number" value={fractionDen} onChange={e => setFractionDen(Number(e.target.value))} /></label>
                </>
              )}
              {graphicType === 'numberLine' && (
                <>
                  <label>Length: <input type="number" value={nlLength} onChange={e => setNlLength(Number(e.target.value))} /></label>
                  <label>Start: <input type="number" value={nlStart} onChange={e => setNlStart(Number(e.target.value))} /></label>
                  <label>End: <input type="number" value={nlEnd} onChange={e => setNlEnd(Number(e.target.value))} /></label>
                  <label>Step: <input type="number" value={nlStep} onChange={e => setNlStep(Number(e.target.value))} /></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={nlVertical} onChange={e => setNlVertical(e.target.checked)} /> Vertical
                  </label>
                </>
              )}
              {graphicType === 'base10' && (
                <>
                  <label>Hundreds: <input type="number" value={b10Hundreds} onChange={e => setB10Hundreds(Number(e.target.value))} /></label>
                  <label>Tens: <input type="number" value={b10Tens} onChange={e => setB10Tens(Number(e.target.value))} /></label>
                  <label>Ones: <input type="number" value={b10Ones} onChange={e => setB10Ones(Number(e.target.value))} /></label>
                </>
              )}
              {graphicType === 'manipulatives' && (
                <>
                  <label>Rows: <input type="number" value={manRows} onChange={e => setManRows(Number(e.target.value))} /></label>
                  <label>Columns: <input type="number" value={manCols} onChange={e => setManCols(Number(e.target.value))} /></label>
                  <label>Spacing: <input type="number" value={manSpacing} onChange={e => setManSpacing(Number(e.target.value))} /></label>
                </>
              )}
              {graphicType === 'shapeInventory' && (
                <>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Shape:{' '}
                    <select
                      value={inventoryShape}
                      onChange={e => setInventoryShape(e.target.value as InventoryShapeKind)}
                    >
                      <optgroup label="Basics">
                        <option value="circle">Circle</option>
                        <option value="heart">Heart</option>
                        <option value="star">Star (5-Pointed)</option>
                        <option value="cross">Cross</option>
                        <option value="moon">Crescent Moon</option>
                        <option value="cloud">Cloud</option>
                        <option value="cloudLightning">Cloud with Lightning Bolt</option>
                        <option value="lightning">Lightning Bolt</option>
                      </optgroup>
                      <optgroup label="Science">
                        <option value="atom">Atom</option>
                        <option value="dna">DNA Helix</option>
                        <option value="leaf">Leaf</option>
                        <option value="fish">Fish</option>
                        <option value="butterfly">Butterfly</option>
                        <option value="earth">Earth / Globe</option>
                        <option value="sun">Sun</option>
                        <option value="volcano">Volcano</option>
                        <option value="magnet">Horseshoe Magnet</option>
                        <option value="thermometer">Thermometer</option>
                        <option value="beaker">Lab Beaker</option>
                        <option value="microscope">Microscope</option>
                      </optgroup>
                      <optgroup label="History">
                        <option value="pyramid">Pyramid</option>
                        <option value="greekColumn">Greek Column</option>
                        <option value="castle">Castle</option>
                        <option value="shipSail">Sailing Ship</option>
                        <option value="compassRose">Compass Rose</option>
                        <option value="scroll">Scroll</option>
                        <option value="libertyBell">Liberty Bell</option>
                        <option value="flag">Flag</option>
                        <option value="timeline">Timeline</option>
                      </optgroup>
                      <optgroup label="Math">
                        <option value="triangle">Triangle</option>
                        <option value="square">Square</option>
                        <option value="hexagon">Hexagon</option>
                        <option value="cube">Cube</option>
                        <option value="cone">Cone</option>
                        <option value="cylinder">Cylinder</option>
                        <option value="rightTriangle">Right Triangle</option>
                        <option value="angle">Angle</option>
                        <option value="coordinateAxes">Coordinate Axes</option>
                        <option value="pieChart">Pie Chart</option>
                      </optgroup>
                      <optgroup label="Everyday">
                        <option value="actingMask">Acting Mask</option>
                        <option value="apple">Apple</option>
                        <option value="axe">Axe</option>
                        <option value="beach">Beach</option>
                        <option value="bed">Bed</option>
                        <option value="birdHouse">Bird House</option>
                        <option value="bowling">Bowling</option>
                        <option value="candle">Candle</option>
                        <option value="cat">Cat</option>
                        <option value="dog">Dog</option>
                        <option value="flower">Flower</option>
                        <option value="hiking">Hiking</option>
                        <option value="house">House</option>
                        <option value="iceSkates">Ice Skating Skates</option>
                        <option value="movieProjector">Movie Projector</option>
                        <option value="mustache">Mustache</option>
                        <option value="paintbrush">Paintbrush</option>
                        <option value="vampireFangs">Vampire Fangs</option>
                      </optgroup>
                    </select>
                  </label>
                  <label>
                    Size (radius in dots):{' '}
                    <input
                      type="number"
                      min={1}
                      value={inventorySize}
                      onChange={e => setInventorySize(Number(e.target.value))}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={inventoryFilled}
                      onChange={e => setInventoryFilled(e.target.checked)}
                    />{' '}
                    Filled (solid)
                  </label>
                  {inventoryShape === 'cross' && (
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px dashed var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                      <h4 style={{ gridColumn: '1 / -1', margin: '0 0 0.5rem 0' }}>Cross Parameters</h4>
                      <label>
                        Horizontal Bar Length (dots):{' '}
                        <input
                          type="number"
                          min={2}
                          value={crossLengthHorizontal}
                          onChange={e => setCrossLengthHorizontal(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Vertical Bar Thickness (dots):{' '}
                        <input
                          type="number"
                          min={1}
                          value={crossThicknessVertical}
                          onChange={e => setCrossThicknessVertical(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Horizontal Bar Thickness (dots):{' '}
                        <input
                          type="number"
                          min={1}
                          value={crossThicknessHorizontal}
                          onChange={e => setCrossThicknessHorizontal(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Crossbar Height Ratio (0.1 - 0.9):{' '}
                        <input
                          type="number"
                          step={0.05}
                          min={0.1}
                          max={0.9}
                          value={crossHeightRatio}
                          onChange={e => setCrossHeightRatio(Number(e.target.value))}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
              {graphicType === 'customShape' && (
                <>
                  <label>
                    Size (radius in dots):{' '}
                    <input
                      type="number"
                      min={1}
                      value={customSize}
                      onChange={e => setCustomSize(Number(e.target.value))}
                    />
                  </label>
                  <label>Sides: <input type="number" min={3} value={customSides} onChange={e => setCustomSides(Number(e.target.value))} /></label>
                  <label>Rotation (degrees): <input type="number" value={customAngle} onChange={e => setCustomAngle(Number(e.target.value))} /></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={customFilled}
                      onChange={e => setCustomFilled(e.target.checked)}
                    />{' '}
                    Filled (solid)
                  </label>
                </>
              )}
              {graphicType === 'raisedPrintText' && (
                <>
                  {fontLoading && <div style={{ gridColumn: '1 / -1', color: 'var(--text-muted)' }}>Loading print font...</div>}
                  {fontError && <div style={{ gridColumn: '1 / -1', color: '#e55' }}>Error: {fontError}</div>}
                  {!fontLoading && !fontError && (
                    <>
                      <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        Print Text:
                        <input
                          type="text"
                          value={printText}
                          onChange={e => setPrintText(e.target.value)}
                          style={{
                            padding: '8px 10px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        Font Size (dots height):
                        <input
                          type="number"
                          min={6}
                          max={100}
                          value={printFontSize}
                          onChange={e => setPrintFontSize(Number(e.target.value))}
                          style={{
                            padding: '8px 10px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                          }}
                        />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        Letter Style:
                        <select
                          value={printLetterType}
                          onChange={e => setPrintLetterType(e.target.value as 'bubble' | 'thin')}
                          style={{
                            padding: '8px 10px',
                            backgroundColor: 'var(--bg-card)',
                            color: 'var(--text-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                          }}
                        >
                          <option value="bubble">Thick Bubble Letters</option>
                          <option value="thin">Thin Letters (Single Stroke)</option>
                        </select>
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: '1.5rem',
                          opacity: printLetterType === 'thin' ? 0.5 : 1,
                          cursor: printLetterType === 'thin' ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={printTextFilled}
                          disabled={printLetterType === 'thin'}
                          onChange={e => setPrintTextFilled(e.target.checked)}
                        />
                        Filled (Solid block letters)
                      </label>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Preview */}
            <div style={{ flex: 1, border: '1px solid var(--border-color)', padding: '1rem', background: '#fff', color: '#000', overflow: 'auto' }}>
              <div style={{ fontFamily: 'sans-serif', marginBottom: '1rem', fontWeight: 'bold' }}>{preview.summary}</div>
              <div
                className="brf-pages-container"
                style={{
                  '--braille-cell-height': '16px',
                  '--braille-cell-width': '10px',
                  '--braille-cell-gap': '4px',
                  '--braille-dot-size-active': '3.5px',
                  '--braille-dot-size-inactive': '0px',
                  '--braille-line-gap': '6px',
                  overflow: 'visible',
                  maxHeight: 'none',
                } as React.CSSProperties}
              >
                {asciiToUnicodeBraille(preview.brf).split('\n').map((line, lineIdx) => (
                  <div key={lineIdx} className="brf-page-line" style={{ whiteSpace: 'nowrap' }}>
                    {[...line].map((ch, chIdx) => (
                      <BrailleCell key={chIdx} char={ch} showEmptyDots={false} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>

        {graphicType !== 'chart' && (
          <footer className="welcome-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="welcome-btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="welcome-btn-primary"
              onClick={handleInsert}
              disabled={!preview.brf || (graphicType === 'graph' && !!graphPreview?.error)}
            >
              Insert Graphic
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function stampShapeOnGrid(
  grid: boolean[][],
  cx: number,
  cy: number,
  shape: InventoryShapeKind,
  size: number,
  filled: boolean,
  crossParams: {
    lengthHorizontal: number;
    thicknessVertical: number;
    thicknessHorizontal: number;
    heightRatio: number;
  }
): boolean[][] {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  
  const cellsW = Math.ceil(cols / 2);
  const cellsH = Math.ceil(rows / 3);
  
  const canvas = new GraphicCanvas(cellsW, cellsH);
  
  switch (shape) {
    case 'actingMask': canvas.drawActingMask(cx, cy, size, filled); break;
    case 'apple': canvas.drawApple(cx, cy, size, filled); break;
    case 'axe': canvas.drawAxe(cx, cy, size, filled); break;
    case 'beach': canvas.drawBeach(cx, cy, size, filled); break;
    case 'bed': canvas.drawBed(cx, cy, size, filled); break;
    case 'birdHouse': canvas.drawBirdHouse(cx, cy, size, filled); break;
    case 'bowling': canvas.drawBowling(cx, cy, size, filled); break;
    case 'candle': canvas.drawCandle(cx, cy, size, filled); break;
    case 'cat': canvas.drawCat(cx, cy, size, filled); break;
    case 'circle': canvas.drawCircle(cx, cy, size, filled); break;
    case 'cloud': canvas.drawCloud(cx, cy, size, filled); break;
    case 'cloudLightning': canvas.drawCloudLightning(cx, cy, size, filled); break;
    case 'moon': canvas.drawCrescentMoon(cx, cy, size, filled); break;
    case 'cross':
      canvas.drawCross(
        cx,
        cy,
        size,
        crossParams.lengthHorizontal,
        crossParams.thicknessVertical,
        crossParams.thicknessHorizontal,
        crossParams.heightRatio,
        filled
      );
      break;
    case 'dog': canvas.drawDog(cx, cy, size, filled); break;
    case 'flower': canvas.drawFlower(cx, cy, size, filled); break;
    case 'heart': canvas.drawHeart(cx, cy, size, filled); break;
    case 'hiking': canvas.drawHiking(cx, cy, size, filled); break;
    case 'house': canvas.drawHouse(cx, cy, size, filled); break;
    case 'iceSkates': canvas.drawIceSkates(cx, cy, size, filled); break;
    case 'lightning': canvas.drawLightningBolt(cx, cy, size, filled); break;
    case 'movieProjector': canvas.drawMovieProjector(cx, cy, size, filled); break;
    case 'mustache': canvas.drawMustache(cx, cy, size, filled); break;
    case 'paintbrush': canvas.drawPaintbrush(cx, cy, size, filled); break;
    case 'star': canvas.drawStar(cx, cy, size, filled); break;
    case 'vampireFangs': canvas.drawVampireFangs(cx, cy, size, filled); break;
    case 'atom': canvas.drawAtom(cx, cy, size, filled); break;
    case 'dna': canvas.drawDna(cx, cy, size, filled); break;
    case 'leaf': canvas.drawLeaf(cx, cy, size, filled); break;
    case 'fish': canvas.drawFish(cx, cy, size, filled); break;
    case 'butterfly': canvas.drawButterfly(cx, cy, size, filled); break;
    case 'earth': canvas.drawEarth(cx, cy, size, filled); break;
    case 'sun': canvas.drawSun(cx, cy, size, filled); break;
    case 'volcano': canvas.drawVolcano(cx, cy, size, filled); break;
    case 'magnet': canvas.drawMagnet(cx, cy, size, filled); break;
    case 'thermometer': canvas.drawThermometer(cx, cy, size, filled); break;
    case 'beaker': canvas.drawBeaker(cx, cy, size, filled); break;
    case 'microscope': canvas.drawMicroscope(cx, cy, size, filled); break;
    case 'pyramid': canvas.drawPyramid(cx, cy, size, filled); break;
    case 'greekColumn': canvas.drawGreekColumn(cx, cy, size, filled); break;
    case 'castle': canvas.drawCastle(cx, cy, size, filled); break;
    case 'shipSail': canvas.drawShipSail(cx, cy, size, filled); break;
    case 'compassRose': canvas.drawCompassRose(cx, cy, size, filled); break;
    case 'scroll': canvas.drawScroll(cx, cy, size, filled); break;
    case 'libertyBell': canvas.drawLibertyBell(cx, cy, size, filled); break;
    case 'flag': canvas.drawFlag(cx, cy, size, filled); break;
    case 'timeline': canvas.drawTimeline(cx, cy, size, filled); break;
    case 'triangle': canvas.drawTriangle(cx, cy, size, filled); break;
    case 'square': canvas.drawSquare(cx, cy, size, filled); break;
    case 'hexagon': canvas.drawHexagon(cx, cy, size, filled); break;
    case 'cube': canvas.drawCube(cx, cy, size, filled); break;
    case 'cone': canvas.drawCone(cx, cy, size, filled); break;
    case 'cylinder': canvas.drawCylinder(cx, cy, size, filled); break;
    case 'rightTriangle': canvas.drawRightTriangle(cx, cy, size, filled); break;
    case 'angle': canvas.drawAngle(cx, cy, size, filled); break;
    case 'coordinateAxes': canvas.drawCoordinateAxes(cx, cy, size, filled); break;
    case 'pieChart': canvas.drawPieChart(cx, cy, size, filled); break;
  }

  const newGrid = grid.map(row => [...row]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (canvas.data[y] && canvas.data[y][x]) {
        newGrid[y][x] = true;
      }
    }
  }
  return newGrid;
}

const loadPdfJs = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).pdfjsLib) {
      resolve((window as any).pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};
