import { describe, expect, it } from 'vitest';
import {
  SixKeyChordTracker,
  UNICODE_BRAILLE_BLANK,
  dotsToUnicodeCell,
  sixKeyEventToDot,
} from './sixKeyBraille';

describe('sixKeyEventToDot', () => {
  it('maps KeyF/D/S/J/K/L codes to dots 1–6', () => {
    expect(sixKeyEventToDot({ code: 'KeyF' })).toBe(1);
    expect(sixKeyEventToDot({ code: 'KeyD' })).toBe(2);
    expect(sixKeyEventToDot({ code: 'KeyS' })).toBe(3);
    expect(sixKeyEventToDot({ code: 'KeyJ' })).toBe(4);
    expect(sixKeyEventToDot({ code: 'KeyK' })).toBe(5);
    expect(sixKeyEventToDot({ code: 'KeyL' })).toBe(6);
  });

  it('maps letter keys as a fallback', () => {
    expect(sixKeyEventToDot({ key: 'f' })).toBe(1);
    expect(sixKeyEventToDot({ key: 'L' })).toBe(6);
  });

  it('returns null for non-chord keys', () => {
    expect(sixKeyEventToDot({ code: 'KeyA', key: 'a' })).toBeNull();
    expect(sixKeyEventToDot({ code: 'Space', key: ' ' })).toBeNull();
  });
});

describe('dotsToUnicodeCell', () => {
  it('maps empty dots to U+2800', () => {
    expect(dotsToUnicodeCell([])).toBe(UNICODE_BRAILLE_BLANK);
  });

  it('maps single dots', () => {
    expect(dotsToUnicodeCell([1])).toBe('\u2801');
    expect(dotsToUnicodeCell([2])).toBe('\u2802');
    expect(dotsToUnicodeCell([3])).toBe('\u2804');
    expect(dotsToUnicodeCell([4])).toBe('\u2808');
    expect(dotsToUnicodeCell([5])).toBe('\u2810');
    expect(dotsToUnicodeCell([6])).toBe('\u2820');
  });

  it('maps chords (f+d = dots 1+2)', () => {
    expect(dotsToUnicodeCell([1, 2])).toBe('\u2803');
  });

  it('maps full cell dots 1–6', () => {
    expect(dotsToUnicodeCell([1, 2, 3, 4, 5, 6])).toBe('\u283F');
  });
});

describe('SixKeyChordTracker', () => {
  it('emits on last key release', () => {
    const t = new SixKeyChordTracker();
    expect(t.keyDown(1)).toBe(true);
    expect(t.keyDown(2)).toBe(true);
    expect(t.keyUp(1)).toBeNull();
    expect(t.keyUp(2)).toBe('\u2803');
  });

  it('ignores key-repeat downs', () => {
    const t = new SixKeyChordTracker();
    expect(t.keyDown(1)).toBe(true);
    expect(t.keyDown(1)).toBe(false);
    expect(t.keyUp(1)).toBe('\u2801');
  });

  it('resets cleanly', () => {
    const t = new SixKeyChordTracker();
    t.keyDown(1);
    t.reset();
    expect(t.hasPressed).toBe(false);
    expect(t.keyUp(1)).toBeNull();
  });
});
