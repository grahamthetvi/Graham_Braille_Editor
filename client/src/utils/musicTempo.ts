/**
 * Detect tempo from Music Braille: metronome marks (BANA §1.8), heading tempo
 * words, and word-sign pace phrases (`>poco moto`, rit., accel., a tempo).
 *
 * All BPM values are quarter-note beats per minute (matches the player slider).
 */

import type {
  DetectedTempo,
  MusicTempoChange,
  MusicTempoSource,
} from '../types/musicBraille';

/** Quarter-note BPM when no score tempo is found. */
export const DEFAULT_SCORE_BPM = 120;

/** Midpoints of the missing-tempo pace presets (user picks when score has no mark). */
export const PRESET_SLOW_EXPRESSIVE_BPM = 78;
export const PRESET_MODERATE_UPBEAT_BPM = 114;

/** Relative pace scales until the next absolute mark or `a tempo`. */
export const TEMPO_SCALE_RIT = 0.85;
export const TEMPO_SCALE_RALL = 0.8;
export const TEMPO_SCALE_ACCEL = 1.15;

/** Teaching-friendly center BPM for common tempo / mood words. */
export const TEMPO_WORD_BPM: Record<string, number> = {
  grave: 40,
  largo: 50,
  larghetto: 60,
  adagio: 70,
  lento: 52,
  andante: 84,
  andantino: 90,
  moderato: 108,
  allegretto: 112,
  allegro: 120,
  vivace: 140,
  presto: 168,
  prestissimo: 200,
  'allegro moderato': 116,
  'allegro maestoso': 112,
  'andante moderato': 92,
  'poco moto': 108,
  'con moto': 112,
};

/** C-only note shapes used as the note-value side of a metronome mark. */
const METRONOME_C_SHAPES: Record<string, number> = {
  // long beats for the printed note value (eighth / quarter / half / whole)
  d: 0.5,
  '?': 1,
  n: 2,
  y: 4,
};

const BRAILLE_DIGIT: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
  i: 9,
  j: 0,
};

export type RawTempoMarkKind =
  | 'metronome'
  | 'tempoWord'
  | 'wordSignAbsolute'
  | 'wordSignRelative'
  | 'aTempo';

export interface RawTempoMark {
  charIndex: number;
  kind: RawTempoMarkKind;
  label: string;
  /** Absolute quarter-note BPM when known. */
  bpm?: number;
  /** Multiply current absolute BPM (rit / accel). */
  bpmScale?: number;
  /** Span consumed in the source (for lexer skip). */
  length: number;
}

function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_SCORE_BPM;
  return Math.min(240, Math.max(40, Math.round(bpm)));
}

/**
 * Parse a braille number after `#` (a–i = 1–9, j = 0).
 * Returns null if `#` is missing or no digits follow.
 */
export function parseBrailleDigits(
  text: string,
  hashIndex: number,
): { value: number; nextIndex: number } | null {
  if (text[hashIndex] !== '#') return null;
  let i = hashIndex + 1;
  let value = 0;
  let digits = 0;
  while (i < text.length) {
    const ch = text[i].toLowerCase();
    if (!(ch in BRAILLE_DIGIT)) break;
    value = value * 10 + BRAILLE_DIGIT[ch];
    digits += 1;
    i += 1;
  }
  if (digits === 0) return null;
  return { value, nextIndex: i };
}

function quarterBpmFromMetronome(
  noteValueBeats: number,
  marksPerMinute: number,
): number {
  if (noteValueBeats <= 0 || marksPerMinute <= 0) return DEFAULT_SCORE_BPM;
  // If eighth=120, quarter BPM = 60; if half=60, quarter BPM = 120.
  return clampBpm(marksPerMinute * (noteValueBeats / 1));
}

/**
 * Try to parse a metronome indication at `i` (BANA §1.8).
 * Forms: `?7#abj`, `#abj7?`, optional music parentheses `,' … ,'`.
 */
