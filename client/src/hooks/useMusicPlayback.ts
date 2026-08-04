/**
 * useMusicPlayback — parse Music Braille (ASCII BRF or Unicode cells) and schedule Web Audio notes.
 *
 * Exposes activeCharIndex so the BRF preview can highlight the sounding cell.
 * Scheduling uses the AudioContext clock with a sliding lookahead window;
 * cell highlights and end-of-piece detection follow the same clock (no setTimeout).
 *
 * Step next/prev parks on a single event, sounds it once, and announces its
 * music term (pitch + duration) via speechSynthesis. Rests get a soft click
 * and a timed “felt” wait at the current BPM (Step is never blocked).
 *
 * Score tempo (metronome / tempo words) auto-applies until the user moves the
 * slider; mid-score tempoChanges update BPM while playing.
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
import {
  eventIndexAtBeat,
  formatMusicEventLabels,
  nextStepEventIndex,
  prevStepEventIndex,
} from '../utils/musicNoteLabel';
import { speakMusicHint, cancelMusicSpeech } from '../utils/musicNoteSpeech';
import { MusicSynthEngine } from '../services/audio/musicSynth';
import { musicDebugLog } from '../services/audio/musicDebugLog';
import { DEFAULT_SCORE_BPM } from '../utils/musicTempo';

const DEFAULT_BPM = DEFAULT_SCORE_BPM;
const MIN_BPM = 40;
const MAX_BPM = 240;
/** How far ahead (seconds) to schedule oscillators on the audio clock. */
const LOOKAHEAD_SEC = 1.25;
/** Minimum gap between React state updates for beat / highlight. */
const UI_UPDATE_MS = 50;
/** Debounce tempo changes while playing so dragging the slider does not thrash. */
const BPM_RESCHEDULE_MS = 150;
/** How long a stepped note sounds (seconds). */
const STEP_SOUND_SEC = 0.45;

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
  /** Advance one event; plays and announces the note/term. */
  stepNext: () => void;
  /** Go back one event; plays and announces the note/term. */
  stepPrev: () => void;
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

function toErrorKey(err: unknown): MusicPlaybackErrorKey {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (/not available|AudioContext|webkitAudioContext/i.test(msg)) {
    return 'webAudioUnavailable';
  }
  return 'playbackFailed';
}

function bpmAtBeat(score: MusicScoreAST, beat: number, fallback: number): number {
  const changes = score.tempoChanges ?? [];
  let bpm = score.detectedTempo?.bpm ?? fallback;
  for (const c of changes) {
    if (c.timeOffsetBeats <= beat + 1e-9) bpm = c.bpm;
    else break;
  }
  return clampBpm(bpm);
}

