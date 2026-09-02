import { asciiToUnicodeBraille, unicodeBrailleToAscii } from './braille';

/**
 * Word-wraps a single braille line to at most `cells` characters.
 *
 * `space` is the word-separator character:
 *   - '\u2800' (U+2800, BRAILLE PATTERN BLANK) for Unicode braille strings
 *   - ' '  (0x20) for raw ASCII BRF strings
 *
 * Words that fit on the current line are appended with a leading space.
 * Words longer than `cells` are hard-broken at the character limit (the only
 * case where a word is split mid-character, matching the user's requirement).
 */
/** 1-based Braille cell index (cell 1 = leftmost). */
export type ParagraphLineStarts = {
  firstLineStartCell: number;
  runoverStartCell: number;
};

/**
 * Soft line break between visual rows so plain text matches BRF cell wrap.
 * Uses CR-only (\\r) so editors do not flag "unusual line terminators" (LS/U+2028, PS).
 * User paragraph boundaries remain \\n; the worker strips \\r to a space before liblouis.
 * Legacy U+2028 from older builds is normalized away when building canonical text.
 */
export const SOFT_LINE_BREAK_CHAR = '\r';

/** Previous soft-wrap character — still stripped when normalizing for translate/sync. */
const LEGACY_SOFT_LINE_BREAK_CHAR = '\u2028';

/** Courier half-points: \fs24 = 12pt. Used when no page metrics are supplied. */
export const RTF_FS_BASE = 24;
/** Absolute readability floor: \fs16 = 8pt. Words that still overflow at this size may drift. */
export const RTF_FS_MIN = 16;

/** Twips (1/20 pt) per inch — RTF paper, margin, and line-spacing unit. */
export const TWIPS_PER_INCH = 1440;
/**
 * Courier New is 0.6em wide. `\fs` is half-points, so one character is 6 twips per `\fs` unit
 * (12pt Courier = 10 CPI = 144 twips = `\fs24` × 6).
 */
export const COURIER_TWIPS_PER_FS = 6;

export type PrintLayoutPaperFormat = 'us-letter' | 'wide' | 'custom';

export type PrintLayoutPageSpec = {
  cellsPerRow: number;
  linesPerPage: number;
  paperFormat?: PrintLayoutPaperFormat;
};

export type PrintLayoutPageMetrics = {
  paperWidthTwips: number;
  paperHeightTwips: number;
  marginLeftTwips: number;
  marginRightTwips: number;
  marginTopTwips: number;
  marginBottomTwips: number;
  fsBase: number;
  fsMin: number;
  slTwips: number;
  cellsPerRow: number;
  linesPerPage: number;
};

export function inferPrintPaperFormat(cellsPerRow: number, linesPerPage: number): PrintLayoutPaperFormat {
  if (cellsPerRow === 32 && linesPerPage === 25) return 'us-letter';
  if (cellsPerRow === 40 && linesPerPage === 25) return 'wide';
  return 'custom';
}

function inchesToTwips(inches: number): number {
  return Math.round(inches * TWIPS_PER_INCH);
}

/** Shrink floor: 8pt, or 40% of the page's base size — whichever is larger. */
export function rtfFontSizeMin(fsBase: number): number {
  return Math.max(RTF_FS_MIN, Math.round(fsBase * 0.4));
}

/**
 * Paper size, margins, Courier `\fs`, and exact line spacing so `linesPerPage`
 * occupies the printable height (same pitch as the embossed page). Character
 * pitch starts at one Courier column per braille cell; callers may shrink `\fs`
 * so a longer print line still fits on one row without wrapping.
 */
export function printLayoutPageMetrics(spec: PrintLayoutPageSpec): PrintLayoutPageMetrics {
  const cells = Math.max(1, spec.cellsPerRow);
  const lines = Math.max(1, spec.linesPerPage);
  const format = spec.paperFormat ?? inferPrintPaperFormat(cells, lines);

  let widthIn: number;
  let heightIn: number;
  let marginLeftIn: number;
  let marginRightIn: number;
  let marginTopIn: number;
  let marginBottomIn: number;

  if (format === 'us-letter') {
    widthIn = 8.5;
    heightIn = 11;
    marginLeftIn = 0.5;
    marginRightIn = 0.5;
    marginTopIn = 0.5;
    marginBottomIn = 0.5;
  } else if (format === 'wide') {
    widthIn = 11.5;
    heightIn = 11;
    marginLeftIn = 0.75;
    marginRightIn = 0.75;
    marginTopIn = 0.5;
    marginBottomIn = 0.5;
  } else {
    marginLeftIn = 0.5;
    marginRightIn = 0.5;
    marginTopIn = 0.5;
    marginBottomIn = 0.5;
    widthIn = marginLeftIn + cells * 0.25 + marginRightIn;
    heightIn = marginTopIn + lines * 0.4 + marginBottomIn;
  }

  const paperWidthTwips = inchesToTwips(widthIn);
  const paperHeightTwips = inchesToTwips(heightIn);
  const marginLeftTwips = inchesToTwips(marginLeftIn);
  const marginRightTwips = inchesToTwips(marginRightIn);
  const marginTopTwips = inchesToTwips(marginTopIn);
  const marginBottomTwips = inchesToTwips(marginBottomIn);

  const printableWidth = Math.max(1, paperWidthTwips - marginLeftTwips - marginRightTwips);
  const printableHeight = Math.max(1, paperHeightTwips - marginTopTwips - marginBottomTwips);
  const cellWidthTwips = printableWidth / cells;
  const slTwips = Math.max(1, Math.round(printableHeight / lines));
  const fsBase = Math.max(RTF_FS_MIN, Math.round(cellWidthTwips / COURIER_TWIPS_PER_FS));

  return {
    paperWidthTwips,
    paperHeightTwips,
    marginLeftTwips,
    marginRightTwips,
    marginTopTwips,
    marginBottomTwips,
    fsBase,
    fsMin: rtfFontSizeMin(fsBase),
    slTwips,
    cellsPerRow: cells,
    linesPerPage: lines,
  };
}

/**
 * Visual character count of one inner print line. RTF `\\uN?` is one character;
 * `\\\\` `\\{` `\\}` are one each. Mid-line `{\\fsN ...}` (legacy) counts the text only.
 */
export function rtfInnerVisualLength(line: string): number {
  let n = 0;
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('{\\fs', i)) {
      const m = line.slice(i).match(/^\{\\fs\d+ /);
      if (m) {
        const contentStart = i + m[0].length;
        const end = line.indexOf('}', contentStart);
        const text = end >= 0 ? line.slice(contentStart, end) : line.slice(contentStart);
        n += rtfInnerVisualLength(text);
        i = end >= 0 ? end + 1 : line.length;
        continue;
      }
    }
    if (line.startsWith('\\u', i)) {
      const um = line.slice(i).match(/^\\u-?\d+\?/);
      if (um) {
        n += 1;
        i += um[0].length;
        continue;
      }
    }
    if (line[i] === '\\' && i + 1 < line.length) {
      n += 1;
      i += 2;
      continue;
    }
    n += 1;
    i += 1;
  }
  return n;
}

