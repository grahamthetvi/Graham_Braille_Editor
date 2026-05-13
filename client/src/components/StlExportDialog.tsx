import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { defaultStlFilename, type BuildBrailleStlOptions } from '../utils/brailleStl';
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

  const [scope, setScope] = useState<'one' | 'all'>('one');
  const [page1, setPage1] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    if (page1 > pageCount) setPage1(Math.max(1, pageCount));
  }, [page1, pageCount]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

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

  const handleExport = async () => {
    setError('');
    if (disabled || pageCount < 1 || unicodePages.length === 0) {
      setError('Nothing to export. Translate text and check layout first.');
      return;
    }
    setBusy(true);
    try {
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
        if (!busy) onClose();
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
          <button type="button" className="stl-export-close" onClick={() => !busy && onClose()} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="stl-export-body">
          <p className="stl-export-hint">
            Uses BANA midpoint dimensions (mm): dot diameter, height, intra-cell, inter-cell, and line spacing.
            STL coordinates are millimeters (Z up from the plate). Verify scale and orientation in your slicer.
          </p>

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
            <button type="button" className="toolbar-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={() => void handleExport()}
              disabled={busy || disabled || pageCount < 1}
            >
              {busy ? 'Generating…' : 'Download STL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
