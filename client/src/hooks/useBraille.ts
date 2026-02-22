/**
 * useBraille — React hook that owns the braille Web Worker lifecycle.
 *
 * Usage:
 *   const { translate, translatedText, isLoading, progress, error } = useBraille();
 *   translate('Hello world', 'en-ueb-g2.ctb');
 *
 * The worker is an ES module worker (Vite worker format: 'es').
 * Message protocol matches workers/braille.worker.ts:
 *   send    → { text: string, table?: string }
 *   receive → { type: 'READY' }
 *             { type: 'RESULT',   result: string }
 *             { type: 'PROGRESS', percent: number }
 *             { type: 'ERROR',    error:  string }
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseBrailleReturn {
  /** Call this with plain text and an optional liblouis table filename. */
  translate: (text: string, table?: string) => void;
  /** The most recent translated BRF string (Braille ASCII). */
  translatedText: string;
  /** True while the worker is initialising or a translation is in flight. */
  isLoading: boolean;
  /**
   * Translation progress (0–100) for large documents being processed in chunks.
   * Always 100 once a RESULT arrives; resets to 0 at the start of a new job.
   */
  progress: number;
  /** Non-null when the last translation attempt produced an error. */
  error: string | null;
  /** True once the worker has signalled it is ready. */
  workerReady: boolean;
}

export function useBraille(): UseBrailleReturn {
  const workerRef = useRef<Worker | null>(null);

  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading]           = useState(true);   // true until READY
  const [progress, setProgress]             = useState(0);
  const [error, setError]                   = useState<string | null>(null);
  const [workerReady, setWorkerReady]       = useState(false);

  // -------------------------------------------------------------------------
  // Spawn / tear down the worker
  // -------------------------------------------------------------------------
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/braille.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'READY' }
        | { type: 'RESULT';   result:  string }
        | { type: 'PROGRESS'; percent: number }
        | { type: 'ERROR';    error:   string };

      if (msg.type === 'READY') {
        setWorkerReady(true);
        setIsLoading(false);
      } else if (msg.type === 'PROGRESS') {
        setProgress(msg.percent);
      } else if (msg.type === 'RESULT') {
        setTranslatedText(msg.result);
        setProgress(100);
        setIsLoading(false);
        setError(null);
      } else if (msg.type === 'ERROR') {
        setError(msg.error);
        setIsLoading(false);
      }
    });

    worker.addEventListener('error', (e: ErrorEvent) => {
      setError(`Worker error: ${e.message}`);
      setIsLoading(false);
    });

    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Public translate function
  // -------------------------------------------------------------------------
  const translate = useCallback((text: string, table = 'en-ueb-g2.ctb') => {
    if (!workerRef.current) return;
    setIsLoading(true);
    setProgress(0);
    setError(null);
    workerRef.current.postMessage({ text, table, mathCode });
  }, []);

  return { translate, translatedText, isLoading, progress, error, workerReady };
}
