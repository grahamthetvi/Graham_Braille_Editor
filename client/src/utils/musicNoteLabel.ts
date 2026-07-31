/**
 * Human-readable labels for Music Braille playback events
 * (pitch names, duration terms, rests, chords).
 */

import type { MusicNoteEvent } from '../types/musicBraille';

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** MIDI pitch → "C4", "F#5", etc. */
export function midiToLabel(midi: number): string {
  const name = PITCH_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Speakable pitch: "C 4", "F sharp 5". */
export function midiToSpeech(midi: number): string {
  const raw = midiToLabel(midi);
  const m = raw.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return raw;
  const pitch = m[1].includes('#') ? `${m[1].replace('#', '')} sharp` : m[1];
  return `${pitch} ${m[2]}`;
}

const DURATION_TABLE: ReadonlyArray<{ beats: number; label: string; speech: string }> = [
  { beats: 4, label: 'whole', speech: 'whole' },
  { beats: 3, label: 'dotted half', speech: 'dotted half' },
  { beats: 2, label: 'half', speech: 'half' },
  { beats: 1.5, label: 'dotted quarter', speech: 'dotted quarter' },
  { beats: 4 / 3, label: 'triplet half', speech: 'triplet half' },
  { beats: 1, label: 'quarter', speech: 'quarter' },
  { beats: 0.75, label: 'dotted eighth', speech: 'dotted eighth' },
  { beats: 2 / 3, label: 'triplet quarter', speech: 'triplet quarter' },
  { beats: 0.5, label: 'eighth', speech: 'eighth' },
  { beats: 0.375, label: 'dotted sixteenth', speech: 'dotted sixteenth' },
  { beats: 1 / 3, label: 'triplet eighth', speech: 'triplet eighth' },
  { beats: 0.25, label: 'sixteenth', speech: 'sixteenth' },
  { beats: 1 / 6, label: 'triplet sixteenth', speech: 'triplet sixteenth' },
  { beats: 0.125, label: 'thirty-second', speech: 'thirty-second' },
];

export interface DurationTerm {
  label: string;
  speech: string;
}

/** Map quarter-note beat length to a music duration term. */
export function durationBeatsToTerm(durationBeats: number): DurationTerm {
  if (!Number.isFinite(durationBeats) || durationBeats <= 0) {
    return { label: 'note', speech: 'note' };
  }
  let best = DURATION_TABLE[0];
  let bestDist = Math.abs(durationBeats - best.beats);
  for (let i = 1; i < DURATION_TABLE.length; i++) {
    const row = DURATION_TABLE[i];
    const dist = Math.abs(durationBeats - row.beats);
    if (dist < bestDist - 1e-9) {
      best = row;
      bestDist = dist;
    }
  }
  if (bestDist < 0.04) return { label: best.label, speech: best.speech };
  // Fallback for unusual lengths (e.g. soft overflow).
  const rounded = Math.round(durationBeats * 1000) / 1000;
  return {
    label: `${rounded}-beat`,
    speech: `${rounded} beat`,
  };
}

function pitchesDisplay(midiPitches: number[]): string {
  return midiPitches.map(midiToLabel).join('+');
}

function pitchesSpeech(midiPitches: number[]): string {
  if (midiPitches.length === 0) return '';
  if (midiPitches.length === 1) return midiToSpeech(midiPitches[0]);
  const parts = midiPitches.map(midiToSpeech);
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

export interface MusicEventLabels {
  /** Compact status text, e.g. "C4, quarter". */
  display: string;
  /** Spoken announcement, e.g. "C 4, quarter note". */
  speech: string;
}

/** Build display + speech labels for a parsed playback event. */
export function formatMusicEventLabels(ev: MusicNoteEvent): MusicEventLabels {
  const dur = durationBeatsToTerm(ev.durationBeats);
  const tied = ev.isTied ? ', tied' : '';
  const tiedSpeech = ev.isTied ? ', tied' : '';

  if (ev.type === 'rest' || ev.midiPitches.length === 0) {
    return {
      display: `${dur.label} rest${tied}`,
      speech: `${dur.speech} rest${tiedSpeech}`,
    };
  }

  const pitchDisp = pitchesDisplay(ev.midiPitches);
  const pitchSp = pitchesSpeech(ev.midiPitches);

  if (ev.type === 'chord' || ev.midiPitches.length > 1) {
    return {
      display: `${pitchDisp}, ${dur.label} chord${tied}`,
      speech: `chord ${pitchSp}, ${dur.speech}${tiedSpeech}`,
    };
  }

  return {
    display: `${pitchDisp}, ${dur.label}${tied}`,
    speech: `${pitchSp}, ${dur.speech} note${tiedSpeech}`,
  };
}

/** Index of the event sounding at `beat`, or -1. */
export function eventIndexAtBeat(events: MusicNoteEvent[], beat: number): number {
  return events.findIndex(
    (e) =>
      beat >= e.timeOffsetBeats - 1e-6 && beat < e.timeOffsetBeats + e.durationBeats,
  );
}

/**
 * Next event index to step to from the current beat / event.
 * When `fromIndex` is set, steps after that index; otherwise the first
 * event at or after `fromBeat` (so idle start lands on note 0).
 */
export function nextStepEventIndex(
  events: MusicNoteEvent[],
  fromBeat: number,
  fromIndex: number | null,
): number {
  if (!events.length) return -1;
  if (fromIndex != null && fromIndex >= 0) {
    const next = fromIndex + 1;
    return next < events.length ? next : -1;
  }
  for (let i = 0; i < events.length; i++) {
    if (events[i].timeOffsetBeats >= fromBeat - 1e-6) return i;
  }
  return -1;
}

/** Previous event index for step-back. */
export function prevStepEventIndex(
  events: MusicNoteEvent[],
  fromBeat: number,
  fromIndex: number | null,
): number {
  if (!events.length) return -1;
  if (fromIndex != null && fromIndex >= 0) {
    return fromIndex > 0 ? fromIndex - 1 : -1;
  }
  // Covering / last-started event at fromBeat, then one before it.
  let i = events.length - 1;
  while (i >= 0 && events[i].timeOffsetBeats > fromBeat + 1e-6) i -= 1;
  if (i < 0) return -1;
  return i > 0 ? i - 1 : -1;
}
