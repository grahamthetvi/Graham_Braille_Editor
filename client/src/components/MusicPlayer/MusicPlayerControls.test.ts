/**
 * Unit tests for missing-tempo pace picker visibility and copy.
 */

import { describe, expect, it } from 'vitest';
import { shouldShowMissingTempoNotice } from './MusicPlayerControls';
import en from '../../i18n/locales/en.json';
import {
  PRESET_MODERATE_UPBEAT_BPM,
  PRESET_SLOW_EXPRESSIVE_BPM,
} from '../../utils/musicTempo';

describe('shouldShowMissingTempoNotice', () => {
  it('shows only when default origin, has events, not dismissed', () => {
    expect(
      shouldShowMissingTempoNotice({
        eventCount: 4,
        tempoOrigin: 'default',
        dismissed: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMissingTempoNotice({
        eventCount: 4,
        tempoOrigin: 'default',
        dismissed: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMissingTempoNotice({
        eventCount: 4,
        tempoOrigin: 'score',
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMissingTempoNotice({
        eventCount: 0,
        tempoOrigin: 'default',
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMissingTempoNotice({
        disabled: true,
        eventCount: 4,
        tempoOrigin: 'default',
        dismissed: false,
      }),
    ).toBe(false);
  });
});

describe('missing-tempo pace presets', () => {
  it('uses midpoints of the slow and moderate teaching ranges', () => {
    expect(PRESET_SLOW_EXPRESSIVE_BPM).toBe(78);
    expect(PRESET_MODERATE_UPBEAT_BPM).toBe(114);
  });

  it('includes fromDefault and pace-picker copy', () => {
    const tempo = en.app.musicPlayer.tempo;
    expect(tempo.fromDefault).toContain('not found in score');
    expect(tempo.missingNotice.title.length).toBeGreaterThan(0);
    expect(tempo.missingNotice.body).toContain('{{bpm}}');
    expect(tempo.missingNotice.slowExpressive).toContain('{{bpm}}');
    expect(tempo.missingNotice.moderateUpbeat).toContain('{{bpm}}');
    expect(tempo.missingNotice.setMyself.length).toBeGreaterThan(0);
  });
});
