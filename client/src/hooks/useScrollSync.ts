/**
 * Coalesces bidirectional scroll sync onto animation frames and suppresses
 * re-entrant scroll events caused by programmatic scrollTop updates.
 */
import { useCallback, useEffect, useRef } from 'react';

export function useScrollSync() {
  const syncingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const clearSyncRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (clearSyncRafRef.current != null) cancelAnimationFrame(clearSyncRafRef.current);
    };
  }, []);

  const isSyncing = useCallback(() => syncingRef.current, []);

  /** Run a programmatic scroll and ignore peer scroll events until after paint. */
  const runSynced = useCallback((fn: () => void) => {
    syncingRef.current = true;
    if (clearSyncRafRef.current != null) cancelAnimationFrame(clearSyncRafRef.current);
    try {
      fn();
    } finally {
      // Two rAFs: allow the browser to dispatch the scroll event from setScrollTop
      // before we accept user-driven sync again.
      clearSyncRafRef.current = requestAnimationFrame(() => {
        clearSyncRafRef.current = requestAnimationFrame(() => {
          clearSyncRafRef.current = null;
          syncingRef.current = false;
        });
      });
    }
  }, []);

  /** Coalesce rapid scroll callbacks to once per frame. */
  const schedule = useCallback((fn: () => void) => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      fn();
    });
  }, []);

  return { isSyncing, runSynced, schedule };
}
