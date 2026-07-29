/**
 * useMusicPlayback — parse Music Braille (ASCII BRF or Unicode cells) and schedule Web Audio notes.
 *
 * Exposes activeCharIndex so the BRF preview can highlight the sounding cell.
 * Scheduling uses the AudioContext clock with a sliding lookahead window;
 * cell highlights and end-of-piece detection follow the same clock (no setTimeout).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  MusicNoteEvent,
  MusicPlaybackErrorKey,
  MusicScoreAST,
  PlaybackState,
} from '../types/musicBraille';
import {
  beatForCharIndex,
  findMusicStartCharIndex,
  parseBrailleMusic,
} from '../utils/musicBraille';
import { MusicSynthEngine } from '../services/audio/musicSynth';

const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;
/** How far ahead (seconds) to schedule oscillators on the audio clock. */
const LOOKAHEAD_SEC = 1.25;
/** Minimum gap between React state updates for beat / highlight. */
const UI_UPDATE_MS = 50;
/** Debounce tempo changes while playing so dragging the slider does not thrash. */
const BPM_RESCHEDULE_MS = 150;

/** Where a fresh (non-resume) Play should begin. */
export type MusicPlayFrom = 'cursor' | 'document' | 'music';

export interface UseMusicPlaybackReturn {
  playbackState: PlaybackState;
  score: MusicScoreAST;
  /** Detected character index where music notes likely begin. */
  musicStartCharIndex: number;
  play: (opts?: { from?: MusicPlayFrom }) => void;
  pause: () => void;
  stop: () => void;
  setBPM: (bpm: number) => void;
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

function eventAtBeat(events: MusicNoteEvent[], beat: number): MusicNoteEvent | null {
  return (
    events.find(
      (e) =>
        beat >= e.timeOffsetBeats - 1e-6 &&
        beat < e.timeOffsetBeats + e.durationBeats,
    ) ?? null
  );
}

function cancelSpeechOverlap(): void {
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* ignore */
  }
}

function toErrorKey(err: unknown): MusicPlaybackErrorKey {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/not available|AudioContext|webkitAudioContext/i.test(msg)) {
    return 'webAudioUnavailable';
  }
  return 'playbackFailed';
}

/**
 * @param brfString Music Braille source (ASCII BRF and/or Unicode braille cells)
 * @param cursorCharIndex Editor caret/selection start offset
 * @param playFromCursor When true (default), Play uses the caret; when false, Play
 *   starts at the document beginning. Pass `from: 'music'` to start at detected score.
 */
