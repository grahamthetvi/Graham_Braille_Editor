/**
 * Music BRF structural auditor (local heuristic linter) + AI review payload.
 *
 * Complements the playback parser: `parseBrailleMusic` prefers audible output and
 * silently skips unknowns / nearest-octave leaps. This module surfaces those
 * soft failures as reviewable issues for the "Audit BRF with AI" UI.
 *
 * Graham does NOT translate sheet music → braille; it audits existing BRF.
 */

import type { MusicNoteEvent, MusicScoreAST } from '../types/musicBraille';
import { unicodeBrailleToAscii } from './braille';
import {
  beatsCapacityFromTimeSig,
  parseBrailleMusic,
} from './musicBraille';
import {
  hasPianoHandSigns,
  segmentPianoSystems,
} from './musicBraillePiano';

/** BANA: octave mark required when the interval exceeds a perfect fourth (5 semitones). */
export const OCTAVE_LEAP_SEMITONES = 5;

export const MUSIC_BRAILLE_AUDIT_SYSTEM_PROMPT = `Role: BANA / IPA Music Braille Auditor & Linter.
Task: Analyze the attached BRF music file formatted in parallel bar-over-bar layout.

Instructions:
1. Math Check: Verify every measure against the stated or contextually implied time signature. Flag any measures missing beats or rests.
2. Octave Rule Check: Check all pitch leaps of a 4th or larger across bar lines and scalar runs to ensure octave marks are not omitted.
3. Corruption/Artifact Stripping: Detect and flag any garbled ASCII strings or invalid cell sequences (e.g. unexpected non-music ASCII characters).
4. Hand Sign Alignment: Ensure Right Hand (>/l or .>) and Left Hand (>#l or _>) markers align in bar-over-bar parallel blocks.

Output Format:
- Bulleted Summary of Critical Errors (Measure #, Issue Type, Description).
- Corrected BRF Text Block.
`;

export type AuditIssueType =
  | 'measure_imbalance'
  | 'missing_octave'
  | 'corruption'
  | 'hand_alignment'
  | 'accidental_scope'
  | 'info';

export type AuditSeverity = 'critical' | 'warning' | 'info';

export interface AuditIssue {
  id: string;
  /** 1-based measure number when known; null for file-level issues. */
  measure: number | null;
  issueType: AuditIssueType;
  description: string;
  severity: AuditSeverity;
  charIndex?: number;
  /** Optional local auto-fix hint (not always applied). */
  suggestion?: string;
}

export interface MeasureBeatUsage {
  measure: number;
  usedBeats: number;
  capacityBeats: number;
  shortfallBeats: number;
  eventCount: number;
}

export interface MusicBrailleAuditResult {
  originalBrf: string;
  asciiBrf: string;
  score: MusicScoreAST;
  issues: AuditIssue[];
  measureUsage: MeasureBeatUsage[];
  /** Best-effort corrected BRF from local heuristics; null when unchanged. */
  correctedBrf: string | null;
  /** Full payload for external AI review (system prompt + BRF). */
  aiPayload: string;
  criticalCount: number;
  warningCount: number;
}

const OCTAVE_CHARS = new Set('@^_".;,'.split(''));
const NOTE_REST_CELLS = new Set('defghij?:$]\\[|wnopqrstyz&=(!)xuvm'.split(''));
const MUSIC_UTILITY = new Set(
  ("@^_\";,<%*/+#903-cClL#'<>." + '0123456789abcdefghijABCDEFGHIJ').split(''),
);

/** Build the one-click AI review payload for the active BRF buffer. */
export function buildMusicBrailleAuditPayload(brf: string): string {
  const body = brf.replace(/\s+$/u, '');
  return `${MUSIC_BRAILLE_AUDIT_SYSTEM_PROMPT}

--- BEGIN BRF ---
${body}
--- END BRF ---
`;
}

