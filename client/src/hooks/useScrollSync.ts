/**
 * Bidirectional print ↔ braille scroll sync.
 *
 * Continuous scrolling must apply to the follower on the same turn as the
 * leader's scroll event. Coalescing onto animation frames (or ignoring *all*
 * scroll events while a lock is held) makes the panes lag apart.
 *
 * Echo suppression is origin-aware: only the follower's bounce-back is ignored.
 * Further events from the same leader keep applying so the two views stay
 * locked together for the whole gesture.
 */
import { useCallback, useEffect, useRef } from 'react';

export type ScrollSyncOrigin = 'editor' | 'preview';

export type FrameScheduler = {
  request: (cb: () => void) => number;
  cancel: (id: number) => void;
};

const defaultScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export function createScrollSync(scheduler: FrameScheduler = defaultScheduler) {
  let leader: ScrollSyncOrigin | null = null;
  let clearId: number | null = null;

  const scheduleClear = () => {
    if (clearId != null) scheduler.cancel(clearId);
    // Two rAFs: allow the browser to dispatch an async scroll event from
    // setScrollTop before a different pane may become leader. Events from the
    // current leader are still accepted while this lock is held.
    clearId = scheduler.request(() => {
      clearId = scheduler.request(() => {
        clearId = null;
        leader = null;
      });
    });
  };

  const syncFrom = (origin: ScrollSyncOrigin, apply: () => void): void => {
    if (leader != null && leader !== origin) return;
    leader = origin;
    apply();
    scheduleClear();
  };

  const dispose = () => {
    if (clearId != null) scheduler.cancel(clearId);
    clearId = null;
    leader = null;
  };

  return { syncFrom, dispose };
}

export function useScrollSync() {
  const syncRef = useRef<ReturnType<typeof createScrollSync> | null>(null);
  if (!syncRef.current) {
    syncRef.current = createScrollSync();
  }

  useEffect(() => {
    return () => {
      syncRef.current?.dispose();
    };
  }, []);

  const syncFrom = useCallback((origin: ScrollSyncOrigin, apply: () => void) => {
    syncRef.current?.syncFrom(origin, apply);
  }, []);

  return { syncFrom };
}
