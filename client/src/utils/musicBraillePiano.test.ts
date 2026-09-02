import { describe, expect, it } from 'vitest';
import {
  alignHandChunks,
  extractHandChunks,
  matchHandSignAt,
  sanitizePianoChunkText,
  segmentPianoSystems,
  skipSaoMaiLineNumberAt,
  skipSaoMaiMeasureLabelAt,
  skipWordSignAt,
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

  it('keeps volta #1/#2 and print-repeat <7/<2 for the lexer', () => {
    expect(sanitizePianoChunkText('#1"[', [0, 1, 2, 3]).text).toBe('#1"[');
    expect(sanitizePianoChunkText('<7.f', [0, 1, 2, 3]).text).toBe('<7.f');
    expect(sanitizePianoChunkText('"[<2', [0, 1, 2, 3]).text).toBe('"[<2');
  });

  it('still drops other #nuance runs that are not voltas', () => {
    expect(sanitizePianoChunkText('#3"[', [0, 1, 2, 3]).text).toBe('"[');
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

describe('slash-L hand signs (>/l RH, >#l LH)', () => {
  it('matches dialect and Sao Mai hand signs', () => {
    expect(matchHandSignAt('>/l#c8', 0)).toEqual({ hand: 'rh', next: 3 });
    expect(matchHandSignAt('>#l#c8', 0)).toEqual({ hand: 'lh', next: 3 });
    expect(matchHandSignAt('.>"?', 0)).toEqual({ hand: 'rh', next: 2 });
    expect(matchHandSignAt('_>x', 0)).toEqual({ hand: 'lh', next: 2 });
  });

  it('extracts RH notes after >/l and word marks ending in apostrophe', () => {
    const { hand, chunks } = extractHandChunks(
      "a >/l#c8 >pp>poco moto'.&%Z &%Z&\")*ZY",
      0,
    );
    expect(hand).toBe('rh');
    expect(chunks.map((c) => c.text).join(' ')).toContain('.&%z');
    expect(chunks.some((c) => c.text.includes('&'))).toBe(true);
  });

  it('extracts LH rests after >#l', () => {
    const { hand, chunks } = extractHandChunks(
      "  >#l#c8 >poco moto'x       m",
      0,
    );
    expect(hand).toBe('lh');
    expect(chunks.map((c) => c.text).join(' ')).toMatch(/x/);
  });

  it('segments bar-over-bar systems including unmarked continuation lines', () => {
    const brf = `a >/l#c8 >pp>poco moto'.&%Z &%Z&")*ZY 
  >#l#c8 >poco moto'x       m         
b "Im"Y&! Jm&%()   Dm"&.&%Z &%Z&")*ZY 
  ^!_&!mx ^&_&%(mx ^!_&!mx  m`;
    const systems = segmentPianoSystems(brf);
    expect(systems.length).toBeGreaterThanOrEqual(2);
    expect(systems[0].rh.length).toBeGreaterThan(0);
    expect(systems[0].lh.length).toBeGreaterThan(0);
    // Measure b continues without repeating >/l / >#l
    expect(systems[1].rh.length).toBeGreaterThan(0);
    expect(systems[1].lh.length).toBeGreaterThan(0);
  });

  it('splits mid-line hand switches into segments', () => {
    const { segments } = extractHandChunks('>#l^!_&!mm>/l"&c', 0);
    expect(segments.length).toBe(2);
    expect(segments[0].hand).toBe('lh');
    expect(segments[1].hand).toBe('rh');
  });
});

describe('skipWordSignAt', () => {
  it('skips glued dynamics without consuming following notes', () => {
    expect(skipWordSignAt('>MP.F%E', 0)).toBe(3);
    expect(skipWordSignAt('>mf.$X', 0)).toBe(3);
    expect(skipWordSignAt('>pp.&%Z', 0)).toBe(3);
    expect(skipWordSignAt('>C"JDE', 0)).toBe(2);
    expect(skipWordSignAt('>D"F', 0)).toBe(2);
    expect(skipWordSignAt('>4', 0)).toBe(2);
  });

  it('skips instrument words and does not consume >/l hand signs', () => {
    expect(skipWordSignAt(">PNO'", 0)).toBe(5);
    expect(skipWordSignAt('>/l#c8', 0)).toBeNull();
    expect(skipWordSignAt('>#l#c8', 0)).toBeNull();
  });

  it('skips >poco moto> / apostrophe-terminated phrases', () => {
    const phrase = ">poco moto'.&%Z";
    const end = skipWordSignAt(phrase, 0);
    expect(end).toBe(phrase.indexOf('.') );
    expect(phrase.slice(end!)).toBe('.&%Z');
  });
});

describe('skipSaoMaiMeasureLabelAt / skipSaoMaiLineNumberAt', () => {
  it('skips #1"31A and trailing space, leaving the notes', () => {
    const line = '#1"31A U>MP.F%E';
    const end = skipSaoMaiMeasureLabelAt(line, 0);
    expect(end).toBe(line.indexOf('U'));
    expect(skipSaoMaiMeasureLabelAt('#1"?', 0)).toBeNull();
    expect(skipSaoMaiMeasureLabelAt('#C4', 0)).toBeNull();
  });

  it('skips two-digit labels like #12"31AB', () => {
    const line = '#12"31AB .?X';
    const end = skipSaoMaiMeasureLabelAt(line, 0);
    expect(end).toBe(line.indexOf('.'));
  });

  it('skips ,L#A line numbers', () => {
    expect(skipSaoMaiLineNumberAt(',L#A', 0)).toBe(4);
    expect(skipSaoMaiLineNumberAt(',L#BB', 0)).toBe(5);
    expect(skipSaoMaiLineNumberAt(',PIANO', 0)).toBeNull();
  });
});
