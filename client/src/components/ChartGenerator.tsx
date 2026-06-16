import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import {
    generateChartBrf,
    buildChartSummaryPlainText,
    buildChartSummaryNemethPlainText,
} from '../utils/chartBraille';
import {
    type ChartKind,
    type ChartSpec,
    CHART_LIMITS,
    validateChartSpec,
    parseCsvRows,
    parseCommaSeparatedNumbers,
} from '../types/chart';
import type { MathCode } from '../hooks/useBraille';

interface ChartGeneratorProps {
    /** Document-wide math mode for LaTeX (`$$…$$`, `\\(…\\)`); persisted in the app. */
    mathCode: MathCode;
    onMathCodeChange: (code: MathCode) => void;
    onInsert: (text: string) => void;
    onClose: () => void;
    inline?: boolean;
}

const STEPS = ['Data', 'Chart type and grid', 'Labels', 'Review'] as const;

/** When delimiter-based pairing fails: first two numbers per line (e.g. tab- or space-separated). */
function tryPairsFromNumericTokens(lines: string[]): { x: number; y: number }[] | null {
    const numRe = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
    const pairs: { x: number; y: number }[] = [];
    for (const line of lines) {
        const matches = [...line.matchAll(numRe)];
        if (matches.length < 2) return null;
        const x = parseFloat(matches[0][0]);
        const y = parseFloat(matches[1][0]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        pairs.push({ x, y });
    }
    return pairs;
}

function buildSpecFromState(
    kind: ChartKind,
    xValues: number[],
    values: number[],
    cellsWidth: number,
    cellsHeight: number,
    title: string,
    xAxisLabel: string,
    yAxisLabel: string
): ChartSpec {
    const spec: ChartSpec = {
        kind,
        xValues,
        values,
        cellsWidth,
        cellsHeight,
    };
    const t = title.trim();
    const x = xAxisLabel.trim();
    const y = yAxisLabel.trim();
    if (t) spec.title = t;
    if (x) spec.xAxisLabel = x;
    if (y) spec.yAxisLabel = y;
    return spec;
}

export function ChartGenerator({
    mathCode,
    onMathCodeChange,
    onInsert,
    onClose,
    inline,
}: ChartGeneratorProps) {
    const [step, setStep] = useState(0);
    const [chartType, setChartType] = useState<ChartKind>('line');
    const [cellsWidth, setCellsWidth] = useState(30);
    const [cellsHeight, setCellsHeight] = useState(15);

    /** Comma-separated X and Y; empty X defaults to 0, 1, 2, … in buildDataFromInputs. */
    const [dataXInput, setDataXInput] = useState('');
    const [dataYInput, setDataYInput] = useState('');
    const [csvPaste, setCsvPaste] = useState('');
    const [title, setTitle] = useState('');
    const [xAxisLabel, setXAxisLabel] = useState('');
    const [yAxisLabel, setYAxisLabel] = useState('');

    const [liveMessage, setLiveMessage] = useState('');
    const [fieldErrors, setFieldErrors] = useState<string[]>([]);

    const firstFieldRef = useRef<HTMLTextAreaElement>(null);

    const announce = useCallback((msg: string) => {
        setLiveMessage(msg);
    }, []);

    useEffect(() => {
        firstFieldRef.current?.focus();
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    function buildDataFromInputs(): {
        xValues: number[];
        values: number[];
        parseErrors: string[];
    } {
        const yParsed = parseCommaSeparatedNumbers(dataYInput);
        const xParsed = parseCommaSeparatedNumbers(dataXInput);
        const parseErrors = [...yParsed.errors, ...xParsed.errors];
        const values = yParsed.numbers;
        if (values.length === 0) {
            return { xValues: [], values: [], parseErrors };
        }
        let xValues: number[];
        if (xParsed.numbers.length === 0) {
            xValues = values.map((_, i) => i);
        } else if (xParsed.numbers.length !== values.length) {
            parseErrors.push(
                `X has ${xParsed.numbers.length} number(s) and Y has ${values.length}. Counts must match, or leave X empty for 0, 1, 2, …`
            );
            xValues = [];
        } else {
            xValues = xParsed.numbers;
        }
        return { xValues, values, parseErrors };
    }

    function getSpecForValidation(): ChartSpec {
        const { xValues, values } = buildDataFromInputs();
        return buildSpecFromState(
            chartType,
            xValues,
            values,
            cellsWidth,
            cellsHeight,
            title,
            xAxisLabel,
            yAxisLabel
        );
    }

    function goNext() {
        setFieldErrors([]);
        if (step === 0) {
            const { values, parseErrors } = buildDataFromInputs();
            if (parseErrors.length > 0) {
                setFieldErrors(parseErrors);
                announce(parseErrors.join(' '));
                return;
            }
            const spec = getSpecForValidation();
            const v = validateChartSpec(spec);
            if (!v.ok) {
                setFieldErrors(v.errors);
                announce(v.errors.join(' '));
                return;
            }
            announce(`Data OK. ${values.length} points.`);
        }
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }

    function goBack() {
        setFieldErrors([]);
        setStep((s) => Math.max(s - 1, 0));
    }

    function applyCsv() {
        const lines = csvPaste
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        const pairRows: { x: number; y: number }[] = [];
        let everyLineIsTwoNumbers = lines.length > 0;

        for (const line of lines) {
            const cells = line.split(/[,;\t]/).map((c) => c.trim()).filter((c) => c !== '');
            if (cells.length >= 2) {
                const x = parseFloat(cells[0]);
                const y = parseFloat(cells[1]);
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    pairRows.push({ x, y });
                } else {
                    everyLineIsTwoNumbers = false;
                }
            } else {
                everyLineIsTwoNumbers = false;
            }
        }

        if (everyLineIsTwoNumbers && pairRows.length === lines.length) {
            setDataXInput(pairRows.map((p) => String(p.x)).join(', '));
            setDataYInput(pairRows.map((p) => String(p.y)).join(', '));
            setFieldErrors([]);
            announce(`${pairRows.length} points loaded (two columns: X, Y).`);
            setCsvPaste('');
            return;
        }

        const tokenPairs = tryPairsFromNumericTokens(lines);
        if (tokenPairs && tokenPairs.length === lines.length) {
            setDataXInput(tokenPairs.map((p) => String(p.x)).join(', '));
            setDataYInput(tokenPairs.map((p) => String(p.y)).join(', '));
            setFieldErrors([]);
            announce(`${tokenPairs.length} points loaded (X, Y from each line).`);
            setCsvPaste('');
            return;
        }

        const { values, rowCount, error } = parseCsvRows(csvPaste);
        if (values.length === 0) {
            const msg = error ?? 'No numbers found in pasted text.';
            setFieldErrors([msg]);
            announce(msg);
            return;
        }
        setDataXInput('');
        setDataYInput(values.map(String).join(', '));
        setFieldErrors([]);
        announce(`${values.length} Y values loaded from ${rowCount} row(s). X left empty (0, 1, 2, …).`);
        setCsvPaste('');
    }

    function handleInsert() {
        const { parseErrors } = buildDataFromInputs();
        if (parseErrors.length > 0) {
            setFieldErrors(parseErrors);
            announce(parseErrors.join(' '));
            setStep(0);
            return;
        }
        const spec = getSpecForValidation();
        const v = validateChartSpec(spec);
        if (!v.ok) {
            setFieldErrors(v.errors);
            announce(v.errors.join(' '));
            setStep(0);
            return;
        }
        const brf = generateChartBrf(spec);
        const summary =
            mathCode === 'nemeth'
                ? buildChartSummaryNemethPlainText(spec)
                : buildChartSummaryPlainText(spec);
        const pageBreakBeforeChart = mathCode === 'nemeth' ? '\n\n\f\n\n' : '\n\n';
        const block = `${summary}${pageBreakBeforeChart}:::chart\n${brf}\n:::\n`;
        onInsert(block);
    }

    const reviewSpec = getSpecForValidation();
    const reviewValidation = validateChartSpec(reviewSpec);
    const reviewSummaryPreview =
        reviewValidation.ok && reviewSpec.values.length > 0
            ? mathCode === 'nemeth'
                ? buildChartSummaryNemethPlainText(reviewSpec)
                : buildChartSummaryPlainText(reviewSpec)
            : '';

    const inputStyle: CSSProperties = {
        padding: '6px 8px',
        width: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'var(--bg-card)',
        color: 'var(--text-color)',
        border: '1px solid var(--border-color)',
    };

    const labelStyle: CSSProperties = {
        display: 'block',
        marginBottom: '6px',
        fontWeight: 'bold',
    };

    const content = (
        <div style={inline ? { display: 'flex', flexDirection: 'column', height: '100%', padding: '20px' } : undefined}>
            {!inline && (
                <header className="welcome-header">
                    <h2 id="chart-gen-title">Data-to-Braille Chart Generator</h2>
                    <button
                        type="button"
                        className="welcome-close"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </header>
            )}

            <div aria-live="polite" style={{ fontSize: '0.82rem', minHeight: '1.25em', marginBottom: '8px', opacity: 0.92 }}>
                {liveMessage ? <span>Status: {liveMessage}</span> : <span aria-hidden> </span>}
            </div>

                <div className="welcome-body" style={{ flex: 1, padding: inline ? 0 : '20px' }}>
                    <p
                        style={{
                            marginTop: 0,
                            marginBottom: '12px',
                            fontSize: '0.9rem',
                            color: 'var(--text-color)',
                            opacity: 0.85,
                        }}
                    >
                        Step {step + 1} of {STEPS.length}: {STEPS[step]}. Chart graphics use
                        low-resolution 6-dot cells; a plain-text summary is inserted with each chart
                        so exact values stay available for reading and embossing.
                    </p>

                    <ol
                        aria-label="Progress"
                        style={{
                            margin: '0 0 16px 0',
                            paddingLeft: '1.25rem',
                            fontSize: '0.85rem',
                            opacity: 0.9,
                        }}
                    >
                        {STEPS.map((name, i) => (
                            <li
                                key={name}
                                style={{
                                    fontWeight: i === step ? 700 : 400,
                                }}
                            >
                                {name}
                            </li>
                        ))}
                    </ol>

                    {fieldErrors.length > 0 && (
                        <div
                            role="alert"
                            style={{
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-card)',
                            }}
                        >
                            {fieldErrors.map((err) => (
                                <div key={err}>{err}</div>
                            ))}
                        </div>
                    )}

                    {step === 0 && (
                        <div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-data-x" style={labelStyle}>
                                    X values (comma-separated, optional)
                                </label>
                                <textarea
                                    id="chart-data-x"
                                    rows={2}
                                    value={dataXInput}
                                    onChange={(e) => setDataXInput(e.target.value)}
                                    placeholder="e.g. 1990, 2000, 2010 — or leave empty for 0, 1, 2, …"
                                    aria-describedby="chart-data-x-hint"
                                    style={{
                                        ...inputStyle,
                                        fontFamily: 'monospace',
                                        resize: 'vertical',
                                    }}
                                />
                                <p
                                    id="chart-data-x-hint"
                                    style={{
                                        margin: '6px 0 0 0',
                                        fontSize: '0.82rem',
                                        opacity: 0.85,
                                    }}
                                >
                                    If provided, must have the same count as Y. Empty uses 0, 1, 2, … in order.
                                </p>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-data-y" style={labelStyle}>
                                    Y values (comma-separated)
                                </label>
                                <textarea
                                    ref={firstFieldRef}
                                    id="chart-data-y"
                                    rows={3}
                                    value={dataYInput}
                                    onChange={(e) => setDataYInput(e.target.value)}
                                    placeholder="e.g. 10, 25, 18"
                                    style={{
                                        ...inputStyle,
                                        fontFamily: 'monospace',
                                        resize: 'vertical',
                                    }}
                                />
                            </div>

                            <div>
                                <label htmlFor="chart-csv-paste" style={labelStyle}>
                                    Optional: paste CSV — one Y per line, or two columns (X, Y) per line
                                </label>
                                <textarea
                                    id="chart-csv-paste"
                                    rows={3}
                                    value={csvPaste}
                                    onChange={(e) => setCsvPaste(e.target.value)}
                                    placeholder="e.g. 10, 20, 30 or two columns: 1, 10 / 2, 20"
                                    style={{
                                        ...inputStyle,
                                        fontFamily: 'monospace',
                                        resize: 'vertical',
                                    }}
                                />
                                <button
                                    type="button"
                                    className="welcome-btn-secondary"
                                    style={{ marginTop: '8px' }}
                                    onClick={applyCsv}
                                >
                                    Load from pasted text
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div>
                            <div style={{ marginBottom: '15px' }}>
                                <label htmlFor="chart-type-select" style={labelStyle}>
                                    Chart type
                                </label>
                                <select
                                    id="chart-type-select"
                                    value={chartType}
                                    onChange={(e) =>
                                        setChartType(e.target.value as ChartKind)
                                    }
                                    style={inputStyle}
                                >
                                    <option value="line">Line chart</option>
                                    <option value="bar">Bar chart</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label htmlFor="chart-width" style={labelStyle}>
                                        Width (cells, {CHART_LIMITS.cellsWidth.min}–
                                        {CHART_LIMITS.cellsWidth.max})
                                    </label>
                                    <input
                                        id="chart-width"
                                        type="number"
                                        min={CHART_LIMITS.cellsWidth.min}
                                        max={CHART_LIMITS.cellsWidth.max}
                                        value={cellsWidth}
                                        onChange={(e) =>
                                            setCellsWidth(parseInt(e.target.value, 10) || CHART_LIMITS.cellsWidth.min)
                                        }
                                        style={inputStyle}
                                    />
                                </div>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label htmlFor="chart-height" style={labelStyle}>
                                        Height (lines, {CHART_LIMITS.cellsHeight.min}–
                                        {CHART_LIMITS.cellsHeight.max})
                                    </label>
                                    <input
                                        id="chart-height"
                                        type="number"
                                        min={CHART_LIMITS.cellsHeight.min}
                                        max={CHART_LIMITS.cellsHeight.max}
                                        value={cellsHeight}
                                        onChange={(e) =>
                                            setCellsHeight(parseInt(e.target.value, 10) || CHART_LIMITS.cellsHeight.min)
                                        }
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                            <fieldset
                                style={{
                                    marginTop: '16px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    padding: '12px',
                                }}
                            >
                                <legend style={{ fontSize: '0.85rem', padding: '0 6px' }}>
                                    LaTeX math (Nemeth vs UEB)
                                </legend>
                                <p
                                    style={{
                                        fontSize: '0.82rem',
                                        marginTop: 0,
                                        marginBottom: '10px',
                                        opacity: 0.9,
                                    }}
                                >
                                    Applies when the editor translates <code>$$…$$</code> and{' '}
                                    <code>{`\\(`}…{`\\)`}</code>. This choice is saved for the app and
                                    used for the whole document. With <strong>Nemeth</strong>, numeric lines
                                    use <code>$$…$$</code> blocks (kind and title stay literary), and a form
                                    feed places the graphic on the following page; with{' '}
                                    <strong>UEB math</strong>, the summary stays plain prose above the chart
                                    on the same page sequence.
                                </p>
                                <div role="radiogroup" aria-label="Math braille code for LaTeX">
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            marginBottom: '8px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="chart-math-code"
                                            checked={mathCode === 'nemeth'}
                                            onChange={() => onMathCodeChange('nemeth')}
                                        />
                                        <span>
                                            <strong>Nemeth</strong> — US math notation (often wrapped for
                                            UEB literary context)
                                        </span>
                                    </label>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="chart-math-code"
                                            checked={mathCode === 'ueb'}
                                            onChange={() => onMathCodeChange('ueb')}
                                        />
                                        <span>
                                            <strong>UEB math</strong> — Unified English Braille math
                                        </span>
                                    </label>
                                </div>
                            </fieldset>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-title" style={labelStyle}>
                                    Title (optional)
                                </label>
                                <input
                                    id="chart-title"
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-x-label" style={labelStyle}>
                                    X-axis label (optional)
                                </label>
                                <input
                                    id="chart-x-label"
                                    type="text"
                                    value={xAxisLabel}
                                    onChange={(e) => setXAxisLabel(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                            <div>
                                <label htmlFor="chart-y-label" style={labelStyle}>
                                    Y-axis label (optional)
                                </label>
                                <input
                                    id="chart-y-label"
                                    type="text"
                                    value={yAxisLabel}
                                    onChange={(e) => setYAxisLabel(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div>
                            <h3
                                style={{
                                    margin: '0 0 8px 0',
                                    fontSize: '1rem',
                                }}
                            >
                                Review — text summary to insert
                            </h3>
                            <p style={{ fontSize: '0.88rem', opacity: 0.9, marginTop: 0 }}>
                                {mathCode === 'nemeth' ? (
                                    <>
                                        Nemeth layout below: kind and title lines are literary; grid, range,
                                        axes, and each value pair use <code>$$…$$</code>. The chart starts on
                                        the next page after a form feed. LaTeX math elsewhere uses Nemeth
                                        (set on step 2).
                                    </>
                                ) : (
                                    <>
                                        Plain English below will appear above the tactile chart and will be
                                        translated with your literary table like the rest of the document.
                                        LaTeX math in the file uses UEB math (set on step 2).
                                    </>
                                )}
                            </p>
                            {reviewValidation.ok && reviewSummaryPreview ? (
                                <pre
                                    style={{
                                        ...inputStyle,
                                        whiteSpace: 'pre-wrap',
                                        maxHeight: '220px',
                                        overflow: 'auto',
                                        fontSize: '0.85rem',
                                    }}
                                >
                                    {reviewSummaryPreview}
                                </pre>
                            ) : (
                                <p role="alert">Fix data on step 1 before inserting.</p>
                            )}
                        </div>
                    )}
                </div>

                <footer
                    className="welcome-footer"
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {step > 0 && (
                            <button
                                type="button"
                                className="welcome-btn-secondary"
                                onClick={goBack}
                            >
                                Back
                            </button>
                        )}
                        {step < STEPS.length - 1 && (
                            <button
                                type="button"
                                className="welcome-btn-primary"
                                onClick={goNext}
                            >
                                Next
                            </button>
                        )}
                    </div>
                    {step === STEPS.length - 1 && (
                        <button
                            type="button"
                            className="welcome-btn-primary"
                            onClick={handleInsert}
                            disabled={!reviewValidation.ok}
                        >
                            Insert chart and summary
                        </button>
                    )}
                </footer>
        </div>
    );

    if (inline) {
        return content;
    }

    return (
        <div
            className="welcome-overlay"
            onClick={onClose}
            aria-label="Close chart generator"
        >
            <div
                className="welcome-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chart-gen-title"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '560px' }}
            >
                {content}
            </div>
        </div>
    );
}
