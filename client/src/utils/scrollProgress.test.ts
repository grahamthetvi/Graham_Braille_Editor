import { describe, expect, it } from 'vitest';
import { lineFromProgress, progressFromLine } from './scrollProgress';

describe('scrollProgress', () => {
  it('round-trips line + fraction', () => {
    const lineCount = 200;
    for (const line of [0, 1, 50, 149]) {
      const p = progressFromLine(line, 0.25, lineCount);
      const back = lineFromProgress(p, lineCount);
      expect(back.lineIndex0).toBe(line);
      expect(back.frac).toBeCloseTo(0.25, 8);
    }
  });

  it('maps the last line to 1', () => {
    expect(progressFromLine(9, 0, 10)).toBe(1);
    expect(lineFromProgress(1, 10)).toEqual({ lineIndex0: 9, frac: 0 });
  });
});
