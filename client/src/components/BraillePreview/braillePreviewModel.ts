/**
 * Precompute paginated BRF preview structure (word indices, jumbo lines)
 * so highlight updates do not walk the full cell tree during render.
 */

import { JUMBO_LINE_MARKER, asciiToUnicodeBraille } from '../../utils/braille';

export type BrfSpaceSegment = { type: 'space'; chars: string[] };
export type BrfWordSegment = { type: 'word'; wordIndex: number; chars: string[] };
export type BrfCellSegment = BrfSpaceSegment | BrfWordSegment;

export type BrfLineModel =
  | { kind: 'jumbo'; sizePx: number; chars: string[] }
  | { kind: 'cells'; segments: BrfCellSegment[] }
  | { kind: 'blank' }
  /** Page-number footer — rendered but excluded from word-index sync. */
  | { kind: 'pageNumber'; chars: string[] };

export type BrfPageModel = {
  pageIndex: number;
  lines: BrfLineModel[];
};

export type BuildBrfPageModelsOptions = {
  /**
   * When true, the last line of each page is treated as a page-number footer
   * (from formatBrfPages) and does not consume word indices.
   */
  skipTrailingPageNumbers?: boolean;
};

const BRAILLE_HYPHEN = asciiToUnicodeBraille('-');

function tokenEndsWithHyphen(token: string): boolean {
  if (!token) return false;
  const last = token[token.length - 1];
  return last === '-' || last === BRAILLE_HYPHEN;
}

export function buildBrfPageModels(
  pages: string[],
  options?: BuildBrfPageModelsOptions,
): BrfPageModel[] {
  let wordIndex = 0;
  let continueHyphenatedWord = false;

  return pages.map((pageContent, pageIndex) => {
    const rawLines = pageContent.split('\n');
    const lines: BrfLineModel[] = rawLines.map((line, lineIdx) => {
      if (line.startsWith(JUMBO_LINE_MARKER)) {
        const rest = line.slice(1);
        const sep = rest.indexOf(JUMBO_LINE_MARKER);
        const sizeStr = sep >= 0 ? rest.slice(0, sep) : '';
        const text = sep >= 0 ? rest.slice(sep + 1) : rest;
        const sizePx = Math.min(400, Math.max(8, parseInt(sizeStr, 10) || 48));
        continueHyphenatedWord = false;
        return { kind: 'jumbo', sizePx, chars: text.length ? Array.from(text) : [] };
      }

      const isLast = lineIdx === rawLines.length - 1;
      if (options?.skipTrailingPageNumbers && isLast) {
        continueHyphenatedWord = false;
        return { kind: 'pageNumber', chars: line.length ? Array.from(line) : [] };
      }

      // Empty source line (Enter) or a line of only blank cells — keep a distinct row.
      if (!line || /^[\s\u2800]+$/.test(line)) {
        continueHyphenatedWord = false;
        return { kind: 'blank' };
      }

      const tokens = line.split(/([\s\u2800]+)/);
      const segments: BrfCellSegment[] = [];
      for (const token of tokens) {
        if (!token) continue;
        if (/^[\s\u2800]+$/.test(token)) {
          segments.push({ type: 'space', chars: Array.from(token) });
          continue;
        }

        let index: number;
        if (continueHyphenatedWord) {
          // Second half of a hyphenated wrap — same logical BRF word as wordMap.
          index = Math.max(0, wordIndex - 1);
          continueHyphenatedWord = false;
        } else {
          index = wordIndex++;
        }
        if (tokenEndsWithHyphen(token)) {
          continueHyphenatedWord = true;
        }
        segments.push({
          type: 'word',
          wordIndex: index,
          chars: Array.from(token),
        });
      }
      return { kind: 'cells', segments };
    });
    return { pageIndex, lines };
  });
}

/** Cell height + CSS `--braille-line-gap` (0.5 × cell). */
export function brailleLineHeightPx(brailleSize: number): number {
  return brailleSize + brailleSize * 0.5;
}

export function brailleLineCount(models: BrfPageModel[]): number {
  return models.reduce((n, page) => n + page.lines.length, 0);
}

function heightOfLine(line: BrfLineModel, lineH: number): number {
  if (line.kind === 'jumbo') return line.sizePx + line.sizePx * 0.5;
  return lineH;
}

export function braillePageHeights(models: BrfPageModel[], brailleSize: number): number[] {
  const lineH = brailleLineHeightPx(brailleSize);
  return models.map((page) => {
    let h = 0;
    for (const line of page.lines) h += heightOfLine(line, lineH);
    return Math.max(h, lineH);
  });
}

export function brailleYForLineIndex(
  models: BrfPageModel[],
  brailleSize: number,
  lineIndex0: number,
  fracInLine = 0,
): number {
  const lineH = brailleLineHeightPx(brailleSize);
  let i = 0;
  let y = 0;
  for (const page of models) {
    for (const line of page.lines) {
      const h = heightOfLine(line, lineH);
      if (i === lineIndex0) return y + h * Math.max(0, Math.min(1, fracInLine));
      y += h;
      i += 1;
    }
  }
  return y;
}

export function brailleLineAtY(
  models: BrfPageModel[],
  brailleSize: number,
  y: number,
): { lineIndex0: number; frac: number } {
  const lineH = brailleLineHeightPx(brailleSize);
  let i = 0;
  let top = 0;
  const total = brailleLineCount(models);
  for (const page of models) {
    for (const line of page.lines) {
      const h = heightOfLine(line, lineH);
      if (y < top + h || i === total - 1) {
        return { lineIndex0: i, frac: h > 0 ? Math.max(0, Math.min(1, (y - top) / h)) : 0 };
      }
      top += h;
      i += 1;
    }
  }
  return { lineIndex0: Math.max(0, total - 1), frac: 0 };
}