/**
 * Compute per-measure beat usage from a parsed score.
 * For in-accord / piano measures, uses the max voice span (RH ‖ LH).
 */
export function computeMeasureBeatUsage(score: MusicScoreAST): MeasureBeatUsage[] {
  const capacity =
    score.parseInfo?.capacityBeats ??
    beatsCapacityFromTimeSig(score.timeSignature);

  const byMeasure = new Map<number, MusicNoteEvent[]>();
  for (const e of score.events) {
    if (!byMeasure.has(e.measure)) byMeasure.set(e.measure, []);
    byMeasure.get(e.measure)!.push(e);
  }

  return [...byMeasure.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([measure, events]) => {
      const usedBeats = maxVoiceSpanBeats(events);
      return {
        measure,
        usedBeats,
        capacityBeats: capacity,
        shortfallBeats: capacity - usedBeats,
        eventCount: events.length,
      };
    });
}

/** Max contiguous span across overlapping in-accord voices in one measure. */
function maxVoiceSpanBeats(events: MusicNoteEvent[]): number {
  if (events.length === 0) return 0;
  const base = Math.min(...events.map((e) => e.timeOffsetBeats));
  const voices: MusicNoteEvent[][] = [[]];
  let cursor = base;
  for (const e of events) {
    if (
      voices[voices.length - 1].length > 0 &&
      e.timeOffsetBeats <= base + 1e-9 &&
      cursor > base + 1e-9
    ) {
      voices.push([]);
      cursor = base;
    }
    voices[voices.length - 1].push(e);
    cursor = Math.max(cursor, e.timeOffsetBeats + e.durationBeats);
  }
  let max = 0;
  for (const voice of voices) {
    if (voice.length === 0) continue;
    const vBase = Math.min(...voice.map((e) => e.timeOffsetBeats));
    const end = Math.max(
      ...voice.map((e) => e.timeOffsetBeats + e.durationBeats),
    );
    max = Math.max(max, end - vBase);
  }
  return max;
}

function issueId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/**
 * Detect perfect-fourth-or-larger leaps that lack an explicit octave cell
 * between the two note characters in the ASCII source.
 */
export function findMissingOctaveIssues(
  asciiBrf: string,
  score: MusicScoreAST,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const pitched = score.events.filter((e) => e.midiPitches.length > 0);
  let n = 0;

  for (let i = 1; i < pitched.length; i++) {
    const prev = pitched[i - 1];
    const cur = pitched[i];
    if (cur.measure !== prev.measure && cur.measure !== prev.measure + 1) {
      continue;
    }
    if (
      cur.measure === prev.measure &&
      cur.timeOffsetBeats + 1e-9 < prev.timeOffsetBeats
    ) {
      continue;
    }

    const a = prev.midiPitches[0];
    const b = cur.midiPitches[0];
    const leap = Math.abs(b - a);
    if (leap <= OCTAVE_LEAP_SEMITONES) continue;

    const from = Math.min(prev.charIndex, cur.charIndex);
    const to = Math.max(prev.charIndex, cur.charIndex);
    if (to <= from) continue;

    const between = asciiBrf.slice(from + 1, to);
    const hasOctave = [...between].some((ch) => OCTAVE_CHARS.has(ch));
    if (hasOctave) continue;

    n += 1;
    issues.push({
      id: issueId('octave', n),
      measure: cur.measure,
      issueType: 'missing_octave',
      severity: 'critical',
      charIndex: cur.charIndex,
      description: `Pitch leap of ${leap} semitones (MIDI ${a}→${b}) without an intervening octave mark. BANA requires an octave mark for intervals larger than a fourth.`,
      suggestion:
        'Insert the appropriate octave cell (e.g. . " _ ^) before the destination note.',
    });
  }
  return issues;
}

/**
 * Flag under-full measures. Eighth shortfalls (≥0.5 beats) are critical;
 * sixteenth shortfalls (~0.25) are warnings. Pickup measure 1 is info-only
 * when short.
 */
