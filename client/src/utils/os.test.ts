import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  COMPACT_VIEWPORT_QUERY,
  fittedBrailleDisplaySize,
  fittedEditorFontSize,
  isCompactViewport,
} from './os';

describe('isCompactViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the same breakpoint as the compact layout CSS', () => {
    expect(COMPACT_VIEWPORT_QUERY).toBe('(max-width: 820px)');
  });

  it('is false when the viewport cannot be measured', () => {
    expect(isCompactViewport()).toBe(false);
    vi.stubGlobal('window', {});
    expect(isCompactViewport()).toBe(false);
  });

  it('follows the viewport media query', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('window', { matchMedia });
    expect(isCompactViewport()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 820px)');

    matchMedia.mockReturnValue({ matches: false });
    expect(isCompactViewport()).toBe(false);
  });
});

describe('fittedBrailleDisplaySize', () => {
  it('shrinks a 40-cell row so the whole line fits a phone', () => {
    expect(fittedBrailleDisplaySize(20, 390, 40)).toBe(8);
  });

  it('keeps a size that already fits', () => {
    expect(fittedBrailleDisplaySize(16, 900, 32)).toBe(16);
  });

  it('does not enlarge a size the user set smaller than the fit', () => {
    expect(fittedBrailleDisplaySize(6, 1200, 32)).toBe(6);
  });

  it('uses at least one column', () => {
    expect(fittedBrailleDisplaySize(20, 400, 0)).toBe(20);
  });
});

describe('fittedEditorFontSize', () => {
  it('shrinks the editor so a 40-cell row fits a phone', () => {
    expect(fittedEditorFontSize(390, 40)).toBe(12);
  });

  it('stays at the desktop size when the row already fits', () => {
    expect(fittedEditorFontSize(1280, 40)).toBe(16);
  });
});