export function tryParseMetronomeAt(
  text: string,
  i: number,
): RawTempoMark | null {
  let pos = i;
  let openParen = false;
  if (text.slice(pos, pos + 2) === ",'") {
    openParen = true;
    pos += 2;
  }

  // Optional "circa" / "ca" literary (ASCII letters; ignore case)
  const circa = text.slice(pos).match(/^(circa|ca)\s*/i);
  if (circa) pos += circa[0].length;

  const start = pos;

  // Form A: C-shape + 7 + #digits
  const cShape = text[pos];
  if (cShape && cShape in METRONOME_C_SHAPES && text[pos + 1] === '7') {
    const num = parseBrailleDigits(text, pos + 2);
    if (num) {
      let end = num.nextIndex;
      if (openParen && text.slice(end, end + 2) === ",'") end += 2;
      const noteBeats = METRONOME_C_SHAPES[cShape];
      const bpm = quarterBpmFromMetronome(noteBeats, num.value);
      return {
        charIndex: i,
        kind: 'metronome',
        label: `♩=${bpm}`,
        bpm,
        length: end - i,
      };
    }
  }

  // Form B: #digits + 7 + C-shape
  if (text[pos] === '#') {
    const num = parseBrailleDigits(text, pos);
    if (num && text[num.nextIndex] === '7') {
      const shape = text[num.nextIndex + 1];
      if (shape && shape in METRONOME_C_SHAPES) {
        let end = num.nextIndex + 2;
        if (openParen && text.slice(end, end + 2) === ",'") end += 2;
        const noteBeats = METRONOME_C_SHAPES[shape];
        const bpm = quarterBpmFromMetronome(noteBeats, num.value);
        return {
          charIndex: i,
          kind: 'metronome',
          label: `♩=${bpm}`,
          bpm,
          length: end - i,
        };
      }
    }
  }

  void start;
  return null;
}

function normalizeTempoPhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a known tempo word or compound at the start of `phrase`.
 * Prefer longer matches (e.g. "allegro moderato" over "allegro").
 */
