/**
 * AST and playback types for the Braille Music parser and Web Audio player.
 * Parser input is ASCII BRF; events carry charIndex for UI cell highlighting.
 */

export type PitchName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface MusicNoteEvent {
  id: string;
  /** Original character index in ASCII BRF for UI highlighting */
  charIndex: number;
  measure: number;
  /** Cumulative beat offset within the score */
  timeOffsetBeats: number;
  /** e.g. 1.0 for quarter, 0.5 for 8th */
  durationBeats: number;
  /** Single note [60] or chord [60, 64, 67]; empty for rests */
  midiPitches: number[];
  type: 'note' | 'chord' | 'rest';
}

export interface MusicScoreAST {
  events: MusicNoteEvent[];
  totalBeats: number;
  totalMeasures: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentBeat: number;
  activeCharIndex: number | null;
  bpm: number;
}