export function maxPrintLineVisualLength(text: string): number {
  let max = 0;
  for (const page of text.split('\f')) {
    for (const line of page.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')) {
      max = Math.max(max, rtfInnerVisualLength(line));
    }
  }
  return max;
}

/**
 * One uniform Courier size for the document: never larger than the cell-pitch
 * size, shrunk so the longest print line fits the printable width. Line spacing
 * (`slTwips`) is unchanged so print rows stay on the braille line grid.
 */
export function fitPrintLayoutFontToLongestLine(
  metrics: PrintLayoutPageMetrics,
  maxChars: number,
): PrintLayoutPageMetrics {
  if (maxChars <= 0) return metrics;
  const printable = Math.max(1, metrics.paperWidthTwips - metrics.marginLeftTwips - metrics.marginRightTwips);
  const fsFit = Math.floor(printable / (maxChars * COURIER_TWIPS_PER_FS));
  const fsBase = Math.max(12, Math.min(metrics.fsBase, fsFit));
  return { ...metrics, fsBase };
}

/** Index into the non-empty braille word list for one logical (pre-wrap) line; char range for hard breaks. */
export type BrailleWordSpan = {
  wordIndex: number;
  charStart: number;
  charEnd: number;
};

export type PhysicalBrailleLineMeta = { spans: BrailleWordSpan[] };

function lineLenFromSpans(spans: BrailleWordSpan[], spaceLen: number): number {
  if (spans.length === 0) return 0;
  let len = 0;
  for (let s = 0; s < spans.length; s++) {
    len += spans[s].charEnd - spans[s].charStart;
    if (s > 0) len += spaceLen;
  }
  return len;
}

/** True if s.slice(0, p) and s.slice(p) do not split a word (cut is at whitespace gap). */
function isWordBoundaryCut(s: string, p: number): boolean {
  const L = s.length;
  if (p <= 0) return p === 0;
  if (p >= L) return p === L;
  const left = s[p - 1];
  const right = s[p];
  return left === ' ' || right === ' ';
}

/**
 * Exclusive cut index p: first segment is s.slice(0, p). Prefers word boundaries; on equal
 * distance prefers a larger p so more words stay on earlier rows. Minimizes |p - ideal| in [low, high].
 */
function snapCutToWordBoundary(s: string, ideal: number, low: number, high: number): number {
  const L = s.length;
  const lo = Math.max(low, 0);
  const hi = Math.min(high, L);
  if (lo > hi) return Math.min(lo, L);

  let best = Math.max(lo, Math.min(hi, ideal));
  let bestDist = Infinity;
  for (let d = 0; d <= L; d++) {
    for (const sign of d === 0 ? [0] : [-1, 1]) {
      const p = ideal + sign * d;
      if (p < lo || p > hi) continue;
      if (!isWordBoundaryCut(s, p)) continue;
      const dist = Math.abs(p - ideal);
      if (dist < bestDist || (dist === bestDist && p > best)) {
        bestDist = dist;
        best = p;
      }
    }
    if (bestDist === 0) break;
  }
  if (bestDist < Infinity) return best;
  return Math.max(lo, Math.min(hi, ideal));
}

/**
 * When braille token count ≠ source word count, split `srcJoined` into one segment per
 * physical braille row using cumulative braille weights (character-proportional), snapping
 * cuts to spaces so words are not split mid-token when possible.
 */
function splitSrcJoinedByBrailleWeights(srcJoined: string, lineWeights: number[]): string[] {
  const nLines = lineWeights.length;
  const L = srcJoined.length;
  if (nLines <= 0) return [];
  if (nLines === 1) return [srcJoined.trimEnd()];

  const W = lineWeights.reduce((a, b) => a + b, 0);
  if (W <= 0 || L === 0) {
    return Array.from({ length: nLines }, (_, i) => (i === 0 ? srcJoined : ''));
  }

  const cuts: number[] = [0];
  let cum = 0;

  for (let i = 0; i < nLines - 1; i++) {
    cum += lineWeights[i];
    const low = cuts[i] + 1;
    const high = L - (nLines - 1 - i);
    if (low > high) {
      cuts.push(low);
      continue;
    }
    const ideal = Math.round((cum / W) * L);
    const clamped = Math.max(low, Math.min(high, ideal));
    let t = snapCutToWordBoundary(srcJoined, clamped, low, high);
    if (t <= cuts[i]) t = low;
    cuts.push(t);
  }
  cuts.push(L);

  for (let k = 1; k < cuts.length - 1; k++) {
    if (cuts[k] <= cuts[k - 1]) cuts[k] = cuts[k - 1] + 1;
  }
  if (cuts[cuts.length - 1] !== L) cuts[cuts.length - 1] = L;
  for (let k = cuts.length - 2; k >= 1; k--) {
    if (cuts[k] >= cuts[k + 1]) cuts[k] = Math.max(cuts[k - 1] + 1, cuts[k + 1] - 1);
  }

  const out: string[] = [];
  for (let i = 0; i < nLines; i++) {
    const raw = srcJoined.slice(cuts[i], cuts[i + 1] ?? L);
    out.push(raw.trim());
  }
  return out;
}

function mapBrailleWordIndexToSrcWordIndex(brailleWordIndex: number, mBrailleWords: number, nSrcWords: number): number {
  if (nSrcWords <= 0) return 0;
  if (mBrailleWords <= 0) return 0;
  if (mBrailleWords === 1) return Math.min(nSrcWords - 1, brailleWordIndex);
  return Math.min(nSrcWords - 1, Math.floor((brailleWordIndex * nSrcWords) / mBrailleWords));
}

function sliceSrcForBrailleSpan(
  span: BrailleWordSpan,
  wordsNE: string[],
  srcWords: string[],
  m: number,
  n: number,
): string {
  const bwText = wordsNE[span.wordIndex] ?? '';
  const Lb = Math.max(1, bwText.length);
  const srcIdx =
    m === n && m > 0
      ? Math.min(span.wordIndex, Math.max(0, n - 1))
      : mapBrailleWordIndexToSrcWordIndex(span.wordIndex, m, n);
  const sw = srcWords[srcIdx] ?? '';
  const Ls = sw.length;
  if (span.charStart === 0 && span.charEnd >= bwText.length) return sw;
  if (Ls === 0) return '';
  const start = Math.min(Ls, Math.floor((span.charStart * Ls) / Lb));
  const end = Math.max(start + 1, Math.min(Ls, Math.ceil((span.charEnd * Ls) / Lb)));
  return sw.slice(start, end);
}

