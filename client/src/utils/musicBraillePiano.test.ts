import { describe, expect, it } from 'vitest';
import {
  alignHandChunks,
  extractHandChunks,
  sanitizePianoChunkText,
  type PianoChunk,
} from './musicBraillePiano';

describe('sanitizePianoChunkText', () => {
  it('strips slur l and fingering digits while keeping notes and ties', () => {
    const text = '"?l1":c';
    const indexMap = [...text].map((_, i) => i);
    const out = sanitizePianoChunkText(text, indexMap);
    expect(out.text).toBe('"?":c');
    expect(out.indexMap).toHaveLength(out.text.length);
  });

  it('keeps true post-note intervals and leading triplets', () => {
    expect(sanitizePianoChunkText('"?9', [0, 1, 2]).text).toBe('"?9');
    expect(sanitizePianoChunkText('1"?":"$', [0, 1, 2, 3, 4, 5]).text).toBe(
      '1"?":"$',
    );
  });

  it('drops Sao Mai <c noise prefixes and orphan *c', () => {
    expect(sanitizePianoChunkText('<c^!', [0, 1, 2, 3]).text).toBe('^!');
    expect(sanitizePianoChunkText('*c"?', [0, 1, 2, 3]).text).toBe('"?');
  });

  it('drops #nuance runs so #1 is not a triplet', () => {
    expect(sanitizePianoChunkText('#1"[', [0, 1, 2, 3]).text).toBe('"[');
  });
});

describe('alignHandChunks', () => {
  const chunk = (text: string, start = 0): PianoChunk => ({
    start,
    text,
    indexMap: [...text].map((_, i) => start + i),
  });

  it('pairs equal-length hands and appends leftovers from the longer hand', () => {
    const rh = [chunk('a', 0), chunk('b', 10), chunk('c', 20)];
    const lh = [chunk('x', 100), chunk('y', 110)];
    const paired = alignHandChunks(rh, lh);
    expect(paired).toEqual([
      { rh: rh[0], lh: lh[0] },
      { rh: rh[1], lh: lh[1] },
      { rh: rh[2] },
    ]);
  });

  it('appends leftover LH when RH is shorter', () => {
    const rh = [chunk('a', 0)];
    const lh = [chunk('x', 100), chunk('y', 110)];
    expect(alignHandChunks(rh, lh)).toEqual([
      { rh: rh[0], lh: lh[0] },
      { lh: lh[1] },
    ]);
  });
});

describe('extractHandChunks landmine stripping', () => {
  it('returns sanitized note chunks without slur or bare fingering 0', () => {
    const line = '.>"?l ":0"$';
    const { hand, chunks } = extractHandChunks(line, 0);
    expect(hand).toBe('rh');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined).not.toMatch(/l/);
    // Bare measure-start 0 fingering should not survive as its own token.
    expect(chunks.some((c) => c.text === '0')).toBe(false);
  });
});
