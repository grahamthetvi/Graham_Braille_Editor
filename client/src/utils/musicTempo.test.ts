/**
 * Unit tests for Music Braille tempo detection (metronome, words, word-signs).
 */

import { describe, expect, it } from 'vitest';
import { parseBrailleMusic } from './musicBraille';
import {
  DEFAULT_SCORE_BPM,
  TEMPO_SCALE_RIT,
  detectScoreTempo,
  fingerprintBrfDocument,
  interpretWordSignTempo,
  matchTempoWord,
  parseBrailleDigits,
  resolveTempoMeta,
  scanTempoMarks,
  scoreTempoOriginAtBeat,
  tryParseMetronomeAt,
} from './musicTempo';

describe('parseBrailleDigits', () => {
  it('parses #abj as 120', () => {
    expect(parseBrailleDigits('#abj', 0)).toEqual({ value: 120, nextIndex: 4 });
  });

  it('parses #fj as 60', () => {
    expect(parseBrailleDigits('#fj', 0)).toEqual({ value: 60, nextIndex: 3 });
  });
});

describe('tryParseMetronomeAt', () => {
  it('parses quarter = 120 as ?7#abj', () => {
    const m = tryParseMetronomeAt('?7#abj', 0);
    expect(m).not.toBeNull();
    expect(m!.bpm).toBe(120);
    expect(m!.kind).toBe('metronome');
  });

  it('parses eighth = 120 into quarter BPM 60', () => {
    const m = tryParseMetronomeAt('d7#abj', 0);
    expect(m!.bpm).toBe(60);
  });

  it('parses number-first form #abj7?', () => {
    const m = tryParseMetronomeAt('#abj7?', 0);
    expect(m!.bpm).toBe(120);
  });

  it('parses music-paren form', () => {
    const m = tryParseMetronomeAt(",'?7#abj,'", 0);
    expect(m!.bpm).toBe(120);
    expect(m!.length).toBeGreaterThan(6);
  });

  it('does not treat a plain quarter C as a metronome', () => {
    expect(tryParseMetronomeAt('?"?:$', 0)).toBeNull();
  });

  it('rejects zero or out-of-range metronome numbers instead of clamping to max/default', () => {
    expect(tryParseMetronomeAt('#j7y', 0)).toBeNull();
    expect(tryParseMetronomeAt('#a7y', 0)).toBeNull();
    expect(tryParseMetronomeAt('?7#bij', 0)).toBeNull(); // 210 > 208
    expect(tryParseMetronomeAt('y7#fj', 0)?.bpm).toBe(240); // whole=60 → ♩=240
  });
});

describe('matchTempoWord / word signs', () => {
  it('maps Allegro and compounds', () => {
    expect(matchTempoWord('Allegro')?.bpm).toBe(120);
    expect(matchTempoWord('allegro moderato')?.bpm).toBe(116);
    expect(matchTempoWord('Adagio')?.bpm).toBe(70);
  });

  it('interprets poco moto, rit, accel, a tempo', () => {
    expect(interpretWordSignTempo('poco moto')?.bpm).toBe(108);
    expect(interpretWordSignTempo('rit.')?.bpmScale).toBe(TEMPO_SCALE_RIT);
    expect(interpretWordSignTempo('accel')?.kind).toBe('wordSignRelative');
    expect(interpretWordSignTempo('a tempo')?.kind).toBe('aTempo');
    expect(interpretWordSignTempo('pp')).toBeNull();
  });
});