/**
 * Mirrors `wrapBrailleLine` and records which braille word spans appear on each physical line.
 */
function wrapBrailleLineMeta(line: string, cells: number, space: string): PhysicalBrailleLineMeta[] {
  const words = line.split(space);

  const result: PhysicalBrailleLineMeta[] = [];
  let spans: BrailleWordSpan[] = [];
  const spaceLen = space.length;

  let wordIdx = 0;
  for (const word of words) {
    if (word.length === 0) continue;
    const wi = wordIdx;
    wordIdx++;

    if (word.length > cells) {
      if (spans.length > 0) {
        result.push({ spans: [...spans] });
        spans = [];
      }
      for (let i = 0; i < word.length; i += cells) {
        const chunk = word.slice(i, i + cells);
        if (chunk.length === cells) {
          result.push({
            spans: [{ wordIndex: wi, charStart: i, charEnd: i + cells }],
          });
        } else {
          spans = [{ wordIndex: wi, charStart: i, charEnd: word.length }];
        }
      }
    } else {
      const trial = [...spans, { wordIndex: wi, charStart: 0, charEnd: word.length }];
      const needed = lineLenFromSpans(trial, spaceLen);
      if (needed <= cells) {
        spans = trial;
      } else {
        if (spans.length > 0) result.push({ spans: [...spans] });
        spans = [{ wordIndex: wi, charStart: 0, charEnd: word.length }];
      }
    }
  }

  if (spans.length > 0) result.push({ spans: [...spans] });
  return result;
}

/**
 * Mirrors `wrapBrailleLineWithParagraphStarts` with span metadata per physical line.
 */
function wrapBrailleLineWithParagraphStartsMeta(
  line: string,
  cellsPerRow: number,
  firstLineStartCell: number,
  runoverStartCell: number,
  space: string,
): PhysicalBrailleLineMeta[] {
  const cells = Math.max(1, cellsPerRow);
  const firstCell = clampParagraphCell(firstLineStartCell, cells);
  const runCell = clampParagraphCell(runoverStartCell, cells);
  const marginFirst = firstCell - 1;
  const marginRun = runCell - 1;
  const capFirst = Math.max(1, cells - marginFirst);
  const capRun = Math.max(1, cells - marginRun);

  const words = line.split(space);

  const result: PhysicalBrailleLineMeta[] = [];
  let spans: BrailleWordSpan[] = [];
  let onFirstLine = true;
  const spaceLen = space.length;

  const cap = () => (onFirstLine ? capFirst : capRun);

  const pushCurrent = () => {
    if (spans.length === 0) return;
    result.push({ spans: [...spans] });
    spans = [];
    onFirstLine = false;
  };

  let wordIdx = 0;
  for (const word of words) {
    if (word.length === 0) continue;
    const wi = wordIdx;
    wordIdx++;

    if (word.length > cap()) {
      if (spans.length > 0) pushCurrent();
      let remaining = word;
      let pos = 0;
      while (remaining.length > 0) {
        const c = cap();
        const chunk = remaining.slice(0, c);
        remaining = remaining.slice(c);
        const chunkLen = chunk.length;
        result.push({
          spans: [{ wordIndex: wi, charStart: pos, charEnd: pos + chunkLen }],
        });
        pos += chunkLen;
        onFirstLine = false;
      }
      continue;
    }

    const trial = [...spans, { wordIndex: wi, charStart: 0, charEnd: word.length }];
    const contentLen = lineLenFromSpans(trial, spaceLen);
    if (contentLen <= cap()) {
      spans = trial;
    } else {
      pushCurrent();
      spans = [{ wordIndex: wi, charStart: 0, charEnd: word.length }];
    }
  }
  pushCurrent();
  return result;
}

function physicalLinesMetaForUnicodeLine(
  unicodeLine: string,
  cellsPerRow: number,
  paragraphStarts: ParagraphLineStarts | undefined,
  brailleSpace: string,
): PhysicalBrailleLineMeta[] {
  // Jumbo / large-print lines hold literal text, not braille words — one physical line, no spans.
  if (unicodeLine.startsWith('\u0002')) {
    return [{ spans: [] }];
  }

  const isPreformatted = unicodeLine.startsWith('\u0001');
  if (isPreformatted) {
    unicodeLine = unicodeLine.slice(1);
    const words = unicodeLine.split(brailleSpace).filter(w => w.length > 0);
    if (words.length === 0) return [{ spans: [] }];
    const spans: BrailleWordSpan[] = words.map((w, i) => ({
      wordIndex: i,
      charStart: 0,
      charEnd: w.length,
    }));
    return [{ spans }];
  }

  const cells = Math.max(1, cellsPerRow);
  const firstStart = paragraphStarts?.firstLineStartCell ?? 1;
  const runStart = paragraphStarts?.runoverStartCell ?? 1;
  const useParagraphStarts = firstStart > 1 || runStart > 1;

  if (!unicodeLine) return [];
  if (useParagraphStarts) {
    return wrapBrailleLineWithParagraphStartsMeta(
      unicodeLine,
      cells,
      firstStart,
      runStart,
      brailleSpace,
    );
  }
  if (unicodeLine.length <= cells) {
    const words = unicodeLine.split(brailleSpace).filter(w => w.length > 0);
    if (words.length === 0) return [{ spans: [] }];
    const spans: BrailleWordSpan[] = words.map((w, i) => ({
      wordIndex: i,
      charStart: 0,
      charEnd: w.length,
    }));
    return [{ spans }];
  }
  return wrapBrailleLineMeta(unicodeLine, cells, brailleSpace);
}

/**
 * Builds plain text for one source row so soft line breaks align with braille cell wrap.
 */
