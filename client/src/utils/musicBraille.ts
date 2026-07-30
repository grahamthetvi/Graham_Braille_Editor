/**
 * Music Braille lexer/parser (BANA / North American conventions).
 * Input may be ASCII BRF and/or Unicode braille cells (normalized to ASCII).
 *
 * Supports time/key signatures, ties, triplets, bar repeats, in-accord,
 * and dual-duration disambiguation (whole↔16th online; measure-fill for others).
 */

import type {
  KeySignature,
  MusicNoteEvent,
  MusicScoreAST,
  PitchName,
  TimeSignature,
} from '../types/musicBraille';
import {
  DEFAULT_KEY_SIGNATURE,
  DEFAULT_TIME_SIGNATURE,
} from '../types/musicBraille';
import { unicodeBrailleToAscii } from './braille';
import {
  linearizePianoSystems,
  segmentPianoSystems,
} from './musicBraillePiano';

/** Quarter-note beats in one measure when no time signature is parsed (4/4). */
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

const SHARP_ORDER: PitchName[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: PitchName[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Upper-number letters used in music braille meter/key counts (a=1 … i=9). */
const UPPER_NUM: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
  i: 9,
};

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

const NOTE_SHAPES: Record<string, NoteShape> = {
  d: { pitch: 'C', durationClass: 'eighth' },
  e: { pitch: 'D', durationClass: 'eighth' },
  f: { pitch: 'E', durationClass: 'eighth' },
  g: { pitch: 'F', durationClass: 'eighth' },
  h: { pitch: 'G', durationClass: 'eighth' },
  i: { pitch: 'A', durationClass: 'eighth' },
  j: { pitch: 'B', durationClass: 'eighth' },
  '?': { pitch: 'C', durationClass: 'quarter' },
  ':': { pitch: 'D', durationClass: 'quarter' },
  $: { pitch: 'E', durationClass: 'quarter' },
  ']': { pitch: 'F', durationClass: 'quarter' },
  '\\': { pitch: 'G', durationClass: 'quarter' },
  '|': { pitch: 'G', durationClass: 'quarter' },
  '[': { pitch: 'A', durationClass: 'quarter' },
  w: { pitch: 'B', durationClass: 'quarter' },
  n: { pitch: 'C', durationClass: 'half' },
  o: { pitch: 'D', durationClass: 'half' },
  p: { pitch: 'E', durationClass: 'half' },
  q: { pitch: 'F', durationClass: 'half' },
  r: { pitch: 'G', durationClass: 'half' },
  s: { pitch: 'A', durationClass: 'half' },
  t: { pitch: 'B', durationClass: 'half' },
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

const OCTAVE_MIDI_C: Record<string, number> = {
  '@': 24,
  '^': 36,
  _: 48,
  '"': 60,
  '.': 72,
  ';': 84,
  ',': 96,
};

const ACCIDENTAL_DELTA: Record<string, number> = {
  '<': -1,
  '%': 1,
  '*': 0,
};

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
  dots: number;
  midiPitches: number[];
  type: 'note' | 'chord' | 'rest';
  isTied?: boolean;
  /** When set, skip long/short switching for this event (whole/16th online, triplets). */
  forcedDurationBeats?: number;
  /** True when this event starts a new in-accord voice (`<>`). */
  newVoice?: boolean;
}


export interface ParseBrailleMusicOptions {
  /** Override initial meter capacity in quarter-note beats. */
  beatsPerMeasure?: number;
}

/** Quarter-note beat capacity for a printed time signature. */
export function beatsCapacityFromTimeSig(ts: TimeSignature): number {
  if (ts.beatUnit <= 0) return ts.beatsPerMeasure;
  return ts.beatsPerMeasure * (4 / ts.beatUnit);
}

/** Pitch-class accidentals implied by a key signature count. */
export function keySignatureDeltas(count: number): Map<PitchName, number> {
  const map = new Map<PitchName, number>();
  if (count > 0) {
    for (let i = 0; i < count && i < 7; i++) map.set(SHARP_ORDER[i], 1);
  } else if (count < 0) {
    for (let i = 0; i < -count && i < 7; i++) map.set(FLAT_ORDER[i], -1);
  }
  return map;
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

function nearlyEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Whole/16th online rule: if a whole (4.0) would overflow remaining measure
 * space, use a 16th (0.25).
 */
export function resolveWholeOrSixteenth(
  measureBeatOffset: number,
  capacity: number,
  dots = 0,
): number {
  if (4 + measureBeatOffset > capacity + 1e-9) {
    return applyDots(0.25, dots);
  }
  return applyDots(4, dots);
}

/**
 * Split measure events into in-accord voices. A new voice starts whenever
 * provisional time moves backwards (parser resets offset on `<>`).
 */
function splitInAccordVoices(events: PendingEvent[]): PendingEvent[][] {
  if (events.length === 0) return [];
  const voices: PendingEvent[][] = [[]];
  let prevOffset = -1;
  for (const e of events) {
    if (
      e.newVoice ||
      (prevOffset >= 0 && e.timeOffsetBeats < prevOffset - 1e-9)
    ) {
      voices.push([]);
    }
    voices[voices.length - 1].push(e);
    prevOffset = e.timeOffsetBeats;
  }
  return voices;
}

function materializeMeasure(
  events: PendingEvent[],
  capacity: number,
  measureStartBeat: number,
): { notes: MusicNoteEvent[]; measureBeatsUsed: number } {
  if (events.length === 0) {
    return { notes: [], measureBeatsUsed: 0 };
  }

  const provisionalDur = (e: PendingEvent, useShort: boolean) =>
    e.forcedDurationBeats ?? durationFor(e.durationClass, useShort, e.dots);

  // In-accord voices overlap in time — capacity must be checked per voice,
  // not against the sum of every parallel part (that falsely forces "short"
  // values and crushes the measure into a burst of 32nds/128ths).
  const voices = splitInAccordVoices(events);
  let longSum = 0;
  let shortSum = 0;
  for (const voice of voices) {
    const voiceLong = voice.reduce((s, e) => s + provisionalDur(e, false), 0);
    const voiceShort = voice.reduce((s, e) => s + provisionalDur(e, true), 0);
    longSum = Math.max(longSum, voiceLong);
    shortSum = Math.max(shortSum, voiceShort);
  }

  /**
   * Duration strategy (avoid inaudible 128ths from mixed Sao Mai cells):
   * 1. Prefer long (upper-cell) values when they fit per voice.
   * 2. If they overflow, try a 16th-note grid for unforced notes (common when
   *    whole-shapes and eighth-shapes both encode 16ths in 3/8 piano music).
   * 3. Only fall back to classic short values when that does not invent
   *    sub-16th durations (i.e. wholes→16ths only). Otherwise keep long values
   *    and allow a soft overflow — audible beats beat silent clicks.
   */
  type DurMode = 'long' | 'short' | 'sixteenthGrid';
  let durMode: DurMode = 'long';

  const unforced = (e: PendingEvent) => e.forcedDurationBeats == null;
  const hasNonWholeUnforced = events.some(
    (e) => unforced(e) && e.durationClass !== 'whole',
  );
  const sixteenthGridSumFor = (voice: PendingEvent[]) =>
    voice.reduce((s, e) => {
      if (e.forcedDurationBeats != null) return s + e.forcedDurationBeats;
      return s + applyDots(0.25, e.dots);
    }, 0);

  if (longSum > capacity + 1e-9) {
    let gridSum = 0;
    for (const voice of voices) {
      gridSum = Math.max(gridSum, sixteenthGridSumFor(voice));
    }
    const shortIsSixteenthOnly = !hasNonWholeUnforced;

    if (gridSum <= capacity + 1e-9 && hasNonWholeUnforced) {
      durMode = 'sixteenthGrid';
    } else if (
      shortIsSixteenthOnly &&
      (shortSum <= capacity + 1e-9 || shortSum < longSum)
    ) {
      durMode = 'short';
    } else if (!hasNonWholeUnforced && shortSum <= capacity + 1e-9) {
      durMode = 'short';
    } else {
      durMode = 'long'; // soft overflow
    }
  }

  const durationOf = (e: PendingEvent): number => {
    if (e.forcedDurationBeats != null) return e.forcedDurationBeats;
    if (durMode === 'sixteenthGrid') return applyDots(0.25, e.dots);
    return durationFor(e.durationClass, durMode === 'short', e.dots);
  };

  // Rebuild offsets from chosen durations so mixed modes stay contiguous per voice.
  const notes: MusicNoteEvent[] = [];
  let maxUsed = 0;
  let voiceCursor = 0;
  let prevProvisional = -1;

  for (const e of events) {
    const dur = durationOf(e);
    if (
      e.newVoice ||
      (prevProvisional >= 0 && e.timeOffsetBeats < prevProvisional - 1e-9)
    ) {
      voiceCursor = 0;
    }
    const localOffset = voiceCursor;
    voiceCursor += dur;
    prevProvisional = e.timeOffsetBeats;

    notes.push({
      id: e.id,
      charIndex: e.charIndex,
      measure: e.measure,
      timeOffsetBeats: measureStartBeat + localOffset,
      durationBeats: dur,
      midiPitches: e.midiPitches,
      type: e.type,
      isTied: e.isTied,
    });
    maxUsed = Math.max(maxUsed, localOffset + dur);
  }

  return { notes, measureBeatsUsed: maxUsed };
}

/** True when pitch multisets match (order-independent). */
function midiPitchesEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const sa = a.length === 1 ? a : [...a].sort((x, y) => x - y);
  const sb = b.length === 1 ? b : [...b].sort((x, y) => x - y);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

/** Merge tied note pairs: extend the prior event and drop the continuation attack. */
export function mergeTiedEvents(events: MusicNoteEvent[]): MusicNoteEvent[] {
  const out: MusicNoteEvent[] = [];
  for (const e of events) {
    const prev = out[out.length - 1];
    const canMerge =
      prev &&
      prev.isTied &&
      e.type !== 'rest' &&
      prev.type !== 'rest' &&
      prev.midiPitches.length > 0 &&
      e.midiPitches.length > 0 &&
      midiPitchesEqual(prev.midiPitches, e.midiPitches) &&
      nearlyEqual(e.timeOffsetBeats, prev.timeOffsetBeats + prev.durationBeats);

    if (canMerge && prev) {
      prev.durationBeats += e.durationBeats;
      prev.isTied = e.isTied ?? false;
    } else {
      out.push({ ...e, midiPitches: [...e.midiPitches] });
    }
  }
  return out;
}

/**
 * Try to parse `#b%` / `#c<` (key) or `#d4` / `#d/d` / `#f8` (time) at index i.
 * Returns null if `#` is not a meter/key prefix here.
 */
function tryParseHashPrefix(
  text: string,
  i: number,
): {
  kind: 'key' | 'time';
  key?: KeySignature;
  time?: TimeSignature;
  nextIndex: number;
} | null {
  if (text[i] !== '#') return null;
  const letter = normalizeBrfChar(text[i + 1] ?? '');
  if (!(letter in UPPER_NUM)) return null;
  const count = UPPER_NUM[letter];
  const third = text[i + 2] ?? '';
  const thirdNorm = normalizeBrfChar(third);

  // Key: #b% or #c<
  if (third === '%' || third === '<') {
    return {
      kind: 'key',
      key: { sharpsFlatsCount: third === '%' ? count : -count },
      nextIndex: i + 3,
    };
  }

  // Time: #d4 or #d8 etc.
  if (third === '1' || third === '2' || third === '3' || third === '4' || third === '8') {
    return {
      kind: 'time',
      time: { beatsPerMeasure: count, beatUnit: Number(third) },
      nextIndex: i + 3,
    };
  }

  // Time: #d/d
  if (third === '/' ) {
    const denomLetter = normalizeBrfChar(text[i + 3] ?? '');
    if (denomLetter in UPPER_NUM) {
      return {
        kind: 'time',
        time: { beatsPerMeasure: count, beatUnit: UPPER_NUM[denomLetter] },
        nextIndex: i + 4,
      };
    }
  }

  void thirdNorm;
  return null;
}

/**
 * Parse Music Braille into a timed score AST.
 * Accepts North American ASCII BRF and/or Unicode braille cells (U+2800–U+28FF);
 * Unicode is normalized to ASCII before lexing so pasted Unicode scores play.
 *
 * Sao Mai bar-over-bar piano scores (RH `.>` / LH `_>` systems) are detected and
 * linearized with in-accord so both hands sound together instead of as sequential
 * garbled measures.
 */
export function parseBrailleMusic(
  brf: string,
  options: ParseBrailleMusicOptions = {},
): MusicScoreAST {
  let timeSignature: TimeSignature = { ...DEFAULT_TIME_SIGNATURE };
  let keySignature: KeySignature = { ...DEFAULT_KEY_SIGNATURE };
  let capacity =
    options.beatsPerMeasure ?? beatsCapacityFromTimeSig(timeSignature);
  let keyDeltas = keySignatureDeltas(keySignature.sharpsFlatsCount);

  const sourceAscii = unicodeBrailleToAscii(brf)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Prefer meter/key printed in the heading even when we later lex a linearized
  // piano stream that omitted those cells.
  for (let si = 0; si < sourceAscii.length; si++) {
    if (sourceAscii[si] !== '#') continue;
    const parsed = tryParseHashPrefix(sourceAscii, si);
    if (!parsed) continue;
    if (parsed.kind === 'key' && parsed.key) {
      keySignature = parsed.key;
      keyDeltas = keySignatureDeltas(keySignature.sharpsFlatsCount);
    } else if (parsed.kind === 'time' && parsed.time) {
      timeSignature = parsed.time;
      capacity = beatsCapacityFromTimeSig(timeSignature);
    }
    si = parsed.nextIndex - 1;
  }

  const pianoSystems = segmentPianoSystems(sourceAscii);
  let text = sourceAscii;
  let indexMap: number[] | null = null;
  if (pianoSystems.length > 0) {
    const linear = linearizePianoSystems(pianoSystems);
    if (linear.text.trim().length > 0) {
      text = linear.text;
      indexMap = linear.indexMap;
    }
  }

  const absIndex = (i: number) => indexMap?.[i] ?? i;

  let currentOctaveMidiC = 60;
  let measure = 1;
  let measureBeatOffset = 0;
  let scoreBeatBase = 0;
  let pendingAccidental: number | null = null;
  const activeAccidentals = new Map<PitchName, number>();
  let tripletRemaining = 0;
  let atMeasureStart = true;
  let pendingNewVoice = false;

  let eventCounter = 0;
  const measurePending: PendingEvent[] = [];
  const allEvents: MusicNoteEvent[] = [];
  /** Finalized events for the previous measure (for bar repeat). */
  let previousMeasureNotes: MusicNoteEvent[] = [];
  let previousMeasureLocalBase = 0;

  const flushMeasure = () => {
    const { notes, measureBeatsUsed } = materializeMeasure(
      measurePending,
      capacity,
      scoreBeatBase,
    );
    allEvents.push(...notes);
    previousMeasureNotes = notes;
    previousMeasureLocalBase = scoreBeatBase;
    measurePending.length = 0;
    scoreBeatBase += Math.max(capacity, measureBeatsUsed);
    measureBeatOffset = 0;
    activeAccidentals.clear();
    pendingAccidental = null;
    atMeasureStart = true;
  };

  const applyTriplet = (beats: number): number => {
    if (tripletRemaining <= 0) return beats;
    tripletRemaining -= 1;
    return beats * (2 / 3);
  };

  const resolveAccidental = (pitch: PitchName): number => {
    if (pendingAccidental !== null) {
      const d = pendingAccidental;
      activeAccidentals.set(pitch, d);
      pendingAccidental = null;
      return d;
    }
    if (activeAccidentals.has(pitch)) return activeAccidentals.get(pitch)!;
    return keyDeltas.get(pitch) ?? 0;
  };

  let i = 0;
  while (i < text.length) {
    const raw = text[i];
    const ch = normalizeBrfChar(raw);

    // Whitespace: measure boundary
    if (/\s/.test(raw)) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (measurePending.length > 0) {
        flushMeasure();
        measure += 1;
      }
      atMeasureStart = true;
      continue;
    }

    // Bar repeat at measure start (after barline / empty measure)
    if (
      ch === '0' &&
      atMeasureStart &&
      measurePending.length === 0 &&
      measureBeatOffset === 0 &&
      previousMeasureNotes.length > 0
    ) {
      const charIndex = absIndex(i);
      i += 1;
      const duplicated: MusicNoteEvent[] = previousMeasureNotes.map((e) => ({
        ...e,
        id: `e${eventCounter++}`,
        measure,
        charIndex,
        timeOffsetBeats:
          scoreBeatBase + (e.timeOffsetBeats - previousMeasureLocalBase),
        midiPitches: [...e.midiPitches],
      }));
      allEvents.push(...duplicated);
      previousMeasureNotes = duplicated;
      previousMeasureLocalBase = scoreBeatBase;
      scoreBeatBase += capacity;
      measure += 1;
      atMeasureStart = true;
      pendingAccidental = null;
      continue;
    }

    // Triplet prefix "1"
    if (ch === '1') {
      tripletRemaining = 3;
      i += 1;
      atMeasureStart = false;
      continue;
    }

    // Time / key signature via "#" (not after a note — intervals handled below)
    if (ch === '#') {
      const parsed = tryParseHashPrefix(text, i);
      if (parsed) {
        if (parsed.kind === 'key' && parsed.key) {
          keySignature = parsed.key;
          keyDeltas = keySignatureDeltas(keySignature.sharpsFlatsCount);
        } else if (parsed.kind === 'time' && parsed.time) {
          timeSignature = parsed.time;
          capacity = beatsCapacityFromTimeSig(timeSignature);
        }
        i = parsed.nextIndex;
        atMeasureStart = false;
        continue;
      }
    }

    // In-accord
    if (ch === '<' && text[i + 1] === '>') {
      measureBeatOffset = 0;
      pendingAccidental = null;
      pendingNewVoice = true;
      i += 2;
      atMeasureStart = false;
      continue;
    }

    // Accidentals
    if (ch in ACCIDENTAL_DELTA) {
      pendingAccidental = ACCIDENTAL_DELTA[ch];
      i += 1;
      atMeasureStart = false;
      continue;
    }

    // Octave marks (`.` is octave 5; tie `.c` is handled after notes)
    if (ch in OCTAVE_MIDI_C) {
      currentOctaveMidiC = OCTAVE_MIDI_C[ch];
      i += 1;
      atMeasureStart = false;
      continue;
    }

    // Rests
    if (ch in REST_SHAPES) {
      const durationClass = REST_SHAPES[ch];
      const charIndex = absIndex(i);
      i += 1;
      let dots = 0;
      while (i < text.length && text[i] === "'") {
        dots += 1;
        i += 1;
      }
      while (i < text.length && normalizeBrfChar(text[i]) in INTERVAL_SIZE) i += 1;

      const inTriplet = tripletRemaining > 0;
      let longDur =
        durationClass === 'whole'
          ? resolveWholeOrSixteenth(measureBeatOffset, capacity, dots)
          : durationFor(durationClass, false, dots);
      longDur = applyTriplet(longDur);

      const forcedDurationBeats =
        durationClass === 'whole' || inTriplet ? longDur : undefined;

      const id = `e${eventCounter++}`;
      const provisionalOffset = measureBeatOffset;
      measurePending.push({
        id,
        charIndex,
        measure,
        timeOffsetBeats: provisionalOffset,
        durationClass,
        dots,
        midiPitches: [],
        type: 'rest',
        forcedDurationBeats,
        newVoice: pendingNewVoice,
      });
      pendingNewVoice = false;
      measureBeatOffset += longDur;
      pendingAccidental = null;
      atMeasureStart = false;
      continue;
    }

    // Notes
    if (ch in NOTE_SHAPES) {
      const shape = NOTE_SHAPES[ch];
      const charIndex = absIndex(i);
      i += 1;

      let dots = 0;
      while (i < text.length && text[i] === "'") {
        dots += 1;
        i += 1;
      }

      const accidentalDelta = resolveAccidental(shape.pitch);
      const anchorMidi = midiForPitch(shape.pitch, currentOctaveMidiC, accidentalDelta);
      const pitches: number[] = [anchorMidi];

      while (i < text.length && normalizeBrfChar(text[i]) in INTERVAL_SIZE) {
        const ivCh = normalizeBrfChar(text[i]);
        const iv = INTERVAL_SIZE[ivCh];
        pitches.push(midiDownInterval(anchorMidi, shape.pitch, iv));
        i += 1;
      }

      // Tie: "c" or ".c"
      let isTied = false;
      if (i < text.length && text[i] === '.' && normalizeBrfChar(text[i + 1] ?? '') === 'c') {
        isTied = true;
        i += 2;
      } else if (i < text.length && normalizeBrfChar(text[i]) === 'c') {
        isTied = true;
        i += 1;
      }

      const writtenOctave = Math.floor(anchorMidi / 12) - 1;
      currentOctaveMidiC = (writtenOctave + 1) * 12;

      const inTriplet = tripletRemaining > 0;
      let longDur =
        shape.durationClass === 'whole'
          ? resolveWholeOrSixteenth(measureBeatOffset, capacity, dots)
          : durationFor(shape.durationClass, false, dots);
      longDur = applyTriplet(longDur);

      const forcedDurationBeats =
        shape.durationClass === 'whole' || inTriplet ? longDur : undefined;

      const id = `e${eventCounter++}`;
      const provisionalOffset = measureBeatOffset;
      measurePending.push({
        id,
        charIndex,
        measure,
        timeOffsetBeats: provisionalOffset,
        durationClass: shape.durationClass,
        dots,
        midiPitches: pitches,
        type: pitches.length > 1 ? 'chord' : 'note',
        isTied,
        forcedDurationBeats,
        newVoice: pendingNewVoice,
      });
      pendingNewVoice = false;
      measureBeatOffset += longDur;
      atMeasureStart = false;
      continue;
    }

    // Unknown — skip
    i += 1;
    pendingAccidental = null;
    atMeasureStart = false;
  }

  if (measurePending.length > 0) {
    flushMeasure();
  }

  const merged = mergeTiedEvents(
    allEvents.sort((a, b) => {
      if (a.timeOffsetBeats !== b.timeOffsetBeats) {
        return a.timeOffsetBeats - b.timeOffsetBeats;
      }
      return a.charIndex - b.charIndex;
    }),
  );

  const totalBeats =
    merged.length === 0
      ? 0
      : Math.max(...merged.map((e) => e.timeOffsetBeats + e.durationBeats));
  const totalMeasures =
    merged.length === 0 ? 0 : Math.max(...merged.map((e) => e.measure));

  return {
    events: merged,
    totalBeats,
    totalMeasures,
    timeSignature,
    keySignature,
  };
}

/**
 * Beat position to start playback for a caret/selection character offset.
 * Uses the first score event at or after `charIndex`; if the caret is past
 * every event, returns `totalBeats` (nothing left to play).
 */
export function beatForCharIndex(score: MusicScoreAST, charIndex: number): number {
  if (!score.events.length) return 0;
  if (!Number.isFinite(charIndex) || charIndex <= 0) {
    return score.events[0].timeOffsetBeats;
  }
  const atOrAfter = score.events.find((e) => e.charIndex >= charIndex);
  if (atOrAfter) return atOrAfter.timeOffsetBeats;
  return score.totalBeats;
}

function lineHasMusicSignature(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '#' && tryParseHashPrefix(line, i)) return true;
  }
  return false;
}

