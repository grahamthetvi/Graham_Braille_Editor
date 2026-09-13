/**
 * Sao Mai / BANA / slash-L bar-over-bar piano helpers.
 *
 * Real piano BRFs interleave right-hand and left-hand systems, literary titles,
 * word indicators, and dynamics. Supported hand signs:
 * - Sao Mai / BANA: RH `.>` · LH `_>`
 * - Slash-L dialect: RH `>/l` · LH `>#l`
 *
 * The note lexer only understands note cells — this module strips markup and
 * zips RH/LH measure chunks into in-accord (`<>`) streams while preserving
 * original character indices.
 */

const HAND_RH = '.>';
const HAND_LH = '_>';
/** Slash-L dialect (ASCII Music Braille exports). */
const HAND_RH_SLASH = '>/l';
const HAND_LH_SLASH = '>#l';

/** Upper-number letters a–j used for measure numbers (j=0). */
const MEASURE_NUM = new Set('abcdefghijABCDEFGHIJ'.split(''));

const NOTE_REST_CELLS = 'defghij?:$]\\[|wnopqrstyz&=(!)xuvm';
const NOTE_REST = new Set(NOTE_REST_CELLS.split(''));
/** Interval cells that are valid only immediately after a note/rest. */
const INTERVAL_AFTER_NOTE = new Set('/+#903-'.split(''));
/** Octave marks that often open a note run after word indicators. */
const OCTAVE_CHARS = '@^_".;,';

export interface PianoChunk {
  /** Inclusive start index in the ASCII-normalized source. */
  start: number;
  /** Note-bearing ASCII slice (octaves, notes, rests, ties, etc.). */
  text: string;
  /** Map from offset in `text` → absolute index in the full ASCII source. */
  indexMap: number[];
}

export interface PianoSystem {
  rh: PianoChunk[];
  lh: PianoChunk[];
}

export interface PianoHandSegment {
  hand: 'rh' | 'lh';
  chunks: PianoChunk[];
}

function isNoteLikeChar(ch: string): boolean {
  const c = ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
  return NOTE_REST.has(c) || c === "'";
}

function isMusicUtilityChar(ch: string): boolean {
  const c = ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
  return (
    isNoteLikeChar(c) ||
    '@^_".;,'.includes(c) || // octaves
    '<%*'.includes(c) || // accidentals
    '/+#903-'.includes(c) || // intervals
    (c >= '0' && c <= '9') || // fingerings / numbered nuances / #2 endings
    c === 'c' || // tie
    c === 'l' || // slur (common Sao Mai) — stripped in sanitize
    c === '#' ||
    c === '<' ||
    c === '>'
  );
}

export function looksLikeMusicCellAt(line: string, i: number): boolean {
  if (i >= line.length) return false;
  const ch = line[i];
  const c = ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
  if (NOTE_REST.has(c)) return true;
  if (OCTAVE_CHARS.includes(ch) || ch === '.') return true;
  if ('<%*'.includes(ch)) return true;
  return false;
}

const SECTION_LETTER = /[a-jA-J]/;

