/**
 * Operating System and Environment utilities.
 */

export function isChromeOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /CrOS/.test(navigator.userAgent);
}

export function supportsWebUSB(): boolean {
    if (typeof navigator === 'undefined') return false;
    return 'usb' in navigator;
}

/**
 * Returns true if the current environment is a Chromebook
 * and WebUSB is supported by the browser.
 */
export function canUseWebUSB(): boolean {
    return isChromeOS() && supportsWebUSB();
}

export function isMac(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Mac/.test(navigator.userAgent);
}

export function isWindows(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Win/.test(navigator.userAgent);
}

export function isLinux(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /Linux/.test(navigator.userAgent) && !isChromeOS();
}

/**
 * Phone and narrow-window layout. Keep this in sync with
 * `@media (max-width: 820px)` in App.css.
 *
 * The signal is the viewport, not the user agent. A desktop window dragged
 * narrow has the same cramped editor as a phone, and some tablets report a
 * desktop user agent.
 */
export const COMPACT_VIEWPORT_MAX_WIDTH_PX = 820;

export const COMPACT_VIEWPORT_QUERY = `(max-width: ${COMPACT_VIEWPORT_MAX_WIDTH_PX}px)`;

/**
 * Smallest braille display size on a very narrow screen. Below this, dots stop
 * reading as separate cells, so the row may scroll instead of shrinking further.
 */
export const COMPACT_BRAILLE_MIN_PX = 8;

/** Editor font used on a wide layout. Compact screens may go smaller so one row fits. */
export const EDITOR_FONT_SIZE_PX = 16;

const EDITOR_FONT_MIN_PX = 11;
const EDITOR_CHROME_PX = 28;
const EDITOR_CHAR_WIDTH_RATIO = 0.68;
const EDITOR_LINE_NUMBER_CHARS = 3;

/**
 * Horizontal padding (px) the compact preview spends outside the braille cells:
 * pane padding plus the compact `.brf-page` padding in App.css.
 */
const COMPACT_BRAILLE_CHROME_PX = 28;

/** Cell width (0.64) plus the gap after it (0.4), both fractions of the display size. */
const BRAILLE_CELL_PITCH_RATIO = 1.04;

export function isCompactViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
}

/**
 * Display size that keeps a full braille row inside a narrow viewport.
 * Never larger than the user's chosen size, and never below
 * {@link COMPACT_BRAILLE_MIN_PX} unless they already chose something smaller.
 */
export function fittedBrailleDisplaySize(
    preferredSize: number,
    viewportWidth: number,
    cellsPerRow: number,
): number {
    const available = Math.max(1, viewportWidth - COMPACT_BRAILLE_CHROME_PX);
    const columns = Math.max(1, cellsPerRow);
    const fitted = Math.floor(available / (columns * BRAILLE_CELL_PITCH_RATIO));
    const readable = Math.max(COMPACT_BRAILLE_MIN_PX, fitted);
    return Math.min(preferredSize, readable);
}

/**
 * Monaco font size that fits one braille row, including the line-number gutter,
 * inside a narrow viewport. Wide windows stay at {@link EDITOR_FONT_SIZE_PX}.
 */
export function fittedEditorFontSize(viewportWidth: number, cellsPerRow: number): number {
    const available = Math.max(1, viewportWidth - EDITOR_CHROME_PX);
    const columns = Math.max(1, cellsPerRow) + EDITOR_LINE_NUMBER_CHARS;
    const fitted = Math.floor(available / (columns * EDITOR_CHAR_WIDTH_RATIO));
    return Math.max(EDITOR_FONT_MIN_PX, Math.min(EDITOR_FONT_SIZE_PX, fitted));
}
