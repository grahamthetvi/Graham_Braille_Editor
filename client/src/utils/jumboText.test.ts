import { describe, expect, it } from 'vitest';
import { asciiToUnicodeBraille, JUMBO_LINE_MARKER } from './braille';
import { formatBrfPages } from './brailleFormat';

const M = JUMBO_LINE_MARKER; // '\u0002'

describe('jumbo / large-print text pipeline', () => {
  it('passes jumbo-marked lines through asciiToUnicodeBraille as literal text', () => {
    const jumboLine = `${M}48${M}Hello World`;
    expect(asciiToUnicodeBraille(jumboLine)).toBe(jumboLine);
  });

  it('still translates normal lines to unicode braille', () => {
    const out = asciiToUnicodeBraille('abc');
    // Should be converted to braille patterns, not left as ASCII letters.
    expect(out).not.toBe('abc');
    for (const ch of out) {
      expect(ch.codePointAt(0)!).toBeGreaterThanOrEqual(0x2800);
    }
  });

  it('handles a document mixing braille and jumbo lines', () => {
    const input = `abc\n${M}48${M}Big Text\nxyz`;
    const out = asciiToUnicodeBraille(input);
    const lines = out.split('\n');
    expect(lines[1]).toBe(`${M}48${M}Big Text`); // jumbo line untouched
    expect(lines[0]).not.toBe('abc'); // braille translated
    expect(lines[2]).not.toBe('xyz');
  });

  it('keeps the jumbo marker + text intact through pagination (no braille wrapping)', () => {
    const jumboLine = `${M}96${M}This is a very long line of large print text that would normally wrap`;
    const pages = formatBrfPages(jumboLine, 10, 25, false);
    const allLines = pages.join('\n').split('\n');
    const found = allLines.find(l => l.startsWith(M));
    expect(found).toBe(jumboLine);
  });
});
