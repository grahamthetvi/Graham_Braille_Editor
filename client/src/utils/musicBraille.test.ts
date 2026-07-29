import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BEATS_PER_MEASURE,
  midiDownInterval,
  parseBrailleMusic,
} from './musicBraille';

describe('parseBrailleMusic', () => {
  it('parses middle-C quarter note with octave mark', () => {
    // " = octave 4, ? = C quarter
    const score = parseBrailleMusic('"?');
    expect(score.events).toHaveLength(1);
    expect(score.events[0].type).toBe('note');
    expect(score.events[0].midiPitches).toEqual([60]);
    expect(score.events[0].durationBeats).toBe(1);
    expect(score.events[0].charIndex).toBe(1);
    expect(score.events[0].measure).toBe(1);
  });

  it('parses a simple C major scale of eighths in one measure (fills 4/4 as shorts)', () => {
    // 8 eighths of long reading = 4 beats → keep long
    const score = parseBrailleMusic('"defghijd');
    expect(score.events).toHaveLength(8);
    expect(score.events.every((e) => e.durationBeats === 0.5)).toBe(true);
    expect(score.events[0].midiPitches[0]).toBe(60); // C4
    expect(score.events[1].midiPitches[0]).toBe(62); // D4
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
    // % = sharp, " = oct 4, ? = C → C#
    const score = parseBrailleMusic('%"?');
    expect(score.events[0].midiPitches).toEqual([61]);
  });

  it('builds a downward interval chord', () => {
    // C quarter with fifth below → C + F below (diatonic 5th down)
    const score = parseBrailleMusic('"?9');
    expect(score.events[0].type).toBe('chord');
    expect(score.events[0].midiPitches[0]).toBe(60);
    expect(score.events[0].midiPitches[1]).toBe(midiDownInterval(60, 'C', 5));
    expect(score.events[0].midiPitches[1]).toBe(53); // F3
  });

  it('resets voice on in-accord <>', () => {
    // Two half notes stacked via in-accord should share onset
    const score = parseBrailleMusic('"n<>"o');
    expect(score.events).toHaveLength(2);
    expect(score.events[0].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(score.events[1].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(score.events[0].midiPitches[0]).toBe(60);
    expect(score.events[1].midiPitches[0]).toBe(62);
  });

  it('switches to short values when long reading overflows the measure', () => {
    // 5 whole-note shapes in one measure → long = 20 beats; short (16ths) = 1.25
    // Still overflows 4 — but should prefer short over long
    const fiveWholes = parseBrailleMusic('"yyyyy');
    expect(fiveWholes.events.every((e) => e.durationBeats === 0.25)).toBe(true);

    // Exactly 16 sixteenths (whole shapes) = 4 beats with short reading
    const sixteen = parseBrailleMusic('"yyyyyyyyyyyyyyyy');
    expect(sixteen.events).toHaveLength(16);
    expect(sixteen.events.every((e) => e.durationBeats === 0.25)).toBe(true);
    expect(sixteen.totalBeats).toBeCloseTo(4, 5);
  });

  it('supports dotted notes via apostrophe', () => {
    const score = parseBrailleMusic('"?\'');
    expect(score.events[0].durationBeats).toBeCloseTo(1.5, 5);
  });

  it('returns empty AST for empty / non-music text', () => {
    expect(parseBrailleMusic('').events).toEqual([]);
    // Literary letters overlap music note cells (e.g. "hello" → h,e,…);
    // use characters outside the music note/rest alphabet.
    expect(parseBrailleMusic('kkk 111').events).toEqual([]);
  });
});

describe('midiDownInterval', () => {
  it('moves diatonically down a third from C to A', () => {
    expect(midiDownInterval(60, 'C', 3)).toBe(57); // A3
  });

  it('moves an octave down', () => {
    expect(midiDownInterval(60, 'C', 8)).toBe(48);
  });
});