export function useMusicPlayback(
  brfString: string,
  cursorCharIndex = 0,
  playFromCursor = true,
): UseMusicPlaybackReturn {
  const [bpm, setBpmState] = useState(DEFAULT_BPM);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [error, setError] = useState<MusicPlaybackErrorKey | null>(null);

  const synthRef = useRef<MusicSynthEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const pauseBeatRef = useRef(0);
  const playOriginRef = useRef<{ audioStart: number; beatStart: number } | null>(null);
  const bpmRef = useRef(bpm);
  const scoreRef = useRef<MusicScoreAST>(parseBrailleMusic(''));
  const cursorCharIndexRef = useRef(cursorCharIndex);
  const playFromCursorRef = useRef(playFromCursor);
  const brfStringRef = useRef(brfString);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  /** Bumped to cancel in-flight async schedule / stale rAF generations. */
  const playGenRef = useRef(0);
  const nextEventIndexRef = useRef(0);
  const lastUiUpdateMsRef = useRef(0);
  const bpmDebounceRef = useRef<number | null>(null);

  const score = useMemo(() => parseBrailleMusic(brfString || ''), [brfString]);
  const musicStartCharIndex = useMemo(
    () => findMusicStartCharIndex(brfString || ''),
    [brfString],
  );

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    cursorCharIndexRef.current = cursorCharIndex;
  }, [cursorCharIndex]);

  useEffect(() => {
    playFromCursorRef.current = playFromCursor;
  }, [playFromCursor]);

  useEffect(() => {
    brfStringRef.current = brfString;
  }, [brfString]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const clearRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearBpmDebounce = useCallback(() => {
    if (bpmDebounceRef.current != null) {
      window.clearTimeout(bpmDebounceRef.current);
      bpmDebounceRef.current = null;
    }
  }, []);

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) synthRef.current = new MusicSynthEngine();
    return synthRef.current;
  }, []);

  const stopInternal = useCallback(
    (resetPosition: boolean) => {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      synthRef.current?.silence();
      playOriginRef.current = null;
      nextEventIndexRef.current = 0;
      lastUiUpdateMsRef.current = 0;
      isPlayingRef.current = false;
      isPausedRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setActiveCharIndex(null);
      if (resetPosition) {
        pauseBeatRef.current = 0;
        setCurrentBeat(0);
      }
    },
    [clearBpmDebounce, clearRaf],
  );

  const scheduleFromBeat = useCallback(
    async (fromBeat: number) => {
      const gen = ++playGenRef.current;
      clearRaf();
      clearBpmDebounce();
      const synth = ensureSynth();
      synth.silence();

      try {
        await synth.ensureReady();
      } catch (err) {
        if (gen !== playGenRef.current) return;
        setError(toErrorKey(err));
        isPlayingRef.current = false;
        isPausedRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        setActiveCharIndex(null);
        return;
      }
      if (gen !== playGenRef.current) return;

      cancelSpeechOverlap();
      setError(null);

      const ast = scoreRef.current;
      const audioStart = synth.now() + 0.05;
      playOriginRef.current = { audioStart, beatStart: fromBeat };

      let idx = 0;
      while (idx < ast.events.length) {
        const ev = ast.events[idx];
        if (ev.timeOffsetBeats + ev.durationBeats > fromBeat + 1e-9) break;
        idx += 1;
      }
      nextEventIndexRef.current = idx;
      lastUiUpdateMsRef.current = 0;

      isPlayingRef.current = true;
      isPausedRef.current = false;
      setIsPlaying(true);
      setIsPaused(false);

      const tick = () => {
        if (gen !== playGenRef.current) return;
        const origin = playOriginRef.current;
        const engine = synthRef.current;
        if (!origin || !engine) return;

        const scoreNow = scoreRef.current;
        const spb = 60 / bpmRef.current;
        const audioNow = engine.now();
        const beat = origin.beatStart + (audioNow - origin.audioStart) / spb;
        pauseBeatRef.current = Math.min(beat, scoreNow.totalBeats);

        // Sliding lookahead: schedule voices that start soon on the audio clock.
        const scheduleUntil = audioNow + LOOKAHEAD_SEC;
        while (nextEventIndexRef.current < scoreNow.events.length) {
          const ev = scoreNow.events[nextEventIndexRef.current];
          const endBeat = ev.timeOffsetBeats + ev.durationBeats;
          if (endBeat <= origin.beatStart + 1e-9) {
            nextEventIndexRef.current += 1;
            continue;
          }
          const startBeat = Math.max(ev.timeOffsetBeats, origin.beatStart);
          const startTime = origin.audioStart + (startBeat - origin.beatStart) * spb;
          if (startTime > scheduleUntil) break;

          const remainBeats = endBeat - startBeat;
          const durSec = Math.max(0.05, remainBeats * spb * 0.92);
          if (ev.type !== 'rest' && ev.midiPitches.length > 0) {
            engine.playChord(ev.midiPitches, startTime, durSec);
          }
          nextEventIndexRef.current += 1;
        }

        const wallNow =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (wallNow - lastUiUpdateMsRef.current >= UI_UPDATE_MS) {
          lastUiUpdateMsRef.current = wallNow;
          setCurrentBeat(beat);
          const active = eventAtBeat(scoreNow.events, beat);
          setActiveCharIndex(active?.charIndex ?? null);
        }

        if (beat >= scoreNow.totalBeats - 1e-6) {
          stopInternal(true);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [clearBpmDebounce, clearRaf, ensureSynth, stopInternal],
  );

  const play = useCallback(
    (opts?: { from?: MusicPlayFrom }) => {
      if (!scoreRef.current.events.length) return;

      // Resume only for the main Play control (no explicit `from` override).
      if (isPausedRef.current && opts?.from == null) {
        void scheduleFromBeat(pauseBeatRef.current);
        return;
      }

      const mode: MusicPlayFrom =
        opts?.from ?? (playFromCursorRef.current ? 'cursor' : 'document');

      let charIndex = 0;
      if (mode === 'cursor') {
        charIndex = cursorCharIndexRef.current;
      } else if (mode === 'music') {
        charIndex = findMusicStartCharIndex(brfStringRef.current || '');
      }

      const startBeat = beatForCharIndex(scoreRef.current, charIndex);
      pauseBeatRef.current = startBeat;
      setCurrentBeat(startBeat);
      void scheduleFromBeat(startBeat);
    },
    [scheduleFromBeat],
  );

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    playGenRef.current += 1;
    clearRaf();
    clearBpmDebounce();
    synthRef.current?.silence();
    playOriginRef.current = null;
    nextEventIndexRef.current = 0;
    isPlayingRef.current = false;
    isPausedRef.current = true;
    setIsPlaying(false);
    setIsPaused(true);
    setActiveCharIndex(null);
  }, [clearBpmDebounce, clearRaf]);

  const stop = useCallback(() => {
    setError(null);
    stopInternal(true);
  }, [stopInternal]);

  const setBPM = useCallback(
    (next: number) => {
      const clamped = clampBpm(next);
      setBpmState(clamped);

      if (!isPlayingRef.current) {
        bpmRef.current = clamped;
        return;
      }

      // Keep audio on the previous tempo until the debounced reschedule fires.
      clearBpmDebounce();
      bpmDebounceRef.current = window.setTimeout(() => {
        bpmDebounceRef.current = null;
        bpmRef.current = clamped;
        if (isPlayingRef.current) {
          void scheduleFromBeat(pauseBeatRef.current);
        }
      }, BPM_RESCHEDULE_MS);
    },
    [clearBpmDebounce, scheduleFromBeat],
  );

  // Stop playback when the BRF source changes (new parse / mode toggle).
  // Keep the AudioContext alive — only silence voices.
  useEffect(() => {
    playGenRef.current += 1;
    clearRaf();
    clearBpmDebounce();
    synthRef.current?.silence();
    playOriginRef.current = null;
    nextEventIndexRef.current = 0;
    pauseBeatRef.current = 0;
    lastUiUpdateMsRef.current = 0;
    isPlayingRef.current = false;
    isPausedRef.current = false;
    // Intentional reset of playback UI when the score text changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- media engine must resync React state with a new BRF source
    setIsPlaying(false);
    setIsPaused(false);
    setActiveCharIndex(null);
    setCurrentBeat(0);
    setError(null);
  }, [brfString, clearBpmDebounce, clearRaf]);

  useEffect(() => {
    return () => {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, [clearBpmDebounce, clearRaf]);

  const playbackState: PlaybackState = {
    isPlaying,
    isPaused,
    currentBeat,
    activeCharIndex,
    bpm,
    error,
  };

  return {
    playbackState,
    score,
    musicStartCharIndex,
    play,
    pause,
    stop,
    setBPM,
  };
}

export { DEFAULT_BPM, MIN_BPM, MAX_BPM };