function syncPlainLineToBrailleWrap(
  sourceLine: string,
  unicodeBrailleLine: string,
  cellsPerRow: number,
  paragraphStarts: ParagraphLineStarts | undefined,
): string {
  // Jumbo / large-print lines are literal text; leave the source row untouched.
  if (unicodeBrailleLine.startsWith('\u0002')) {
    return sourceLine;
  }

  const isPreformatted = unicodeBrailleLine.startsWith('\u0001');
  if (isPreformatted) {
    unicodeBrailleLine = unicodeBrailleLine.slice(1);
  }

  const BRAILLE_SPACE = '\u2800';
  const canonicalSrc = sourceLine
    .replaceAll(SOFT_LINE_BREAK_CHAR, ' ')
    .replaceAll(LEGACY_SOFT_LINE_BREAK_CHAR, ' ');
  const srcWords = canonicalSrc.trim() === '' ? [] : canonicalSrc.trim().split(/\s+/);

  if (!unicodeBrailleLine.trim()) {
    return canonicalSrc;
  }

  const brfWords = unicodeBrailleLine.split(BRAILLE_SPACE).filter(w => w.length > 0);
  const physical = physicalLinesMetaForUnicodeLine(
    unicodeBrailleLine,
    cellsPerRow,
    paragraphStarts,
    BRAILLE_SPACE,
  );

  if (physical.length === 0) return canonicalSrc;

  const m = brfWords.length;
  const n = srcWords.length;

  if (n === 0) {
    return canonicalSrc;
  }

  const leadingSpace = canonicalSrc.match(/^\s*/)?.[0] ?? '';
  const trailingSpace = canonicalSrc.match(/\s*$/)?.[0] ?? '';

  if (m === n && n > 0) {
    const lineParts: string[] = [];
    for (let k = 0; k < physical.length; k++) {
      const pl = physical[k];
      const margin = paragraphStarts
        ? clampParagraphCell(k === 0 ? paragraphStarts.firstLineStartCell : paragraphStarts.runoverStartCell, cellsPerRow) - 1
        : 0;

      let currentLineStr = '';
      let lastPrintEnd = 0;
      let spanStartCell = margin;

      for (let idx = 0; idx < pl.spans.length; idx++) {
        const sp = pl.spans[idx];
        const printWord = sliceSrcForBrailleSpan(sp, brfWords, srcWords, m, n);
        
        // The braille start position of this word on the row
        const brailleStartCell = spanStartCell;
        
        // The target print start column: must be at least brailleStartCell,
        // and if there is a previous word, at least lastPrintEnd + 1 to keep a space gap.
        const printStartColumn = Math.max(brailleStartCell, lastPrintEnd + (idx > 0 ? 1 : 0));
        
        const spacesNeeded = printStartColumn - currentLineStr.length;
        if (spacesNeeded > 0) {
          currentLineStr += ' '.repeat(spacesNeeded);
        }
        currentLineStr += printWord;
        lastPrintEnd = currentLineStr.length;
        
        // Update spanStartCell for the next word: length of current braille word + 1 space separator
        spanStartCell += (sp.charEnd - sp.charStart) + 1;
      }
      lineParts.push(currentLineStr.trimEnd());
    }
    return leadingSpace + lineParts.join(SOFT_LINE_BREAK_CHAR) + trailingSpace;
  }

  const lineWeights = physical.map(pl => {
    let w = 0;
    for (const sp of pl.spans) {
      w += sp.charEnd - sp.charStart;
    }
    if (pl.spans.length > 1) w += pl.spans.length - 1;
    return Math.max(1, w);
  });

  const srcJoined = srcWords.join(' ');
  const outLines = splitSrcJoinedByBrailleWeights(srcJoined, lineWeights);
  const alignedOutLines = outLines.map((line, k) => {
    const margin = paragraphStarts
      ? clampParagraphCell(k === 0 ? paragraphStarts.firstLineStartCell : paragraphStarts.runoverStartCell, cellsPerRow) - 1
      : 0;
    return ' '.repeat(margin) + line;
  });

  return leadingSpace + alignedOutLines.join(SOFT_LINE_BREAK_CHAR) + trailingSpace;
}

/**
 * Inserts soft line breaks (`\\r`) between visual rows so plain text matches BRF word-wrap.
 * User newlines (`\\n`) stay paragraph boundaries; the worker turns soft breaks into spaces (see worker).
 */
export function buildPlainTextToMatchBrailleWrap(
  sourceText: string,
  asciiBrf: string,
  cellsPerRow: number,
  paragraphStarts?: ParagraphLineStarts,
): string {
  const srcSegs = sourceText.split('\f');
  const brfSegs = asciiBrf.split('\f');
  const maxSegs = Math.max(srcSegs.length, brfSegs.length);
  const outSegs: string[] = [];

  for (let sIdx = 0; sIdx < maxSegs; sIdx++) {
    const srcSeg = srcSegs[sIdx] ?? '';
    const brfSeg = brfSegs[sIdx] ?? '';

    const srcLines = srcSeg.split('\n');
    const brfLines = brfSeg.split('\n');
    const maxLines = Math.max(srcLines.length, brfLines.length);
    const outLines: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const s = srcLines[i] ?? '';
      const b = brfLines[i] ?? '';
      const unicode = asciiToUnicodeBraille(b);
      outLines.push(syncPlainLineToBrailleWrap(s, unicode, cellsPerRow, paragraphStarts));
    }
    outSegs.push(outLines.join('\n'));
  }

  return outSegs.join('\f');
}

function clampParagraphCell(n: number, cellsPerRow: number): number {
  const max = Math.max(1, cellsPerRow);
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/**
 * Word-wraps one logical line with literary paragraph margins: first physical line
 * starts at `firstLineStartCell`, continuation lines at `runoverStartCell` (1-based).
 * Each output line is prefix blanks + content, total width at most `cellsPerRow`.
 */
export function wrapBrailleLineWithParagraphStarts(
  line: string,
  cellsPerRow: number,
  firstLineStartCell: number,
  runoverStartCell: number,
  space: string,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const firstCell = clampParagraphCell(firstLineStartCell, cells);
  const runCell = clampParagraphCell(runoverStartCell, cells);
  const marginFirst = firstCell - 1;
  const marginRun = runCell - 1;
  const capFirst = Math.max(1, cells - marginFirst);
  const capRun = Math.max(1, cells - marginRun);

  const words = line.split(space);
  const result: string[] = [];
  let current = '';
  let onFirstLine = true;

  const margin = () => (onFirstLine ? marginFirst : marginRun);
  const cap = () => (onFirstLine ? capFirst : capRun);

  const pushCurrent = () => {
    if (current.length === 0) return;
    const m = margin();
    result.push(space.repeat(m) + current);
    current = '';
    onFirstLine = false;
  };

  for (const word of words) {
    if (word.length === 0) continue;

    if (word.length > cap()) {
      if (current.length > 0) pushCurrent();
      let remaining = word;
      while (remaining.length > 0) {
        const c = cap();
        const chunk = remaining.slice(0, c);
        remaining = remaining.slice(c);
        const m = margin();
        result.push(space.repeat(m) + chunk);
        onFirstLine = false;
      }
      continue;
    }

    const needed =
      current.length === 0 ? word.length : current.length + space.length + word.length;
    if (needed <= cap()) {
      current = current.length === 0 ? word : current + space + word;
    } else {
      pushCurrent();
      current = word;
    }
  }
  pushCurrent();
  return result;
}

function wrapBrailleLine(line: string, cells: number, space: string): string[] {
  const words = line.split(space);
  const result: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length === 0) continue; // skip empty segments (consecutive spaces)

    if (word.length > cells) {
      // Single word exceeds a full row — hard-break at the character limit
      if (current.length > 0) {
        result.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += cells) {
        const chunk = word.slice(i, i + cells);
        if (chunk.length === cells) {
          result.push(chunk);
        } else {
          current = chunk; // final partial chunk continues on next line
        }
      }
    } else {
      // Normal word — does it fit on the current line?
      const needed = current.length === 0
        ? word.length
        : current.length + 1 + word.length; // +1 for the space separator
      if (needed <= cells) {
        current = current.length === 0 ? word : current + space + word;
      } else {
        if (current.length > 0) result.push(current);
        current = word;
      }
    }
  }

  if (current.length > 0) result.push(current);
  return result;
}