/**
 * True when `i` looks like a Music Braille octave mark followed by a note/rest
 * (optional accidentals). Avoids common literary false positives such as
 * capital indicators (`,` + A–Z).
 */
function isLikelyOctaveNoteAt(text: string, i: number): boolean {
  const oct = text[i];
  if (!(oct in OCTAVE_MIDI_C)) return false;

  let j = i + 1;
  while (j < text.length && text[j] in ACCIDENTAL_DELTA) j += 1;
  if (j >= text.length) return false;

  const raw = text[j];
  // Literary capital letter: comma + uppercase A–Z
  if (oct === ',' && raw >= 'A' && raw <= 'Z') return false;
  // Sentence period + whitespace is not an octave-5 note
  if (oct === '.' && (raw === ' ' || raw === '\n' || raw === '\t')) return false;

  const note = normalizeBrfChar(raw);
  return note in NOTE_SHAPES || note in REST_SHAPES;
}

/**
 * Heuristic character offset where Music Braille (notes) likely begins after
 * literary front matter. Prefers a music heading (key/time) then the first
 * octave+note; falls back to the first octave+note in the file.
 */
export function findMusicStartCharIndex(brf: string): number {
  const text = unicodeBrailleToAscii(brf || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!text) return 0;

  const lines: Array<{ start: number; content: string }> = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      lines.push({ start: lineStart, content: text.slice(lineStart, i) });
      lineStart = i + 1;
    }
  }

  let searchFrom = 0;
  let foundHeading = false;

  // Prefer blank line + music heading (BANA initial heading convention).
  for (let li = 0; li < lines.length; li++) {
    const prevBlank = li === 0 || lines[li - 1].content.trim() === '';
    if (prevBlank && lineHasMusicSignature(lines[li].content)) {
      searchFrom = lines[li].start;
      foundHeading = true;
      break;
    }
  }

  // Any music heading if no blank-line-prefixed one was found.
  if (!foundHeading) {
    for (const line of lines) {
      if (lineHasMusicSignature(line.content)) {
        searchFrom = line.start;
        foundHeading = true;
        break;
      }
    }
  }

  for (let i = searchFrom; i < text.length; i++) {
    if (isLikelyOctaveNoteAt(text, i)) return i;
  }

  if (searchFrom > 0) {
    for (let i = 0; i < searchFrom; i++) {
      if (isLikelyOctaveNoteAt(text, i)) return i;
    }
  }

  const score = parseBrailleMusic(text);
  return score.events.length > 0 ? score.events[0].charIndex : 0;
}
