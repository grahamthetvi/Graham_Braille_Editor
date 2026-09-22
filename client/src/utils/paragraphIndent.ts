/**
 * Per-paragraph braille cell indentation markers in print source.
 *
 * Layout settings use global first-line / runover start cells (1–5).
 * A selection can override that with a line-leading `{p:F-R}` marker
 * (e.g. `{p:3-5}Hello`), matching the same cell counts. The braille worker
 * strips the marker, translates the rest, and prefixes the BRF line with a
 * private sentinel so formatBrfPages can apply those starts only to that line.
 */

export type ParagraphIndent = {
  firstLineStartCell: number;
  runoverStartCell: number;
};

/** Private-use sentinel: `\u0004` + first digit + run digit + `\u0004`. */
export const PARAGRAPH_INDENT_BRF_MARKER = '\u0004';

const MARKER_RE = /^\{p:([1-5])-([1-5])\}/;
const BRF_MARKER_RE = /^\u0004([1-5])([1-5])\u0004/;

export function clampIndentCell(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export function formatParagraphIndentMarker(indent: ParagraphIndent): string {
  const first = clampIndentCell(indent.firstLineStartCell);
  const run = clampIndentCell(indent.runoverStartCell);
  return `{p:${first}-${run}}`;
}

export function parseParagraphIndentPrefix(line: string): {
  indent: ParagraphIndent | null;
  rest: string;
  markerLength: number;
} {
  const m = MARKER_RE.exec(line);
  if (!m) return { indent: null, rest: line, markerLength: 0 };
  return {
    indent: {
      firstLineStartCell: Number(m[1]),
      runoverStartCell: Number(m[2]),
    },
    rest: line.slice(m[0].length),
    markerLength: m[0].length,
  };
}

export function stripParagraphIndentMarker(line: string): string {
  return parseParagraphIndentPrefix(line).rest;
}

export function encodeParagraphIndentBrfPrefix(indent: ParagraphIndent): string {
  const first = clampIndentCell(indent.firstLineStartCell);
  const run = clampIndentCell(indent.runoverStartCell);
  return `${PARAGRAPH_INDENT_BRF_MARKER}${first}${run}${PARAGRAPH_INDENT_BRF_MARKER}`;
}

export function parseParagraphIndentBrfPrefix(line: string): {
  indent: ParagraphIndent | null;
  rest: string;
} {
  const m = BRF_MARKER_RE.exec(line);
  if (!m) return { indent: null, rest: line };
  return {
    indent: {
      firstLineStartCell: Number(m[1]),
      runoverStartCell: Number(m[2]),
    },
    rest: line.slice(m[0].length),
  };
}

/**
 * Apply `{p:F-R}` to every paragraph (line) intersecting [selStart, selEnd].
 * Replaces any existing marker on those lines.
 */
export function applyParagraphIndentToRange(
  text: string,
  selStart: number,
  selEnd: number,
  indent: ParagraphIndent,
): { text: string; selStart: number; selEnd: number } {
  const start = Math.max(0, Math.min(selStart, selEnd, text.length));
  const end = Math.max(0, Math.min(Math.max(selStart, selEnd), text.length));
  const marker = formatParagraphIndentMarker(indent);

  // Expand to full lines that intersect the selection.
  let lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd < 0) lineEnd = text.length;

  const before = text.slice(0, lineStart);
  const mid = text.slice(lineStart, lineEnd);
  const after = text.slice(lineEnd);

  const lines = mid.split('\n');
  const updated = lines.map((line) => {
    const { rest } = parseParagraphIndentPrefix(line);
    // Blank lines keep no marker (Enter-only spacing).
    if (!rest.trim()) return rest;
    return marker + rest;
  });

  const newMid = updated.join('\n');
  const newText = before + newMid + after;
  return {
    text: newText,
    selStart: lineStart,
    selEnd: lineStart + newMid.length,
  };
}
