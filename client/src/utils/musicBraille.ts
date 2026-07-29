/**
 * ASCII BRF Music Braille lexer/parser (BANA / North American conventions).
 *
 * Duration shapes are dual-valued (e.g. whole ↔ 16th). We resolve each measure
 * against a default 4/4 meter by preferring the long values, then short values
 * when the long reading would overflow the measure — the same pedagogical rule
 * teachers use before value-distinction signs appear.
 */

import type {
  MusicNoteEvent,
  MusicScoreAST,
  PitchName,
} from '../types/musicBraille';

/** Beats in one measure when no time signature is parsed (4/4). */
export const DEFAULT_BEATS_PER_MEASURE = 4;

const PITCH_NAMES: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const PITCH_SEMITONES: Record<PitchName, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Long / short beat values for each duration shape class. */
type DurationClass = 'eighth' | 'quarter' | 'half' | 'whole';

const DURATION_BEATS: Record<DurationClass, { long: number; short: number }> = {
  eighth: { long: 0.5, short: 1 / 128 },
  quarter: { long: 1, short: 1 / 64 },
  half: { long: 2, short: 1 / 32 },
  whole: { long: 4, short: 0.25 },
};

interface NoteShape {
  pitch: PitchName;
  durationClass: DurationClass;
}

/**
 * BANA note cells (upper dots = pitch, dots 3/6 = duration class).
 * Spec typo "i → e" for quarter A is corrected to "[" (dots 2-4-6).
 */
const NOTE_SHAPES: Record<string, NoteShape> = {
  // 8ths / 128ths
  d: { pitch: 'C', durationClass: 'eighth' },
  e: { pitch: 'D', durationClass: 'eighth' },
  f: { pitch: 'E', durationClass: 'eighth' },
  g: { pitch: 'F', durationClass: 'eighth' },
  h: { pitch: 'G', durationClass: 'eighth' },
  i: { pitch: 'A', durationClass: 'eighth' },
  j: { pitch: 'B', durationClass: 'eighth' },
  // Quarters / 64ths
  '?': { pitch: 'C', durationClass: 'quarter' },
  ':': { pitch: 'D', durationClass: 'quarter' },
  $: { pitch: 'E', durationClass: 'quarter' },
  ']': { pitch: 'F', durationClass: 'quarter' },
  '\\': { pitch: 'G', durationClass: 'quarter' },
  '|': { pitch: 'G', durationClass: 'quarter' }, // UEB-friendly alias for dots 1-2-5-6
  '[': { pitch: 'A', durationClass: 'quarter' },
  w: { pitch: 'B', durationClass: 'quarter' },
  // Halves / 32nds
  n: { pitch: 'C', durationClass: 'half' },
  o: { pitch: 'D', durationClass: 'half' },
  p: { pitch: 'E', durationClass: 'half' },
  q: { pitch: 'F', durationClass: 'half' },
  r: { pitch: 'G', durationClass: 'half' },
  s: { pitch: 'A', durationClass: 'half' },
  t: { pitch: 'B', durationClass: 'half' },
  // Wholes / 16ths
  y: { pitch: 'C', durationClass: 'whole' },
  z: { pitch: 'D', durationClass: 'whole' },
  '&': { pitch: 'E', durationClass: 'whole' },
  '=': { pitch: 'F', durationClass: 'whole' },
  '(': { pitch: 'G', durationClass: 'whole' },
  '!': { pitch: 'A', durationClass: 'whole' },
  ')': { pitch: 'B', durationClass: 'whole' },
};

const REST_SHAPES: Record<string, DurationClass> = {
  x: 'eighth',
  v: 'quarter',
  u: 'half',
  m: 'whole',
};

/** Octave mark → MIDI number for C in that octave (C4 / middle C = 60). */
const OCTAVE_MIDI_C: Record<string, number> = {
  '@': 24, // octave 1
  '^': 36, // octave 2
  _: 48, // octave 3
  '"': 60, // octave 4
  '.': 72, // octave 5
  ';': 84, // octave 6
  ',': 96, // octave 7
};

const ACCIDENTAL_DELTA: Record<string, number> = {
  '<': -1, // flat
  '%': 1, // sharp
  '*': 0, // natural
};

/** Interval signs after an anchor note (diatonic steps down for RH/treble default). */
const INTERVAL_SIZE: Record<string, number> = {
  '/': 2,
  '+': 3,
  '#': 4,
  '9': 5,
  '0': 6,
  '3': 7,
  '-': 8,
};

interface PendingEvent {
  id: string;
  charIndex: number;
  measure: number;
  timeOffsetBeats: number;
  durationClass: DurationClass;
  /** Augmentation dots (each ×1.5). */
  dots: number;
  midiPitches: number[];
  type: 'note' | 'chord' | 'rest';
}

