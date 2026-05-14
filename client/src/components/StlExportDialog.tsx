import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  defaultStlFilename,
  maxLogoEdgePxForReliefQuality,
  reliefSamplesPerMmForQuality,
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
}: StlExportDialogProps) {
  const titleId = useId();
  const workerRef = useRef<Worker | null>(null);
  const nextIdRef = useRef(1);
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        pend.reject(new Error('STL worker terminated'));
      }
      w.terminate();
      workerRef.current = null;
    };
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
      return Promise.reject(new Error('STL worker not ready'));
    }
    const id = nextIdRef.current++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          reject(new Error('STL generation timed out'));
        }
      }, 120_000);
      pendingRef.current.set(id, { resolve, reject, timer });
      const req: StlWorkerRequest = { type: 'BUILD', id, payload };
      w.postMessage(req);
    });
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
    setLogoMessage('File selected. Choose Prepare logo to rasterize (and optionally remove the background).');
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
      setLogoMessage('Choose an image file first.');
      return;
    }
    setLogoBusy(true);
    setLogoMessage(removeNearWhite ? 'Rasterizing and clearing near-white pixels…' : 'Rasterizing image…');
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
        `Logo ready (${raster.width}×${raster.height} px, ${reliefQuality} detail). It will appear as raised relief in the STL top-left; braille and large print shift to clear it. Re-prepare after changing logo width or detail quality.`,
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
      setLogoMessage('Prepare a logo before downloading SVG.');
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
    if (disabled || pageCount < 1 || unicodePages.length === 0) {
      setError('Nothing to export. Translate text and check layout first.');
      return;
    }
    setBusy(true);
    try {
      const logoPxToMm =
        logoRaster && logoRaster.width > 0 ? logoTargetWidthMm / logoRaster.width : undefined;

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
      aria-label="Close STL export"
    >
      <div
        className="stl-export-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="stl-export-header">
          <h2 id={titleId}>Export 3D (STL)</h2>
          <button type="button" className="stl-export-close" onClick={() => !busy && !logoBusy && onClose()} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="stl-export-body">
          <p className="stl-export-hint">
            Uses BANA midpoint dimensions (mm): dot diameter, height, intra-cell, inter-cell, and line spacing.
            STL coordinates are millimeters (Z up from the plate). When exporting exactly one line of text, an ADA-style large print label is generated to the right of any optional logo, using Open Sans outline triangulation (not pixel slabs). Verify scale and orientation in your slicer.
          </p>

          <fieldset className="stl-export-field stl-export-logo-field">
            <legend>Optional logo (top-left)</legend>
            <p className="stl-export-logo-intro">
              Add a tactile logo: choose an image or SVG, optionally clear a white or light paper background (non-white ink and colors stay), then prepare. SVGs are sampled at the selected STL detail quality; Download SVG wraps the prepared PNG pixels in a minimal SVG container.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.svg,image/svg+xml"
              className="stl-export-file-input"
              aria-label="Choose logo image"
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
                Choose image…
              </button>
              <button
                type="button"
                className="toolbar-btn toolbar-btn--primary"
                disabled={!pendingFile || logoBusy || busy}
                onClick={() => void prepareLogo()}
              >
                {logoBusy ? 'Working…' : 'Prepare logo'}
              </button>
              <button type="button" className="toolbar-btn" disabled={!logoRaster || busy} onClick={() => void downloadLogoSvg()}>
                Download SVG
              </button>
              <button type="button" className="toolbar-btn" disabled={(!pendingFile && !logoRaster) || logoBusy || busy} onClick={clearLogo}>
                Clear logo
              </button>
            </div>
            <label className="stl-export-logo-check">
              <input
                type="checkbox"
                checked={removeNearWhite}
                onChange={e => setRemoveNearWhite(e.target.checked)}
                disabled={logoBusy || busy}
              />
              Clear near-white background when preparing (preserves darker colors and edges; no cloud ML)
            </label>
            {pickedLabel ? <p className="stl-export-logo-file">Selected: {pickedLabel}</p> : null}
            {previewUrl ? (
              <div className="stl-export-logo-preview-wrap">
                <img className="stl-export-logo-preview" src={previewUrl} alt="" />
              </div>
            ) : null}
            <label className="stl-export-field stl-export-logo-width">
              Logo width on plate (mm)
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
            <legend>Raised detail quality</legend>
            <label className="stl-export-field">
              STL detail
              <select
                value={reliefQuality}
                onChange={e => setReliefQuality(e.target.value as StlReliefQuality)}
                disabled={busy || logoBusy}
              >
                <option value="standard">Standard ({reliefSamplesPerMmForQuality('standard')} samples/mm)</option>
                <option value="high">High ({reliefSamplesPerMmForQuality('high')} samples/mm)</option>
                <option value="ultra">Ultra ({reliefSamplesPerMmForQuality('ultra')} samples/mm)</option>
              </select>
            </label>
            <label className="stl-export-field stl-export-print-height">
              Print letter height (mm)
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
              Higher detail improves logos and print letters but produces larger STL files. Braille dot roundness still uses the BANA STL dot setting.
            </p>
          </fieldset>

          <fieldset className="stl-export-field">
            <legend>Scope</legend>
            <label className="stl-export-radio">
              <input
                type="radio"
                name="stl-scope"
                checked={scope === 'one'}
                onChange={() => setScope('one')}
                disabled={busy}
              />
              Single page
            </label>
            <label className="stl-export-radio">
              <input
                type="radio"
                name="stl-scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                disabled={busy}
              />
              All pages (one STL per page)
            </label>
          </fieldset>

          {scope === 'one' && (
            <label className="stl-export-field">
              Page (1–{pageCount})
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

          {error ? (
            <p className="stl-export-err" role="alert">
              {error}
            </p>
          ) : null}

          <div className="stl-export-actions">
            <button type="button" className="toolbar-btn" onClick={onClose} disabled={busy || logoBusy}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={() => void handleExport()}
              disabled={busy || logoBusy || disabled || pageCount < 1}
            >
              {busy ? 'Generating…' : 'Download STL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
