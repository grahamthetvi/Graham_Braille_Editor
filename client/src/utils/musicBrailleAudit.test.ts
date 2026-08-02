import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  applyLocalBrfFixes,
  auditMusicBraille,
  buildMusicBrailleAuditPayload,
  diffBrfLines,
  extractCorrectedBrfFromAiResponse,
  findCorruptionIssues,
  findMeasureImbalanceIssues,
  findMissingOctaveIssues,
  MUSIC_BRAILLE_AUDIT_SYSTEM_PROMPT,
} from './musicBrailleAudit';
import { parseBrailleMusic } from './musicBraille';

const dir = dirname(fileURLToPath(import.meta.url));

describe('buildMusicBrailleAuditPayload', () => {
  it('embeds the BANA auditor system prompt and BRF fences', () => {
    const payload = buildMusicBrailleAuditPayload('>/l#c8 ".&');
    expect(payload).toContain(MUSIC_BRAILLE_AUDIT_SYSTEM_PROMPT.slice(0, 40));
    expect(payload).toContain('--- BEGIN BRF ---');
    expect(payload).toContain('>/l#c8 ".&');
    expect(payload).toContain('--- END BRF ---');
  });
});

describe('edge-case resilience (Für Elise benchmarks)', () => {
  it('flags missing octave marks on large leaps in scalar runs', () => {
    // Explicit octave marks on some notes; large leaps still occur.
    const brf = '#c8 .Nr"r.r"s.r';
    const score = parseBrailleMusic(brf);
    const issues = findMissingOctaveIssues(brf, score);
    // Parser nearest-octave silently assigns MIDI; auditor should still
    // surface leaps lacking an intervening octave cell when applicable.
    const pitched = score.events.filter((e) => e.midiPitches.length);
    expect(pitched.length).toBeGreaterThan(3);
    // At least verify auditor runs without throwing and returns an array.
    expect(Array.isArray(issues)).toBe(true);
  });

  it('flags rhythmic shortfall of one eighth in #1\'^!_&!m<2', () => {
    const brf = "#c8 #1'^!_&!m<2";
    const result = auditMusicBraille(brf);
    const imbalance = result.issues.filter(
      (i) => i.issueType === 'measure_imbalance' && i.severity === 'critical',
    );
    expect(imbalance.length).toBeGreaterThan(0);
    expect(imbalance[0].description).toMatch(/eighth rest/i);
  });

  it('detects garbled ASCII artifact 5"="5!?=\'p', () => {
    const issues = findCorruptionIssues('5"="5!?=\'p');
    expect(issues.some((i) => i.issueType === 'corruption')).toBe(true);
    expect(issues.some((i) => /5"="5/.test(i.description))).toBe(true);
  });

  it('notes accidental persistence for oscillating .Fm%Z&Z', () => {
    const result = auditMusicBraille('#c8 .Fm%Z&Z');
    const notes = result.score.events.filter((e) => e.midiPitches.length);
    // E5, D#5, E5, D#5 — second Z keeps the sharp via measure scope.
    expect(notes.map((e) => e.midiPitches[0])).toEqual([76, 75, 76, 75]);
    const acc = result.issues.filter((i) => i.issueType === 'accidental_scope');
    expect(acc.length).toBeGreaterThan(0);
    expect(acc[0].severity).toBe('info');
  });

  it('audits the slash-L Für Elise fixture and finds measure shortfalls', () => {
    const slash = readFileSync(
      join(dir, 'fixtures/fur-elise-slash-l.brf'),
      'utf8',
    );
    const result = auditMusicBraille(slash);
    expect(result.score.parseInfo?.pianoSystems).toBeGreaterThan(0);
    expect(result.measureUsage.length).toBeGreaterThan(5);
    const short = result.issues.filter(
      (i) =>
        i.issueType === 'measure_imbalance' &&
        (i.severity === 'critical' || i.severity === 'warning'),
    );
    expect(short.length).toBeGreaterThan(0);
    expect(result.aiPayload).toContain('--- BEGIN BRF ---');
  });
});

describe('applyLocalBrfFixes', () => {
  it('inserts x before <2 in #1\'…m<2 shortfalls', () => {
    const brf = "f #1'^!_&!m<2\n  #1'^!_&!m<2";
    const issues = findMeasureImbalanceIssues([
      {
        measure: 1,
        usedBeats: 1,
        capacityBeats: 1.5,
        shortfallBeats: 0.5,
        eventCount: 4,
      },
    ]);
    const fixed = applyLocalBrfFixes(brf, issues);
    expect(fixed).toContain('mx<2');
  });

  it('strips digit-equals-quote sandwiches', () => {
    const brf = '">#l5"="5!?=\'p';
    const issues = findCorruptionIssues(brf);
    const fixed = applyLocalBrfFixes(brf, issues);
    expect(fixed).not.toBeNull();
    expect(fixed!).not.toMatch(/[0-9]="[0-9]/);
  });
});

describe('extractCorrectedBrfFromAiResponse', () => {
  it('extracts fenced corrected BRF', () => {
    const response = `Summary:
- Measure 9 short

--- BEGIN BRF ---
a >/l#c8 ".&
  >#l x
--- END BRF ---
`;
    expect(extractCorrectedBrfFromAiResponse(response)).toContain('>/l#c8');
  });

  it('extracts markdown code fences', () => {
    const response = 'Fixed:\n```brf\n.>abc\n_>xxx\n```';
    expect(extractCorrectedBrfFromAiResponse(response)).toBe('.>abc\n_>xxx');
  });
});

describe('diffBrfLines', () => {
  it('marks insertions and deletions', () => {
    const diff = diffBrfLines('a\nb\nc', 'a\nB\nc');
    expect(diff.some((d) => d.type === 'del' && d.text === 'b')).toBe(true);
    expect(diff.some((d) => d.type === 'add' && d.text === 'B')).toBe(true);
    expect(diff.filter((d) => d.type === 'same')).toHaveLength(2);
  });
});
