import { describe, expect, it } from 'vitest';
import type { MusicNoteEvent } from '../types/musicBraille';
import {
  durationBeatsToTerm,
  formatMusicEventLabels,
  midiToLabel,
  midiToSpeech,
  nextStepEventIndex,
  prevStepEventIndex,
  eventIndexAtBeat,
} from './musicNoteLabel';

function note(
  partial: Partial<MusicNoteEvent> & Pick<MusicNoteEvent, 'id' | 'midiPitches' | 'durationBeats'>,
): MusicNoteEvent {
  return {
    charIndex: 0,
    measure: 1,
    timeOffsetBeats: 0,
    type: partial.midiPitches.length > 1 ? 'chord' : partial.midiPitches.length === 0 ? 'rest' : 'note',
    ...partial,
  };
}

describe('midiToLabel / midiToSpeech', () => {
  it('labels midi pitches', () => {
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToLabel(69)).toBe('A4');
    expect(midiToLabel(76)).toBe('E5');
  });

  it('speaks sharps and octaves', () => {
    expect(midiToSpeech(61)).toBe('C sharp 4');
    expect(midiToSpeech(60)).toBe('C 4');
  });
});

describe('durationBeatsToTerm', () => {
  it('maps common lengths', () => {
    expect(durationBeatsToTerm(1).label).toBe('quarter');
    expect(durationBeatsToTerm(0.5).label).toBe('eighth');
    expect(durationBeatsToTerm(2).label).toBe('half');
    expect(durationBeatsToTerm(4).label).toBe('whole');
    expect(durationBeatsToTerm(1.5).label).toBe('dotted quarter');
    expect(durationBeatsToTerm(1 / 3).label).toBe('triplet eighth');
  });
});

describe('formatMusicEventLabels', () => {
  it('labels a quarter note', () => {
    const labels = formatMusicEventLabels(
      note({ id: '1', midiPitches: [60], durationBeats: 1 }),
    );
    expect(labels.display).toBe('C4, quarter');
    expect(labels.speech).toBe('C 4, quarter note');
  });

  it('labels a rest', () => {
    const labels = formatMusicEventLabels(
      note({ id: '2', midiPitches: [], durationBeats: 0.5, type: 'rest' }),
    );
    expect(labels.display).toBe('eighth rest');
    expect(labels.speech).toBe('eighth rest');
  });

  it('labels a chord', () => {
    const labels = formatMusicEventLabels(
      note({ id: '3', midiPitches: [60, 64, 67], durationBeats: 2, type: 'chord' }),
    );
    expect(labels.display).toBe('C4+E4+G4, half chord');
    expect(labels.speech).toContain('chord');
    expect(labels.speech).toContain('half');
  });

  it('marks ties', () => {
    const labels = formatMusicEventLabels(
      note({ id: '4', midiPitches: [62], durationBeats: 1, isTied: true }),
    );
    expect(labels.display).toContain('tied');
    expect(labels.speech).toContain('tied');
  });
});

describe('step index helpers', () => {
  const events: MusicNoteEvent[] = [
    note({ id: 'a', midiPitches: [60], durationBeats: 1, timeOffsetBeats: 0, charIndex: 0 }),
    note({ id: 'b', midiPitches: [62], durationBeats: 1, timeOffsetBeats: 1, charIndex: 1 }),
    note({ id: 'c', midiPitches: [64], durationBeats: 1, timeOffsetBeats: 2, charIndex: 2 }),
  ];

  it('finds event at beat', () => {
    expect(eventIndexAtBeat(events, 0.5)).toBe(0);
    expect(eventIndexAtBeat(events, 1.2)).toBe(1);
    expect(eventIndexAtBeat(events, 3)).toBe(-1);
  });

  it('steps next from idle start', () => {
    expect(nextStepEventIndex(events, 0, null)).toBe(0);
    expect(nextStepEventIndex(events, 0, 0)).toBe(1);
    expect(nextStepEventIndex(events, 1, 1)).toBe(2);
    expect(nextStepEventIndex(events, 2, 2)).toBe(-1);
  });

  it('steps prev', () => {
    expect(prevStepEventIndex(events, 2, 2)).toBe(1);
    expect(prevStepEventIndex(events, 0, 0)).toBe(-1);
    expect(prevStepEventIndex(events, 1.5, null)).toBe(0);
  });
});