/**
 * Converts a page number to ASCII braille notation (North American).
 * e.g. 1 -> '#a', 10 -> '#aj'
 */
function toBrailleNumber(num: number): string {
  let chars = '#';
  const s = num.toString();
  for (const c of s) {
    if (c === '0') chars += 'j';
    else chars += String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 10) - 1);
  }
  return chars;
}

/** Count consecutive `\n` characters at the end of a string. */
function countTrailingNewlines(text: string): number {
  let count = 0;
  for (let i = text.length - 1; i >= 0 && text[i] === '\n'; i--) count++;
  return count;
}

/**
 * Remove trailing blank lines beyond those implied by the source text ending.
 * Keeps Enter-created blank lines while still trimming spurious padding.
 */
function trimTrailingBlankLines(lines: string[], sourceText: string): void {
  const preserve = countTrailingNewlines(sourceText);
  let trailingBlanks = 0;
  for (let i = lines.length - 1; i >= 0 && lines[i] === ''; i--) trailingBlanks++;
  const remove = Math.max(0, trailingBlanks - preserve);
  for (let i = 0; i < remove; i++) lines.pop();
}

/**
 * One segment of Unicode braille (no form feeds). `firstPageNumber` is the 1-based
 * label for the first page of this segment when page numbers are shown.
 */
function formatBrfPagesSegment(
  unicodeBraille: string,
  cellsPerRow: number,
  linesPerPage: number,
  includePageNumbers: boolean,
  paragraphStarts: ParagraphLineStarts | undefined,
  firstPageNumber: number,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);

  // In Unicode braille, ASCII space (0x20) was converted to U+2800 (blank braille pattern)
  const BRAILLE_SPACE = '\u2800';

  const firstStart = paragraphStarts?.firstLineStartCell ?? 1;
  const runStart = paragraphStarts?.runoverStartCell ?? 1;
  const useParagraphStarts = firstStart > 1 || runStart > 1;

  const rawLines = unicodeBraille.split('\n');
  const wrappedLines: string[] = [];

  for (let line of rawLines) {
    // Jumbo / large-print lines carry literal text (marker + size header) — never wrap them
    // as braille; keep the marker so the renderer knows to show big print.
    if (line.startsWith('\u0002')) {
      wrappedLines.push(line);
      continue;
    }

    const isPreformatted = line.startsWith('\u0001');
    if (isPreformatted) {
      wrappedLines.push(line.slice(1));
      continue;
    }

    if (line.length === 0) {
      wrappedLines.push(''); // preserve blank lines (e.g. from Enter key presses)
    } else if (useParagraphStarts) {
      wrappedLines.push(
        ...wrapBrailleLineWithParagraphStarts(line, cells, firstStart, runStart, BRAILLE_SPACE),
      );
    } else if (line.length <= cells) {
      wrappedLines.push(line); // fits — no wrapping needed
    } else {
      wrappedLines.push(...wrapBrailleLine(line, cells, BRAILLE_SPACE));
    }
  }

  trimTrailingBlankLines(wrappedLines, unicodeBraille);

  if (wrappedLines.length === 0) return [''];

  const pages: string[] = [];
  const contentLines = includePageNumbers ? Math.max(1, lines - 1) : lines;

  for (let i = 0; i < wrappedLines.length; i += contentLines) {
    const chunk = wrappedLines.slice(i, i + contentLines);
    if (includePageNumbers) {
      // Pad to standard size so page number goes to the bottom
      while (chunk.length < contentLines) {
        chunk.push('');
      }
      const pageNumStr = toBrailleNumber(firstPageNumber + Math.floor(i / contentLines));
      const unicodePageNum = pageNumStr.split('').map(c => String.fromCharCode(c.charCodeAt(0) - 0x20 + 0x2800)).join('');
      chunk.push(unicodePageNum.padStart(cells, BRAILLE_SPACE));
    }
    pages.push(chunk.join('\n'));
  }
  return pages;
}

/**
 * Formats a Unicode braille string into an array of page strings for display.
 * Each page contains at most linesPerPage lines; each line is at most cellsPerRow
 * characters wide. Lines that exceed cellsPerRow are word-wrapped — whole braille
 * words move to the next line. Only words longer than cellsPerRow are hard-broken.
 *
 * Form feed (`\f`) starts a new pagination block: content after each `\f` begins on a
 * new page sequence (e.g. chart after summary).
 */
export function formatBrfPages(
  unicodeBraille: string,
  cellsPerRow: number,
  linesPerPage: number,
  includePageNumbers: boolean = false,
  paragraphStarts?: ParagraphLineStarts,
): string[] {
  if (!unicodeBraille.includes('\f')) {
    return formatBrfPagesSegment(
      unicodeBraille,
      cellsPerRow,
      linesPerPage,
      includePageNumbers,
      paragraphStarts,
      1,
    );
  }

  const segments = unicodeBraille.split('\f');
  const allPages: string[] = [];
  let nextPageNum = 1;
  for (const seg of segments) {
    const pages = formatBrfPagesSegment(
      seg,
      cellsPerRow,
      linesPerPage,
      includePageNumbers,
      paragraphStarts,
      nextPageNum,
    );
    nextPageNum += pages.length;
    allPages.push(...pages);
  }
  return allPages.length > 0 ? allPages : [''];
}

/**
 * Normalizes a BRF buffer: CRLF → LF, form feeds → blank line (page gap),
 * then Unicode braille cells → North American ASCII BRF.
 */
export function normalizeImportedBrf(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\f/g, '\n\n');
  return unicodeBrailleToAscii(normalized);
}

/** Default download name; includes time so same-day exports do not overwrite in the browser. */
export function defaultBrfDownloadFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `braille-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.brf`;
}

