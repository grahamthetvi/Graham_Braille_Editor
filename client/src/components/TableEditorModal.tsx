import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBraille, type MathCode } from '../hooks/useBraille';
import {
  DEFAULT_TN_BLANK_OTHER,
  DEFAULT_TN_BLANK_SIMPLE,
  DEFAULT_TN_LINEAR,
  DEFAULT_TN_LISTED,
  DEFAULT_TN_STAIRSTEP,
  defaultTableSpec,
  parseTableCsv,
  resizeGrid,
  tableHasBlankCells,
  TABLE_LIMITS,
  validateTableSpec,
  type TableFormat,
  type TableSpec,
} from '../types/table';
import {
  defaultBlankTnForFormat,
  defaultTnForFormat,
  formatTableInsertBlock,
  generateTableBrf,
  type ResolvedTableFormat,
} from '../utils/tableBraille';
import { DEFAULT_TABLE } from '../utils/tableRegistry';

export interface TableEditorModalProps {
  onInsert: (text: string) => void;
  onClose: () => void;
  brailleTable?: string;
  mathCode?: MathCode;
  cellsPerRow: number;
}

async function translateAll(
  texts: string[],
  translateAsync: (text: string, table?: string, mathCode?: MathCode) => Promise<string>,
  table: string,
  mathCode: MathCode
): Promise<string[]> {
  const out: string[] = [];
  for (const t of texts) {
    if (!t.trim()) {
      out.push('');
      continue;
    }
    try {
      out.push(await translateAsync(t, table, mathCode));
    } catch {
      out.push(t);
    }
  }
  return out;
}

function tnDefaultFor(format: TableFormat): string {
  if (format === 'auto') return '';
  return defaultTnForFormat(format);
}

