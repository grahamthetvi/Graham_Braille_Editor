/**
 * Unit tests for missing-tempo notice visibility helper.
 */

import { describe, expect, it } from 'vitest';
import { shouldShowMissingTempoNotice } from './MusicPlayerControls';
import en from '../../i18n/locales/en.json';

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

describe('missing-tempo i18n', () => {
  it('includes fromDefault and missingNotice copy', () => {
    const tempo = en.app.musicPlayer.tempo;
    expect(tempo.fromDefault).toContain('not found in score');
    expect(tempo.missingNotice.title.length).toBeGreaterThan(0);
    expect(tempo.missingNotice.body).toContain('{{bpm}}');
    expect(tempo.missingNotice.dismiss.length).toBeGreaterThan(0);
  });
});
