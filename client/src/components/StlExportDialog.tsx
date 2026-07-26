import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBraille, type MathCode } from '../hooks/useBraille';
import { asciiToUnicodeBraille } from '../utils/braille';
import {
  defaultStlFilename,
  maxLogoEdgePxForReliefQuality,
  type BuildBrailleStlOptions,
  type StlReliefQuality,
} from '../utils/brailleStl';
import { imageBlobToSerializableRaster, type SerializableLogoRaster } from '../utils/logoRaster';
import { pngBlobToSvgDocument } from '../utils/logoSvg';
import type { StlWorkerRequest, StlWorkerResponse } from '../workers/stl.worker';
import StlWorkerConstructor from '../workers/stl.worker?worker';

type StlExportDialogProps = {
  onClose: () => void;
  pageCount: number;
  /** Build options excluding `unicodeLines` (filled per page). */
  buildBase: Omit<BuildBrailleStlOptions, 'unicodeLines'>;
  /** Paginated Unicode braille (same source as BRF preview). */
  unicodePages: string[];
  disabled?: boolean;
  printText?: string;
  selectedTable: string;
  mathCode: MathCode;
};

type Pending = {
  resolve: (b: ArrayBuffer) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_LOGO_WIDTH_MM = 22;
const DEFAULT_PRINT_TEXT_HEIGHT_MM = 15;

/**
 * Modal to export the current layout as binary STL (BANA-sized dots + plate).
 */
export function StlExportDialog({
  onClose,
  pageCount,
  buildBase,
  unicodePages,
  disabled,
  printText,
  selectedTable,
  mathCode,
}: StlExportDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(1);
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [textSource, setTextSource] = useState<'custom' | 'editor'>('custom');
  const [customText, setCustomText] = useState(() => {
    if (!printText) return '';
    const trimmed = printText.trim();
    if (trimmed.includes('\n') || trimmed.length > 60) {
      return '';
    }
    return trimmed;
  });

  const { translate: translateStl, translatedText: translatedStlText, isLoading: isTranslating } = useBraille();

  useEffect(() => {
    if (textSource === 'custom') {
      translateStl(customText, selectedTable, mathCode);
    }
  }, [customText, selectedTable, mathCode, translateStl, textSource]);

  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [page1, setPage1] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /** Make light/white pixels transparent before STL/SVG; keeps printed colors and line art. */
  const [removeNearWhite, setRemoveNearWhite] = useState(true);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMessage, setLogoMessage] = useState('');
  const [logoRaster, setLogoRaster] = useState<SerializableLogoRaster | null>(null);
  const [logoPngBlob, setLogoPngBlob] = useState<Blob | null>(null);
  const [logoTargetWidthMm, setLogoTargetWidthMm] = useState(DEFAULT_LOGO_WIDTH_MM);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [reliefQuality, setReliefQuality] = useState<StlReliefQuality>('standard');
  const [printTextHeightMm, setPrintTextHeightMm] = useState(DEFAULT_PRINT_TEXT_HEIGHT_MM);

  useEffect(() => {
    const w = new StlWorkerConstructor();
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<StlWorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'READY') return;
      if (m.type === 'RESULT') {
        const p = pendingRef.current.get(m.id);
        if (p) {
          clearTimeout(p.timer);
          pendingRef.current.delete(m.id);
          p.resolve(m.buffer);
        }
        return;
      }
      if (m.type === 'ERROR') {
        const p = pendingRef.current.get(m.id);
        if (p) {
          clearTimeout(p.timer);
          pendingRef.current.delete(m.id);
          p.reject(new Error(m.message));
        }
      }
    };
    return () => {
      const pendingSnapshot = pendingRef.current;
      pendingRef.current = new Map();
      for (const [, pend] of pendingSnapshot) {
        clearTimeout(pend.timer);
        pend.reject(new Error(t('stlExport.errors.workerTerminated')));
      }
      w.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (page1 > pageCount) setPage1(Math.max(1, pageCount));
  }, [page1, pageCount]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && !logoBusy) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, logoBusy, onClose]);

  const runBuildInWorker = useCallback((payload: BuildBrailleStlOptions): Promise<ArrayBuffer> => {
    const w = workerRef.current;
    if (!w) {
      return Promise.reject(new Error(t('stlExport.errors.workerNotReady')));
    }
    const id = nextIdRef.current++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error(t('stlExport.errors.timedOut')));
        }
      }, 120_000);
      pendingRef.current.set(id, { resolve, reject, timer });
      const req: StlWorkerRequest = { type: 'BUILD', id, payload };
      w.postMessage(req);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerDownload = (buffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([buffer], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setPendingFile(f);
    setPickedLabel(f.name);
    setLogoRaster(null);
    setLogoPngBlob(null);
    setLogoMessage(t('stlExport.logo.status.fileSelected'));
  };

  const clearLogo = () => {
    setPendingFile(null);
    setPickedLabel(null);
    setLogoRaster(null);
    setLogoPngBlob(null);
    setLogoMessage('');
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const prepareLogo = async () => {
    if (!pendingFile) {
      setLogoMessage(t('stlExport.logo.status.chooseFileFirst'));
      return;
    }
    setLogoBusy(true);
    setLogoMessage(removeNearWhite ? t('stlExport.logo.status.clearingBackground') : t('stlExport.logo.status.rasterizing'));
    try {
      const maxEdgePx = maxLogoEdgePxForReliefQuality(reliefQuality, logoTargetWidthMm);
      const isSvg = pendingFile.type === 'image/svg+xml' || pendingFile.name.toLowerCase().endsWith('.svg');
      const { raster, pngBlob } = await imageBlobToSerializableRaster(pendingFile, {
        maxEdgePx,
        removeNearWhite,
        allowUpscale: isSvg,
      });
      setLogoRaster(raster);
      setLogoPngBlob(pngBlob);
      setLogoMessage(
        t('stlExport.logo.status.ready', { width: raster.width, height: raster.height, quality: reliefQuality }),
      );
    } catch (err) {
      setLogoRaster(null);
      setLogoPngBlob(null);
      setLogoMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLogoBusy(false);
    }
  };

  const downloadLogoSvg = async () => {
    if (!logoRaster || !logoPngBlob) {
      setLogoMessage(t('stlExport.logo.status.prepareBeforeDownload'));
      return;
    }
    try {
      const svg = await pngBlobToSvgDocument(logoPngBlob, logoRaster.width, logoRaster.height);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'logo-from-stl-export.svg';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setLogoMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExport = async () => {
    setError('');
    if (textSource === 'editor' && (disabled || pageCount < 1 || unicodePages.length === 0)) {
      setError(t('stlExport.errors.nothingToExport'));
      return;
    }
    if (textSource === 'custom' && !customText.trim()) {
      setError(t('stlExport.errors.enterCustomText'));
      return;
    }
    setBusy(true);
    try {
      const logoPxToMm =
        logoRaster && logoRaster.width > 0 ? logoTargetWidthMm / logoRaster.width : undefined;

      if (textSource === 'custom') {
        const asciiBraille = translatedStlText || '';
        const unicodeBraille = asciiToUnicodeBraille(asciiBraille);
        const unicodeLines = unicodeBraille.split('\n');
        const printTextLine = customText.trim().replace(/\s+/g, ' ');

        const buffer = await runBuildInWorker({
          ...buildBase,
          unicodeLines,
          printTextLine,
          reliefQuality,
          printTextHeightMm,
          ...(logoRaster ? { logo: logoRaster, logoPxToMm } : {}),
        });
        triggerDownload(buffer, defaultStlFilename());
      } else {
        if (scope === 'one') {
          const idx = Math.min(Math.max(1, page1), pageCount) - 1;
          const pageText = unicodePages[idx] ?? '';
          const unicodeLines = pageText.split('\n');

          let printTextLine: string | undefined;
          if (unicodeLines.length === 1 && printText) {
            printTextLine = printText.replace(/\s+/g, ' ').trim();
          }

          const buffer = await runBuildInWorker({
            ...buildBase,
            unicodeLines,
            printTextLine,
            reliefQuality,
            printTextHeightMm,
            ...(logoRaster ? { logo: logoRaster, logoPxToMm } : {}),
          });
          triggerDownload(buffer, defaultStlFilename(idx + 1));
        } else {
          for (let i = 0; i < unicodePages.length; i++) {
            const unicodeLines = unicodePages[i].split('\n');
            let printTextLine: string | undefined;
            if (unicodeLines.length === 1 && printText) {
              printTextLine = printText.replace(/\s+/g, ' ').trim();
            }
            const buffer = await runBuildInWorker({
              ...buildBase,
              unicodeLines,
              printTextLine,
              reliefQuality,
              printTextHeightMm,
              ...(logoRaster ? { logo: logoRaster, logoPxToMm } : {}),
            });
            triggerDownload(buffer, defaultStlFilename(i + 1));
            await new Promise(r => setTimeout(r, 150));
          }
        }
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="stl-export-overlay"
      onClick={() => {
        if (!busy && !logoBusy) onClose();
      }}
      aria-label={t('stlExport.closeAriaLabel')}
    >
      <div
        className="stl-export-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="stl-export-header">
          <h2 id={titleId}>{t('stlExport.title')}</h2>
          <button type="button" className="stl-export-close" onClick={() => !busy && !logoBusy && onClose()} aria-label={t('stlExport.closeButton')}>
            ✕
          </button>
        </header>

        <div className="stl-export-body">
          <p className="stl-export-hint">
            {t('stlExport.description')}
          </p>

          <fieldset className="stl-export-field stl-export-logo-field">
            <legend>{t('stlExport.logo.heading')}</legend>
            <p className="stl-export-logo-intro">
              {t('stlExport.logo.description')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.svg,image/svg+xml"
              className="stl-export-file-input"
              aria-label={t('stlExport.logo.chooseAriaLabel')}
              disabled={logoBusy || busy}
              onChange={handleFileChange}
            />
            <div className="stl-export-logo-actions">
              <button
                type="button"
                className="toolbar-btn"
                disabled={logoBusy || busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('stlExport.logo.chooseButton')}
              </button>
              <button
                type="button"
                className="toolbar-btn toolbar-btn--primary"
                disabled={!pendingFile || logoBusy || busy}
                onClick={() => void prepareLogo()}
              >
                {logoBusy ? t('stlExport.logo.working') : t('stlExport.logo.prepareButton')}
              </button>
              <button type="button" className="toolbar-btn" disabled={!logoRaster || busy} onClick={() => void downloadLogoSvg()}>
                {t('stlExport.logo.downloadSvg')}
              </button>
              <button type="button" className="toolbar-btn" disabled={(!pendingFile && !logoRaster) || logoBusy || busy} onClick={clearLogo}>
                {t('stlExport.logo.clear')}
              </button>
            </div>
            <label className="stl-export-logo-check">
              <input
                type="checkbox"
                checked={removeNearWhite}
                onChange={e => setRemoveNearWhite(e.target.checked)}
                disabled={logoBusy || busy}
              />
              {t('stlExport.logo.clearBackground')}
            </label>
            {pickedLabel ? <p className="stl-export-logo-file">{t('stlExport.logo.selected', { filename: pickedLabel })}</p> : null}
            {previewUrl ? (
              <div className="stl-export-logo-preview-wrap">
                <img className="stl-export-logo-preview" src={previewUrl} alt="" />
              </div>
            ) : null}
            <label className="stl-export-field stl-export-logo-width">
              {t('stlExport.logo.widthLabel')}
              <input
                type="number"
                min={4}
                max={120}
                step={0.5}
                value={logoTargetWidthMm}
                onChange={e => setLogoTargetWidthMm(Math.max(4, Math.min(120, parseFloat(e.target.value) || DEFAULT_LOGO_WIDTH_MM)))}
                disabled={busy || logoBusy}
              />
            </label>
            {logoMessage ? <p className="stl-export-logo-status">{logoMessage}</p> : null}
          </fieldset>

          <fieldset className="stl-export-field">
            <legend>{t('stlExport.detail.heading')}</legend>
            <label className="stl-export-field">
              {t('stlExport.detail.label')}
              <select
                value={reliefQuality}
                onChange={e => setReliefQuality(e.target.value as StlReliefQuality)}
                disabled={busy || logoBusy}
              >
                <option value="standard">{t('stlExport.detail.standard')}</option>
                <option value="high">{t('stlExport.detail.high')}</option>
                <option value="ultra">{t('stlExport.detail.ultra')}</option>
              </select>
            </label>
            <label className="stl-export-field stl-export-print-height">
              {t('stlExport.printLetterHeight')}
              <input
                type="number"
                min={6}
                max={40}
                step={0.5}
                value={printTextHeightMm}
                onChange={e => setPrintTextHeightMm(Math.max(6, Math.min(40, parseFloat(e.target.value) || DEFAULT_PRINT_TEXT_HEIGHT_MM)))}
                disabled={busy || logoBusy}
              />
            </label>
            <p className="stl-export-logo-status">
              {t('stlExport.detailHint')}
            </p>
          </fieldset>

          <fieldset className="stl-export-field">
            <legend>{t('stlExport.textSource.heading')}</legend>
            <label className="stl-export-radio">
              <input
                type="radio"
                name="stl-text-source"
                checked={textSource === 'custom'}
                onChange={() => setTextSource('custom')}
                disabled={busy}
              />
              {t('stlExport.textSource.custom')}
            </label>
            <label className="stl-export-radio">
              <input
                type="radio"
                name="stl-text-source"
                checked={textSource === 'editor'}
                onChange={() => setTextSource('editor')}
                disabled={busy}
              />
              {t('stlExport.textSource.editor')}
            </label>
          </fieldset>

          {textSource === 'custom' ? (
            <label className="stl-export-field">
              {t('stlExport.customText.label')}
              <input
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder={t('stlExport.customText.placeholder')}
                disabled={busy}
                style={{ width: '100%', maxWidth: 'none', boxSizing: 'border-box', marginTop: '0.35rem', padding: '0.4rem' }}
              />
              {isTranslating && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                  {t('stlExport.translating')}
                </span>
              )}
            </label>
          ) : (
            <>
              <fieldset className="stl-export-field">
                <legend>{t('stlExport.scope.heading')}</legend>
                <label className="stl-export-radio">
                  <input
                    type="radio"
                    name="stl-scope"
                    checked={scope === 'one'}
                    onChange={() => setScope('one')}
                    disabled={busy}
                  />
                  {t('stlExport.scope.singlePage')}
                </label>
                <label className="stl-export-radio">
                  <input
                    type="radio"
                    name="stl-scope"
                    checked={scope === 'all'}
                    onChange={() => setScope('all')}
                    disabled={busy}
                  />
                  {t('stlExport.scope.allPages')}
                </label>
              </fieldset>

              {scope === 'one' && (
                <label className="stl-export-field">
                  {t('stlExport.scope.pageOf', { count: pageCount })}
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, pageCount)}
                    value={page1}
                    onChange={e => setPage1(parseInt(e.target.value, 10) || 1)}
                    disabled={busy}
                  />
                </label>
              )}
            </>
          )}

          {error ? (
            <p className="stl-export-err" role="alert">
              {error}
            </p>
          ) : null}

          <div className="stl-export-actions">
            <button type="button" className="toolbar-btn" onClick={onClose} disabled={busy || logoBusy}>
              {t('stlExport.cancel')}
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={() => void handleExport()}
              disabled={
                busy ||
                logoBusy ||
                (textSource === 'editor' && (disabled || pageCount < 1)) ||
                (textSource === 'custom' && (!customText.trim() || isTranslating))
              }
            >
              {busy ? t('stlExport.generating') : t('stlExport.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