/** Formatted ASCII BRF ready for download or email-attach workflow. */
export type BrfDownloadPayload = {
  filename: string;
  blob: Blob;
  formatted: string;
};

/**
 * Builds the same embosser-friendly BRF blob used by Download BRF and Email BRF.
 */
export function buildBrfDownloadPayload(
  rawBrf: string,
  cellsPerRow: number,
  linesPerPage: number,
  includePageNumbers: boolean = false,
  paragraphStarts?: ParagraphLineStarts,
): BrfDownloadPayload {
  const formatted = formatBrfForOutput(
    rawBrf,
    cellsPerRow,
    linesPerPage,
    includePageNumbers,
    paragraphStarts,
  );
  const blob = new Blob([formatted], { type: 'text/plain;charset=us-ascii' });
  return { filename: defaultBrfDownloadFilename(), blob, formatted };
}

/** Triggers a browser file download from a Blob. */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Gmail web compose URL with subject/body prefilled.
 * Attachments cannot be injected by the browser without OAuth.
 */
export function buildGmailComposeUrl(subject: string, body: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

/** Default name for the left-pane print-layout text export. */
export function defaultPrintLayoutTextFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `print-layout-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.rtf`;
}

/** Default name for the grading print-layout text export. */
export function defaultGradingPrintLayoutFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `grading-print-layout-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.rtf`;
}

/** Default name for Festival MP3 audio export. */
export function defaultMp3DownloadFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `speech-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mp3`;
}

export type ConvertToRtfOptions = {
  /**
   * Inner text already contains RTF control words (`\\fs`, `\\uN?`) and escaped
   * specials. Skip character escaping so mid-line size runs stay intact.
   */
  bodyIsRtf?: boolean;
  /** When set, emit paper size, margins, Courier pitch, and line spacing that fill the sheet. */
  page?: PrintLayoutPageMetrics;
};

function rtfParagraphReset(metrics: PrintLayoutPageMetrics): string {
  return `\\pard\\sa0\\sb0\\sl${metrics.slTwips}\\slmult0\\nowidctlpar\\hyphpar0\\f0\\fs${metrics.fsBase}`;
}

function rtfDocumentOpen(metrics?: PrintLayoutPageMetrics): string {
  const fonttbl = '{\\fonttbl{\\f0\\fmodern\\fprq1\\fcharset0 Courier New;}}';
  if (!metrics) {
    return `{\\rtf1\\ansi\\deff0\r\n${fonttbl}\r\n\\viewkind4\\uc1\\pard\\f0\\fs24\r\n`;
  }
  return (
    `{\\rtf1\\ansi\\deff0\r\n${fonttbl}\r\n` +
    `\\paperw${metrics.paperWidthTwips}\\paperh${metrics.paperHeightTwips}` +
    `\\margl${metrics.marginLeftTwips}\\margr${metrics.marginRightTwips}` +
    `\\margt${metrics.marginTopTwips}\\margb${metrics.marginBottomTwips}` +
    `\\viewkind4\\uc1\r\n` +
    `\\sectd\\pgwsxn${metrics.paperWidthTwips}\\pghsxn${metrics.paperHeightTwips}` +
    `\\marglsxn${metrics.marginLeftTwips}\\margrsxn${metrics.marginRightTwips}` +
    `\\margtsxn${metrics.marginTopTwips}\\margbsxn${metrics.marginBottomTwips}\r\n` +
    `${rtfParagraphReset(metrics)}\r\n`
  );
}

/** True when `text` already has RTF runs we must not re-escape. */
function rtfBodyHasControlWords(text: string): boolean {
  return /\\fs\d+|\\u-?\d+\?/.test(text);
}

/**
 * Escapes RTF specials and emits `\\uN?` for non-ASCII. Leaves `\n` `\r` `\f`
 * for {@link convertToRtf} to turn into `\par` / `\page`.
 */
export function escapeRtfPlainText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (ch === '\\') {
      out += '\\\\';
      continue;
    }
    if (ch === '{') {
      out += '\\{';
      continue;
    }
    if (ch === '}') {
      out += '\\}';
      continue;
    }
    if (code === 10 || code === 13 || code === 12) {
      out += ch;
      continue;
    }
    if (code <= 0x7f) {
      out += ch;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const hiSigned = code > 32767 ? code - 65536 : code;
        const loSigned = low > 32767 ? low - 65536 : low;
        out += `\\u${hiSigned}?\\u${loSigned}?`;
        i++;
        continue;
      }
    }
    const signed = code > 32767 ? code - 65536 : code;
    out += `\\u${signed}?`;
  }
  return out;
}

/**
 * Converts a plain text string (or a pre-built RTF body with `\\fs` runs) to RTF
 * using Courier New. Escapes `\\ { }` and non-ASCII unless `bodyIsRtf` is set.
 * Newlines become `\par`; form feeds become `\page`.
 * With `page` metrics, paper size / margins / character pitch / line spacing fill the sheet
 * so each cell column and braille row maps onto the printable area.
 */
export function convertToRtf(text: string, options?: ConvertToRtfOptions): string {
  const bodyIsRtf = options?.bodyIsRtf === true || rtfBodyHasControlWords(text);
  const prepared = bodyIsRtf ? text : escapeRtfPlainText(text);
  const metrics = options?.page;
  const pageBreak = metrics ? `\\page${rtfParagraphReset(metrics)}\r\n` : '\\page\r\n';

  const formFeedsReplaced = prepared.replace(/\f/g, pageBreak);
  const lines = formFeedsReplaced.replace(/\r\n/g, '\n').split(/[\n\r]/);
  const rtfContent = lines.join('\\par\r\n');

  return `${rtfDocumentOpen(metrics)}${rtfContent}\\par\r\n}`;
}



/**
 * Converts editor buffer (soft breaks = {@link SOFT_LINE_BREAK_CHAR}, user lines = \\n) to plain text
 * suitable for printing: one file line per visual row so layout matches the braille preview.
 */
export function formatPlainTextForPrintDownload(editorContent: string): string {
  return editorContent
    .replaceAll('\r\n', '\n')
    .replaceAll(LEGACY_SOFT_LINE_BREAK_CHAR, '\n')
    .replaceAll(SOFT_LINE_BREAK_CHAR, '\n');
}

function printLineFromPhysicalSpans(
  pl: PhysicalBrailleLineMeta,
  brfWords: string[],
  srcWords: string[],
  m: number,
  n: number,
  margin: number,
): string {
  const parts: string[] = [];
  for (const sp of pl.spans) {
    const printWord = sliceSrcForBrailleSpan(sp, brfWords, srcWords, m, n);
    if (printWord.length > 0) parts.push(printWord);
  }
  return (' '.repeat(margin) + parts.join(' ')).replace(/\s+$/, '');
}