export interface ParseBrailleMusicOptions {
  /** Meter numerator in quarter-note beats (default 4). */
  beatsPerMeasure?: number;
}

function normalizeBrfChar(ch: string): string {
  if (ch >= 'A' && ch <= 'Z') return ch.toLowerCase();
  return ch;
}

function midiForPitch(
  pitch: PitchName,
  octaveMidiC: number,
  accidentalDelta: number,
): number {
  return octaveMidiC + PITCH_SEMITONES[pitch] + accidentalDelta;
}

/** Diatonic interval downward from an anchor pitch (treble / right-hand default). */
export function midiDownInterval(
  anchorMidi: number,
  anchorPitch: PitchName,
  intervalSize: number,
): number {
  const steps = Math.max(1, intervalSize) - 1;
  let idx = PITCH_NAMES.indexOf(anchorPitch);
  let semis = 0;
  for (let s = 0; s < steps; s++) {
    const fromPc = PITCH_SEMITONES[PITCH_NAMES[idx]];
    idx = (idx - 1 + 7) % 7;
    const toPc = PITCH_SEMITONES[PITCH_NAMES[idx]];
    let diff = fromPc - toPc;
    if (diff <= 0) diff += 12;
    semis += diff;
  }
  return anchorMidi - semis;
}

function applyDots(beats: number, dots: number): number {
  let total = beats;
  let add = beats;
  for (let i = 0; i < dots; i++) {
    add /= 2;
    total += add;
  }
  return total;
}

function durationFor(cls: DurationClass, useShort: boolean, dots: number): number {
  const base = useShort ? DURATION_BEATS[cls].short : DURATION_BEATS[cls].long;
  return applyDots(base, dots);
}

/**
 * Apply long vs short duration reading for one measure and map provisional
 * (long-unit) offsets onto the chosen scale. In-accord resets (lower offset
 * than the previous event) are preserved.
 */
function materializeMeasure(
  events: PendingEvent[],
  beatsPerMeasure: number,
  measureStartBeat: number,
): { notes: MusicNoteEvent[]; measureBeatsUsed: number } {
  if (events.length === 0) {
    return { notes: [], measureBeatsUsed: 0 };
  }

  const longSum = events.reduce(
    (s, e) => s + durationFor(e.durationClass, false, e.dots),
    0,
  );
  const shortSum = events.reduce(
    (s, e) => s + durationFor(e.durationClass, true, e.dots),
    0,
  );

  // Prefer long values; switch to short only when long overflows the meter
  // and short fits (or is closer to fitting).
  let useShort = false;
  if (longSum > beatsPerMeasure + 1e-9) {
    if (shortSum <= beatsPerMeasure + 1e-9 || shortSum < longSum) {
      useShort = true;
    }
  }

  const scale = useShort && longSum > 0 ? shortSum / longSum : 1;
  const notes: MusicNoteEvent[] = [];
  let maxUsed = 0;
  let prevProvisional = -1;

  for (const e of events) {
    let localOffset = e.timeOffsetBeats * scale;
    if (prevProvisional >= 0 && e.timeOffsetBeats < prevProvisional - 1e-9) {
      // In-accord: restart at the (scaled) stored offset, usually 0.
      localOffset = e.timeOffsetBeats * scale;
    }
    prevProvisional = e.timeOffsetBeats;

    const dur = durationFor(e.durationClass, useShort, e.dots);
    notes.push({
      id: e.id,
      charIndex: e.charIndex,
      measure: e.measure,
      timeOffsetBeats: measureStartBeat + localOffset,
      durationBeats: dur,
      midiPitches: e.midiPitches,
      type: e.type,
    });
    maxUsed = Math.max(maxUsed, localOffset + dur);
  }

  return { notes, measureBeatsUsed: maxUsed };
}

/**
 * Parse an ASCII Music Braille BRF string into a timed score AST.
 */