export function findMeasureImbalanceIssues(
  usage: MeasureBeatUsage[],
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let n = 0;
  for (const u of usage) {
    if (u.shortfallBeats <= 0.05) continue;
    if (u.shortfallBeats < -0.05) {
      n += 1;
      issues.push({
        id: issueId('meter', n),
        measure: u.measure,
        issueType: 'measure_imbalance',
        severity: 'warning',
        description: `Measure appears overfull by ${(-u.shortfallBeats).toFixed(2)} quarter-note beats (used ${u.usedBeats.toFixed(2)} / capacity ${u.capacityBeats.toFixed(2)}).`,
      });
      continue;
    }

    const isPickup =
      u.measure === 1 && u.usedBeats > 0 && u.usedBeats < u.capacityBeats;
    const eighthShort = u.shortfallBeats >= 0.45;
    n += 1;

    if (isPickup && !eighthShort) {
      issues.push({
        id: issueId('meter', n),
        measure: u.measure,
        issueType: 'measure_imbalance',
        severity: 'info',
        description: `Opening pickup uses ${u.usedBeats.toFixed(2)} of ${u.capacityBeats.toFixed(2)} beats (expected for anacrusis).`,
      });
      continue;
    }

    const missingEighth = Math.abs(u.shortfallBeats - 0.5) < 0.08;
    issues.push({
      id: issueId('meter', n),
      measure: u.measure,
      issueType: 'measure_imbalance',
      severity: eighthShort ? 'critical' : 'warning',
      description: missingEighth
        ? `Measure is short by one eighth rest (used ${u.usedBeats.toFixed(2)} / capacity ${u.capacityBeats.toFixed(2)}). Consider inserting \`x\`.`
        : `Measure is short by ${u.shortfallBeats.toFixed(2)} quarter-note beats (used ${u.usedBeats.toFixed(2)} / capacity ${u.capacityBeats.toFixed(2)}).`,
      suggestion: missingEighth ? 'Insert eighth rest cell `x`.' : undefined,
    });
  }
  return issues;
}

/**
 * Detect garbled ASCII runs that are unlikely to be valid music cells
 * (e.g. `5"="5!?='p` from failed automated translation).
 */
export function findCorruptionIssues(asciiBrf: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let n = 0;

  const patterns: Array<{ re: RegExp; label: string }> = [
    {
      // e.g. 5"="5 from failed automated translation
      re: /[0-9]"="[0-9]/g,
      label: 'digit-quote-equals sandwich',
    },
    {
      re: /[0-9]="[0-9]/g,
      label: 'digit-equals-quote sandwich',
    },
    {
      re: /[0-9][!"'=?]{2,}[a-zA-Z]/g,
      label: 'digit + punctuation clump',
    },
    {
      re: /[!]{2,}|[?]{2,}|[=]{2,}/g,
      label: 'repeated punctuation artifact',
    },
  ];

  for (const { re, label } of patterns) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(asciiBrf)) !== null) {
      n += 1;
      issues.push({
        id: issueId('corrupt', n),
        measure: null,
        issueType: 'corruption',
        severity: 'critical',
        charIndex: match.index,
        description: `Possible garbled ASCII artifact (${label}): \`${match[0]}\` at offset ${match.index}.`,
        suggestion: 'Strip or replace with valid music cells after specialist review.',
      });
    }
  }

  let runStart = -1;
  let run = '';
  const flush = () => {
    if (run.length >= 4) {
      n += 1;
      issues.push({
        id: issueId('corrupt', n),
        measure: null,
        issueType: 'corruption',
        severity: 'warning',
        charIndex: runStart,
        description: `Unexpected non-music character run \`${run}\` at offset ${runStart}.`,
      });
    }
    run = '';
    runStart = -1;
  };

  for (let i = 0; i < asciiBrf.length; i++) {
    const ch = asciiBrf[i];
    if (
      /\s/.test(ch) ||
      MUSIC_UTILITY.has(ch) ||
      NOTE_REST_CELLS.has(ch.toLowerCase())
    ) {
      flush();
      continue;
    }
    if (runStart < 0) runStart = i;
    run += ch;
  }
  flush();

  return issues;
}

