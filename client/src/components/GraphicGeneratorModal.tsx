import { useState, useMemo, useEffect, useCallback } from 'react';
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
  type GraphicResult,
  type InventoryShapeKind
} from '../utils/graphicBraille';
import {
  DRAWING_TOOLS,
  MATH_TOOLS,
  SHAPE_CATEGORY_LABELS,
  SHAPES_SECTION_CATEGORIES,
  getShapeEntry,
  searchGraphicsCatalog,
  searchHitChip,
  searchHitLabel,
  shapesInCategory,
  type GraphicsSection,
  type SearchHit,
  type ShapeCatalogCategory,
} from '../utils/shapeCatalog';
import { generateEquationGraph } from '../utils/graphEquation';
import { asciiToUnicodeBraille } from '../utils/braille';
import { BrailleCell } from './BrailleCell';
import { TactileDesignCanvas } from './TactileDesignCanvas';
import { parse } from 'opentype.js';
import fontUrl from '@fontsource/open-sans/files/open-sans-latin-700-normal.woff?url';
import { DEFAULT_TABLE } from '../utils/tableRegistry';

interface GraphicGeneratorModalProps {
  mathCode: MathCode;
  onMathCodeChange: (code: MathCode) => void;
  defaultCellsPerRow: number;
  defaultLinesPerPage: number;
  brailleTable?: string;
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
  brailleTable = DEFAULT_TABLE,
  onInsert,
  onClose
}: GraphicGeneratorModalProps) {
  const [graphicType, setGraphicType] = useState<GraphicType>('clock');
  const [section, setSection] = useState<GraphicsSection>('math');
  const [shapesCategory, setShapesCategory] = useState<Exclude<ShapeCatalogCategory, 'math'>>('basics');
  const [searchQuery, setSearchQuery] = useState('');
  const [tactilePreview, setTactilePreview] = useState<GraphicResult>({ brf: '', summary: '' });
  const handleTactilePreview = useCallback((p: GraphicResult) => setTactilePreview(p), []);

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

  const searchHits = useMemo(() => searchGraphicsCatalog(searchQuery), [searchQuery]);

  const selectMathTool = (id: (typeof MATH_TOOLS)[number]['id']) => {
    setSection('math');
    setGraphicType(id);
    setSearchQuery('');
  };

  const selectMathQuickShape = (kind: InventoryShapeKind) => {
    setSection('math');
    setGraphicType('shapeInventory');
    setInventoryShape(kind);
    setSearchQuery('');
  };

  const selectShapesCategory = (cat: Exclude<ShapeCatalogCategory, 'math'>) => {
    setSection('shapes');
    setShapesCategory(cat);
    setGraphicType('shapeInventory');
    const first = shapesInCategory(cat)[0];
    if (first && getShapeEntry(inventoryShape)?.category !== cat) {
      setInventoryShape(first.kind);
    }
    setSearchQuery('');
  };

  const selectCustomShape = () => {
    setSection('shapes');
    setGraphicType('customShape');
    setSearchQuery('');
  };

  const selectDrawingTool = (id: (typeof DRAWING_TOOLS)[number]['id']) => {
    setSection('drawing');
    setGraphicType(id);
    setSearchQuery('');
  };

  const applySearchHit = (hit: SearchHit) => {
    switch (hit.kind) {
      case 'mathTool':
        selectMathTool(hit.tool.id);
        break;
      case 'mathQuickShape':
        selectMathQuickShape(hit.shape.kind);
        break;
      case 'shape':
        if (hit.shape.category === 'math') {
          selectMathQuickShape(hit.shape.kind);
        } else {
          setSection('shapes');
          setShapesCategory(hit.shape.category as Exclude<ShapeCatalogCategory, 'math'>);
          setGraphicType('shapeInventory');
          setInventoryShape(hit.shape.kind);
          setSearchQuery('');
        }
        break;
      case 'customShape':
        selectCustomShape();
        break;
      case 'drawing':
        selectDrawingTool(hit.tool.id);
        break;
    }
  };

  const mathQuickShapes = shapesInCategory('math');
  const shapesCatalogForSection = shapesInCategory(shapesCategory);
  const showingMathQuickShapes = section === 'math' && graphicType === 'shapeInventory';
  const showingShapesCatalog = section === 'shapes' && graphicType === 'shapeInventory';

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    textAlign: 'left',
    textTransform: 'none',
    fontWeight: active ? 700 : 500,
    opacity: active ? 1 : 0.9,
  });

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
      case 'photo':
        preview = tactilePreview;
        break;
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
        <header className="welcome-header" style={{ flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <h2 style={{ margin: 0, flex: '1 1 auto' }}>Tactile Graphics Generator</h2>
          <label style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '360px' }}>
            <span className="visually-hidden">Search graphics</span>
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tools and shapes…"
              aria-label="Search tools and shapes"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-card)',
                color: 'var(--text-color)',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <button className="welcome-close" onClick={onClose}>✕</button>
          {searchQuery.trim() && (
            <div
              role="listbox"
              aria-label="Search results"
              style={{
                flex: '1 1 100%',
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                background: 'var(--bg-card)',
                padding: '0.35rem',
              }}
            >
              {searchHits.length === 0 ? (
                <div style={{ padding: '0.5rem', opacity: 0.75 }}>No matches</div>
              ) : (
                searchHits.map((hit, i) => (
                  <button
                    key={`${searchHitChip(hit)}-${searchHitLabel(hit)}-${i}`}
                    type="button"
                    role="option"
                    className="toolbar-btn"
                    onClick={() => applySearchHit(hit)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      marginBottom: '0.25rem',
                      textTransform: 'none',
                    }}
                  >
                    <span>{searchHitLabel(hit)}</span>
                    <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>{searchHitChip(hit)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: graphicType === 'photo' ? 0 : '400px', overflow: 'hidden' }}>
          {/* Sidebar: Math / Shapes / Drawing */}
          <div style={{ width: '220px', borderRight: '1px solid var(--border-color)', padding: '1rem', overflowY: 'auto', flexShrink: 0 }}>
            <section style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 }}>Math</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {MATH_TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`toolbar-btn ${section === 'math' && graphicType === tool.id ? 'toolbar-btn--active' : ''}`}
                    onClick={() => selectMathTool(tool.id)}
                    style={navBtnStyle(section === 'math' && graphicType === tool.id)}
                  >
                    {tool.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`toolbar-btn ${showingMathQuickShapes ? 'toolbar-btn--active' : ''}`}
                  onClick={() => {
                    const current = getShapeEntry(inventoryShape);
                    selectMathQuickShape(current?.category === 'math' ? inventoryShape : 'triangle');
                  }}
                  style={navBtnStyle(showingMathQuickShapes)}
                >
                  Quick shapes
                </button>
              </div>
            </section>

            <section style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 }}>Shapes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {SHAPES_SECTION_CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    className={`toolbar-btn ${showingShapesCatalog && shapesCategory === cat ? 'toolbar-btn--active' : ''}`}
                    onClick={() => selectShapesCategory(cat)}
                    style={navBtnStyle(showingShapesCatalog && shapesCategory === cat)}
                  >
                    {SHAPE_CATEGORY_LABELS[cat]}
                  </button>
                ))}
                <button
                  type="button"
                  className={`toolbar-btn ${section === 'shapes' && graphicType === 'customShape' ? 'toolbar-btn--active' : ''}`}
                  onClick={selectCustomShape}
                  style={navBtnStyle(section === 'shapes' && graphicType === 'customShape')}
                >
                  Custom polygon
                </button>
              </div>
            </section>

            <section>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.75 }}>Drawing</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {DRAWING_TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`toolbar-btn ${section === 'drawing' && graphicType === tool.id ? 'toolbar-btn--active' : ''}`}
                    onClick={() => selectDrawingTool(tool.id)}
                    style={navBtnStyle(section === 'drawing' && graphicType === tool.id)}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            </section>
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
            <TactileDesignCanvas
              defaultCellsPerRow={defaultCellsPerRow}
              defaultLinesPerPage={defaultLinesPerPage}
              brailleTable={brailleTable}
              mathCode={mathCode}
              onPreviewChange={handleTactilePreview}
            />
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
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
                      {showingMathQuickShapes
                        ? 'Math · Quick shapes'
                        : `Shapes · ${SHAPE_CATEGORY_LABELS[shapesCategory]}`}
                    </div>
                    <div
                      role="listbox"
                      aria-label={showingMathQuickShapes ? 'Math quick shapes' : `${SHAPE_CATEGORY_LABELS[shapesCategory]} shapes`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '0.4rem',
                      }}
                    >
                      {(showingMathQuickShapes ? mathQuickShapes : shapesCatalogForSection).map(shape => {
                        const active = inventoryShape === shape.kind;
                        return (
                          <button
                            key={shape.kind}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`toolbar-btn ${active ? 'toolbar-btn--active' : ''}`}
                            onClick={() => setInventoryShape(shape.kind)}
                            style={{ textTransform: 'none', textAlign: 'center', padding: '0.45rem 0.35rem' }}
                          >
                            {shape.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}>
                      Selected: {getShapeEntry(inventoryShape)?.label ?? inventoryShape}
                      {getShapeEntry(inventoryShape) ? ` · ${SHAPE_CATEGORY_LABELS[getShapeEntry(inventoryShape)!.category]}` : ''}
                    </div>
                  </div>
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

