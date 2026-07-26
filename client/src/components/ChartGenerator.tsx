import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { generateChartBrf } from '../utils/chartBraille';
import {
    type ChartKind,
    type ChartSpec,
    type ChartValidationResult,
    CHART_LIMITS,
    parseCsvRows,
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

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Step keys used to look up `chart.steps.*` for display text at render time. */
const STEP_KEYS = ['data', 'chartTypeAndGrid', 'labels', 'review'] as const;

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

/**
 * Locale-aware mirror of `parseCommaSeparatedNumbers` (types/chart.ts); reimplemented here so
 * the "Invalid number" message is translated instead of using the utility's fixed English text.
 */
function parseCommaSeparatedNumbersT(s: string, t: TFn): { numbers: number[]; errors: string[] } {
    const trimmed = s.trim();
    if (!trimmed) return { numbers: [], errors: [] };
    const parts = trimmed.split(',').map((p) => p.trim());
    const numbers: number[] = [];
    const errors: string[] = [];
    for (const part of parts) {
        if (part === '') continue;
        const n = parseFloat(part);
        if (!Number.isFinite(n)) {
            errors.push(t('chart.messages.invalidNumber', { value: part }));
        } else {
            numbers.push(n);
        }
    }
    return { numbers, errors };
}

/**
 * Locale-aware mirror of `validateChartSpec` (types/chart.ts). `CHART_LIMITS` values are baked
 * into the `en.json` strings as literal numbers (they are fixed constants), so no interpolation
 * is needed for the range messages.
 */
function validateChartSpecT(spec: ChartSpec, t: TFn): ChartValidationResult {
    const errors: string[] = [];

    if (!spec.values.length) {
        errors.push(t('chart.messages.addAtLeastOnePoint'));
    } else if (spec.values.length > CHART_LIMITS.maxPoints) {
        errors.push(t('chart.messages.tooManyPoints'));
    }

    if (spec.values.length !== spec.xValues.length) {
        errors.push(t('chart.messages.xyCountMismatch'));
    }

    spec.values.forEach((v, i) => {
        if (!Number.isFinite(v)) {
            errors.push(t('chart.messages.invalidYAt', { index: i + 1 }));
        }
    });

    spec.xValues.forEach((v, i) => {
        if (!Number.isFinite(v)) {
            errors.push(t('chart.messages.invalidXAt', { index: i + 1 }));
        }
    });

    const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
    if (!inRange(spec.cellsWidth, CHART_LIMITS.cellsWidth.min, CHART_LIMITS.cellsWidth.max)) {
        errors.push(t('chart.messages.widthRange'));
    }
    if (!inRange(spec.cellsHeight, CHART_LIMITS.cellsHeight.min, CHART_LIMITS.cellsHeight.max)) {
        errors.push(t('chart.messages.heightRange'));
    }

    return { ok: errors.length === 0, errors };
}

/** Locale-aware mirror of `buildChartSummaryPlainText` (utils/chartBraille.ts). */
function buildChartSummaryPlainTextT(spec: ChartSpec, t: TFn): string {
    const v = spec.values;
    if (v.length === 0) return '';

    const kindLabel = t(spec.kind === 'line' ? 'chart.summary.lineChart' : 'chart.summary.barChart');
    const lines: string[] = [];

    const title = spec.title?.trim();
    lines.push(
        title
            ? t(spec.kind === 'line' ? 'chart.summary.lineChartTitled' : 'chart.summary.barChartTitled', { title })
            : kindLabel
    );
    lines.push(t('chart.summary.grid', { width: spec.cellsWidth, height: spec.cellsHeight, count: v.length }));

    const min = Math.min(...v);
    const max = Math.max(...v);
    lines.push(t('chart.summary.range', { min, max }));

    const yl = spec.yAxisLabel?.trim();
    const xl = spec.xAxisLabel?.trim();
    if (yl || xl) {
        const parts: string[] = [];
        if (yl) parts.push(t('chart.summary.yAxis', { label: yl }));
        if (xl) parts.push(t('chart.summary.xAxis', { label: xl }));
        lines.push(parts.join(' '));
    }

    const xv = spec.xValues;
    lines.push(t('chart.summary.valuesHeading'));
    v.forEach((n, i) => {
        lines.push(t('chart.summary.valueRow', { x: xv[i], y: n }));
    });

    return lines.join('\n');
}

/** Locale-aware mirror of `buildChartSummaryNemethPlainText` (utils/chartBraille.ts). */
function buildChartSummaryNemethPlainTextT(spec: ChartSpec, t: TFn): string {
    const v = spec.values;
    if (v.length === 0) return '';

    const kindLabel = t(spec.kind === 'line' ? 'chart.summary.lineChart' : 'chart.summary.barChart');
    const lines: string[] = [];

    lines.push(t('chart.nemeth.kindLine', { kind: kindLabel }));
    const title = spec.title?.trim();
    if (title) lines.push(title);

    lines.push(t('chart.nemeth.grid', { width: spec.cellsWidth, height: spec.cellsHeight, count: v.length }));

    const min = Math.min(...v);
    const max = Math.max(...v);
    lines.push(t('chart.nemeth.range', { min, max }));

    const yl = spec.yAxisLabel?.trim();
    const xl = spec.xAxisLabel?.trim();
    if (yl || xl) {
        const parts: string[] = [];
        if (yl) parts.push(t('chart.summary.yAxis', { label: yl }).replace(/\.$/, ''));
        if (xl) parts.push(t('chart.summary.xAxis', { label: xl }).replace(/\.$/, ''));
        lines.push(t('chart.nemeth.axis', { axisParts: parts.join('. ') }));
    }

    const xv = spec.xValues;
    lines.push(t('chart.nemeth.valuesHeading'));
    v.forEach((n, i) => {
        lines.push(t('chart.nemeth.valueRow', { x: xv[i], y: n }));
    });

    return lines.join('\n');
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
    const { t } = useTranslation();
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
        const yParsed = parseCommaSeparatedNumbersT(dataYInput, t);
        const xParsed = parseCommaSeparatedNumbersT(dataXInput, t);
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
                t('chart.messages.countMismatch', { xCount: xParsed.numbers.length, yCount: values.length })
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
            const v = validateChartSpecT(spec, t);
            if (!v.ok) {
                setFieldErrors(v.errors);
                announce(v.errors.join(' '));
                return;
            }
            announce(t('chart.messages.dataOk', { count: values.length }));
        }
        setStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
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
            announce(t('chart.messages.twoColumnsLoaded', { count: pairRows.length }));
            setCsvPaste('');
            return;
        }

        const tokenPairs = tryPairsFromNumericTokens(lines);
        if (tokenPairs && tokenPairs.length === lines.length) {
            setDataXInput(tokenPairs.map((p) => String(p.x)).join(', '));
            setDataYInput(tokenPairs.map((p) => String(p.y)).join(', '));
            setFieldErrors([]);
            announce(t('chart.messages.xyFromEachLine', { count: tokenPairs.length }));
            setCsvPaste('');
            return;
        }

        const { values, rowCount, error } = parseCsvRows(csvPaste);
        if (values.length === 0) {
            // parseCsvRows only ever returns one of these two fixed English messages; bridge them
            // to the translated equivalents rather than editing the shared utility for i18n.
            const msg = error == null
                ? t('chart.messages.noNumbersFound')
                : error === 'No numeric values found in pasted text.'
                    ? t('chart.messages.noNumericValues')
                    : t('chart.messages.multiColumnWarning');
            setFieldErrors([msg]);
            announce(msg);
            return;
        }
        setDataXInput('');
        setDataYInput(values.map(String).join(', '));
        setFieldErrors([]);
        announce(t('chart.messages.yOnlyLoaded', { count: values.length, rows: rowCount }));
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
        const v = validateChartSpecT(spec, t);
        if (!v.ok) {
            setFieldErrors(v.errors);
            announce(v.errors.join(' '));
            setStep(0);
            return;
        }
        const brf = generateChartBrf(spec);
        const summary =
            mathCode === 'nemeth'
                ? buildChartSummaryNemethPlainTextT(spec, t)
                : buildChartSummaryPlainTextT(spec, t);
        const pageBreakBeforeChart = mathCode === 'nemeth' ? '\n\n\f\n\n' : '\n\n';
        const block = `${summary}${pageBreakBeforeChart}:::chart\n${brf}\n:::\n`;
        onInsert(block);
    }

    const reviewSpec = getSpecForValidation();
    const reviewValidation = validateChartSpecT(reviewSpec, t);
    const reviewSummaryPreview =
        reviewValidation.ok && reviewSpec.values.length > 0
            ? mathCode === 'nemeth'
                ? buildChartSummaryNemethPlainTextT(reviewSpec, t)
                : buildChartSummaryPlainTextT(reviewSpec, t)
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
                    <h2 id="chart-gen-title">{t('chart.title')}</h2>
                    <button
                        type="button"
                        className="welcome-close"
                        onClick={onClose}
                        aria-label={t('chart.closeAriaLabel')}
                    >
                        {t('chart.closeIcon')}
                    </button>
                </header>
            )}

            <div aria-live="polite" style={{ fontSize: '0.82rem', minHeight: '1.25em', marginBottom: '8px', opacity: 0.92 }}>
                {liveMessage ? <span>{t('chart.statusPrefix', { message: liveMessage })}</span> : <span aria-hidden> </span>}
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
                        {t('chart.stepAnnouncement', { current: step + 1, stepName: t(`chart.steps.${STEP_KEYS[step]}`) })}
                    </p>

                    <ol
                        aria-label={t('chart.progressAriaLabel')}
                        style={{
                            margin: '0 0 16px 0',
                            paddingLeft: '1.25rem',
                            fontSize: '0.85rem',
                            opacity: 0.9,
                        }}
                    >
                        {STEP_KEYS.map((key, i) => (
                            <li
                                key={key}
                                style={{
                                    fontWeight: i === step ? 700 : 400,
                                }}
                            >
                                {t(`chart.steps.${key}`)}
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
                                    {t('chart.dataStep.xValuesLabel')}
                                </label>
                                <textarea
                                    id="chart-data-x"
                                    rows={2}
                                    value={dataXInput}
                                    onChange={(e) => setDataXInput(e.target.value)}
                                    placeholder={t('chart.dataStep.xValuesPlaceholder')}
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
                                    {t('chart.dataStep.xValuesHint')}
                                </p>
                            </div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-data-y" style={labelStyle}>
                                    {t('chart.dataStep.yValuesLabel')}
                                </label>
                                <textarea
                                    ref={firstFieldRef}
                                    id="chart-data-y"
                                    rows={3}
                                    value={dataYInput}
                                    onChange={(e) => setDataYInput(e.target.value)}
                                    placeholder={t('chart.dataStep.yValuesPlaceholder')}
                                    style={{
                                        ...inputStyle,
                                        fontFamily: 'monospace',
                                        resize: 'vertical',
                                    }}
                                />
                            </div>

                            <div>
                                <label htmlFor="chart-csv-paste" style={labelStyle}>
                                    {t('chart.dataStep.pasteHint')}
                                </label>
                                <textarea
                                    id="chart-csv-paste"
                                    rows={3}
                                    value={csvPaste}
                                    onChange={(e) => setCsvPaste(e.target.value)}
                                    placeholder={t('chart.dataStep.pastePlaceholder')}
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
                                    {t('chart.dataStep.loadFromPaste')}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 1 && (
                        <div>
                            <div style={{ marginBottom: '15px' }}>
                                <label htmlFor="chart-type-select" style={labelStyle}>
                                    {t('chart.chartTypeStep.chartType')}
                                </label>
                                <select
                                    id="chart-type-select"
                                    value={chartType}
                                    onChange={(e) =>
                                        setChartType(e.target.value as ChartKind)
                                    }
                                    style={inputStyle}
                                >
                                    <option value="line">{t('chart.chartTypeStep.line')}</option>
                                    <option value="bar">{t('chart.chartTypeStep.bar')}</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label htmlFor="chart-width" style={labelStyle}>
                                        {t('chart.chartTypeStep.width')}
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
                                        {t('chart.chartTypeStep.height')}
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
                                    {t('chart.chartTypeStep.mathHeading')}
                                </legend>
                                <p
                                    style={{
                                        fontSize: '0.82rem',
                                        marginTop: 0,
                                        marginBottom: '10px',
                                        opacity: 0.9,
                                    }}
                                >
                                    {t('chart.chartTypeStep.mathDescription')}
                                </p>
                                <div role="radiogroup" aria-label={t('chart.chartTypeStep.mathAriaLabel')}>
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
                                        <span>{t('chart.chartTypeStep.nemeth')}</span>
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
                                        <span>{t('chart.chartTypeStep.uebMath')}</span>
                                    </label>
                                </div>
                            </fieldset>
                        </div>
                    )}

                    {step === 2 && (
                        <div>
                            <div style={{ marginBottom: '12px' }}>
                                <label htmlFor="chart-title" style={labelStyle}>
                                    {t('chart.labelsStep.titleOptional')}
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
                                    {t('chart.labelsStep.xAxisLabel')}
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
                                    {t('chart.labelsStep.yAxisLabel')}
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
                                {t('chart.reviewStep.heading')}
                            </h3>
                            <p style={{ fontSize: '0.88rem', opacity: 0.9, marginTop: 0 }}>
                                {mathCode === 'nemeth'
                                    ? t('chart.reviewStep.nemethNote')
                                    : t('chart.reviewStep.uebNote')}
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
                                <p role="alert">{t('chart.reviewStep.fixDataHint')}</p>
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
                                {t('chart.back')}
                            </button>
                        )}
                        {step < STEP_KEYS.length - 1 && (
                            <button
                                type="button"
                                className="welcome-btn-primary"
                                onClick={goNext}
                            >
                                {t('chart.next')}
                            </button>
                        )}
                    </div>
                    {step === STEP_KEYS.length - 1 && (
                        <button
                            type="button"
                            className="welcome-btn-primary"
                            onClick={handleInsert}
                            disabled={!reviewValidation.ok}
                        >
                            {t('chart.insertChartAndSummary')}
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
            aria-label={t('chart.closeAriaLabel')}
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
