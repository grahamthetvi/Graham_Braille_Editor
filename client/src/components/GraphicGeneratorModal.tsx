import { useState, useEffect } from 'react';
import { ChartGenerator } from './ChartGenerator';
import type { MathCode } from '../hooks/useBraille';
import {
  generateClock,
  generateFraction,
  generateNumberLine,
  generateBase10,
  generateManipulatives,
  generatePolygon,
  generateSimpleShape,
  type GraphicResult,
  type SimpleShapeKind
} from '../utils/graphicBraille';

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
  | 'simpleShape'
  | 'polygon'
  | 'chart';

export function GraphicGeneratorModal({ mathCode, onMathCodeChange, onInsert, onClose }: GraphicGeneratorModalProps) {
  const [graphicType, setGraphicType] = useState<GraphicType>('clock');
  const [preview, setPreview] = useState<GraphicResult>({ brf: '', summary: '' });

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

  // Preset shapes (circle, heart) — size is radius in braille dots (same unit as polygon)
  const [presetShape, setPresetShape] = useState<SimpleShapeKind>('circle');
  const [presetSize, setPresetSize] = useState(15);
  const [presetFilled, setPresetFilled] = useState(false);

  // Polygon state
  const [polyRadius, setPolyRadius] = useState(15);
  const [polySides, setPolySides] = useState(3);
  const [polyAngle, setPolyAngle] = useState(0);
  const [polyFilled, setPolyFilled] = useState(false);

  useEffect(() => {
    if (graphicType === 'chart') return;
    let result: GraphicResult = { brf: '', summary: '' };
    switch (graphicType) {
      case 'clock':
        result = generateClock(clockRadius, clockHours, clockMinutes);
        break;
      case 'fraction':
        result = generateFraction(fractionRadius, fractionNum, fractionDen);
        break;
      case 'numberLine':
        result = generateNumberLine(nlLength, nlStart, nlEnd, nlStep, nlVertical);
        break;
      case 'base10':
        result = generateBase10(b10Hundreds, b10Tens, b10Ones);
        break;
      case 'manipulatives':
        result = generateManipulatives(manRows, manCols, manSpacing);
        break;
      case 'simpleShape':
        result = generateSimpleShape(presetShape, presetSize, presetFilled);
        break;
      case 'polygon':
        result = generatePolygon(polyRadius, polySides, polyAngle, polyFilled);
        break;
    }
    setPreview(result);
  }, [
    graphicType,
    clockRadius, clockHours, clockMinutes,
    fractionRadius, fractionNum, fractionDen,
    nlLength, nlStart, nlEnd, nlStep, nlVertical,
    b10Hundreds, b10Tens, b10Ones,
    manRows, manCols, manSpacing,
    presetShape, presetSize, presetFilled,
    polyRadius, polySides, polyAngle, polyFilled
  ]);

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
                  'simpleShape',
                  'polygon',
                  'chart'
                ] as GraphicType[]
              ).map(type => (
                <button
                  key={type}
                  className={`toolbar-btn ${graphicType === type ? 'toolbar-btn--active' : ''}`}
                  onClick={() => setGraphicType(type)}
                  style={{ textAlign: 'left', textTransform: 'capitalize' }}
                >
                  {type === 'simpleShape'
                    ? 'Circle / heart'
                    : type.replace(/([A-Z])/g, ' $1').trim()}
                </button>
              ))}
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
              {graphicType === 'simpleShape' && (
                <>
                  <label style={{ gridColumn: '1 / -1' }}>
                    Shape:{' '}
                    <select
                      value={presetShape}
                      onChange={e => setPresetShape(e.target.value as SimpleShapeKind)}
                    >
                      <option value="circle">Circle</option>
                      <option value="heart">Heart</option>
                    </select>
                  </label>
                  <label>
                    Size (radius in dots):{' '}
                    <input
                      type="number"
                      min={1}
                      value={presetSize}
                      onChange={e => setPresetSize(Number(e.target.value))}
                    />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={presetFilled}
                      onChange={e => setPresetFilled(e.target.checked)}
                    />{' '}
                    Filled (solid)
                  </label>
                </>
              )}
              {graphicType === 'polygon' && (
                <>
                  <label>
                    Size (radius in dots):{' '}
                    <input
                      type="number"
                      min={1}
                      value={polyRadius}
                      onChange={e => setPolyRadius(Number(e.target.value))}
                    />
                  </label>
                  <label>Sides: <input type="number" min={3} value={polySides} onChange={e => setPolySides(Number(e.target.value))} /></label>
                  <label>Rotation (degrees): <input type="number" value={polyAngle} onChange={e => setPolyAngle(Number(e.target.value))} /></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={polyFilled}
                      onChange={e => setPolyFilled(e.target.checked)}
                    />{' '}
                    Filled (solid)
                  </label>
                </>
              )}
            </div>

            {/* Preview */}
            <div style={{ flex: 1, border: '1px solid var(--border-color)', padding: '1rem', background: '#fff', color: '#000', overflow: 'auto' }}>
              <div style={{ fontFamily: 'sans-serif', marginBottom: '1rem', fontWeight: 'bold' }}>{preview.summary}</div>
              <pre style={{ fontFamily: 'monospace', margin: 0, lineHeight: 1.2 }}>{preview.brf}</pre>
            </div>
          </div>
          )}
        </div>

        {graphicType !== 'chart' && (
          <footer className="welcome-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button className="welcome-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="welcome-btn-primary" onClick={handleInsert}>Insert Graphic</button>
          </footer>
        )}
      </div>
    </div>
  );
}
