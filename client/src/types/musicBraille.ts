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

export interface MusicScoreParseInfo {
  /** Sao Mai RH/LH systems detected (0 = sequential / non-piano lex). */
  pianoSystems: number;
  /** Quarter-note beat capacity used for measure fill. */
  capacityBeats: number;
  /** Character index where lexing began after skipping literary front matter. */
  literarySkipCharIndex: number;
}

/** How the initial playback tempo was chosen from the score. */
export type MusicTempoSource =
  | 'metronome'
  | 'tempoWord'
  | 'wordSign'
  | 'default';

export interface DetectedTempo {
  /** Quarter-note beats per minute. */
  bpm: number;
  source: MusicTempoSource;
  /** Human-readable label (e.g. "Allegro", "♩=120"). */
  label: string;
}

/** Mid-score absolute tempo change (already resolved from rit/accel/a tempo). */
export interface MusicTempoChange {
  timeOffsetBeats: number;
  bpm: number;
  label: string;
}

export interface MusicScoreAST {
  events: MusicNoteEvent[];
  totalBeats: number;
  totalMeasures: number;
  timeSignature: TimeSignature;
  keySignature: KeySignature;
  /** Optional parse diagnostics for the music debug panel. */
  parseInfo?: MusicScoreParseInfo;
  /** Best initial tempo from the score (metronome > word > default). */
  detectedTempo?: DetectedTempo;
  /** Absolute BPM changes after the opening tempo. */
  tempoChanges?: MusicTempoChange[];
}

/** Stable keys for music playback errors (UI maps via i18n). */
export type MusicPlaybackErrorKey = 'webAudioUnavailable' | 'playbackFailed';

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  activeCharIndex: number | null;
  /** Index into score.events for the highlighted / stepped note. */
  activeEventIndex: number | null;
  bpm: number;
  /**
   * Where the current BPM came from for UI:
   * - score: auto from detectedTempo / tempoChanges
   * - user: teacher/student moved the slider
   * - default: no tempo found in the BRF; using fallback BPM
   */
  tempoOrigin: 'score' | 'user' | 'default';
  /** Label for the score-derived tempo when origin is score (e.g. Allegro). */
  tempoLabel: string | null;
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