export function parseBrailleMusic(
  brf: string,
  options: ParseBrailleMusicOptions = {},
): MusicScoreAST {
  const beatsPerMeasure = options.beatsPerMeasure ?? DEFAULT_BEATS_PER_MEASURE;
  const text = brf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  let currentOctaveMidiC = 60; // octave 4 default
  let measure = 1;
  let measureBeatOffset = 0;
  let scoreBeatBase = 0;
  let pendingAccidental: number | null = null;
  const activeAccidentals = new Map<PitchName, number>();

  let eventCounter = 0;
  const measurePending: PendingEvent[] = [];
  const allEvents: MusicNoteEvent[] = [];

  const flushMeasure = () => {
    const { notes, measureBeatsUsed } = materializeMeasure(
      measurePending,
      beatsPerMeasure,
      scoreBeatBase,
    );
    allEvents.push(...notes);
    measurePending.length = 0;
    scoreBeatBase += Math.max(beatsPerMeasure, measureBeatsUsed);
    measureBeatOffset = 0;
    activeAccidentals.clear();
    pendingAccidental = null;
  };

  const pushPending = (ev: PendingEvent) => {
    measurePending.push(ev);
  };

  let i = 0;
  while (i < text.length) {
    const raw = text[i];
    const ch = normalizeBrfChar(raw);

    // Whitespace: measure boundary (spaces / newlines / tabs)
    if (/\s/.test(raw)) {
      // Collapse runs; each whitespace run = one barline if measure has content
      while (i < text.length && /\s/.test(text[i])) i++;
      if (measurePending.length > 0) {
        flushMeasure();
        measure += 1;
      }
      continue;
    }

    // In-accord: "<>" (dots 1-2-6, 3-4-5) — restart voice at start of measure
    if (ch === '<' && text[i + 1] === '>') {
      measureBeatOffset = 0;
      pendingAccidental = null;
      i += 2;
      continue;
    }

    // Accidentals (before octave / note). Flat is "<" but not "<>".
    if (ch in ACCIDENTAL_DELTA) {
      pendingAccidental = ACCIDENTAL_DELTA[ch];
      i += 1;
      continue;
    }

    // Octave marks
    if (ch in OCTAVE_MIDI_C) {
      currentOctaveMidiC = OCTAVE_MIDI_C[ch];
      i += 1;
      continue;
    }

    // Rests
    if (ch in REST_SHAPES) {
      const durationClass = REST_SHAPES[ch];
      const charIndex = i;
      i += 1;
      let dots = 0;
      while (i < text.length && text[i] === "'") {
        dots += 1;
        i += 1;
      }
      // Skip trailing interval signs on rests (ignore)
      while (i < text.length && normalizeBrfChar(text[i]) in INTERVAL_SIZE) i += 1;

      const id = `e${eventCounter++}`;
      const provisionalOffset = measureBeatOffset;
      const longDur = durationFor(durationClass, false, dots);
      pushPending({
        id,
        charIndex,
        measure,
        timeOffsetBeats: provisionalOffset,
        durationClass,
        dots,
        midiPitches: [],
        type: 'rest',
      });
      measureBeatOffset += longDur;
      pendingAccidental = null;
      continue;
    }

    // Notes
    if (ch in NOTE_SHAPES) {
      const shape = NOTE_SHAPES[ch];
      const charIndex = i;
      i += 1;

      let dots = 0;
      while (i < text.length && text[i] === "'") {
        dots += 1;
        i += 1;
      }

      let accidentalDelta: number;
      if (pendingAccidental !== null) {
        accidentalDelta = pendingAccidental;
        activeAccidentals.set(shape.pitch, pendingAccidental);
        pendingAccidental = null;
      } else if (activeAccidentals.has(shape.pitch)) {
        accidentalDelta = activeAccidentals.get(shape.pitch)!;
      } else {
        accidentalDelta = 0;
      }

      const anchorMidi = midiForPitch(shape.pitch, currentOctaveMidiC, accidentalDelta);
      const pitches: number[] = [anchorMidi];

      // Interval chord tones (downward)
      while (i < text.length && normalizeBrfChar(text[i]) in INTERVAL_SIZE) {
        const iv = INTERVAL_SIZE[normalizeBrfChar(text[i])];
        pitches.push(midiDownInterval(anchorMidi, shape.pitch, iv));
        i += 1;
      }

      // Stepwise octave tracking: update current octave from sounding pitch
      const writtenOctave = Math.floor(anchorMidi / 12) - 1;
      currentOctaveMidiC = (writtenOctave + 1) * 12;

      const id = `e${eventCounter++}`;
      const provisionalOffset = measureBeatOffset;
      const longDur = durationFor(shape.durationClass, false, dots);
      pushPending({
        id,
        charIndex,
        measure,
        timeOffsetBeats: provisionalOffset,
        durationClass: shape.durationClass,
        dots,
        midiPitches: pitches,
        type: pitches.length > 1 ? 'chord' : 'note',
      });
      measureBeatOffset += longDur;
      continue;
    }

    // Unknown / literary / punctuation — skip one cell
    i += 1;
    pendingAccidental = null;
  }

  if (measurePending.length > 0) {
    flushMeasure();
  }

  const events = allEvents.sort((a, b) => {
    if (a.timeOffsetBeats !== b.timeOffsetBeats) {
      return a.timeOffsetBeats - b.timeOffsetBeats;
    }
    return a.charIndex - b.charIndex;
  });

  const totalBeats =
    events.length === 0
      ? 0
      : Math.max(...events.map((e) => e.timeOffsetBeats + e.durationBeats));
  const totalMeasures =
    events.length === 0 ? 0 : Math.max(...events.map((e) => e.measure));

  return { events, totalBeats, totalMeasures };
}