function tempoLabelAtBeat(score: MusicScoreAST, beat: number): string | null {
  const changes = score.tempoChanges ?? [];
  let label = score.detectedTempo?.label ?? null;
  if (label === 'default') label = null;
  for (const c of changes) {
    if (c.timeOffsetBeats <= beat + 1e-9) label = c.label;
    else break;
  }
  return label;
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
  const [tempoOrigin, setTempoOrigin] = useState<'score' | 'user'>('score');
  const [tempoLabel, setTempoLabel] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [activeEventIndex, setActiveEventIndex] = useState<number | null>(null);
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
  const activeEventIndexRef = useRef<number | null>(null);
  /** Bumped to cancel in-flight async schedule / stale rAF generations. */
  const playGenRef = useRef(0);
  const nextEventIndexRef = useRef(0);
  const lastUiUpdateMsRef = useRef(0);
  const bpmDebounceRef = useRef<number | null>(null);
  const stepRestTimerRef = useRef<number | null>(null);
  const userTempoOverrideRef = useRef(false);
  const tempoOriginRef = useRef<'score' | 'user'>('score');
  const lastTempoChangeIdxRef = useRef(-1);

  const score = useMemo(() => parseBrailleMusic(brfString || ''), [brfString]);
  const musicStartCharIndex = useMemo(
    () => findMusicStartCharIndex(brfString || ''),
    [brfString],
  );

  useEffect(() => {
    scoreRef.current = score;
    musicDebugLog.setScore(score, musicStartCharIndex);
  }, [score, musicStartCharIndex]);

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

  useEffect(() => {
    activeEventIndexRef.current = activeEventIndex;
  }, [activeEventIndex]);

  useEffect(() => {
    tempoOriginRef.current = tempoOrigin;
  }, [tempoOrigin]);

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

  const clearStepRestTimer = useCallback(() => {
    if (stepRestTimerRef.current != null) {
      window.clearTimeout(stepRestTimerRef.current);
      stepRestTimerRef.current = null;
    }
  }, []);

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) synthRef.current = new MusicSynthEngine();
    return synthRef.current;
  }, []);

  const applyScoreTempo = useCallback(
    (nextScore: MusicScoreAST, beat = 0) => {
      if (userTempoOverrideRef.current) return;
      const nextBpm = bpmAtBeat(nextScore, beat, DEFAULT_BPM);
      const label = tempoLabelAtBeat(nextScore, beat);
      bpmRef.current = nextBpm;
      setBpmState(nextBpm);
      setTempoOrigin('score');
      setTempoLabel(label);
    },
    [],
  );

  const stopInternal = useCallback(
    (resetPosition: boolean) => {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();
      synthRef.current?.silence();
      playOriginRef.current = null;
      nextEventIndexRef.current = 0;
      lastUiUpdateMsRef.current = 0;
      lastTempoChangeIdxRef.current = -1;
      isPlayingRef.current = false;
      isPausedRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setActiveCharIndex(null);
      setActiveEventIndex(null);
      if (resetPosition) {
        pauseBeatRef.current = 0;
        setCurrentBeat(0);
      }
      musicDebugLog.logTransport('stop', resetPosition ? 'reset' : 'keep-position', pauseBeatRef.current);
    },
    [clearBpmDebounce, clearRaf, clearStepRestTimer],
  );

  const scheduleFromBeat = useCallback(
    async (fromBeat: number) => {
      const gen = ++playGenRef.current;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();
      const synth = ensureSynth();
      synth.silence();

      if (!userTempoOverrideRef.current) {
        const scoreBpm = bpmAtBeat(scoreRef.current, fromBeat, bpmRef.current);
        bpmRef.current = scoreBpm;
        setBpmState(scoreBpm);
        setTempoOrigin('score');
        setTempoLabel(tempoLabelAtBeat(scoreRef.current, fromBeat));
      }

      musicDebugLog.logTransport('reschedule', `fromBeat=${fromBeat.toFixed(3)}`, fromBeat, bpmRef.current);

      try {
        await synth.ensureReady();
      } catch (err) {
        if (gen !== playGenRef.current) return;
        const key = toErrorKey(err);
        setError(key);
        musicDebugLog.logTransport('error', key);
        isPlayingRef.current = false;
        isPausedRef.current = false;
        setIsPlaying(false);
        setIsPaused(false);
        setActiveCharIndex(null);
        setActiveEventIndex(null);
        return;
      }
      if (gen !== playGenRef.current) return;

      cancelMusicSpeech();
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

      const changes = ast.tempoChanges ?? [];
      let changeIdx = -1;
      for (let c = 0; c < changes.length; c++) {
        if (changes[c].timeOffsetBeats <= fromBeat + 1e-9) changeIdx = c;
      }
      lastTempoChangeIdxRef.current = changeIdx;

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

        // Mid-score tempo changes (only when following the score, not user override).
        if (!userTempoOverrideRef.current) {
          const tChanges = scoreNow.tempoChanges ?? [];
          let nextChangeIdx = lastTempoChangeIdxRef.current;
          for (let c = lastTempoChangeIdxRef.current + 1; c < tChanges.length; c++) {
            if (tChanges[c].timeOffsetBeats <= beat + 1e-9) nextChangeIdx = c;
            else break;
          }
          if (nextChangeIdx > lastTempoChangeIdxRef.current) {
            lastTempoChangeIdxRef.current = nextChangeIdx;
            const ch = tChanges[nextChangeIdx];
            const newBpm = clampBpm(ch.bpm);
            if (newBpm !== bpmRef.current) {
              bpmRef.current = newBpm;
              setBpmState(newBpm);
              setTempoOrigin('score');
              setTempoLabel(ch.label);
              playOriginRef.current = { audioStart: audioNow, beatStart: beat };
              // Re-find next event index from current beat under new tempo.
              let ni = 0;
              while (ni < scoreNow.events.length) {
                const ev = scoreNow.events[ni];
                if (ev.timeOffsetBeats + ev.durationBeats > beat + 1e-9) break;
                ni += 1;
              }
              nextEventIndexRef.current = ni;
              musicDebugLog.logTransport('bpm', `score→${newBpm}:${ch.label}`, beat, newBpm);
            }
          }
        }

        const originNow = playOriginRef.current;
        if (!originNow) return;
        const spbNow = 60 / bpmRef.current;
        const beatNow =
          originNow.beatStart + (engine.now() - originNow.audioStart) / spbNow;
        pauseBeatRef.current = Math.min(beatNow, scoreNow.totalBeats);

        // Sliding lookahead: schedule voices that start soon on the audio clock.
        const scheduleUntil = engine.now() + LOOKAHEAD_SEC;
        let scheduledThisTick = 0;
        while (nextEventIndexRef.current < scoreNow.events.length) {
          const ev = scoreNow.events[nextEventIndexRef.current];
          const endBeat = ev.timeOffsetBeats + ev.durationBeats;
          if (endBeat <= originNow.beatStart + 1e-9) {
            nextEventIndexRef.current += 1;
            continue;
          }
          const startBeat = Math.max(ev.timeOffsetBeats, originNow.beatStart);
          const startTime =
            originNow.audioStart + (startBeat - originNow.beatStart) * spbNow;
          if (startTime > scheduleUntil) break;

          const remainBeats = endBeat - startBeat;
          const durSec = Math.max(0.05, remainBeats * spbNow * 0.92);
          if (ev.type === 'rest' || ev.midiPitches.length === 0) {
            engine.playRestClick(startTime);
            musicDebugLog.logSchedule({
              audioTime: startTime,
              beat: startBeat,
              durationSec: 0.04,
              midiPitches: [],
              charIndex: ev.charIndex,
              measure: ev.measure,
              eventId: ev.id,
              delayFromOriginSec: startTime - originNow.audioStart,
            });
            scheduledThisTick += 1;
          } else {
            engine.playChord(ev.midiPitches, startTime, durSec);
            musicDebugLog.logSchedule({
              audioTime: startTime,
              beat: startBeat,
              durationSec: durSec,
              midiPitches: ev.midiPitches,
              charIndex: ev.charIndex,
              measure: ev.measure,
              eventId: ev.id,
              delayFromOriginSec: startTime - originNow.audioStart,
            });
            scheduledThisTick += 1;
          }
          nextEventIndexRef.current += 1;
        }

        const activeIdx = eventIndexAtBeat(scoreNow.events, beatNow);
        const active = activeIdx >= 0 ? scoreNow.events[activeIdx] : null;
        musicDebugLog.logClock({
          audioTime: engine.now(),
          beat: beatNow,
          activeCharIndex: active?.charIndex ?? null,
          nextEventIndex: nextEventIndexRef.current,
          scheduledAhead: scheduledThisTick,
        });

        const wallNow =
          typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (wallNow - lastUiUpdateMsRef.current >= UI_UPDATE_MS) {
          lastUiUpdateMsRef.current = wallNow;
          setCurrentBeat(beatNow);
          setActiveCharIndex(active?.charIndex ?? null);
          setActiveEventIndex(activeIdx >= 0 ? activeIdx : null);
        }

        if (beatNow >= scoreNow.totalBeats - 1e-6) {
          stopInternal(true);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [clearBpmDebounce, clearRaf, clearStepRestTimer, ensureSynth, stopInternal],
  );

  const play = useCallback(
    (opts?: { from?: MusicPlayFrom }) => {
      if (!scoreRef.current.events.length) return;

      // Resume only for the main Play control (no explicit `from` override).
      if (isPausedRef.current && opts?.from == null) {
        musicDebugLog.logTransport('resume', undefined, pauseBeatRef.current, bpmRef.current);
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
      musicDebugLog.clearSession();
      musicDebugLog.logTransport(
        mode === 'cursor' ? 'play-cursor' : mode === 'music' ? 'play-music' : 'play-document',
        `char=${charIndex}`,
        startBeat,
        bpmRef.current,
      );
      void scheduleFromBeat(startBeat);
    },
    [scheduleFromBeat],
  );

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    playGenRef.current += 1;
    clearRaf();
    clearBpmDebounce();
    clearStepRestTimer();
    synthRef.current?.silence();
    playOriginRef.current = null;
    nextEventIndexRef.current = 0;
    isPlayingRef.current = false;
    isPausedRef.current = true;
    setIsPlaying(false);
    setIsPaused(true);
    const beat = pauseBeatRef.current;
    const idx = eventIndexAtBeat(scoreRef.current.events, beat);
    if (idx >= 0) {
      setActiveEventIndex(idx);
      setActiveCharIndex(scoreRef.current.events[idx].charIndex);
      setCurrentBeat(scoreRef.current.events[idx].timeOffsetBeats);
    } else {
      setActiveCharIndex(null);
      setActiveEventIndex(null);
      setCurrentBeat(beat);
    }
    musicDebugLog.logTransport('pause', undefined, pauseBeatRef.current, bpmRef.current);
  }, [clearBpmDebounce, clearRaf, clearStepRestTimer]);

  const stop = useCallback(() => {
    setError(null);
    cancelMusicSpeech();
    stopInternal(true);
  }, [stopInternal]);

  const parkOnEvent = useCallback(
    async (ev: MusicNoteEvent, index: number, announce: boolean) => {
      const gen = ++playGenRef.current;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();

      const beat = ev.timeOffsetBeats;
      pauseBeatRef.current = beat;
      playOriginRef.current = null;
      nextEventIndexRef.current = 0;
      isPlayingRef.current = false;
      isPausedRef.current = true;
      setIsPlaying(false);
      setIsPaused(true);
      setCurrentBeat(beat);
      setActiveCharIndex(ev.charIndex);
      setActiveEventIndex(index);

      if (!userTempoOverrideRef.current) {
        const scoreBpm = bpmAtBeat(scoreRef.current, beat, bpmRef.current);
        bpmRef.current = scoreBpm;
        setBpmState(scoreBpm);
        setTempoOrigin('score');
        setTempoLabel(tempoLabelAtBeat(scoreRef.current, beat));
      }

      const labels = formatMusicEventLabels(ev);
      musicDebugLog.logTransport(
        'step',
        `${index}:${labels.display}`,
        beat,
        bpmRef.current,
      );

      const restDurSec = Math.max(0.05, ev.durationBeats * (60 / bpmRef.current));

      try {
        const synth = ensureSynth();
        await synth.ensureReady();
        if (gen !== playGenRef.current) return;
        synth.silence();
        if (ev.type === 'rest' || ev.midiPitches.length === 0) {
          synth.playRestClick(synth.now() + 0.02);
          // Feel the full rest length; Step remains usable early (new park cancels).
          stepRestTimerRef.current = window.setTimeout(() => {
            stepRestTimerRef.current = null;
            if (gen !== playGenRef.current) return;
            const endBeat = ev.timeOffsetBeats + ev.durationBeats;
            pauseBeatRef.current = endBeat;
            setCurrentBeat(endBeat);
          }, Math.round(restDurSec * 1000));
        } else {
          const start = synth.now() + 0.02;
          const durSec = Math.max(
            0.12,
            Math.min(STEP_SOUND_SEC, ev.durationBeats * (60 / bpmRef.current) * 0.85),
          );
          synth.playChord(ev.midiPitches, start, durSec);
        }
        setError(null);
      } catch (err) {
        setError(toErrorKey(err));
      }

      if (announce) {
        speakMusicHint(labels.speech);
      }
    },
    [clearBpmDebounce, clearRaf, clearStepRestTimer, ensureSynth],
  );

  const stepNext = useCallback(() => {
    const events = scoreRef.current.events;
    if (!events.length) return;

    // Leave continuous playback; park on the next event after the current one.
    if (isPlayingRef.current) {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();
      synthRef.current?.silence();
      playOriginRef.current = null;
      isPlayingRef.current = false;
      setIsPlaying(false);
    }

    const idx = nextStepEventIndex(
      events,
      pauseBeatRef.current,
      activeEventIndexRef.current,
    );
    if (idx < 0) return;
    void parkOnEvent(events[idx], idx, true);
  }, [clearBpmDebounce, clearRaf, clearStepRestTimer, parkOnEvent]);

  const stepPrev = useCallback(() => {
    const events = scoreRef.current.events;
    if (!events.length) return;

    if (isPlayingRef.current) {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();
      synthRef.current?.silence();
      playOriginRef.current = null;
      isPlayingRef.current = false;
      setIsPlaying(false);
    }

    const idx = prevStepEventIndex(
      events,
      pauseBeatRef.current,
      activeEventIndexRef.current,
    );
    if (idx < 0) return;
    void parkOnEvent(events[idx], idx, true);
  }, [clearBpmDebounce, clearRaf, clearStepRestTimer, parkOnEvent]);

  const setBPM = useCallback(
    (next: number) => {
      const clamped = clampBpm(next);
      userTempoOverrideRef.current = true;
      setTempoOrigin('user');
      setTempoLabel(null);
      setBpmState(clamped);

      if (!isPlayingRef.current) {
        bpmRef.current = clamped;
        musicDebugLog.logTransport('bpm', `idle→${clamped}`, pauseBeatRef.current, clamped);
        return;
      }

      // Keep audio on the previous tempo until the debounced reschedule fires.
      clearBpmDebounce();
      bpmDebounceRef.current = window.setTimeout(() => {
        bpmDebounceRef.current = null;
        bpmRef.current = clamped;
        musicDebugLog.logTransport('bpm', `live→${clamped}`, pauseBeatRef.current, clamped);
        if (isPlayingRef.current) {
          void scheduleFromBeat(pauseBeatRef.current);
        }
      }, BPM_RESCHEDULE_MS);
    },
    [clearBpmDebounce, scheduleFromBeat],
  );

  // Stop playback when the BRF source changes (new parse / mode toggle).
  // Re-apply score tempo unless the user overrides again on the new document.
  useEffect(() => {
    playGenRef.current += 1;
    clearRaf();
    clearBpmDebounce();
    clearStepRestTimer();
    synthRef.current?.silence();
    playOriginRef.current = null;
    nextEventIndexRef.current = 0;
    pauseBeatRef.current = 0;
    lastUiUpdateMsRef.current = 0;
    lastTempoChangeIdxRef.current = -1;
    isPlayingRef.current = false;
    isPausedRef.current = false;
    userTempoOverrideRef.current = false;
    musicDebugLog.logTransport('score-reset');
    // Intentional reset of playback UI when the score text changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- media engine must resync React state with a new BRF source
    setIsPlaying(false);
    setIsPaused(false);
    setActiveCharIndex(null);
    setActiveEventIndex(null);
    setCurrentBeat(0);
    setError(null);
    applyScoreTempo(score, 0);
  }, [brfString, score, clearBpmDebounce, clearRaf, clearStepRestTimer, applyScoreTempo]);

  useEffect(() => {
    return () => {
      playGenRef.current += 1;
      clearRaf();
      clearBpmDebounce();
      clearStepRestTimer();
      cancelMusicSpeech();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, [clearBpmDebounce, clearRaf, clearStepRestTimer]);

  const playbackState: PlaybackState = {
    isPlaying,
    isPaused,
    currentBeat,
    activeCharIndex,
    activeEventIndex,
    bpm,
    tempoOrigin,
    tempoLabel,
    error,
  };

  useEffect(() => {
    musicDebugLog.setPlayback({
      isPlaying,
      isPaused,
      currentBeat,
      activeCharIndex,
      activeEventIndex,
      bpm,
      tempoOrigin,
      tempoLabel,
      error,
    });
  }, [
    isPlaying,
    isPaused,
    currentBeat,
    activeCharIndex,
    activeEventIndex,
    bpm,
    tempoOrigin,
    tempoLabel,
    error,
  ]);

  return {
    playbackState,
    score,
    musicStartCharIndex,
    play,
    pause,
    stop,
    setBPM,
    stepNext,
    stepPrev,
  };
}

export { DEFAULT_BPM, MIN_BPM, MAX_BPM };
