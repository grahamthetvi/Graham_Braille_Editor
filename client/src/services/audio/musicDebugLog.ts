/**
 * Secret Music Braille playback diagnostics.
 *
 * Enable with any of:
 * - URL `?musicDebug=1`
 * - localStorage `graham.musicDebug=1`
 * - Ctrl+Shift+Alt+M (toggles)
 *
 * Captures parse summaries, schedule events, clock samples, and anomalies so a
 * session can be exported as JSON for remote debugging.
 */

import type { MusicNoteEvent, MusicScoreAST, PlaybackState } from '../../types/musicBraille';

export const MUSIC_DEBUG_STORAGE_KEY = 'graham.musicDebug';

export type MusicDebugTransport =
  | 'play'
  | 'play-cursor'
  | 'play-document'
  | 'play-music'
  | 'pause'
  | 'stop'
  | 'resume'
  | 'bpm'
  | 'reschedule'
  | 'score-reset'
  | 'error';

export interface MusicDebugScheduleEntry {
  wallMs: number;
  audioTime: number;
  beat: number;
  durationSec: number;
  midiPitches: number[];
  charIndex: number;
  measure: number;
  eventId: string;
  /** Seconds after play origin when this note was supposed to start. */
  delayFromOriginSec: number;
}

export interface MusicDebugClockSample {
  wallMs: number;
  audioTime: number;
  beat: number;
  activeCharIndex: number | null;
  nextEventIndex: number;
  scheduledAhead: number;
}

export interface MusicDebugTransportEntry {
  wallMs: number;
  kind: MusicDebugTransport;
  detail?: string;
  beat?: number;
  bpm?: number;
}

export interface MusicDebugScoreSummary {
  eventCount: number;
  noteCount: number;
  restCount: number;
  chordCount: number;
  totalBeats: number;
  totalMeasures: number;
  timeSignature: MusicScoreAST['timeSignature'];
  keySignature: MusicScoreAST['keySignature'];
  musicStartCharIndex: number;
  durationHistogram: Record<string, number>;
  tinyNoteCount: number;
  /** Notes shorter than a 16th (0.25 beats). */
  subSixteenthCount: number;
  firstNotes: Array<{
    t: number;
    d: number;
    midi: number[];
    type: string;
    ch: number;
    m: number;
  }>;
  /** charIndex moves backward while time advances (highlight jumps). */
  highlightBackjumpCount: number;
}

export interface MusicDebugAnomaly {
  kind: string;
  wallMs: number;
  detail: string;
}

export interface MusicDebugSnapshot {
  version: 1;
  capturedAt: string;
  enabled: boolean;
  userAgent: string;
  score: MusicDebugScoreSummary | null;
  playback: PlaybackState | null;
  transport: MusicDebugTransportEntry[];
  schedule: MusicDebugScheduleEntry[];
  clock: MusicDebugClockSample[];
  anomalies: MusicDebugAnomaly[];
}

const MAX_SCHEDULE = 400;
const MAX_CLOCK = 240;
const MAX_TRANSPORT = 80;
const MAX_ANOMALIES = 100;

type Listener = () => void;

function readEnabledFromEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem(MUSIC_DEBUG_STORAGE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('musicDebug') === '1' || q.get('musicDebug') === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}

