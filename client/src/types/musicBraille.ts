/**
 * AST and playback types for the Braille Music parser and Web Audio player.
 * Parser input is ASCII BRF; events carry charIndex for UI cell highlighting.
 */

export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface TimeSignature {
  /** Numerator (e.g. 4). */
  beatsPerMeasure: number;
  /** Denominator (e.g. 4 for quarter, 8 for eighth). */
  beatUnit: number;
}

export interface KeySignature {
  /** Positive for sharps, negative for flats. */
  sharpsFlatsCount: number;
}

export interface MusicNoteEvent {
  id: string;
  /** Original character offset in the ASCII BRF string for UI sync. */
  charIndex: number;
  measure: number;
  /** Absolute beat position in the score (quarter-note beats). */
  timeOffsetBeats: number;
  /** Beat length (e.g. 1.0 = quarter, 0.5 = 8th). */
  durationBeats: number;
  /** Single note [60] or chord [60, 64, 67]; empty for rests. */
  midiPitches: number[];
  type: 'note' | 'chord' | 'rest';
  /** When true, this note is tied into the next matching pitch (no new attack). */
  isTied?: boolean;
}

export interface MusicScoreAST {
  events: MusicNoteEvent[];
  totalBeats: number;
  totalMeasures: number;
  timeSignature: TimeSignature;
  keySignature: KeySignature;
}

/** Stable keys for music playback errors (UI maps via i18n). */
export type MusicPlaybackErrorKey = 'webAudioUnavailable' | 'playbackFailed';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  activeCharIndex: number | null;
  bpm: number;
  /** Non-null when the last play attempt failed. */
  error: MusicPlaybackErrorKey | null;
}

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beatsPerMeasure: 4,
  beatUnit: 4,
};

export const DEFAULT_KEY_SIGNATURE: KeySignature = {
  sharpsFlatsCount: 0,
};
