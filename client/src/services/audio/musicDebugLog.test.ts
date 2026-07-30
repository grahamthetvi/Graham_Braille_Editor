import { describe, expect, it } from 'vitest';
import { summarizeScore, midiToLabel } from './musicDebugLog';
import { parseBrailleMusic } from '../../utils/musicBraille';

describe('musicDebugLog helpers', () => {
  it('summarizes a simple score', () => {
    const score = parseBrailleMusic('"?:$]');
    const summary = summarizeScore(score, 0);
    expect(summary.noteCount).toBe(4);
    expect(summary.eventCount).toBe(4);
    expect(summary.tinyNoteCount).toBe(0);
    expect(summary.firstNotes[0].midi).toEqual([60]);
  });

  it('labels midi pitches', () => {
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToLabel(69)).toBe('A4');
    expect(midiToLabel(76)).toBe('E5');
  });
});
