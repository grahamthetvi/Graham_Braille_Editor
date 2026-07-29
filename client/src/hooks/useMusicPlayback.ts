/**
 * useMusicPlayback — parse ASCII Music Braille BRF and schedule Web Audio notes.
 *
 * Exposes activeCharIndex so the BRF preview can highlight the sounding cell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MusicScoreAST, PlaybackState } from '../types/musicBraille';
import { parseBrailleMusic } from '../utils/musicBraille';
import { MusicSynthEngine } from '../services/audio/musicSynth';

const DEFAULT_BPM = 120;
const MIN_BPM = 40;
const MAX_BPM = 240;

export interface UseMusicPlaybackReturn {
  playbackState: PlaybackState;
  score: MusicScoreAST;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setBPM: (bpm: number) => void;
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function useMusicPlayback(brfString: string): UseMusicPlaybackReturn {
  const [bpm, setBpmState] = useState(DEFAULT_BPM);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);

  const synthRef = useRef<MusicSynthEngine | null>(null);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const pauseBeatRef = useRef(0);
  const playOriginRef = useRef<{ audioStart: number; beatStart: number } | null>(null);
  const bpmRef = useRef(bpm);
  const scoreRef = useRef<MusicScoreAST>(parseBrailleMusic(''));

  const score = useMemo(() => parseBrailleMusic(brfString || ''), [brfString]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const ensureSynth = useCallback(() => {
    if (!synthRef.current) synthRef.current = new MusicSynthEngine();
    return synthRef.current;
  }, []);

  const stopInternal = useCallback(
    (resetPosition: boolean) => {
      clearTimers();
      synthRef.current?.stopAll();
      synthRef.current = null;
      playOriginRef.current = null;
      setIsPlaying(false);
      setIsPaused(false);
      setActiveCharIndex(null);
      if (resetPosition) {
        pauseBeatRef.current = 0;
        setCurrentBeat(0);
      }
    },
    [clearTimers],
  );

  const scheduleFromBeat = useCallback(
    (fromBeat: number) => {
      clearTimers();
      const ast = scoreRef.current;
      const synth = ensureSynth();
      const secondsPerBeat = 60 / bpmRef.current;
      const audioStart = synth.now() + 0.05;
      playOriginRef.current = { audioStart, beatStart: fromBeat };

      for (const ev of ast.events) {
        const endBeat = ev.timeOffsetBeats + ev.durationBeats;
        if (endBeat <= fromBeat + 1e-9) continue;

        const startBeat = Math.max(ev.timeOffsetBeats, fromBeat);
        const delayBeats = startBeat - fromBeat;
        const remainBeats = endBeat - startBeat;
        const startTime = audioStart + delayBeats * secondsPerBeat;
        const durSec = Math.max(0.05, remainBeats * secondsPerBeat * 0.92);

        if (ev.type !== 'rest' && ev.midiPitches.length > 0) {
          // Tied continuations are merged in the parser (extended durationBeats).
          synth.playChord(ev.midiPitches, startTime, durSec);
        }

        const highlightDelayMs = Math.max(0, delayBeats * secondsPerBeat * 1000);
        const tid = window.setTimeout(() => {
          setActiveCharIndex(ev.charIndex);
          setCurrentBeat(ev.timeOffsetBeats);
        }, highlightDelayMs);
        timersRef.current.push(tid);
      }

      const remainingBeats = Math.max(0, ast.totalBeats - fromBeat);
      const endTid = window.setTimeout(() => {
        stopInternal(true);
      }, remainingBeats * secondsPerBeat * 1000 + 80);
      timersRef.current.push(endTid);

      const tick = () => {
        const origin = playOriginRef.current;
        if (!origin || !synthRef.current) return;
        const elapsed = synthRef.current.now() - origin.audioStart;
        const beat = origin.beatStart + elapsed / secondsPerBeat;
        setCurrentBeat(beat);
        pauseBeatRef.current = beat;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [clearTimers, ensureSynth, stopInternal],
  );

  const play = useCallback(() => {
    if (!scoreRef.current.events.length) return;
    const startBeat = isPaused ? pauseBeatRef.current : 0;
    if (!isPaused) {
      pauseBeatRef.current = 0;
      setCurrentBeat(0);
    }
    setIsPaused(false);
    setIsPlaying(true);
    scheduleFromBeat(startBeat);
  }, [isPaused, scheduleFromBeat]);

  const pause = useCallback(() => {
    if (!isPlaying) return;
    clearTimers();
    synthRef.current?.stopAll();
    synthRef.current = null;
    playOriginRef.current = null;
    setIsPlaying(false);
    setIsPaused(true);
    setActiveCharIndex(null);
  }, [clearTimers, isPlaying]);

  const stop = useCallback(() => {
    stopInternal(true);
  }, [stopInternal]);

  const setBPM = useCallback(
    (next: number) => {
      const clamped = clampBpm(next);
      setBpmState(clamped);
      if (isPlaying) {
        clearTimers();
        synthRef.current?.stopAll();
        synthRef.current = null;
        scheduleFromBeat(pauseBeatRef.current);
      }
    },
    [clearTimers, isPlaying, scheduleFromBeat],
  );

  // Stop playback when the BRF source changes (new parse / mode toggle).
  useEffect(() => {
    clearTimers();
    synthRef.current?.stopAll();
    synthRef.current = null;
    playOriginRef.current = null;
    pauseBeatRef.current = 0;
    // Intentional reset of playback UI when the score text changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- media engine must resync React state with a new BRF source
    setIsPlaying(false);
    setIsPaused(false);
    setActiveCharIndex(null);
    setCurrentBeat(0);
  }, [brfString, clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
      synthRef.current?.stopAll();
      synthRef.current = null;
    };
  }, [clearTimers]);

  const playbackState: PlaybackState = {
    isPlaying,
    isPaused,
    currentBeat,
    activeCharIndex,
    bpm,
  };

  return {
    playbackState,
    score,
    play,
    pause,
    stop,
    setBPM,
  };
}

export { DEFAULT_BPM, MIN_BPM, MAX_BPM };