/** Glued dynamics / nuances after `>`: mp, mf, p/f/s runs, c/d, finger-like 1–5. */
const GLUED_WORD_SIGN =
  /^(mp|mf|sfz?|[pfs]{1,3}|[cd]|[1-5])(?=[.@^_"';,\s><\n\r]|$)/i;

/**
 * Skip a word / dynamic / instrument indicator starting at `>` (`>mp`, `>pno'`,
 * `>poco moto>`, `>c`, `>4`). Returns the index after the sign, or null.
 * Does not consume piano hand signs (`>/l`, `>#l`).
 */
export function skipWordSignAt(text: string, i: number): number | null {
  if (i >= text.length || text[i] !== '>') return null;
  if (matchHandSignAt(text, i)) return null;

  const start = i;
  i += 1;
  const glued = text.slice(i).match(GLUED_WORD_SIGN);
  if (glued) return i + glued[1].length;

  while (i < text.length && text[i] !== '>') {
    if (text[i] === "'" && looksLikeMusicCellAt(text, i + 1)) {
      return i + 1;
    }
    // Stop before octave/accidental so `>mp.f` does not swallow notes.
    // Do not stop on note letters — they appear in instrument words (`>pno'`).
    if (i > start + 1) {
      const ch = text[i];
      if (OCTAVE_CHARS.includes(ch) || ch === '.' || '<%*'.includes(ch)) {
        return i;
      }
    }
    i += 1;
  }
  if (i < text.length && text[i] === '>') i += 1;
  return i;
}

/**
 * Sao Mai single-staff measure label (`#1"31A`, `#12"31AB`).
 * Consumes trailing spaces/tabs so the following notes stay in the same bar.
 */
export function skipSaoMaiMeasureLabelAt(text: string, i: number): number | null {
  if (text[i] !== '#') return null;
  let j = i + 1;
  if (j >= text.length || text[j] < '0' || text[j] > '9') return null;
  while (j < text.length && text[j] >= '0' && text[j] <= '9') j += 1;
  if (text[j] !== '"' || text[j + 1] !== '3') return null;
  j += 2;
  if (text[j] === '1') j += 1;
  if (j >= text.length || !SECTION_LETTER.test(text[j])) return null;
  while (j < text.length && SECTION_LETTER.test(text[j])) j += 1;
  while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j += 1;
  return j;
}

/** Sao Mai line number (`,L#A` … `,L#E`) — not an octave-7 mark. */
export function skipSaoMaiLineNumberAt(text: string, i: number): number | null {
  if (text[i] !== ',') return null;
  const el = text[i + 1];
  if (el !== 'L' && el !== 'l') return null;
  if (text[i + 2] !== '#') return null;
  let j = i + 3;
  if (j >= text.length || !SECTION_LETTER.test(text[j])) return null;
  while (j < text.length && SECTION_LETTER.test(text[j])) j += 1;
  return j;
}

/**
 * Match RH/LH hand signs at `i`. Returns the hand and index after the sign.
 * Supports Sao Mai `.>` / `_>` and slash-L `>/l` / `>#l` (case-insensitive L).
 */
export function matchHandSignAt(
  line: string,
  i: number,
): { hand: 'rh' | 'lh'; next: number } | null {
  if (i >= line.length) return null;

  const three = line.slice(i, i + 3).toLowerCase();
  if (three === HAND_RH_SLASH) return { hand: 'rh', next: i + 3 };
  if (three === HAND_LH_SLASH) return { hand: 'lh', next: i + 3 };

  if (line.slice(i, i + 2) === HAND_RH) return { hand: 'rh', next: i + 2 };
  if (line.slice(i, i + 2) === HAND_LH) return { hand: 'lh', next: i + 2 };

  // Tolerate blank cells between Sao Mai prefix and `>`.
  if (line[i] === '.' || line[i] === '_') {
    const prefix = line[i];
    let j = i + 1;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j += 1;
    if (line[j] === '>') {
      return { hand: prefix === '.' ? 'rh' : 'lh', next: j + 1 };
    }
  }
  return null;
}

/** True when the ASCII text uses slash-L or Sao Mai piano hand signs. */
export function hasPianoHandSigns(asciiText: string): boolean {
  const t = asciiText.toLowerCase();
  return (
    t.includes(HAND_RH_SLASH) ||
    t.includes(HAND_LH_SLASH) ||
    asciiText.includes(HAND_RH) ||
    asciiText.includes(HAND_LH)
  );
}

/**
 * Remove slur / fingering landmines and Sao Mai LH noise (`<c`, orphan `*c`)
 * while keeping true post-note intervals, ties, and leading triplet `1`.
 */
export function sanitizePianoChunkText(
  text: string,
  indexMap: number[],
): { text: string; indexMap: number[] } {
  let out = '';
  const outMap: number[] = [];
  let i = 0;
  let sawNoteInChunk = false;
  let lastWasNoteOrInterval = false;

  const push = (ch: string, abs: number) => {
    out += ch;
    outMap.push(abs);
  };

  while (i < text.length) {
    const ch = text[i];
    const abs = indexMap[i] ?? 0;

    // Print-repeat barlines (BANA Table 17): must keep both cells so `<` is
    // not left behind as a flat accidental.
    if (ch === '<' && (text[i + 1] === '7' || text[i + 1] === '2')) {
      push('<', abs);
      push(text[i + 1], indexMap[i + 1] ?? abs);
      i += 2;
      lastWasNoteOrInterval = false;
      continue;
    }

    // Sao Mai LH chord/noise prefix: flat + orphan `c` (not a tie).
    if (ch === '<' && text[i + 1] === 'c') {
      i += 2;
      lastWasNoteOrInterval = false;
      continue;
    }

    // Orphan natural+c noise (not after a note — real ties use c after notes).
    if (ch === '*' && text[i + 1] === 'c' && !lastWasNoteOrInterval) {
      i += 2;
      lastWasNoteOrInterval = false;
      continue;
    }

    // Volta endings `#1` / `#2` — keep for the lexer (meter uses letters: `#c8`).
    if (ch === '#' && (text[i + 1] === '1' || text[i + 1] === '2')) {
      push('#', abs);
      push(text[i + 1], indexMap[i + 1] ?? abs);
      i += 2;
      lastWasNoteOrInterval = false;
      continue;
    }

    // Non-meter `#` nuances — drop so a following digit is not a triplet, and
    // meter/key letters in chunks stay out of the note stream (`#c8` is read
    // from the full source heading before piano linearization).
    if (ch === '#') {
      i += 1;
      while (i < text.length) {
        const n = text[i];
        if (
          (n >= '0' && n <= '9') ||
          (n >= 'a' && n <= 'j') ||
          (n >= 'A' && n <= 'J') ||
          n === '/'
        ) {
          i += 1;
          continue;
        }
        break;
      }
      lastWasNoteOrInterval = false;
      continue;
    }

    // Slur — never lex as music.
    if (ch === 'l' || ch === 'L') {
      i += 1;
      continue;
    }

    // Digits: interval 9/0/3 only after note; triplet 1 only before any note
    // and not after octave/accidental clutter at chunk start without intent —
    // keep leading `1` when the next cell is a note/octave (true triplet).
    if (ch >= '0' && ch <= '9') {
      if (INTERVAL_AFTER_NOTE.has(ch) && lastWasNoteOrInterval) {
        push(ch, abs);
        lastWasNoteOrInterval = true;
        i += 1;
        continue;
      }
      if (ch === '1' && !sawNoteInChunk) {
        // Peek: triplet only when a note (optionally after octave/accidental) follows.
        let j = i + 1;
        while (
          j < text.length &&
          ("@^_\";,<%*'".includes(text[j]) || text[j] === '.')
        ) {
          j += 1;
        }
        if (j < text.length && NOTE_REST.has(text[j])) {
          push(ch, abs);
          lastWasNoteOrInterval = false;
          i += 1;
          continue;
        }
      }
      i += 1;
      continue;
    }

    if (NOTE_REST.has(ch)) {
      push(ch, abs);
      sawNoteInChunk = true;
      lastWasNoteOrInterval = true;
      i += 1;
      continue;
    }

    if (INTERVAL_AFTER_NOTE.has(ch) && lastWasNoteOrInterval) {
      push(ch, abs);
      lastWasNoteOrInterval = true;
      i += 1;
      continue;
    }

    // Tie after note: c or .c
    if (ch === 'c' && lastWasNoteOrInterval) {
      push(ch, abs);
      lastWasNoteOrInterval = false;
      i += 1;
      continue;
    }
    if (ch === '.' && text[i + 1] === 'c' && lastWasNoteOrInterval) {
      push('.', abs);
      push('c', indexMap[i + 1] ?? abs);
      lastWasNoteOrInterval = false;
      i += 2;
      continue;
    }

    // Octave / accidental / dot (`.` also starts octave 5).
    if ("@^_\";,<%*'".includes(ch) || ch === '.') {
      push(ch, abs);
      lastWasNoteOrInterval = false;
      i += 1;
      continue;
    }

    // Drop anything else (including bare `>` residue).
    i += 1;
    lastWasNoteOrInterval = false;
  }

  return { text: out, indexMap: outMap };
}

function sanitizeChunk(chunk: PianoChunk): PianoChunk | null {
  const cleaned = sanitizePianoChunkText(chunk.text, chunk.indexMap);
  if (![...cleaned.text].some((ch) => NOTE_REST.has(ch))) {
    return null;
  }
  return {
    start: cleaned.indexMap[0] ?? chunk.start,
    text: cleaned.text,
    indexMap: cleaned.indexMap,
  };
}

/**
 * Strip hand signs, word/dynamic indicators, and bare measure numbers from a
 * piano system line, returning space-separated note chunks with source maps.
 *
 * Mid-line hand switches (`>#l...>/l...`) yield multiple `segments`.
 */
export function extractHandChunks(line: string, lineStart: number): {
  hand: 'rh' | 'lh' | null;
  chunks: PianoChunk[];
  segments: PianoHandSegment[];
} {
  const segments: PianoHandSegment[] = [];
  let hand: 'rh' | 'lh' | null = null;
  let segmentChunks: PianoChunk[] = [];
  let i = 0;

  const pushSegment = () => {
    if (hand && segmentChunks.length > 0) {
      segments.push({ hand, chunks: segmentChunks });
      segmentChunks = [];
    }
  };

  // Leading spaces / measure number (optional letter or letter-letter like "AA")
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  if (i < line.length && MEASURE_NUM.has(line[i])) {
    const numStart = i;
    while (i < line.length && MEASURE_NUM.has(line[i])) i += 1;
    // Only treat as measure number when followed by space/hand — not a note run.
    const next = line[i] ?? '';
    if (
      next !== ' ' &&
      next !== '\t' &&
      next !== '.' &&
      next !== '_' &&
      next !== '>'
    ) {
      // Rewind — this letter is music (e.g. note cell), not a measure number.
      i = numStart;
    } else {
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
    }
  }

  const leadingHand = matchHandSignAt(line, i);
  if (leadingHand) {
    hand = leadingHand.hand;
    i = leadingHand.next;
  }

  // Optional dot-3 music hyphen / blank cells after hand sign
  while (i < line.length && line[i] === "'") i += 1;

  let chunkText = '';
  let chunkMap: number[] = [];
  let chunkStart = -1;

  const flushChunk = () => {
    const trimmed = chunkText.replace(/^\s+/, '');
    if (!trimmed) {
      chunkText = '';
      chunkMap = [];
      chunkStart = -1;
      return;
    }
    // Drop leading spaces from map too
    const lead = chunkText.length - trimmed.length;
    const raw: PianoChunk = {
      start: lineStart + (chunkStart < 0 ? 0 : chunkStart + lead),
      text: trimmed,
      indexMap: chunkMap.slice(lead),
    };
    const cleaned = sanitizeChunk(raw);
    if (cleaned) segmentChunks.push(cleaned);
    chunkText = '';
    chunkMap = [];
    chunkStart = -1;
  };

  while (i < line.length) {
    // Hand signs (slash-L or Sao Mai) — before word/dynamic `>` stripping.
    const nestedHand = matchHandSignAt(line, i);
    if (nestedHand) {
      flushChunk();
      if (hand && hand !== nestedHand.hand) {
        pushSegment();
      }
      hand = nestedHand.hand;
      i = nestedHand.next;
      while (i < line.length && line[i] === "'") i += 1;
      continue;
    }

    const wordEnd = skipWordSignAt(line, i);
    if (wordEnd != null) {
      i = wordEnd;
      continue;
    }

    const ch = line[i];
    const abs = lineStart + i;

    // Space = measure chunk boundary. Collapse alignment padding runs into a
    // single boundary so empty slots are not invented between measures.
    if (ch === ' ' || ch === '\t') {
      flushChunk();
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
      continue;
    }

    // Skip isolated literary commas / unrelated cells that aren't music utilities
    if (!isMusicUtilityChar(ch) && ch !== ' ') {
      i += 1;
      continue;
    }

    if (chunkStart < 0) chunkStart = i;
    // Lex the same lowercased cells the note parser expects.
    const out = ch >= 'A' && ch <= 'Z' ? ch.toLowerCase() : ch;
    chunkText += out;
    chunkMap.push(abs);
    i += 1;
  }
  flushChunk();
  pushSegment();

  // Unmarked continuation lines still produce note chunks (hand assigned later).
  if (segments.length === 0 && segmentChunks.length > 0) {
    // hand stayed null — expose chunks for implied-role pairing.
    return { hand: null, chunks: segmentChunks, segments: [] };
  }

  const allChunks = segments.flatMap((s) => s.chunks);
  return {
    hand: segments[0]?.hand ?? hand,
    chunks: allChunks,
    segments,
  };
}

/**
 * Apply one hand's chunks into the open system (RH starts; LH completes).
 */
function applyHandToSystem(
  systems: PianoSystem[],
  current: PianoSystem | null,
  hand: 'rh' | 'lh',
  chunks: PianoChunk[],
): PianoSystem | null {
  if (chunks.length === 0) return current;

  if (hand === 'rh') {
    if (current && (current.rh.length || current.lh.length)) {
      systems.push(current);
    }
    return { rh: chunks, lh: [] };
  }

  // lh
  if (!current) current = { rh: [], lh: [] };
  current.lh.push(...chunks);
  systems.push(current);
  return null;
}

/**
 * Group ASCII music lines into RH/LH systems for bar-over-bar piano scores.
 * Non-piano scores (no hand signs) return an empty list — caller keeps legacy parse.
 *
 * Continuation lines that omit hand signs inherit the next expected role
 * (after RH → LH, after completed LH → RH).
 */
export function segmentPianoSystems(asciiText: string): PianoSystem[] {
  const lines: Array<{ start: number; content: string }> = [];
  let lineStart = 0;
  for (let i = 0; i <= asciiText.length; i++) {
    if (i === asciiText.length || asciiText[i] === '\n') {
      lines.push({ start: lineStart, content: asciiText.slice(lineStart, i) });
      lineStart = i + 1;
    }
  }

  const systems: PianoSystem[] = [];
  let current: PianoSystem | null = null;
  let sawHand = false;
  /** Next role for an unmarked music line once a piano system has started. */
  let expectHand: 'rh' | 'lh' | null = null;

  for (const line of lines) {
    const trimmed = line.content.trim();
    if (!trimmed) {
      if (current && (current.rh.length || current.lh.length)) {
        systems.push(current);
        current = null;
      }
      expectHand = null;
      continue;
    }

    const { hand, chunks, segments } = extractHandChunks(line.content, line.start);

    if (segments.length > 0) {
      sawHand = true;
      for (const seg of segments) {
        current = applyHandToSystem(systems, current, seg.hand, seg.chunks);
        expectHand = seg.hand === 'rh' ? 'lh' : 'rh';
      }
      continue;
    }

    if (!hand && chunks.length > 0 && expectHand) {
      // Continuation line without an explicit hand sign.
      current = applyHandToSystem(systems, current, expectHand, chunks);
      expectHand = expectHand === 'rh' ? 'lh' : 'rh';
      continue;
    }

    if (!hand) {
      // Time/key-only line or literary — ignore for segmentation
      continue;
    }

    sawHand = true;
    current = applyHandToSystem(systems, current, hand, chunks);
    expectHand = hand === 'rh' ? 'lh' : 'rh';
  }
  if (current && (current.rh.length || current.lh.length)) {
    systems.push(current);
  }

  return sawHand ? systems : [];
}

/**
 * Align RH/LH measure chunks when counts differ (alignment spaces / pickups).
 * Pairs by index up to min length, then appends leftover note-bearing chunks
 * from the longer hand so measures are not falsely zipped across barlines.
 */
export function alignHandChunks(
  rh: PianoChunk[],
  lh: PianoChunk[],
): Array<{ rh?: PianoChunk; lh?: PianoChunk }> {
  const paired: Array<{ rh?: PianoChunk; lh?: PianoChunk }> = [];
  const n = Math.min(rh.length, lh.length);
  for (let i = 0; i < n; i++) {
    paired.push({ rh: rh[i], lh: lh[i] });
  }
  for (let i = n; i < rh.length; i++) {
    paired.push({ rh: rh[i] });
  }
  for (let i = n; i < lh.length; i++) {
    paired.push({ lh: lh[i] });
  }
  return paired;
}

/**
 * Linearize piano systems into a single braille stream with `<>` between
 * RH and LH of each measure and spaces between measures. `indexMap[i]` gives
 * the original ASCII source index for each emitted character (spaces/`<>`
 * map to the nearest surrounding music cell).
 */
export function linearizePianoSystems(systems: PianoSystem[]): {
  text: string;
  indexMap: number[];
} {
  let text = '';
  const indexMap: number[] = [];

  const pushChar = (ch: string, abs: number) => {
    text += ch;
    indexMap.push(abs);
  };

  const pushChunk = (chunk: PianoChunk) => {
    for (let i = 0; i < chunk.text.length; i++) {
      pushChar(chunk.text[i], chunk.indexMap[i] ?? chunk.start);
    }
  };

  const allPairs: Array<{ rh?: PianoChunk; lh?: PianoChunk }> = [];
  for (const sys of systems) {
    allPairs.push(...alignHandChunks(sys.rh, sys.lh));
  }

  for (let m = 0; m < allPairs.length; m++) {
    const { rh, lh } = allPairs[m];
    if (rh) pushChunk(rh);
    if (rh && lh) {
      const abs = lh.indexMap[0] ?? lh.start;
      pushChar('<', abs);
      pushChar('>', abs);
    }
    if (lh) pushChunk(lh);
    if (m < allPairs.length - 1) {
      const abs =
        lh?.indexMap[0] ??
        rh?.indexMap[(rh.indexMap.length || 1) - 1] ??
        rh?.start ??
        0;
      pushChar(' ', abs);
    }
  }

  return { text, indexMap };
}