describe('scanTempoMarks / resolveTempoMeta', () => {
  it('prefers metronome over tempo word in the heading', () => {
    const marks = scanTempoMarks(',ALLEGRO4 ?7#abj #d4\n"?:$]');
    const meta = resolveTempoMeta(marks, () => 0);
    expect(meta.detectedTempo.source).toBe('metronome');
    expect(meta.detectedTempo.bpm).toBe(120);
  });

  it('uses Allegro when no metronome is present', () => {
    const marks = scanTempoMarks(',ALLEGRO4 #d4\n"?:$]');
    const meta = resolveTempoMeta(marks, () => 0);
    expect(meta.detectedTempo.source).toBe('tempoWord');
    expect(meta.detectedTempo.bpm).toBe(120);
    expect(meta.detectedTempo.label.toLowerCase()).toContain('allegro');
  });

  it('builds rit then a tempo timeline', () => {
    const marks = scanTempoMarks('>allegro\'"?:$] >rit.\'"\\ >a tempo\'"[');
    const meta = resolveTempoMeta(marks, (ci) => (ci < 20 ? 0 : ci < 40 ? 4 : 8));
    expect(meta.detectedTempo.bpm).toBe(120);
    expect(meta.tempoChanges.some((c) => c.label === 'rit.')).toBe(true);
    const rit = meta.tempoChanges.find((c) => c.label === 'rit.');
    expect(rit!.bpm).toBe(Math.round(120 * TEMPO_SCALE_RIT));
    const aTempo = meta.tempoChanges.find((c) => c.label === 'a tempo');
    expect(aTempo!.bpm).toBe(120);
  });

  it('defaults when nothing is found', () => {
    const meta = detectScoreTempo('"?:$]', () => 0);
    expect(meta.detectedTempo.bpm).toBe(DEFAULT_SCORE_BPM);
    expect(meta.detectedTempo.source).toBe('default');
  });
});

describe('parseBrailleMusic tempo integration', () => {
  it('attaches metronome detectedTempo and does not sound the C-shape', () => {
    const score = parseBrailleMusic('?7#abj "?:$]');
    expect(score.detectedTempo?.source).toBe('metronome');
    expect(score.detectedTempo?.bpm).toBe(120);
    // Four melody notes — metronome C must not add a fifth pitched event
    expect(score.events.filter((e) => e.midiPitches.length > 0)).toHaveLength(4);
  });

  it('detects >poco moto in a slash-L piano excerpt', () => {
    const brf = `a >/l#c8 >pp>poco moto'.&%Z &%Z&")*ZY
  >#l#c8 >poco moto'x       m`;
    const score = parseBrailleMusic(brf);
    expect(score.detectedTempo?.bpm).toBe(108);
    expect(
      score.detectedTempo?.source === 'wordSign' ||
        score.detectedTempo?.source === 'tempoWord',
    ).toBe(true);
  });

  it('still parses rests', () => {
    const score = parseBrailleMusic('v');
    expect(score.events[0].type).toBe('rest');
    expect(score.events[0].durationBeats).toBe(1);
  });
});

describe('scoreTempoOriginAtBeat / fingerprint', () => {
  it('returns default when no tempo was detected', () => {
    const score = parseBrailleMusic('"?:$]');
    expect(score.detectedTempo?.source).toBe('default');
    expect(scoreTempoOriginAtBeat(score, 0)).toBe('default');
  });

  it('returns score for metronome and word-sign scores', () => {
    expect(scoreTempoOriginAtBeat(parseBrailleMusic('?7#abj "?:$]'), 0)).toBe('score');
    const piano = parseBrailleMusic(`a >/l#c8 >pp>poco moto'.&%Z &%Z&")*ZY
  >#l#c8 >poco moto'x       m`);
    expect(scoreTempoOriginAtBeat(piano, 0)).toBe('score');
  });

  it('returns score once a mid-score tempoChange is reached', () => {
    const partial = {
      detectedTempo: {
        bpm: 120,
        source: 'default' as const,
        label: 'default',
      },
      tempoChanges: [{ timeOffsetBeats: 4, bpm: 102, label: 'rit.' }],
    };
    expect(scoreTempoOriginAtBeat(partial, 4)).toBe('score');
    expect(scoreTempoOriginAtBeat(partial, 0)).toBe('default');
  });

  it('fingerprints documents stably', () => {
    expect(fingerprintBrfDocument('abc')).toBe(fingerprintBrfDocument('abc'));
    expect(fingerprintBrfDocument('abc')).not.toBe(fingerprintBrfDocument('abd'));
  });
});