export function TableEditorModal({
  onInsert,
  onClose,
  brailleTable = DEFAULT_TABLE,
  mathCode = 'nemeth',
  cellsPerRow,
}: TableEditorModalProps) {
  const { t } = useTranslation();
  const { translateAsync, workerReady } = useBraille();
  const [spec, setSpec] = useState<TableSpec>(() => defaultTableSpec(3, 3));
  const [csvPaste, setCsvPaste] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [previewBrf, setPreviewBrf] = useState('');
  const [previewFormat, setPreviewFormat] = useState<ResolvedTableFormat | ''>('');
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  const rowCount = spec.cells.length;
  const colCount = rowCount > 0 ? spec.cells[0].length : 0;

  const updateCell = (r: number, c: number, value: string) => {
    setSpec((prev) => {
      const cells = prev.cells.map((row, ri) =>
        row.map((cell, ci) => (ri === r && ci === c ? value : cell))
      );
      return { ...prev, cells };
    });
  };

  const setRows = (n: number) => {
    setSpec((prev) => ({
      ...prev,
      cells: resizeGrid(prev.cells, n, prev.cells[0]?.length ?? 3),
    }));
  };

  const setCols = (n: number) => {
    setSpec((prev) => ({
      ...prev,
      cells: resizeGrid(prev.cells, prev.cells.length, n),
    }));
  };

  const setFormat = (format: TableFormat) => {
    setSpec((prev) => {
      const next: TableSpec = { ...prev, format };
      // Prefill TN when switching to a format that needs one and field is empty or was a default.
      const prevDefault = tnDefaultFor(prev.format);
      const isDefaultOrEmpty =
        !prev.transcriberNote?.trim() || prev.transcriberNote === prevDefault;
      if (isDefaultOrEmpty) {
        next.transcriberNote = tnDefaultFor(format);
      }
      const prevBlankDefault = defaultBlankTnForFormat(
        prev.format === 'auto' ? 'simple' : (prev.format as ResolvedTableFormat)
      );
      const blankIsDefault =
        !prev.blankCellNote?.trim() || prev.blankCellNote === prevBlankDefault;
      if (blankIsDefault) {
        next.blankCellNote = defaultBlankTnForFormat(
          format === 'auto' ? 'simple' : (format as ResolvedTableFormat)
        );
      }
      return next;
    });
  };

  const applyCsvText = (text: string) => {
    const parsed = parseTableCsv(text);
    if (parsed.error) {
      setCsvError(parsed.error);
      return;
    }
    setCsvError(null);
    setSpec((prev) => ({
      ...prev,
      cells: parsed.cells,
      hasColumnHeadings: true,
    }));
  };

  const handleLoadPaste = () => applyCsvText(csvPaste);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsvPaste(text);
      applyCsvText(text);
    };
    reader.onerror = () => setCsvError(t('tableEditor.csv.readError'));
    reader.readAsText(file);
  };

  const buildPreview = useCallback(async () => {
    const validation = validateTableSpec(spec);
    if (!validation.ok) {
      setPreviewError(validation.errors[0] ?? t('tableEditor.errors.invalid'));
      setPreviewBrf('');
      return;
    }
    if (!workerReady) {
      setPreviewError(t('tableEditor.errors.workerNotReady'));
      setPreviewBrf('');
      return;
    }

    setBusy(true);
    setPreviewError(null);
    try {
      const flatCells = spec.cells.flat();
      const translatedFlat = await translateAll(flatCells, translateAsync, brailleTable, mathCode);
      const translatedCells: string[][] = [];
      let idx = 0;
      for (const row of spec.cells) {
        const tr: string[] = [];
        for (let c = 0; c < row.length; c++) {
          tr.push(translatedFlat[idx++] ?? '');
        }
        translatedCells.push(tr);
      }

      const resolvedHint: ResolvedTableFormat | 'auto' =
        spec.format === 'auto' ? 'auto' : spec.format;
      const needsTn = spec.format !== 'simple';
      const tnPrint =
        needsTn || spec.format === 'auto'
          ? (spec.transcriberNote?.trim() ||
              (spec.format === 'listed'
                ? DEFAULT_TN_LISTED
                : spec.format === 'stairstep'
                  ? DEFAULT_TN_STAIRSTEP
                  : spec.format === 'linear'
                    ? DEFAULT_TN_LINEAR
                    : ''))
          : '';

      // For auto, TN is filled after resolve — generate without TN first if auto+empty,
      // then we attach listed/stairstep/linear defaults inside generate via tnBrf.
      let tnBrf = '';
      if (tnPrint) {
        tnBrf = (await translateAll([tnPrint], translateAsync, brailleTable, mathCode))[0] ?? '';
      }

      let blankTnBrf = '';
      if (tableHasBlankCells(spec)) {
        const blankPrint =
          spec.blankCellNote?.trim() ||
          (resolvedHint === 'simple' || resolvedHint === 'auto'
            ? DEFAULT_TN_BLANK_SIMPLE
            : DEFAULT_TN_BLANK_OTHER);
        blankTnBrf =
          (await translateAll([blankPrint], translateAsync, brailleTable, mathCode))[0] ?? '';
      }

      let titleBrf = '';
      if (spec.title?.trim()) {
        titleBrf =
          (await translateAll([spec.title.trim()], translateAsync, brailleTable, mathCode))[0] ??
          '';
      }

      // When format is auto and no TN yet, generate once to learn format, then add default TN.
      let result = generateTableBrf(
        spec,
        { cells: translatedCells, titleBrf, tnBrf, blankTnBrf },
        cellsPerRow
      );

      if (spec.format === 'auto' && !tnBrf && result.format !== 'simple') {
        const autoTn =
          result.format === 'listed'
            ? DEFAULT_TN_LISTED
            : result.format === 'stairstep'
              ? DEFAULT_TN_STAIRSTEP
              : DEFAULT_TN_LINEAR;
        tnBrf = (await translateAll([autoTn], translateAsync, brailleTable, mathCode))[0] ?? '';
        result = generateTableBrf(
          { ...spec, format: result.format },
          { cells: translatedCells, titleBrf, tnBrf, blankTnBrf },
          cellsPerRow
        );
      }

      setPreviewBrf(result.brf);
      setPreviewFormat(result.format);
      setPreviewWarnings(result.warnings);
      if (!result.ok && result.warnings.length) {
        setPreviewError(result.warnings[0]);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('tableEditor.errors.previewFailed'));
      setPreviewBrf('');
    } finally {
      setBusy(false);
    }
  }, [spec, workerReady, translateAsync, brailleTable, mathCode, cellsPerRow, t]);

  // Debounced live preview
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      void buildPreview();
    }, 400);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [buildPreview]);

  const handleInsert = async () => {
    const validation = validateTableSpec(spec);
    if (!validation.ok) {
      setPreviewError(validation.errors[0] ?? t('tableEditor.errors.invalid'));
      return;
    }
    if (!workerReady) {
      setPreviewError(t('tableEditor.errors.workerNotReady'));
      return;
    }

    setBusy(true);
    setPreviewError(null);
    try {
      const flatCells = spec.cells.flat();
      const translatedFlat = await translateAll(flatCells, translateAsync, brailleTable, mathCode);
      const translatedCells: string[][] = [];
      let idx = 0;
      for (const row of spec.cells) {
        const tr: string[] = [];
        for (let c = 0; c < row.length; c++) {
          tr.push(translatedFlat[idx++] ?? '');
        }
        translatedCells.push(tr);
      }

      const needsTn = spec.format !== 'simple';
      let tnPrint =
        needsTn || spec.format === 'auto'
          ? (spec.transcriberNote?.trim() ||
              (spec.format === 'listed'
                ? DEFAULT_TN_LISTED
                : spec.format === 'stairstep'
                  ? DEFAULT_TN_STAIRSTEP
                  : spec.format === 'linear'
                    ? DEFAULT_TN_LINEAR
                    : ''))
          : '';

      let tnBrf = '';
      if (tnPrint) {
        tnBrf = (await translateAll([tnPrint], translateAsync, brailleTable, mathCode))[0] ?? '';
      }

      let blankTnBrf = '';
      if (tableHasBlankCells(spec)) {
        const blankPrint =
          spec.blankCellNote?.trim() ||
          (spec.format === 'listed' || spec.format === 'stairstep' || spec.format === 'linear'
            ? DEFAULT_TN_BLANK_OTHER
            : DEFAULT_TN_BLANK_SIMPLE);
        blankTnBrf =
          (await translateAll([blankPrint], translateAsync, brailleTable, mathCode))[0] ?? '';
      }

      let titleBrf = '';
      if (spec.title?.trim()) {
        titleBrf =
          (await translateAll([spec.title.trim()], translateAsync, brailleTable, mathCode))[0] ??
          '';
      }

      let result = generateTableBrf(
        spec,
        { cells: translatedCells, titleBrf, tnBrf, blankTnBrf },
        cellsPerRow
      );

      if (spec.format === 'auto' && !tnBrf && result.format !== 'simple') {
        const autoTn =
          result.format === 'listed'
            ? DEFAULT_TN_LISTED
            : result.format === 'stairstep'
              ? DEFAULT_TN_STAIRSTEP
              : DEFAULT_TN_LINEAR;
        tnBrf = (await translateAll([autoTn], translateAsync, brailleTable, mathCode))[0] ?? '';
        result = generateTableBrf(
          { ...spec, format: result.format },
          { cells: translatedCells, titleBrf, tnBrf, blankTnBrf },
          cellsPerRow
        );
      }

      if (!result.brf.trim()) {
        setPreviewError(result.warnings[0] ?? t('tableEditor.errors.noPreview'));
        return;
      }

      setPreviewBrf(result.brf);
      setPreviewFormat(result.format);
      onInsert(formatTableInsertBlock(result.brf));
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : t('tableEditor.errors.previewFailed'));
    } finally {
      setBusy(false);
    }
  };

  const showTnFields = spec.format !== 'simple';
  const showSimpleOptions = spec.format === 'simple' || spec.format === 'auto';

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 'bold',
    marginBottom: '0.35rem',
    fontSize: '0.9rem',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.4rem 0.5rem',
    boxSizing: 'border-box',
  };

  return (
    <div className="welcome-overlay" onClick={onClose} aria-label={t('tableEditor.ariaLabel')}>
      <div
        className="welcome-modal table-editor-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '960px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        <header className="welcome-header">
          <h2>{t('tableEditor.title')}</h2>
          <button
            type="button"
            className="welcome-close"
            onClick={onClose}
            aria-label={t('tableEditor.close')}
          >
            ✕
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            padding: '1.25rem 1.5rem',
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 100px' }}>
                <label htmlFor="table-rows" style={labelStyle}>
                  {t('tableEditor.rows')}
                </label>
                <input
                  id="table-rows"
                  type="number"
                  min={TABLE_LIMITS.minRows}
                  max={TABLE_LIMITS.maxRows}
                  value={rowCount}
                  onChange={(e) => setRows(parseInt(e.target.value, 10) || 1)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '0 0 100px' }}>
                <label htmlFor="table-cols" style={labelStyle}>
                  {t('tableEditor.columns')}
                </label>
                <input
                  id="table-cols"
                  type="number"
                  min={TABLE_LIMITS.minCols}
                  max={TABLE_LIMITS.maxCols}
                  value={colCount}
                  onChange={(e) => setCols(parseInt(e.target.value, 10) || 1)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="table-format" style={labelStyle}>
                  {t('tableEditor.format.label')}
                </label>
                <select
                  id="table-format"
                  value={spec.format}
                  onChange={(e) => setFormat(e.target.value as TableFormat)}
                  style={inputStyle}
                >
                  <option value="auto">{t('tableEditor.format.auto')}</option>
                  <option value="simple">{t('tableEditor.format.simple')}</option>
                  <option value="listed">{t('tableEditor.format.listed')}</option>
                  <option value="stairstep">{t('tableEditor.format.stairstep')}</option>
                  <option value="linear">{t('tableEditor.format.linear')}</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="table-title" style={labelStyle}>
                {t('tableEditor.tableTitle')}
              </label>
              <input
                id="table-title"
                type="text"
                value={spec.title ?? ''}
                onChange={(e) => setSpec((p) => ({ ...p, title: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <label className="gen-radio-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={spec.hasColumnHeadings}
                onChange={(e) => setSpec((p) => ({ ...p, hasColumnHeadings: e.target.checked }))}
              />
              {t('tableEditor.firstRowHeadings')}
            </label>

            {showSimpleOptions && (
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <label htmlFor="table-gap" style={labelStyle}>
                    {t('tableEditor.columnGap')}
                  </label>
                  <select
                    id="table-gap"
                    value={spec.columnGap}
                    onChange={(e) =>
                      setSpec((p) => ({
                        ...p,
                        columnGap: Number(e.target.value) === 1 ? 1 : 2,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value={2}>{t('tableEditor.gap2')}</option>
                    <option value={1}>{t('tableEditor.gap1')}</option>
                  </select>
                </div>
                <label className="gen-radio-label" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={spec.guideDots}
                    onChange={(e) => setSpec((p) => ({ ...p, guideDots: e.target.checked }))}
                  />
                  {t('tableEditor.guideDots')}
                </label>
              </div>
            )}

            {showTnFields && (
              <div>
                <label htmlFor="table-tn" style={labelStyle}>
                  {t('tableEditor.transcriberNote')}
                </label>
                <textarea
                  id="table-tn"
                  rows={3}
                  value={spec.transcriberNote ?? ''}
                  onChange={(e) => setSpec((p) => ({ ...p, transcriberNote: e.target.value }))}
                  placeholder={tnDefaultFor(spec.format) || t('tableEditor.tnAutoHint')}
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            )}

            {tableHasBlankCells(spec) && (
              <div>
                <label htmlFor="table-blank-tn" style={labelStyle}>
                  {t('tableEditor.blankCellNote')}
                </label>
                <textarea
                  id="table-blank-tn"
                  rows={2}
                  value={spec.blankCellNote ?? ''}
                  onChange={(e) => setSpec((p) => ({ ...p, blankCellNote: e.target.value }))}
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            )}

            <div style={{ overflow: 'auto', maxHeight: '280px', border: '1px solid var(--border, #444)', borderRadius: 4 }}>
              <table className="table-editor-grid" style={{ borderCollapse: 'collapse', width: '100%', minWidth: colCount * 90 }}>
                <tbody>
                  {spec.cells.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: 2, border: '1px solid var(--border, #555)' }}>
                          <input
                            type="text"
                            aria-label={t('tableEditor.cellAria', { row: ri + 1, col: ci + 1 })}
                            value={cell}
                            onChange={(e) => updateCell(ri, ci, e.target.value)}
                            style={{
                              width: '100%',
                              minWidth: 80,
                              padding: '0.35rem',
                              boxSizing: 'border-box',
                              fontWeight: spec.hasColumnHeadings && ri === 0 ? 600 : 400,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label htmlFor="table-csv-paste" style={labelStyle}>
                {t('tableEditor.csv.pasteHint')}
              </label>
              <textarea
                id="table-csv-paste"
                rows={3}
                value={csvPaste}
                onChange={(e) => setCsvPaste(e.target.value)}
                placeholder={t('tableEditor.csv.pastePlaceholder')}
                style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" className="welcome-btn-secondary" onClick={handleLoadPaste}>
                  {t('tableEditor.csv.loadFromPaste')}
                </button>
                <button
                  type="button"
                  className="welcome-btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('tableEditor.csv.loadFile')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
              {csvError && (
                <p role="alert" style={{ color: 'var(--danger, #c44)', marginTop: 6, fontSize: '0.85rem' }}>
                  {csvError}
                </p>
              )}
            </div>
          </div>

          <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', minHeight: 200 }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
              {t('tableEditor.preview')}
              {previewFormat ? ` (${t(`tableEditor.format.${previewFormat}`)})` : ''}
              {busy ? ` — ${t('tableEditor.updating')}` : ''}
            </div>
            {previewError && (
              <p role="alert" style={{ color: 'var(--danger, #c44)', fontSize: '0.85rem' }}>
                {previewError}
              </p>
            )}
            {previewWarnings.length > 0 && !previewError && (
              <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>{previewWarnings[0]}</p>
            )}
            <pre
              aria-live="polite"
              style={{
                flex: 1,
                margin: 0,
                padding: '0.75rem',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                whiteSpace: 'pre',
                background: 'var(--bg-secondary, rgba(0,0,0,0.15))',
                borderRadius: 4,
                minHeight: 180,
              }}
            >
              {previewBrf || t('tableEditor.previewEmpty')}
            </pre>
          </div>
        </div>

        <footer
          className="welcome-footer"
          style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}
        >
          <button type="button" className="welcome-btn-secondary" onClick={onClose}>
            {t('tableEditor.cancel')}
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            className="welcome-btn-primary"
            onClick={() => void handleInsert()}
            disabled={busy || !workerReady}
          >
            {t('tableEditor.insert')}
          </button>
        </footer>
      </div>
    </div>
  );
}
