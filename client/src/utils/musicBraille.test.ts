import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEATS_PER_MEASURE,
  beatsCapacityFromTimeSig,
  keySignatureDeltas,
  midiDownInterval,
  parseBrailleMusic,
  resolveWholeOrSixteenth,
} from './musicBraille';

describe('parseBrailleMusic', () => {
  it('parses middle-C quarter note with octave mark', () => {
    const score = parseBrailleMusic('"?');
    expect(score.events).toHaveLength(1);
    expect(score.events[0].type).toBe('note');
    expect(score.events[0].midiPitches).toEqual([60]);
    expect(score.events[0].durationBeats).toBe(1);
    expect(score.events[0].charIndex).toBe(1);
    expect(score.events[0].measure).toBe(1);
    expect(score.timeSignature).toEqual({ beatsPerMeasure: 4, beatUnit: 4 });
    expect(score.keySignature).toEqual({ sharpsFlatsCount: 0 });
  });

  it('parses a simple C major scale of eighths in one measure', () => {
    const score = parseBrailleMusic('"defghijd');
    expect(score.events).toHaveLength(8);
    expect(score.events.every((e) => e.durationBeats === 0.5)).toBe(true);
    expect(score.events[0].midiPitches[0]).toBe(60);
    expect(score.events[1].midiPitches[0]).toBe(62);
    expect(score.totalBeats).toBeCloseTo(4, 5);
  });

  it('uses spaces as measure boundaries', () => {
    const score = parseBrailleMusic('"? "?');
    expect(score.totalMeasures).toBe(2);
    expect(score.events[0].measure).toBe(1);
    expect(score.events[1].measure).toBe(2);
    expect(score.events[1].timeOffsetBeats).toBeCloseTo(DEFAULT_BEATS_PER_MEASURE, 5);
  });

  it('parses rests', () => {
    const score = parseBrailleMusic('v');
    expect(score.events).toHaveLength(1);
    expect(score.events[0].type).toBe('rest');
    expect(score.events[0].midiPitches).toEqual([]);
    expect(score.events[0].durationBeats).toBe(1);
  });

  it('applies sharp accidental', () => {
    const score = parseBrailleMusic('%"?');
    expect(score.events[0].midiPitches).toEqual([61]);
  });

  it('builds a downward interval chord', () => {
    const score = parseBrailleMusic('"?9');
    expect(score.events[0].type).toBe('chord');
    expect(score.events[0].midiPitches[0]).toBe(60);
    expect(score.events[0].midiPitches[1]).toBe(midiDownInterval(60, 'C', 5));
    expect(score.events[0].midiPitches[1]).toBe(53);
  });

  it('resets voice on in-accord <>', () => {
    const score = parseBrailleMusic('"n<>"o');
    expect(score.events).toHaveLength(2);
    expect(score.events[0].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(score.events[1].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(score.events[0].midiPitches[0]).toBe(60);
    expect(score.events[1].midiPitches[0]).toBe(62);
  });

  it('applies whole/16th online rule from remaining measure space', () => {
    // First whole fits; subsequent whole-shapes become 16ths
    const five = parseBrailleMusic('"yyyyy');
    expect(five.events[0].durationBeats).toBe(4);
    expect(five.events.slice(1).every((e) => e.durationBeats === 0.25)).toBe(true);

    // Lone whole at start of empty measure
    const one = parseBrailleMusic('"y');
    expect(one.events[0].durationBeats).toBe(4);
  });

  it('supports dotted notes via apostrophe', () => {
    const score = parseBrailleMusic('"?\'');
    expect(score.events[0].durationBeats).toBeCloseTo(1.5, 5);
  });

  it('returns empty events for empty / non-music text', () => {
    expect(parseBrailleMusic('').events).toEqual([]);
    expect(parseBrailleMusic('kkk').events).toEqual([]);
  });

  it('parses time signatures #d4, #c4, #f8, and #d/d', () => {
    const fourFour = parseBrailleMusic('#d4"?');
    expect(fourFour.timeSignature).toEqual({ beatsPerMeasure: 4, beatUnit: 4 });
    expect(beatsCapacityFromTimeSig(fourFour.timeSignature)).toBe(4);

    const threeFour = parseBrailleMusic('#c4"?');
    expect(threeFour.timeSignature).toEqual({ beatsPerMeasure: 3, beatUnit: 4 });
    expect(beatsCapacityFromTimeSig(threeFour.timeSignature)).toBe(3);

    const sixEight = parseBrailleMusic('#f8"?');
    expect(sixEight.timeSignature).toEqual({ beatsPerMeasure: 6, beatUnit: 8 });
    expect(beatsCapacityFromTimeSig(sixEight.timeSignature)).toBe(3);

    const slash = parseBrailleMusic('#d/d"?');
    expect(slash.timeSignature).toEqual({ beatsPerMeasure: 4, beatUnit: 4 });
  });

  it('applies key signatures #b% (2 sharps) and #c< (3 flats)', () => {
    // 2 sharps: F# and C#. F eighth = g
    const twoSharps = parseBrailleMusic('#b%"g');
    expect(twoSharps.keySignature.sharpsFlatsCount).toBe(2);
    expect(twoSharps.events[0].midiPitches[0]).toBe(66); // F#4 (65 would be F, +1)

    // F natural octave 4 = 65; with sharp = 66. Wait F4 = 65? C4=60, D=62, E=64, F=65. Yes F#=66.

    const threeFlats = parseBrailleMusic('#c<"j');
    expect(threeFlats.keySignature.sharpsFlatsCount).toBe(-3);
    // 3 flats: Bb Eb Ab. B eighth = j → Bb = 70 (B4=71)
    expect(threeFlats.events[0].midiPitches[0]).toBe(70);
  });

  it('lets inline accidentals override the key signature', () => {
    // 2 sharps but natural on F
    const score = parseBrailleMusic('#b%*"g');
    expect(score.events[0].midiPitches[0]).toBe(65); // F natural
  });

  it('merges tied notes with c and .c', () => {
    const withC = parseBrailleMusic('"?c"?');
    expect(withC.events).toHaveLength(1);
    expect(withC.events[0].durationBeats).toBeCloseTo(2, 5);
    expect(withC.events[0].midiPitches).toEqual([60]);

    const withDotC = parseBrailleMusic('"?.c"?');
    expect(withDotC.events).toHaveLength(1);
    expect(withDotC.events[0].durationBeats).toBeCloseTo(2, 5);
  });

  it('applies triplet prefix 1 to the next three notes (× 2/3)', () => {
    // Three eighths under a triplet = one beat total
    const score = parseBrailleMusic('1"def');
    expect(score.events).toHaveLength(3);
    expect(score.events.every((e) => Math.abs(e.durationBeats - 1 / 3) < 1e-9)).toBe(true);
    expect(score.totalBeats).toBeCloseTo(1, 5);
  });

  it('duplicates the previous measure on bar repeat 0', () => {
    const score = parseBrailleMusic('"? 0');
    expect(score.totalMeasures).toBeGreaterThanOrEqual(2);
    expect(score.events).toHaveLength(2);
    expect(score.events[0].midiPitches).toEqual([60]);
    expect(score.events[1].midiPitches).toEqual([60]);
    expect(score.events[0].measure).toBe(1);
    expect(score.events[1].measure).toBe(2);
    expect(score.events[1].timeOffsetBeats).toBeCloseTo(4, 5);
  });
});

describe('beatsCapacityFromTimeSig', () => {
  it('converts printed meter to quarter-note capacity', () => {
    expect(beatsCapacityFromTimeSig({ beatsPerMeasure: 4, beatUnit: 4 })).toBe(4);
    expect(beatsCapacityFromTimeSig({ beatsPerMeasure: 3, beatUnit: 4 })).toBe(3);
    expect(beatsCapacityFromTimeSig({ beatsPerMeasure: 6, beatUnit: 8 })).toBe(3);
  });
});

describe('keySignatureDeltas', () => {
  it('maps sharp and flat orders', () => {
    expect([...keySignatureDeltas(2).entries()]).toEqual([
      ['F', 1],
      ['C', 1],
    ]);
    expect([...keySignatureDeltas(-3).entries()]).toEqual([
      ['B', -1],
      ['E', -1],
      ['A', -1],
    ]);
  });
});

describe('resolveWholeOrSixteenth', () => {
  it('chooses whole when it fits and 16th when it would overflow', () => {
    expect(resolveWholeOrSixteenth(0, 4)).toBe(4);
    expect(resolveWholeOrSixteenth(1, 4)).toBe(0.25);
    expect(resolveWholeOrSixteenth(0, 3)).toBe(0.25);
  });
});

describe('midiDownInterval', () => {
  it('moves diatonically down a third from C to A', () => {
    expect(midiDownInterval(60, 'C', 3)).toBe(57);
  });

  it('moves an octave down', () => {
    expect(midiDownInterval(60, 'C', 8)).toBe(48);
  });
});