/**
 * One print row per visual braille row. Words on a print line are the literary
 * words that belong to that braille line, joined with a single space at one font
 * size (no per-word `\fs` scaling, no cell-column padding).
 */
function syncPlainLineToPrintRows(
  sourceLine: string,
  unicodeBrailleLine: string,
  cellsPerRow: number,
  paragraphStarts: ParagraphLineStarts | undefined,
): string[] {
  if (unicodeBrailleLine.startsWith('\u0002')) {
    const visual = formatPlainTextForPrintDownload(sourceLine);
    return visual.split('\n').map(line => escapeRtfPlainText(line));
  }

  const BRAILLE_SPACE = '\u2800';
  const canonicalSrc = sourceLine
    .replaceAll(SOFT_LINE_BREAK_CHAR, ' ')
    .replaceAll(LEGACY_SOFT_LINE_BREAK_CHAR, ' ');
  const srcWords = canonicalSrc.trim() === '' ? [] : canonicalSrc.trim().split(/\s+/);
  const brfWords = unicodeBrailleLine.replace(/^\u0001/, '').split(BRAILLE_SPACE).filter(w => w.length > 0);
  const m = brfWords.length;
  const n = srcWords.length;

  if (n === 0 || !unicodeBrailleLine.trim() || m !== n) {
    const plain = syncPlainLineToBrailleWrap(sourceLine, unicodeBrailleLine, cellsPerRow, paragraphStarts);
    const visual = formatPlainTextForPrintDownload(plain);
    return visual.split('\n').map(line => escapeRtfPlainText(line));
  }

  const physical = physicalLinesMetaForUnicodeLine(
    unicodeBrailleLine,
    cellsPerRow,
    paragraphStarts,
    BRAILLE_SPACE,
  );
  if (physical.length === 0) {
    return [escapeRtfPlainText(canonicalSrc)];
  }

  const leadingSpace = canonicalSrc.match(/^\s*/)?.[0] ?? '';
  const trailingSpace = canonicalSrc.match(/\s*$/)?.[0] ?? '';
  const rows: string[] = [];
  for (let k = 0; k < physical.length; k++) {
    const margin = paragraphStarts
      ? clampParagraphCell(k === 0 ? paragraphStarts.firstLineStartCell : paragraphStarts.runoverStartCell, cellsPerRow) - 1
      : 0;
    let line = printLineFromPhysicalSpans(physical[k], brfWords, srcWords, m, n, margin);
    if (k === 0 && leadingSpace) line = leadingSpace + line;
    if (k === physical.length - 1 && trailingSpace) line += trailingSpace;
    rows.push(escapeRtfPlainText(line));
  }
  return rows;
}

/**
 * Builds one RTF inner line per visual braille row (soft breaks become newlines).
 * Source form feeds stay as `\f`. Each print line holds the same words as that
 * braille line, at one font size, with ordinary spaces between words.
 */
export function buildPrintLayoutRtfBody(
  sourceText: string,
  asciiBrf: string,
  cellsPerRow: number,
  paragraphStarts?: ParagraphLineStarts,
): string {
  const srcSegs = sourceText.split('\f');
  const brfSegs = asciiBrf.split('\f');
  const maxSegs = Math.max(srcSegs.length, brfSegs.length);
  const outSegs: string[] = [];

  for (let sIdx = 0; sIdx < maxSegs; sIdx++) {
    const srcSeg = srcSegs[sIdx] ?? '';
    const brfSeg = brfSegs[sIdx] ?? '';
    const srcLines = srcSeg.split('\n');
    const brfLines = brfSeg.split('\n');
    const maxLines = Math.max(srcLines.length, brfLines.length);
    const outLines: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const s = srcLines[i] ?? '';
      const b = brfLines[i] ?? '';
      const unicode = asciiToUnicodeBraille(b);
      outLines.push(...syncPlainLineToPrintRows(s, unicode, cellsPerRow, paragraphStarts));
    }
    outSegs.push(outLines.join('\n'));
  }

  return outSegs.join('\f');
}

export type BuildPrintLayoutRtfOptions = {
  cellsPerRow: number;
  linesPerPage: number;
  paperFormat?: PrintLayoutPaperFormat;
  includePageNumbers?: boolean;
  paragraphStarts?: ParagraphLineStarts;
};

/**
 * Paginated RTF whose line spacing matches the embossed page. Each print row is
 * one braille row (same words). Font is one size, shrunk if needed so Word cannot
 * wrap a long print line onto a second row.
 */
export function buildPrintLayoutRtf(
  sourceText: string,
  asciiBrf: string,
  options: BuildPrintLayoutRtfOptions,
): string {
  const metrics = printLayoutPageMetrics({
    cellsPerRow: options.cellsPerRow,
    linesPerPage: options.linesPerPage,
    paperFormat: options.paperFormat,
  });
  const inner = buildPrintLayoutRtfBody(
    sourceText,
    asciiBrf,
    options.cellsPerRow,
    options.paragraphStarts,
  );
  const paginated = paginatePrintLines(
    inner,
    options.linesPerPage,
    options.includePageNumbers ?? false,
    options.cellsPerRow,
  );
  const page = fitPrintLayoutFontToLongestLine(metrics, maxPrintLineVisualLength(paginated));
  return convertToRtf(paginated, { bodyIsRtf: true, page });
}

function wrapPlainLineToCells(line: string, cellsPerRow: number): string[] {
  const w = Math.max(1, cellsPerRow);
  if (line.length <= w) return [line];
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length <= w) {
      current = trial;
    } else {
      if (current) out.push(current);
      current = word.length > w ? word.slice(0, w) : word;
    }
  }
  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

/** Grading header wrapped to the braille cell width so it fits the print-over-braille grid. */
export function formatGradingSheetHeader(
  cellsPerRow: number,
  wordCount: number,
  charCount: number,
): string {
  const w = Math.max(1, cellsPerRow);
  const sep = '='.repeat(w);
  const lines: string[] = [sep, 'GRADING SHEET', sep];
  lines.push(...wrapPlainLineToCells(`Word Count: ${wordCount}`, w));
  lines.push(...wrapPlainLineToCells(`Character Count: ${charCount}`, w));
  lines.push('');
  lines.push(...wrapPlainLineToCells('Date: _________________', w));
  lines.push(
    ...wrapPlainLineToCells('WPM:  _________________ (number of words/total seconds*60)', w),
  );
  lines.push(
    ...wrapPlainLineToCells('LPM:  _________________ (number of letters/total seconds*60)', w),
  );
  lines.push(...wrapPlainLineToCells('Accuracy: _____________ %', w));
  lines.push(sep, '');
  return lines.join('\n');
}

