/**
 * useBraille — React hook that owns the braille Web Worker lifecycle.
 *
 * Usage:
 *   const { translate, translatedText, isLoading, progress, error } = useBraille();
 *   translate('Hello world', 'en-ueb-g1.ctb');
 *
 * The worker is an ES module worker (Vite worker format: 'es').
 * Message protocol matches workers/braille.worker.ts:
 *   send    → { text: string, table?: string }
 *   receive → { type: 'READY' }
 *             { type: 'RESULT',   result: string }
 *             { type: 'CONVERT_MATH_RESULT', result: string }
 *             { type: 'BACK_TRANSLATE_RESULT', plainText: string, brf: string }
 *             { type: 'PROGRESS', percent: number }
 *             { type: 'ERROR',    error:  string }
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TABLE } from '../utils/tableRegistry';
import type { WordMapData } from '../workers/braille.worker';

export type BrailleTable = string;
export type MathCode = 'nemeth' | 'ueb';

export type BackTranslateBrfResult = { plainText: string; brf: string };

export interface UseBrailleReturn {
  /** Call this with plain text and an optional liblouis table filename and math code. */
  translate: (text: string, table?: string, mathCode?: MathCode) => void;
  /** Translates only the math portions of the text and returns the new text via a Promise. */
  convertMath: (text: string, mathCode?: MathCode) => Promise<string>;
  /**
   * ASCII BRF → plain text using liblouis back-translation for the given table.
   * Resolves with the same `brf` string passed in (after you normalize on the caller side).
   * Grade 2 back-translation is approximate and may not match original source wording.
   */
  backTranslateBrf: (brf: string, table?: string) => Promise<BackTranslateBrfResult>;
  /** The most recent translated BRF string (Braille ASCII). */
  translatedText: string;
  /** The source string that corresponds to the most recent translatedText. */
  translatedSourceText: string;
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
  /** Source-word-to-BRF-word mapping derived from liblouis outputPos. */
  wordMap: WordMapData | null;
}

const WORKER_TIMEOUT_MS = 30000;

export function useBraille(): UseBrailleReturn {
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const convertMathResolvers = useRef<Array<(result: string) => void>>([]);
  const pendingBackTranslateRef = useRef<{
    resolve: (v: BackTranslateBrfResult) => void;
    reject: (e: Error) => void;
  } | null>(null);

  const [translatedText, setTranslatedText] = useState('');
  const [translatedSourceText, setTranslatedSourceText] = useState('');
  const [isLoading, setIsLoading] = useState(true);   // true until READY
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [wordMap, setWordMap] = useState<WordMapData | null>(null);
  const isWorkerReadyRef = useRef(false);
  const pendingTranslateRef = useRef<{ text: string; table: string; mathCode: MathCode } | null>(null);

  // -------------------------------------------------------------------------
  // Spawn / tear down the worker
  // -------------------------------------------------------------------------
  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }
    
    const worker = new Worker(
      new URL('../workers/braille.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'READY' }
        | { type: 'RESULT'; result: string; sourceText: string; wordMap?: WordMapData }
        | { type: 'CONVERT_MATH_RESULT'; result: string }
        | { type: 'BACK_TRANSLATE_RESULT'; plainText: string; brf: string }
        | { type: 'PROGRESS'; percent: number }
        | { type: 'ERROR'; error: string };

      if (['RESULT', 'CONVERT_MATH_RESULT', 'BACK_TRANSLATE_RESULT', 'ERROR'].includes(msg.type)) {
         if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }

      if (msg.type === 'READY') {
        setWorkerReady(true);
        isWorkerReadyRef.current = true;
        setIsLoading(false);
      } else if (msg.type === 'PROGRESS') {
        setProgress(msg.percent);
      } else if (msg.type === 'RESULT') {
        setTranslatedText(msg.result);
        setTranslatedSourceText(msg.sourceText);
        setWordMap(msg.wordMap ?? null);
        setProgress(100);
        setIsLoading(false);
        setError(null);
      } else if (msg.type === 'CONVERT_MATH_RESULT') {
        const resolve = convertMathResolvers.current.shift();
        if (resolve) resolve(msg.result);
      } else if (msg.type === 'BACK_TRANSLATE_RESULT') {
        setTranslatedText(msg.brf);
        setProgress(100);
        setIsLoading(false);
        setError(null);
        const pending = pendingBackTranslateRef.current;
        pendingBackTranslateRef.current = null;
        if (pending) pending.resolve({ plainText: msg.plainText, brf: msg.brf });
      } else if (msg.type === 'ERROR') {
        const pendingBt = pendingBackTranslateRef.current;
        pendingBackTranslateRef.current = null;
        if (pendingBt) pendingBt.reject(new Error(msg.error));
        setError(msg.error);
        setIsLoading(false);
      }
    });

    worker.addEventListener('error', (e: ErrorEvent) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      const pendingBt = pendingBackTranslateRef.current;
      pendingBackTranslateRef.current = null;
      if (pendingBt) pendingBt.reject(new Error(e.message));
      setError(`Worker error: ${e.message}`);
      setIsLoading(false);
    });

    workerRef.current = worker;
  }, []);

  useEffect(() => {
    initWorker();
    return () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [initWorker]);


  const startWorkerTask = useCallback(() => {
    setIsLoading(true);
    setProgress(0);
    setError(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    timeoutRef.current = setTimeout(() => {
      setError('Translation timed out. Try splitting the document into smaller chunks.');
      setIsLoading(false);
      initWorker(); // Reboot the dead worker
    }, WORKER_TIMEOUT_MS);
  }, [initWorker]);

  // -------------------------------------------------------------------------
  // Public translate function
  // -------------------------------------------------------------------------
  const translate = useCallback((text: string, table = DEFAULT_TABLE, mathCode: MathCode = 'nemeth') => {
    if (!workerRef.current) return;
    if (!isWorkerReadyRef.current) {
      pendingTranslateRef.current = { text, table, mathCode };
      setIsLoading(true);
      return;
    }
    startWorkerTask();
    workerRef.current.postMessage({ type: 'TRANSLATE', text, table, mathCode });
  }, [startWorkerTask]);

  // -------------------------------------------------------------------------
  // Public convertMath function
  // -------------------------------------------------------------------------
  const convertMath = useCallback((text: string, mathCode: MathCode = 'nemeth'): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not ready'));
        return;
      }
      startWorkerTask();
      convertMathResolvers.current.push(resolve);
      workerRef.current.postMessage({ type: 'CONVERT_MATH_ONLY', text, mathCode });
    });
  }, [startWorkerTask]);

  const backTranslateBrf = useCallback((brf: string, table = DEFAULT_TABLE): Promise<BackTranslateBrfResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not ready'));
        return;
      }
      startWorkerTask();
      pendingBackTranslateRef.current = { resolve, reject };
      workerRef.current.postMessage({ type: 'BACK_TRANSLATE', text: brf, table });
    });
  }, [startWorkerTask]);

  useEffect(() => {
    if (workerReady && pendingTranslateRef.current) {
      const { text, table, mathCode } = pendingTranslateRef.current;
      pendingTranslateRef.current = null;
      translate(text, table, mathCode);
    }
  }, [workerReady, translate]);

  return {
    translate,
    convertMath,
    backTranslateBrf,
    translatedText,
    translatedSourceText,
    isLoading,
    progress,
    error,
    workerReady,
    wordMap,
  };
}

