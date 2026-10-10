import { useEffect, useState } from 'react';
import { COMPACT_VIEWPORT_QUERY, isCompactViewport } from '../utils/os';

export interface CompactViewport {
  compact: boolean;
  width: number;
}

function readViewport(): CompactViewport {
  if (typeof window === 'undefined') {
    return { compact: false, width: 1280 };
  }
  return {
    compact: isCompactViewport(),
    width: window.innerWidth,
  };
}

/**
 * True when the window is narrow enough that the side-by-side editor does not fit.
 * Updates when the viewport crosses the breakpoint or is resized.
 */
export function useCompactViewport(): CompactViewport {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);
    const update = () => setViewport(readViewport());
    update();
    media.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}