/** Check RH/LH chunk counts in bar-over-bar piano systems. */
export function findHandAlignmentIssues(asciiBrf: string): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (!hasPianoHandSigns(asciiBrf)) {
    return [
      {
        id: 'hand-0',
        measure: null,
        issueType: 'hand_alignment',
        severity: 'info',
        description:
          'No piano hand signs detected (>/l, >#l, .>, _>). Sequential single-staff parsing will be used.',
      },
    ];
  }

  const systems = segmentPianoSystems(asciiBrf);
  let n = 0;
  systems.forEach((sys, sysIdx) => {
    if (sys.rh.length !== sys.lh.length) {
      n += 1;
      issues.push({
        id: issueId('hand', n),
        measure: null,
        issueType: 'hand_alignment',
        severity: 'critical',
        description: `Piano system ${sysIdx + 1}: RH has ${sys.rh.length} measure chunk(s) but LH has ${sys.lh.length}. Bar-over-bar alignment may be skewed.`,
        suggestion:
          'Ensure each parallel block has matching Right Hand (>/l or .>) and Left Hand (>#l or _>) measure chunks.',
      });
    }
  });

  if (n === 0) {
    issues.push({
      id: 'hand-ok',
      measure: null,
      issueType: 'hand_alignment',
      severity: 'info',
      description: `Detected ${systems.length} piano system(s) with matching RH/LH chunk counts.`,
    });
  }
  return issues;
}

/**
 * Flag oscillating same-pitch patterns that rely on measure-persistent
 * accidentals without a printed natural/second accidental (review only).
 */
export function findAccidentalScopeIssues(
  asciiBrf: string,
  score: MusicScoreAST,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let n = 0;

  const re = /([<%*])([a-zA-Z&=(!)?:$\]\\|[yznopqrst])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(asciiBrf)) !== null) {
    const acc = match[1];
    const cell = match[2];
    const after = asciiBrf.slice(
      match.index + match[0].length,
      match.index + match[0].length + 6,
    );
    const escaped = cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const samePitch = after.match(new RegExp(`[^<%*]*${escaped}`));
    if (!samePitch) continue;

    const idx = match.index;
    const nearest = score.events.reduce<MusicNoteEvent | null>((best, e) => {
      if (best == null) return e;
      return Math.abs(e.charIndex - idx) < Math.abs(best.charIndex - idx)
        ? e
        : best;
    }, null);

    n += 1;
    const accName = acc === '%' ? 'sharp' : acc === '<' ? 'flat' : 'natural';
    issues.push({
      id: issueId('acc', n),
      measure: nearest?.measure ?? null,
      issueType: 'accidental_scope',
      severity: 'info',
      charIndex: idx,
      description: `Oscillating pattern uses a single ${accName} (\`${match[0]}\`) then repeats pitch cell \`${cell}\`. Within a measure this is valid BANA persistence — confirm no missing natural was intended.`,
    });
  }
  return issues;
}

/**
 * Best-effort local corrections:
 * - Strip known garbled digit-equals-quote sandwiches
 * - Insert missing eighth rest `x` before `<2` endings in common LH shortfalls
 */
