/**
 * Sao Mai / BANA bar-over-bar piano helpers.
 *
 * Real piano BRFs interleave right-hand (`.>`) and left-hand (`_>`) systems,
 * literary titles, word indicators, and dynamics. The note lexer only understands
 * note cells — this module strips markup and zips RH/LH measure chunks into
 * in-accord (`<>`) streams while preserving original character indices.
 */

const HAND_RH = '.>';
const HAND_LH = '_>';

/** Upper-number letters a–j used for measure numbers (j=0). */
const MEASURE_NUM = new Set('abcdefghijABCDEFGHIJ'.split(''));

const NOTE_REST_CELLS = 'defghij?:$]\\[|wnopqrstyz&=(!)xuvm';
const NOTE_REST = new Set(NOTE_REST_CELLS.split(''));
/** Interval cells that are valid only immediately after a note/rest. */
const INTERVAL_AFTER_NOTE = new Set('/+#903-'.split(''));

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

    // Non-meter `#` nuances / endings (`#1`, `#2`) — drop so a following `1`
    // is not lexed as a triplet prefix.
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
 */
export function extractHandChunks(line: string, lineStart: number): {
  hand: 'rh' | 'lh' | null;
  chunks: PianoChunk[];
} {
  let hand: 'rh' | 'lh' | null = null;
  const chunks: PianoChunk[] = [];
  let i = 0;

  // Leading spaces / measure number (optional letter or letter-letter like "AA")
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
  if (i < line.length && MEASURE_NUM.has(line[i])) {
    const numStart = i;
    while (i < line.length && MEASURE_NUM.has(line[i])) i += 1;
    // Only treat as measure number when followed by space/hand — not a note run.
    const next = line[i] ?? '';
    if (next !== ' ' && next !== '\t' && next !== '.' && next !== '_') {
      // Rewind — this letter is music (e.g. note cell), not a measure number.
      i = numStart;
    } else {
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
    }
  }

  if (line.slice(i, i + 2) === HAND_RH) {
    hand = 'rh';
    i += 2;
  } else if (line.slice(i, i + 2) === HAND_LH) {
    hand = 'lh';
    i += 2;
  } else if (line[i] === '.' || line[i] === '_') {
    // Tolerate blank cells between the octave/dot prefix and `>` (some exports
    // insert alignment spaces inside the hand sign).
    const prefix = line[i];
    let j = i + 1;
    while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j += 1;
    if (line[j] === '>') {
      hand = prefix === '.' ? 'rh' : 'lh';
      i = j + 1;
    }
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
    if (cleaned) chunks.push(cleaned);
    chunkText = '';
    chunkMap = [];
    chunkStart = -1;
  };

  while (i < line.length) {
    // Word / dynamic indicator: >word> or glued >PP / >P / >FF before music
    if (line[i] === '>') {
      i += 1;
      const rest = line.slice(i);
      const dyn = rest.match(/^([PpFfSs]{1,3})(?=[.@^_"';,\s]|$)/);
      if (dyn) {
        i += dyn[1].length;
        continue;
      }
      // Literary word phrase until closing '>'
      while (i < line.length && line[i] !== '>') i += 1;
      if (i < line.length && line[i] === '>') i += 1;
      continue;
    }

    // Nested hand signs mid-line
    if (line.slice(i, i + 2) === HAND_RH || line.slice(i, i + 2) === HAND_LH) {
      if (!hand) {
        hand = line.slice(i, i + 2) === HAND_RH ? 'rh' : 'lh';
      }
      i += 2;
      while (i < line.length && line[i] === "'") i += 1;
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
      // Unknown markup — skip single cell
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

  return { hand, chunks };
}

/**
 * Group ASCII music lines into RH/LH systems for bar-over-bar piano scores.
 * Non-piano scores (no hand signs) return an empty list — caller keeps legacy parse.
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

  for (const line of lines) {
    const trimmed = line.content.trim();
    if (!trimmed) {
      if (current && (current.rh.length || current.lh.length)) {
        systems.push(current);
        current = null;
      }
      continue;
    }

    const { hand, chunks } = extractHandChunks(line.content, line.start);
    if (!hand) {
      // Time/key-only line or literary — ignore for segmentation
      continue;
    }
    sawHand = true;

    if (hand === 'rh') {
      if (current && (current.rh.length || current.lh.length)) {
        systems.push(current);
      }
      current = { rh: chunks, lh: [] };
    } else {
      // lh
      if (!current) current = { rh: [], lh: [] };
      current.lh.push(...chunks);
      systems.push(current);
      current = null;
    }
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
