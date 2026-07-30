import { describe, expect, it } from 'vitest';
import { asciiToUnicodeBraille, unicodeBrailleToAscii } from './braille';
import {
  DEFAULT_BEATS_PER_MEASURE,
  beatForCharIndex,
  beatsCapacityFromTimeSig,
  findMusicStartCharIndex,
  keySignatureDeltas,
  mergeTiedEvents,
  midiDownInterval,
  parseBrailleMusic,
  resolveWholeOrSixteenth,
} from './musicBraille';
import type { MusicNoteEvent } from '../types/musicBraille';
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

  it('parses Unicode braille music the same as ASCII BRF', () => {
    const ascii = '"?:$]\\[w';
    const unicode = asciiToUnicodeBraille(ascii);
    expect(unicode).toMatch(/^[\u2800-\u28FF]+$/);

    const fromAscii = parseBrailleMusic(ascii);
    const fromUnicode = parseBrailleMusic(unicode);

    expect(fromUnicode.events).toHaveLength(fromAscii.events.length);
    expect(fromUnicode.totalBeats).toBeCloseTo(fromAscii.totalBeats, 5);
    for (let i = 0; i < fromAscii.events.length; i++) {
      expect(fromUnicode.events[i].midiPitches).toEqual(fromAscii.events[i].midiPitches);
      expect(fromUnicode.events[i].durationBeats).toBe(fromAscii.events[i].durationBeats);
      expect(fromUnicode.events[i].charIndex).toBe(fromAscii.events[i].charIndex);
      expect(fromUnicode.events[i].timeOffsetBeats).toBeCloseTo(
        fromAscii.events[i].timeOffsetBeats,
        5,
      );
    }
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

  it('does not crush in-accord voices when parallel parts each fill the measure', () => {
    // Two half notes per voice (4 beats each). Summing both voices used to
    // exceed capacity and force 32nd-note values, so playback sounded like a
    // scrambled burst instead of overlapping halves.
    const score = parseBrailleMusic('"nr<>"os');
    expect(score.events).toHaveLength(4);
    expect(score.totalBeats).toBeCloseTo(4, 5);
    for (const e of score.events) {
      expect(e.durationBeats).toBeCloseTo(2, 5);
    }
    const byStart = [...score.events].sort(
      (a, b) => a.timeOffsetBeats - b.timeOffsetBeats || a.charIndex - b.charIndex,
    );
    expect(byStart[0].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(byStart[1].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(byStart[2].timeOffsetBeats).toBeCloseTo(2, 5);
    expect(byStart[3].timeOffsetBeats).toBeCloseTo(2, 5);
  });

  it('keeps quarter values for two full parallel in-accord voices', () => {
    const score = parseBrailleMusic('"?:$]<>"w[\\$');
    expect(score.events).toHaveLength(8);
    expect(score.events.every((e) => Math.abs(e.durationBeats - 1) < 1e-9)).toBe(true);
    expect(score.totalBeats).toBeCloseTo(4, 5);
  });

  it('still prefers a sixteenth grid over inaudible 64ths when quarters overflow', () => {
    // Five quarters in one voice exceed 4/4 — use 16th grid (audible), not 64ths.
    const score = parseBrailleMusic('"?:$]?');
    expect(score.events).toHaveLength(5);
    expect(score.events.every((e) => Math.abs(e.durationBeats - 0.25) < 1e-9)).toBe(
      true,
    );
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

  it('merges tied chords when all pitches match (order-independent)', () => {
    const events: MusicNoteEvent[] = [
      {
        id: 'a',
        charIndex: 0,
        measure: 1,
        timeOffsetBeats: 0,
        durationBeats: 1,
        midiPitches: [60, 64, 67],
        type: 'chord',
        isTied: true,
      },
      {
        id: 'b',
        charIndex: 4,
        measure: 1,
        timeOffsetBeats: 1,
        durationBeats: 1,
        midiPitches: [67, 60, 64],
        type: 'chord',
        isTied: false,
      },
    ];
    const merged = mergeTiedEvents(events);
    expect(merged).toHaveLength(1);
    expect(merged[0].durationBeats).toBeCloseTo(2, 5);
    expect(merged[0].midiPitches).toEqual([60, 64, 67]);
  });

  it('does not merge ties when chord pitches differ', () => {
    const merged = mergeTiedEvents([
      {
        id: 'a',
        charIndex: 0,
        measure: 1,
        timeOffsetBeats: 0,
        durationBeats: 1,
        midiPitches: [60, 64, 67],
        type: 'chord',
        isTied: true,
      },
      {
        id: 'b',
        charIndex: 4,
        measure: 1,
        timeOffsetBeats: 1,
        durationBeats: 1,
        midiPitches: [60, 64, 65],
        type: 'chord',
        isTied: false,
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].durationBeats).toBe(1);
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

describe('beatForCharIndex', () => {
  it('returns 0 for an empty score', () => {
    expect(beatForCharIndex(parseBrailleMusic(''), 5)).toBe(0);
  });

  it('starts at the first note when the caret is at the beginning', () => {
    const score = parseBrailleMusic('"defg');
    expect(beatForCharIndex(score, 0)).toBe(0);
    expect(beatForCharIndex(score, score.events[0].charIndex)).toBe(0);
  });

  it('starts at the note under the caret', () => {
    const score = parseBrailleMusic('"defg');
    const third = score.events[2];
    expect(beatForCharIndex(score, third.charIndex)).toBeCloseTo(
      third.timeOffsetBeats,
      5,
    );
  });

  it('skips to the next note when the caret is between note characters', () => {
    const score = parseBrailleMusic('"d e');
    // Space sits between the two note letters; caret there should start on the second.
    const spaceIndex = score.events[0].charIndex + 1;
    expect(score.events[1].charIndex).toBeGreaterThan(spaceIndex);
    expect(beatForCharIndex(score, spaceIndex)).toBeCloseTo(
      score.events[1].timeOffsetBeats,
      5,
    );
  });

  it('returns totalBeats when the caret is past every event', () => {
    const score = parseBrailleMusic('"de');
    const pastEnd = score.events[score.events.length - 1].charIndex + 10;
    expect(beatForCharIndex(score, pastEnd)).toBe(score.totalBeats);
  });
});

describe('findMusicStartCharIndex', () => {
  it('returns the opening octave mark for a pure music string', () => {
    const brf = '"?:$]\\[w';
    expect(findMusicStartCharIndex(brf)).toBe(0);
  });

  it('skips literary front matter before the first octave+note', () => {
    const literary = ',BEETHOVEN"<#AGGJ,-#AHBG">';
    const music = '"?:$]';
    const brf = `${literary}\n\n${music}`;
    const start = findMusicStartCharIndex(brf);
    expect(brf[start]).toBe('"');
    expect(start).toBe(brf.indexOf(music));
  });

  it('prefers notes after a music heading with time signature', () => {
    const brf = ',ALLEGRO4 #D4\n\n"? :$';
    // Heading has #D4; music begins with " on the following line.
    const start = findMusicStartCharIndex(brf);
    expect(brf.slice(start, start + 2)).toBe('"?');
  });

  it('works with Unicode literary + music cells', () => {
    const literary = asciiToUnicodeBraille(',FUR ELISE');
    const music = asciiToUnicodeBraille('"defg');
    const brf = `${literary}\n\n${music}`;
    const start = findMusicStartCharIndex(brf);
    expect(start).toBeGreaterThan(0);
    expect(unicodeBrailleToAscii(brf)[start]).toBe('"');
  });
});

describe('Sao Mai piano bar-over-bar (Für Elise excerpt)', () => {
  const eliseHead = `⠼⠉⠦
⠚⠀⠨⠜⠄⠜⠏⠕⠉⠕⠀⠍⠕⠞⠕⠜⠀⠜⠏⠏⠨⠯⠩⠵⠀⠯⠩⠑⠋⠐⠚⠡⠑⠙
⠀⠁⠸⠜⠀⠀⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠀⠭⠀⠀⠀⠀⠍
⠃⠀⠨⠜⠀⠀⠀⠐⠊⠍⠐⠽⠯⠮⠀⠀⠀⠚⠍⠯⠩⠷⠾⠀⠀⠀⠀⠀⠙⠍⠐⠯⠨⠯⠩⠵
⠀⠀⠸⠜⠄⠣⠉⠘⠮⠸⠯⠮⠍⠭⠀⠣⠉⠘⠯⠸⠯⠩⠷⠍⠭⠀⠣⠉⠘⠮⠸⠯⠮⠍⠭⠡⠉`;

  it('parses 3/8 and the opening E-D#-E motif as audible sixteenths', () => {
    const score = parseBrailleMusic(eliseHead);
    expect(score.timeSignature).toEqual({ beatsPerMeasure: 3, beatUnit: 8 });
    expect(score.parseInfo?.pianoSystems).toBeGreaterThan(0);
    expect(score.parseInfo?.capacityBeats).toBeCloseTo(1.5, 5);
    const notes = score.events.filter((e) => e.midiPitches.length > 0);
    expect(notes.length).toBeGreaterThan(8);
    expect(notes.every((e) => e.durationBeats >= 0.2)).toBe(true);
    // E5 D#5 E5 D#5 E5 B4 …
    expect(notes[0].midiPitches[0]).toBe(76);
    expect(notes[1].midiPitches[0]).toBe(75);
    expect(notes[2].midiPitches[0]).toBe(76);
  });

  it('does not invent sub-16th clicks for the opening system', () => {
    const score = parseBrailleMusic(eliseHead);
    expect(score.events.every((e) => e.durationBeats >= 0.2)).toBe(true);
  });

  it('does not pad the pickup measure to a full 3/8 of silence', () => {
    const score = parseBrailleMusic(eliseHead);
    const notes = score.events.filter((e) => e.midiPitches.length > 0);
    // Pickup E D# then immediately the next E — no 1-beat gap to beat 1.5.
    expect(notes[0].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(notes[1].timeOffsetBeats).toBeCloseTo(0.25, 5);
    expect(notes[2].timeOffsetBeats).toBeCloseTo(0.5, 5);
  });

  it('still plays 16ths when the meter line is omitted from a piano excerpt', () => {
    // User paste without ⠼⠉⠦ — must not turn whole-shapes into 4-beat tones.
    const excerpt = `⠚⠀⠨⠜⠄⠜⠏⠕⠉⠕⠀⠍⠕⠞⠕⠜⠀⠜⠏⠏⠨⠯⠩⠵⠀⠯⠩⠑⠋⠐⠚⠡⠑⠙
⠀⠁⠸⠜⠀⠀⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠄⠀⠭⠀⠀⠀⠀⠍
⠃⠀⠨⠜⠀⠀⠀⠐⠊⠍⠐⠽⠯⠮⠀⠀⠀⠚⠍⠯⠩⠷⠾⠀⠀⠀⠀⠀⠙⠍⠐⠯⠨⠯⠩⠵
⠀⠀⠸⠜⠄⠣⠉⠘⠮⠸⠯⠮⠍⠭⠀⠣⠉⠘⠯⠸⠯⠩⠷⠍⠭⠀⠣⠉⠘⠮⠸⠯⠮⠍⠭⠡⠉`;
    const score = parseBrailleMusic(excerpt);
    expect(score.parseInfo?.pianoSystems).toBeGreaterThan(0);
    expect(score.timeSignature).toEqual({ beatsPerMeasure: 3, beatUnit: 8 });
    const notes = score.events.filter((e) => e.midiPitches.length > 0);
    expect(notes.length).toBeGreaterThan(10);
    expect(notes.every((e) => e.durationBeats <= 0.5 + 1e-9)).toBe(true);
    expect(notes[0].midiPitches[0]).toBe(76);
    expect(notes[1].midiPitches[0]).toBe(75);
    expect(notes[2].midiPitches[0]).toBe(76);
    // Contiguous sixteenth attacks — not one whole note then a long gap.
    expect(notes[0].timeOffsetBeats).toBeCloseTo(0, 5);
    expect(notes[1].timeOffsetBeats).toBeCloseTo(0.25, 5);
    expect(notes[2].timeOffsetBeats).toBeCloseTo(0.5, 5);
  });
});

describe('literary front matter without piano hand signs', () => {
  it('skips title letters so they are not lexed as notes', () => {
    // Simulate a score where hand signs were lost but meter + octave notes remain.
    const brf = `,FUR ELISE IN ,A ,MINOR

#C8
".&%z &%ef"j*ed`;
    const score = parseBrailleMusic(brf);
    expect(score.timeSignature).toEqual({ beatsPerMeasure: 3, beatUnit: 8 });
    expect(score.parseInfo?.literarySkipCharIndex).toBeGreaterThan(0);
    const notes = score.events.filter((e) => e.midiPitches.length > 0);
    expect(notes[0].midiPitches[0]).toBe(76); // E5, not a title letter
    // No C7+ garbage from literary capital commas.
    expect(notes.every((e) => e.midiPitches.every((p) => p < 96))).toBe(true);
  });
});

describe('non-meter # markup', () => {
  it('does not treat #1 as a triplet prefix', () => {
    // Without the fix, `#` is skipped and `1` starts a triplet (durations × 2/3).
    const score = parseBrailleMusic('#1"?');
    expect(score.events).toHaveLength(1);
    expect(score.events[0].midiPitches).toEqual([60]);
    expect(score.events[0].durationBeats).toBeCloseTo(1, 5);
  });
});
