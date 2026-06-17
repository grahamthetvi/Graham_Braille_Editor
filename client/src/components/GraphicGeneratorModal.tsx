import { useState, useMemo } from 'react';
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
  type GraphicResult,
  type InventoryShapeKind
} from '../utils/graphicBraille';
import { generateEquationGraph } from '../utils/graphEquation';
import { asciiToUnicodeBraille } from '../utils/braille';
import { BrailleCell } from './BrailleCell';

interface GraphicGeneratorModalProps {
  mathCode: MathCode;
  onMathCodeChange: (code: MathCode) => void;
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
  | 'graph'
  | 'chart';

export function GraphicGeneratorModal({ mathCode, onMathCodeChange, onInsert, onClose }: GraphicGeneratorModalProps) {
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
        style={{ maxWidth: '1000px', display: 'flex', flexDirection: 'column' }}
      >
        <header className="welcome-header">
          <h2>Tactile Graphics Generator</h2>
          <button className="welcome-close" onClick={onClose}>✕</button>
        </header>

        <div style={{ display: 'flex', flex: 1, minHeight: '400px' }}>
          {/* Sidebar */}
          <div style={{ width: '200px', borderRight: '1px solid var(--border-color)', padding: '1rem' }}>
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
                      <option value="circle">Circle</option>
                      <option value="heart">Heart</option>
                      <option value="cloud">Cloud</option>
                      <option value="moon">Crescent Moon</option>
                      <option value="lightning">Lightning Bolt</option>
                      <option value="star">Star (5-Pointed)</option>
                      <option value="apple">Apple</option>
                      <option value="cross">Cross</option>
                      <option value="flower">Flower</option>
                      <option value="iceSkates">Ice Skating Skates</option>
                      <option value="vampireFangs">Vampire Fangs</option>
                      <option value="paintbrush">Paintbrush</option>
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
              disabled={graphicType === 'graph' && (!preview.brf || !!graphPreview?.error)}
            >
              Insert Graphic
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
