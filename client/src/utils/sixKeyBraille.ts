/**
 * Braille Blaster–style 6-key chord input on a QWERTY home row:
 *   F D S  = dots 1 2 3
 *   J K L  = dots 4 5 6
 *
 * Chord timing: accumulate dots while keys are held; emit one cell when
 * the last chord key is released.
 */

/** Physical key codes → braille dot numbers (1–6). */
export const SIX_KEY_CODE_TO_DOT: Readonly<Record<string, number>> = {
  KeyF: 1,
  KeyD: 2,
  KeyS: 3,
  KeyJ: 4,
  KeyK: 5,
  KeyL: 6,
};

/** Lowercase letter → dot (fallback when only `key` is available). */
export const SIX_KEY_LETTER_TO_DOT: Readonly<Record<string, number>> = {
  f: 1,
  d: 2,
  s: 3,
  j: 4,
  k: 5,
  l: 6,
};

export const UNICODE_BRAILLE_BLANK = '\u2800';

/** Resolve a KeyboardEvent-like object to a dot number, or null if not a chord key. */
export function sixKeyEventToDot(e: { code?: string; key?: string }): number | null {
  if (e.code && SIX_KEY_CODE_TO_DOT[e.code] !== undefined) {
    return SIX_KEY_CODE_TO_DOT[e.code];
  }
  if (e.key && e.key.length === 1) {
    const dot = SIX_KEY_LETTER_TO_DOT[e.key.toLowerCase()];
    return dot !== undefined ? dot : null;
  }
  return null;
}

/**
 * Convert active dots (1–6) to a Unicode braille cell (U+2800–U+283F).
 * Dot n sets bit (n − 1), matching the Unicode Braille Patterns block.
 */
export function dotsToUnicodeCell(dots: Iterable<number>): string {
  let mask = 0;
  for (const d of dots) {
    if (d >= 1 && d <= 6) mask |= 1 << (d - 1);
  }
  return String.fromCharCode(0x2800 + mask);
}

/** Mutable chord tracker for keydown/keyup handling. */
export class SixKeyChordTracker {
  private pressed = new Set<number>();
  private accumulated = new Set<number>();

  /** Record a chord key down. Returns true if this was a new press. */
  keyDown(dot: number): boolean {
    if (this.pressed.has(dot)) return false;
    this.pressed.add(dot);
    this.accumulated.add(dot);
    return true;
  }

  /**
   * Record a chord key up. When the last chord key releases, returns the
   * Unicode cell for the accumulated chord (or null if empty / still held).
   */
  keyUp(dot: number): string | null {
    this.pressed.delete(dot);
    if (this.pressed.size > 0) return null;
    if (this.accumulated.size === 0) return null;
    const cell = dotsToUnicodeCell(this.accumulated);
    this.accumulated.clear();
    return cell;
  }

  reset(): void {
    this.pressed.clear();
    this.accumulated.clear();
  }

  get hasPressed(): boolean {
    return this.pressed.size > 0;
  }
}