export function buildGradingPrintLayoutRtf(
  sourceText: string,
  asciiBrf: string,
  wordCount: number,
  charCount: number,
  gradingSheetOnAllPages: boolean,
  options: BuildPrintLayoutRtfOptions,
): string {
  const metrics = printLayoutPageMetrics({
    cellsPerRow: options.cellsPerRow,
    linesPerPage: options.linesPerPage,
    paperFormat: options.paperFormat,
  });
  const inner = buildPrintLayoutRtfBody(
    sourceText,
    asciiBrf,
    options.cellsPerRow,
    options.paragraphStarts,
  );
  const paginated = paginatePrintLines(
    inner,
    options.linesPerPage,
    options.includePageNumbers ?? false,
    options.cellsPerRow,
  );
  const header = formatGradingSheetHeader(options.cellsPerRow, wordCount, charCount);
  const fullContent = gradingSheetOnAllPages
    ? paginated.split('\f').map(page => header + page).join('\f')
    : header + paginated;
  const page = fitPrintLayoutFontToLongestLine(metrics, maxPrintLineVisualLength(fullContent));
  return convertToRtf(fullContent, { bodyIsRtf: true, page });
}

function paginatePrintSegment(
  segment: string,
  linesPerPage: number,
  includePageNumbers: boolean,
  cellsPerRow: number,
  firstPageNumber: number,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);
  const wrapped = segment.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  while (wrapped.length > 0 && wrapped[wrapped.length - 1] === '') {
    wrapped.pop();
  }

  const pageChunks: string[] = [];
  const contentLines = includePageNumbers ? Math.max(1, lines - 1) : lines;

  for (let i = 0; i < wrapped.length; i += contentLines) {
    const chunk = wrapped.slice(i, i + contentLines);
    if (includePageNumbers) {
      while (chunk.length < contentLines) {
        chunk.push('');
      }
      const pageNumStr = String(firstPageNumber + Math.floor(i / contentLines));
      chunk.push(pageNumStr.padStart(cells, ' '));
    }
    pageChunks.push(chunk.join('\n'));
  }

  return pageChunks;
}

/**
 * Paginates wrapped print lines the same way BRF does: `linesPerPage` content
 * lines (or `linesPerPage - 1` when page numbers are on), joined with `\f`.
 * Source `\f` starts a new pagination block. Page numbers are Arabic, right-aligned
 * to `cellsPerRow`.
 */
export function paginatePrintLines(
  text: string,
  linesPerPage: number,
  includePageNumbers: boolean,
  cellsPerRow: number,
): string {
  if (!text.includes('\f')) {
    return paginatePrintSegment(text, linesPerPage, includePageNumbers, cellsPerRow, 1).join('\f');
  }

  const segments = text.split('\f');
  const allChunks: string[] = [];
  let nextPageNum = 1;
  for (const seg of segments) {
    const pageChunks = paginatePrintSegment(seg, linesPerPage, includePageNumbers, cellsPerRow, nextPageNum);
    nextPageNum += pageChunks.length;
    allChunks.push(...pageChunks);
  }
  return allChunks.join('\f');
}

/**
 * Formats raw ASCII BRF for download / embosser printing.
 * Hard-wraps at cellsPerRow using word-aware wrapping, paginates with
 * form-feed characters (0x0C), and uses CRLF line endings as required
 * by most embosser drivers.
 */
function formatBrfForOutputSegment(
  rawBrf: string,
  cellsPerRow: number,
  linesPerPage: number,
  includePageNumbers: boolean,
  paragraphStarts: ParagraphLineStarts | undefined,
  firstPageNumber: number,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);

  const firstStart = paragraphStarts?.firstLineStartCell ?? 1;
  const runStart = paragraphStarts?.runoverStartCell ?? 1;
  const useParagraphStarts = firstStart > 1 || runStart > 1;

  const rawLines = rawBrf.split('\n');
  const wrapped: string[] = [];

  for (let line of rawLines) {
    // Jumbo / large-print lines are plain text, not braille. For exported output we drop the
    // marker + size header and emit the readable text rather than braille dots.
    if (line.startsWith('\u0002')) {
      const rest = line.slice(1);
      const sep = rest.indexOf('\u0002');
      wrapped.push(sep >= 0 ? rest.slice(sep + 1) : rest);
      continue;
    }

    const isPreformatted = line.startsWith('\u0001');
    if (isPreformatted) {
      wrapped.push(line.slice(1));
      continue;
    }

    if (!line) {
      wrapped.push('');
      continue;
    }
    if (useParagraphStarts) {
      wrapped.push(...wrapBrailleLineWithParagraphStarts(line, cells, firstStart, runStart, ' '));
    } else if (line.length <= cells) {
      wrapped.push(line);
    } else {
      wrapped.push(...wrapBrailleLine(line, cells, ' '));
    }
  }

  trimTrailingBlankLines(wrapped, rawBrf);

  const pageChunks: string[] = [];
  const contentLines = includePageNumbers ? Math.max(1, lines - 1) : lines;

  for (let i = 0; i < wrapped.length; i += contentLines) {
    const chunk = wrapped.slice(i, i + contentLines);
    if (includePageNumbers) {
      // Pad to standard size so page number goes to the bottom
      while (chunk.length < contentLines) {
        chunk.push('');
      }
      const pageNumStr = toBrailleNumber(firstPageNumber + Math.floor(i / contentLines));
      chunk.push(pageNumStr.padStart(cells, ' '));
    }
    pageChunks.push(chunk.join('\r\n'));
  }

  return pageChunks;
}

/**
 * Form feed (`\f`) in the raw BRF starts a new pagination block before resuming
 * line-based paging.
 */
export function formatBrfForOutput(
  rawBrf: string,
  cellsPerRow: number,
  linesPerPage: number,
  includePageNumbers: boolean = false,
  paragraphStarts?: ParagraphLineStarts,
): string {
  if (!rawBrf.includes('\f')) {
    const one = formatBrfForOutputSegment(
      rawBrf,
      cellsPerRow,
      linesPerPage,
      includePageNumbers,
      paragraphStarts,
      1,
    );
    return (one.join('\r\n\f') + '\r\n').replace(/\|/g, '\\');
  }

  const segments = rawBrf.split('\f');
  const allChunks: string[] = [];
  let nextPageNum = 1;
  for (const seg of segments) {
    const pageChunks = formatBrfForOutputSegment(
      seg,
      cellsPerRow,
      linesPerPage,
      includePageNumbers,
      paragraphStarts,
      nextPageNum,
    );
    nextPageNum += pageChunks.length;
    allChunks.push(...pageChunks);
  }

  return (allChunks.join('\r\n\f') + '\r\n').replace(/\|/g, '\\');
}