function round(n: number, digits = 4): number {
  if (!Number.isFinite(n)) return n;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function histKey(beats: number): string {
  return round(beats, 4).toFixed(4);
}

export function summarizeScore(
  score: MusicScoreAST,
  musicStartCharIndex = 0,
): MusicDebugScoreSummary {
  const durationHistogram: Record<string, number> = {};
  let noteCount = 0;
  let restCount = 0;
  let chordCount = 0;
  let tinyNoteCount = 0;
  let subSixteenthCount = 0;

  for (const e of score.events) {
    const k = histKey(e.durationBeats);
    durationHistogram[k] = (durationHistogram[k] ?? 0) + 1;
    if (e.type === 'rest' || e.midiPitches.length === 0) {
      restCount += 1;
    } else {
      noteCount += 1;
      if (e.type === 'chord') chordCount += 1;
      if (e.durationBeats < 0.1) tinyNoteCount += 1;
      if (e.durationBeats < 0.25 - 1e-9) subSixteenthCount += 1;
    }
  }

  const sounding = score.events.filter((e) => e.midiPitches.length > 0);
  let highlightBackjumpCount = 0;
  let maxChar = -1;
  for (const e of sounding) {
    if (e.charIndex < maxChar - 8) highlightBackjumpCount += 1;
    maxChar = Math.max(maxChar, e.charIndex);
  }

  return {
    eventCount: score.events.length,
    noteCount,
    restCount,
    chordCount,
    totalBeats: round(score.totalBeats, 3),
    totalMeasures: score.totalMeasures,
    timeSignature: score.timeSignature,
    keySignature: score.keySignature,
    musicStartCharIndex,
    durationHistogram,
    tinyNoteCount,
    subSixteenthCount,
    firstNotes: score.events.slice(0, 24).map((e) => ({
      t: round(e.timeOffsetBeats, 3),
      d: round(e.durationBeats, 3),
      midi: [...e.midiPitches],
      type: e.type,
      ch: e.charIndex,
      m: e.measure,
    })),
    highlightBackjumpCount,
  };
}

class MusicDebugLog {
  private enabled = false;
  private listeners = new Set<Listener>();
  private score: MusicDebugScoreSummary | null = null;
  private playback: PlaybackState | null = null;
  private transport: MusicDebugTransportEntry[] = [];
  private schedule: MusicDebugScheduleEntry[] = [];
  private clock: MusicDebugClockSample[] = [];
  private anomalies: MusicDebugAnomaly[] = [];
  private lastScheduleAudioTime = -1;
  private lastClockWallMs = 0;

  constructor() {
    this.enabled = readEnabledFromEnvironment();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
    if (typeof window !== 'undefined') {
      try {
        if (next) window.localStorage.setItem(MUSIC_DEBUG_STORAGE_KEY, '1');
        else window.localStorage.removeItem(MUSIC_DEBUG_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    this.emit();
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* ignore subscriber errors */
      }
    }
  }

  private wallMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  clearSession(): void {
    this.transport = [];
    this.schedule = [];
    this.clock = [];
    this.anomalies = [];
    this.lastScheduleAudioTime = -1;
    this.lastClockWallMs = 0;
    this.emit();
  }

  setScore(score: MusicScoreAST, musicStartCharIndex: number): void {
    this.score = summarizeScore(score, musicStartCharIndex);
    if (this.enabled) {
      if (this.score.tinyNoteCount > 0) {
        this.pushAnomaly(
          'tiny-notes',
          `${this.score.tinyNoteCount} notes shorter than 0.1 beats (often inaudible)`,
        );
      }
      if (this.score.highlightBackjumpCount > 10) {
        this.pushAnomaly(
          'highlight-backjumps',
          `${this.score.highlightBackjumpCount} backward charIndex jumps while time advances`,
        );
      }
    }
    this.emit();
  }

  setPlayback(state: PlaybackState): void {
    this.playback = { ...state };
    this.emit();
  }

  logTransport(kind: MusicDebugTransport, detail?: string, beat?: number, bpm?: number): void {
    if (!this.enabled) return;
    this.transport.push({
      wallMs: round(this.wallMs(), 1),
      kind,
      detail,
      beat: beat != null ? round(beat, 3) : undefined,
      bpm,
    });
    if (this.transport.length > MAX_TRANSPORT) {
      this.transport.splice(0, this.transport.length - MAX_TRANSPORT);
    }
    this.emit();
  }

  logSchedule(entry: Omit<MusicDebugScheduleEntry, 'wallMs'>): void {
    if (!this.enabled) return;
    const wallMs = round(this.wallMs(), 1);
    const row: MusicDebugScheduleEntry = {
      ...entry,
      wallMs,
      audioTime: round(entry.audioTime, 4),
      beat: round(entry.beat, 4),
      durationSec: round(entry.durationSec, 4),
      delayFromOriginSec: round(entry.delayFromOriginSec, 4),
    };
    this.schedule.push(row);
    if (this.schedule.length > MAX_SCHEDULE) {
      this.schedule.splice(0, this.schedule.length - MAX_SCHEDULE);
    }

    if (this.lastScheduleAudioTime >= 0) {
      const gap = entry.audioTime - this.lastScheduleAudioTime;
      if (gap < -0.01) {
        this.pushAnomaly(
          'schedule-backwards',
          `Note scheduled ${( -gap).toFixed(3)}s earlier than previous (audio ${entry.audioTime.toFixed(3)})`,
        );
      } else if (gap > 0 && gap < 0.01 && entry.midiPitches.length > 0) {
        // Simultaneous chords are fine; ultra-dense sequential attacks are suspicious.
        // Only flag if pitches differ (not a chord cluster at same time).
      } else if (gap > 2.5) {
        this.pushAnomaly(
          'schedule-gap',
          `Large ${gap.toFixed(2)}s gap before beat ${entry.beat.toFixed(2)}`,
        );
      }
    }
    if (entry.durationSec < 0.04) {
      this.pushAnomaly(
        'inaudible-duration',
        `Scheduled ${entry.durationSec.toFixed(3)}s note (midi ${entry.midiPitches.join(',')})`,
      );
    }
    this.lastScheduleAudioTime = entry.audioTime;
    this.emit();
  }

  logClock(sample: Omit<MusicDebugClockSample, 'wallMs'>): void {
    if (!this.enabled) return;
    const wallMs = this.wallMs();
    // Throttle clock samples (~8 Hz) to keep the export readable.
    if (wallMs - this.lastClockWallMs < 120 && this.clock.length > 0) return;
    this.lastClockWallMs = wallMs;
    this.clock.push({
      wallMs: round(wallMs, 1),
      audioTime: round(sample.audioTime, 4),
      beat: round(sample.beat, 4),
      activeCharIndex: sample.activeCharIndex,
      nextEventIndex: sample.nextEventIndex,
      scheduledAhead: sample.scheduledAhead,
    });
    if (this.clock.length > MAX_CLOCK) {
      this.clock.splice(0, this.clock.length - MAX_CLOCK);
    }
    this.emit();
  }

  private pushAnomaly(kind: string, detail: string): void {
    this.anomalies.push({ kind, wallMs: round(this.wallMs(), 1), detail });
    if (this.anomalies.length > MAX_ANOMALIES) {
      this.anomalies.splice(0, this.anomalies.length - MAX_ANOMALIES);
    }
  }

  getSnapshot(): MusicDebugSnapshot {
    return {
      version: 1,
      capturedAt: new Date().toISOString(),
      enabled: this.enabled,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      score: this.score,
      playback: this.playback,
      transport: [...this.transport],
      schedule: [...this.schedule],
      clock: [...this.clock],
      anomalies: [...this.anomalies],
    };
  }

  /** Live counts for the panel without cloning large arrays. */
  getStats(): {
    enabled: boolean;
    scheduleCount: number;
    clockCount: number;
    transportCount: number;
    anomalyCount: number;
    score: MusicDebugScoreSummary | null;
    playback: PlaybackState | null;
    recentSchedule: MusicDebugScheduleEntry[];
    recentAnomalies: MusicDebugAnomaly[];
    recentTransport: MusicDebugTransportEntry[];
  } {
    return {
      enabled: this.enabled,
      scheduleCount: this.schedule.length,
      clockCount: this.clock.length,
      transportCount: this.transport.length,
      anomalyCount: this.anomalies.length,
      score: this.score,
      playback: this.playback,
      recentSchedule: this.schedule.slice(-12),
      recentAnomalies: this.anomalies.slice(-12),
      recentTransport: this.transport.slice(-8),
    };
  }
}

export const musicDebugLog = new MusicDebugLog();

/** Optional console handle for support sessions. */
declare global {
  interface Window {
    __grahamMusicDebug?: {
      enable: () => void;
      disable: () => void;
      toggle: () => boolean;
      snapshot: () => MusicDebugSnapshot;
      clear: () => void;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__grahamMusicDebug = {
    enable: () => musicDebugLog.setEnabled(true),
    disable: () => musicDebugLog.setEnabled(false),
    toggle: () => musicDebugLog.toggle(),
    snapshot: () => musicDebugLog.getSnapshot(),
    clear: () => musicDebugLog.clearSession(),
  };
}

/** Pitch name helper for the debug panel. */
export function midiToLabel(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function formatScheduleEvent(ev: MusicNoteEvent, bpm: number): string {
  const spb = 60 / Math.max(1, bpm);
  const pitches =
    ev.midiPitches.length === 0
      ? 'rest'
      : ev.midiPitches.map(midiToLabel).join('+');
  return `m${ev.measure} beat=${ev.timeOffsetBeats.toFixed(2)} d=${ev.durationBeats.toFixed(2)} (${(ev.durationBeats * spb).toFixed(2)}s) ${pitches} ch=${ev.charIndex}`;
}