export function applyLocalBrfFixes(
  asciiBrf: string,
  issues: AuditIssue[],
): string | null {
  let next = asciiBrf;
  let changed = false;

  for (const issue of issues) {
    if (issue.issueType === 'corruption' && issue.charIndex != null) {
      const stripped = next
        .replace(/[0-9]"="[0-9]/g, '')
        .replace(/[0-9]="[0-9]/g, '');
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }

  const withRest = next.replace(/(#1'[^<\n]*m)<2/g, '$1x<2');
  if (withRest !== next) {
    next = withRest;
    changed = true;
  }

  const needsX = issues.some(
    (i) =>
      i.issueType === 'measure_imbalance' && i.suggestion?.includes('`x`'),
  );
  if (needsX) {
    const generic = next.replace(/([!&)(=\-yz])m<2/g, '$1mx<2');
    if (generic !== next) {
      next = generic;
      changed = true;
    }
  }

  return changed ? next : null;
}

/** Parse AI (or human) response and extract a corrected BRF block when present. */
export function extractCorrectedBrfFromAiResponse(
  response: string,
): string | null {
  const fenced =
    response.match(
      /---\s*BEGIN(?:\s+CORRECTED)?\s+BRF\s*---\s*([\s\S]*?)---\s*END(?:\s+CORRECTED)?\s+BRF\s*---/i,
    ) || response.match(/```(?:brf|braille|text)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const body = fenced[1].trim();
    if (body.length > 0) return body;
  }

  const lines = response.split(/\r?\n/);
  const musicLines = lines.filter(
    (ln) =>
      /[>#][lL]|[._]>/.test(ln) ||
      (/[@^_".;,]/.test(ln) &&
        /[defghijyz&=(!)nopqrstxuvm]/.test(ln.toLowerCase())),
  );
  if (musicLines.length >= 2 && musicLines.length >= lines.length * 0.4) {
    return musicLines.join('\n').trim();
  }
  return null;
}

/** Simple line-oriented diff for the audit modal. */
export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
  lineNumberOriginal?: number;
  lineNumberCorrected?: number;
}

export function diffBrfLines(original: string, corrected: string): DiffLine[] {
  const a = original.replace(/\r\n/g, '\n').split('\n');
  const b = corrected.replace(/\r\n/g, '\n').split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let lineA = 1;
  let lineB = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({
        type: 'same',
        text: a[i],
        lineNumberOriginal: lineA,
        lineNumberCorrected: lineB,
      });
      i += 1;
      j += 1;
      lineA += 1;
      lineB += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i], lineNumberOriginal: lineA });
      i += 1;
      lineA += 1;
    } else {
      out.push({ type: 'add', text: b[j], lineNumberCorrected: lineB });
      j += 1;
      lineB += 1;
    }
  }
  while (i < n) {
    out.push({ type: 'del', text: a[i], lineNumberOriginal: lineA });
    i += 1;
    lineA += 1;
  }
  while (j < m) {
    out.push({ type: 'add', text: b[j], lineNumberCorrected: lineB });
    j += 1;
    lineB += 1;
  }
  return out;
}

/**
 * Run the full local Music BRF audit and build the AI review payload.
 */
export function auditMusicBraille(brf: string): MusicBrailleAuditResult {
  const originalBrf = brf;
  const asciiBrf = unicodeBrailleToAscii(brf);
  const score = parseBrailleMusic(asciiBrf);
  const measureUsage = computeMeasureBeatUsage(score);

  const issues: AuditIssue[] = [
    ...findMeasureImbalanceIssues(measureUsage),
    ...findMissingOctaveIssues(asciiBrf, score),
    ...findCorruptionIssues(asciiBrf),
    ...findHandAlignmentIssues(asciiBrf),
    ...findAccidentalScopeIssues(asciiBrf, score),
  ];

  const severityRank: Record<AuditSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  issues.sort((a, b) => {
    const s = severityRank[a.severity] - severityRank[b.severity];
    if (s !== 0) return s;
    return (a.measure ?? 9999) - (b.measure ?? 9999);
  });

  const correctedBrf = applyLocalBrfFixes(asciiBrf, issues);
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    originalBrf,
    asciiBrf,
    score,
    issues,
    measureUsage,
    correctedBrf,
    aiPayload: buildMusicBrailleAuditPayload(asciiBrf),
    criticalCount,
    warningCount,
  };
}
