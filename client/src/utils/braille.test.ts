import { describe, expect, it } from 'vitest';
import {
  asciiToUnicodeBraille,
  isPredominantlyUnicodeBraille,
  unicodeBrailleToAscii,
} from './braille';

describe('Braille Translation Map Fixes', () => {
  it('maps "|" to dots 1-2-5-6 (U+2833)', () => {
    const unicode = asciiToUnicodeBraille('|');
    expect(unicode).toBe('\u2833');
  });

  it('maps "\\" to dots 1-2-5-6 (U+2833)', () => {
    const unicode = asciiToUnicodeBraille('\\');
    expect(unicode).toBe('\u2833');
  });

  it('converts dots 1-2-5-6 (U+2833) back to "|" (pipe)', () => {
    const ascii = unicodeBrailleToAscii('\u2833');
    expect(ascii).toBe('|');
  });

  it('correctly maps journey with ou contraction (dots 1-2-5-6)', () => {
    const brfText = 'j|rney';
    const unicode = asciiToUnicodeBraille(brfText);
    // \u281a = j, \u2833 = ou contraction, \u2817 = r, \u281d = n, \u2811 = e, \u283d = y
    expect(unicode).toBe('\u281a\u2833\u2817\u281d\u2811\u283d');

    const backToAscii = unicodeBrailleToAscii(unicode);
    expect(backToAscii).toBe('J|RNEY');
  });
});

describe('isPredominantlyUnicodeBraille', () => {
  it('detects a full Unicode braille title line', () => {
    const title = '⠠⠋⠘⠒⠥⠗⠀⠠⠑⠇⠊⠎⠑⠀⠊⠝⠀⠠⠁⠀⠠⠍⠊⠝⠕⠗';
    expect(isPredominantlyUnicodeBraille(title)).toBe(true);
    expect(unicodeBrailleToAscii(title)).toBe(',F^3UR ,ELISE IN ,A ,MINOR');
  });

  it('rejects plain prose and mixed prose+braille at full ratio', () => {
    expect(isPredominantlyUnicodeBraille('Für Elise in A Minor')).toBe(false);
    expect(isPredominantlyUnicodeBraille('Title ⠠⠁')).toBe(false);
    expect(isPredominantlyUnicodeBraille('')).toBe(false);
    expect(isPredominantlyUnicodeBraille('   \n')).toBe(false);
  });

  it('allows a soft ratio for mostly-braille snippets', () => {
    const mixed = `⠠⠁${'x'.repeat(1)}`;
    expect(isPredominantlyUnicodeBraille(mixed, 1)).toBe(false);
    expect(isPredominantlyUnicodeBraille(mixed, 0.5)).toBe(true);
  });
});