export function matchTempoWord(
  phrase: string,
): { label: string; bpm: number } | null {
  const norm = normalizeTempoPhrase(phrase);
  if (!norm) return null;

  const keys = Object.keys(TEMPO_WORD_BPM).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm === key || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`)) {
      return { label: key.replace(/\b\w/g, (c) => c.toUpperCase()), bpm: TEMPO_WORD_BPM[key] };
    }
    // Exact token sequence contained as whole phrase
    if (norm.includes(key) && (norm.length === key.length || norm.split(' ').includes(key) || key.includes(' '))) {
      if (norm === key || norm.startsWith(key) || norm.endsWith(key)) {
        return {
          label: key.replace(/\b\w/g, (c) => c.toUpperCase()),
          bpm: TEMPO_WORD_BPM[key],
        };
      }
    }
  }
  return null;
}

/**
 * Word-sign body after `>` (until `>`, `'`, or music cell). Returns pace info.
 */
export function interpretWordSignTempo(
  body: string,
): RawTempoMark | null {
  const norm = normalizeTempoPhrase(body);
  if (!norm) return null;

  if (/^a\s*tempo$/.test(norm) || norm === 'atempo') {
    return {
      charIndex: 0,
      kind: 'aTempo',
      label: 'a tempo',
      length: 0,
    };
  }

  if (/^(rit|ritard|ritardando)\b/.test(norm) || norm === 'rit') {
    return {
      charIndex: 0,
      kind: 'wordSignRelative',
      label: 'rit.',
      bpmScale: TEMPO_SCALE_RIT,
      length: 0,
    };
  }
  if (/^(rall|rallentando)\b/.test(norm)) {
    return {
      charIndex: 0,
      kind: 'wordSignRelative',
      label: 'rall.',
      bpmScale: TEMPO_SCALE_RALL,
      length: 0,
    };
  }
  if (/^(accel|accelerando)\b/.test(norm)) {
    return {
      charIndex: 0,
      kind: 'wordSignRelative',
      label: 'accel.',
      bpmScale: TEMPO_SCALE_ACCEL,
      length: 0,
    };
  }

  const word = matchTempoWord(norm);
  if (word) {
    return {
      charIndex: 0,
      kind: 'wordSignAbsolute',
      label: word.label,
      bpm: word.bpm,
      length: 0,
    };
  }

  return null;
}

/**
 * Scan ASCII BRF for tempo marks (metronome, heading words, word-sign pace).
 */
export function scanTempoMarks(asciiBrf: string): RawTempoMark[] {
  const text = asciiBrf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const marks: RawTempoMark[] = [];
  const seen = new Set<number>();

  const add = (m: RawTempoMark) => {
    if (seen.has(m.charIndex)) return;
    seen.add(m.charIndex);
    marks.push(m);
  };

  // Metronome marks anywhere
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (
      ch === '?' ||
      ch === 'd' ||
      ch === 'n' ||
      ch === 'y' ||
      ch === '#' ||
      (ch === ',' && text[i + 1] === "'")
    ) {
      const metro = tryParseMetronomeAt(text, i);
      if (metro) {
        add(metro);
        i = i + metro.length - 1;
      }
    }
  }

  // Word-sign expressions: >…> or >…' or glued >pp (skip dynamics-only)
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '>') continue;
    const bodyStart = i + 1;
    let j = bodyStart;
    const dynOnly = text.slice(j).match(/^([PpFfSs]{1,3})(?=[.@^_"';,\s>]|$)/);
    if (dynOnly) {
      i = j + dynOnly[1].length - 1;
      continue;
    }
    while (j < text.length && text[j] !== '>' && text[j] !== "'") {
      // Stop before an obvious octave+note run without consuming it
      if (
        (text[j] === '.' || text[j] === '_' || text[j] === '"' || text[j] === '^') &&
        j > bodyStart
      ) {
        break;
      }
      j += 1;
    }
    const body = text.slice(bodyStart, j);
    const interpreted = interpretWordSignTempo(body);
    if (interpreted) {
      add({
        ...interpreted,
        charIndex: i,
        length: Math.max(1, j - i + (text[j] === '>' || text[j] === "'" ? 1 : 0)),
      });
    }
    i = Math.max(i, j - 1);
  }

  // Literary heading tempo words: capital letter runs ending with period `4`
  // ASCII examples: `,ALLEGRO4` or `ALLEGRO4` near the start / music heading.
  const literaryRe =
    /(?:^|[\n\s]),?([A-Za-z][A-Za-z\s]{1,40}?)4(?=[\s\n#]|$)/gm;
  let lit: RegExpExecArray | null;
  while ((lit = literaryRe.exec(text)) !== null) {
    const phrase = lit[1];
    const matched = matchTempoWord(phrase);
    if (!matched) continue;
    add({
      charIndex: lit.index,
      kind: 'tempoWord',
      label: matched.label,
      bpm: matched.bpm,
      length: lit[0].length,
    });
  }

  // Also match uncontracted words without requiring braille period when spaced
  // like "Allegro" in Unicode-normalized ASCII mixed titles (best-effort).
  const plainRe =
    /\b(prestissimo|allegro\s+moderato|allegro\s+maestoso|andante\s+moderato|poco\s+moto|con\s+moto|allegretto|allegro|andantino|andante|moderato|adagio|larghetto|largo|lento|grave|vivace|presto)\b/gi;
  let plain: RegExpExecArray | null;
  while ((plain = plainRe.exec(text)) !== null) {
    const matched = matchTempoWord(plain[1]);
    if (!matched) continue;
    add({
      charIndex: plain.index,
      kind: 'tempoWord',
      label: matched.label,
      bpm: matched.bpm,
      length: plain[0].length,
    });
  }

  marks.sort((a, b) => a.charIndex - b.charIndex);
  return marks;
}

export interface ResolvedTempoMeta {
  detectedTempo: DetectedTempo;
  tempoChanges: MusicTempoChange[];
}

/**
 * Resolve raw marks into an initial detected tempo and a timeline of absolute BPM changes.
 * `beatForChar` maps a source char index to a score beat (usually beatForCharIndex).
 */
/**
 * Resolve raw marks into an initial detected tempo and a timeline of absolute BPM changes.
 * Opening priority: metronome > tempo word / word-sign absolute > default 120.
 * Relative marks (rit/accel) scale the current BPM until `a tempo` or the next absolute.
 */
export function resolveTempoMeta(
  marks: RawTempoMark[],
  beatForChar: (charIndex: number) => number,
): ResolvedTempoMeta {
  type Located = RawTempoMark & { beat: number };
  const located: Located[] = marks.map((m) => ({
    ...m,
    beat: Math.max(0, beatForChar(m.charIndex)),
  }));

  const heading = located.filter((m) => m.beat <= 1e-6);
  const pickHeading = (): { bpm: number; source: MusicTempoSource; label: string } => {
    const metro = heading.find((m) => m.kind === 'metronome' && m.bpm != null);
    if (metro?.bpm != null) {
      return { bpm: metro.bpm, source: 'metronome', label: metro.label };
    }
    const word = heading.find(
      (m) =>
        (m.kind === 'tempoWord' || m.kind === 'wordSignAbsolute') && m.bpm != null,
    );
    if (word?.bpm != null) {
      return {
        bpm: word.bpm,
        source: word.kind === 'tempoWord' ? 'tempoWord' : 'wordSign',
        label: word.label,
      };
    }
    // First absolute anywhere becomes the opening tempo when heading is empty
    const firstAbs = located.find(
      (m) =>
        (m.kind === 'metronome' ||
          m.kind === 'tempoWord' ||
          m.kind === 'wordSignAbsolute') &&
        m.bpm != null,
    );
    if (firstAbs?.bpm != null) {
      const source: MusicTempoSource =
        firstAbs.kind === 'metronome'
          ? 'metronome'
          : firstAbs.kind === 'tempoWord'
            ? 'tempoWord'
            : 'wordSign';
      return { bpm: firstAbs.bpm, source, label: firstAbs.label };
    }
    return { bpm: DEFAULT_SCORE_BPM, source: 'default', label: 'default' };
  };

  const opening = pickHeading();
  let baseAbsolute = opening.bpm;
  let current = opening.bpm;
  const tempoChanges: MusicTempoChange[] = [];

  for (const m of located) {
    if (m.kind === 'metronome' && m.bpm != null) {
      current = m.bpm;
      baseAbsolute = m.bpm;
      if (m.beat > 1e-6) {
        tempoChanges.push({
          timeOffsetBeats: m.beat,
          bpm: current,
          label: m.label,
        });
      }
      continue;
    }

    if (
      (m.kind === 'tempoWord' || m.kind === 'wordSignAbsolute') &&
      m.bpm != null
    ) {
      current = m.bpm;
      baseAbsolute = m.bpm;
      if (m.beat > 1e-6) {
        tempoChanges.push({
          timeOffsetBeats: m.beat,
          bpm: current,
          label: m.label,
        });
      }
      continue;
    }

    if (m.kind === 'wordSignRelative' && m.bpmScale != null) {
      current = clampBpm(current * m.bpmScale);
      tempoChanges.push({
        timeOffsetBeats: m.beat,
        bpm: current,
        label: m.label,
      });
      continue;
    }

    if (m.kind === 'aTempo') {
      current = baseAbsolute;
      tempoChanges.push({
        timeOffsetBeats: m.beat,
        bpm: current,
        label: 'a tempo',
      });
    }
  }

  const filtered = tempoChanges.filter((c, idx, arr) => {
    if (idx > 0) {
      const prev = arr[idx - 1];
      if (
        Math.abs(c.timeOffsetBeats - prev.timeOffsetBeats) < 1e-6 &&
        c.bpm === prev.bpm
      ) {
        return false;
      }
    }
    return true;
  });

  return {
    detectedTempo: {
      bpm: opening.bpm,
      source: opening.source,
      label: opening.label,
    },
    tempoChanges: filtered,
  };
}

/** Convenience: scan + resolve using a char→beat mapper. */
export function detectScoreTempo(
  asciiBrf: string,
  beatForChar: (charIndex: number) => number,
): ResolvedTempoMeta {
  return resolveTempoMeta(scanTempoMarks(asciiBrf), beatForChar);
}

/**
 * UI origin when following the score (not a user slider override).
 * Mid-score tempoChanges count as detected score tempo once reached.
 */
export function scoreTempoOriginAtBeat(
  score: {
    detectedTempo?: DetectedTempo;
    tempoChanges?: MusicTempoChange[];
  },
  beat: number,
): 'score' | 'default' {
  const changes = score.tempoChanges ?? [];
  for (const c of changes) {
    if (c.timeOffsetBeats <= beat + 1e-9) return 'score';
  }
  const src = score.detectedTempo?.source;
  if (!src || src === 'default') return 'default';
  return 'score';
}

/** Short stable key for once-per-document UI (session dismiss). */
export function fingerprintBrfDocument(brf: string): string {
  const s = brf || '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${h >>> 0}`;
}
