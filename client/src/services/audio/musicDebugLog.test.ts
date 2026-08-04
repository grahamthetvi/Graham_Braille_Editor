import { describe, expect, it } from 'vitest';
import {
  formatCompactSnapshotJson,
  summarizeScore,
  toCompactSnapshot,
  midiToLabel,
  type MusicDebugSnapshot,
} from './musicDebugLog';
import { parseBrailleMusic } from '../../utils/musicBraille';

describe('musicDebugLog helpers', () => {
  it('summarizes a simple score', () => {
    const score = parseBrailleMusic('"?:$]');
    const summary = summarizeScore(score, 0);
    expect(summary.noteCount).toBe(4);
    expect(summary.eventCount).toBe(4);
    expect(summary.tinyNoteCount).toBe(0);
    expect(summary.firstNotes[0].midi).toEqual([60]);
    expect(summary.firstNotes[0].type).toBe('n');
  });

  it('labels midi pitches', () => {
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToLabel(69)).toBe('A4');
    expect(midiToLabel(76)).toBe('E5');
  });

  it('exports a compact v2 snapshot much smaller than pretty v1', () => {
    const score = parseBrailleMusic('"?:$]\\[wnopqrst');
    const summary = summarizeScore(score, 12);
    const schedule = Array.from({ length: 90 }, (_, i) => ({
      wallMs: 1000 + i * 10,
      audioTime: 100 + i * 0.125,
      beat: i * 0.25,
      durationSec: 0.115,
      midiPitches: [60 + (i % 12)],
      charIndex: 100 + i,
      measure: 1 + Math.floor(i / 6),
      eventId: `e${i}`,
      delayFromOriginSec: i * 0.125,
    }));
    const clock = Array.from({ length: 50 }, (_, i) => ({
      wallMs: 1000 + i * 250,
      audioTime: 100 + i * 0.25,
      beat: i * 0.5,
      activeCharIndex: 100 + i,
      nextEventIndex: i + 5,
      scheduledAhead: i % 3,
    }));

    const full: MusicDebugSnapshot = {
      version: 1,
      capturedAt: '2026-08-01T00:00:00.000Z',
      enabled: true,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) agent-test-user-agent-string',
      score: summary,
      playback: {
        isPlaying: false,
        isPaused: false,
        currentBeat: 0,
        activeCharIndex: null,
        activeEventIndex: null,
        bpm: 120,
        tempoOrigin: 'default',
        tempoLabel: null,
        error: null,
      },
      transport: [
        { wallMs: 1, kind: 'play-music', detail: 'char=12', beat: 0, bpm: 120 },
        { wallMs: 2, kind: 'stop', detail: 'reset', beat: 0 },
      ],
      schedule,
      clock,
      anomalies: [],
    };

    const prettyV1 = JSON.stringify(full, null, 2);
    const compact = toCompactSnapshot(full);
    const compactJson = formatCompactSnapshotJson(full);

    expect(compact.v).toBe(2);
    expect(compact.schedCols).toEqual(['t', 'beat', 'dur', 'midi', 'ch', 'm']);
    expect(compact.schedN).toBe(90);
    // Head 48 + tail 24
    expect(compact.sched).toHaveLength(72);
    expect(compact.sched[0][0]).toBe(0);
    expect(compact.sched[0][3]).toEqual([60]);
    expect(compact.clockN).toBe(50);
    expect(compact.clockHead.length).toBe(6);
    expect(compact.clockTail.length).toBe(6);
    expect(compact.pb?.bpm).toBe(120);
    expect(compactJson.includes('\n')).toBe(false);
    expect(compactJson.length).toBeLessThan(prettyV1.length * 0.35);
  });
});
