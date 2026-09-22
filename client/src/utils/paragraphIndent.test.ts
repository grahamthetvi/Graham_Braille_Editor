import { describe, expect, it } from 'vitest';
import {
  applyParagraphIndentToRange,
  encodeParagraphIndentBrfPrefix,
  formatParagraphIndentMarker,
  parseParagraphIndentBrfPrefix,
  parseParagraphIndentPrefix,
} from './paragraphIndent';

describe('paragraphIndent', () => {
  it('parses and strips a line prefix', () => {
    const { indent, rest, markerLength } = parseParagraphIndentPrefix('{p:3-5}Hello');
    expect(indent).toEqual({ firstLineStartCell: 3, runoverStartCell: 5 });
    expect(rest).toBe('Hello');
    expect(markerLength).toBe('{p:3-5}'.length);
  });

  it('round-trips BRF sentinel', () => {
    const prefix = encodeParagraphIndentBrfPrefix({ firstLineStartCell: 3, runoverStartCell: 5 });
    const { indent, rest } = parseParagraphIndentBrfPrefix(prefix + 'abc');
    expect(indent).toEqual({ firstLineStartCell: 3, runoverStartCell: 5 });
    expect(rest).toBe('abc');
  });

  it('applies markers to selected paragraphs only', () => {
    const text = 'One\nTwo\nThree';
    const marker = formatParagraphIndentMarker({ firstLineStartCell: 3, runoverStartCell: 5 });
    const { text: next } = applyParagraphIndentToRange(text, 4, 7, {
      firstLineStartCell: 3,
      runoverStartCell: 5,
    });
    expect(next).toBe(`One\n${marker}Two\nThree`);
  });

  it('replaces an existing marker on a line', () => {
    const text = '{p:1-1}Hello';
    const { text: next } = applyParagraphIndentToRange(text, 0, text.length, {
      firstLineStartCell: 3,
      runoverStartCell: 5,
    });
    expect(next).toBe('{p:3-5}Hello');
  });
});
