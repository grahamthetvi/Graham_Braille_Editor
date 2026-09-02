/**
 * Precompute paginated BRF preview structure (word indices, jumbo lines)
 * so highlight updates do not walk the full cell tree during render.
 */

import { JUMBO_LINE_MARKER } from '../../utils/braille';

export type BrfSpaceSegment = { type: 'space'; chars: string[] };
export type BrfWordSegment = { type: 'word'; wordIndex: number; chars: string[] };
export type BrfCellSegment = BrfSpaceSegment | BrfWordSegment;

export type BrfLineModel =
  | { kind: 'jumbo'; sizePx: number; chars: string[] }
  | { kind: 'cells'; segments: BrfCellSegment[] };

export type BrfPageModel = {
  pageIndex: number;
  lines: BrfLineModel[];
};

export function buildBrfPageModels(pages: string[]): BrfPageModel[] {
  let wordIndex = 0;
  return pages.map((pageContent, pageIndex) => {
    const rawLines = pageContent.split('\n');
    const lines: BrfLineModel[] = rawLines.map((line) => {
      if (line.startsWith(JUMBO_LINE_MARKER)) {
        const rest = line.slice(1);
        const sep = rest.indexOf(JUMBO_LINE_MARKER);
        const sizeStr = sep >= 0 ? rest.slice(0, sep) : '';
        const text = sep >= 0 ? rest.slice(sep + 1) : rest;
        const sizePx = Math.min(400, Math.max(8, parseInt(sizeStr, 10) || 48));
        return { kind: 'jumbo', sizePx, chars: text.length ? Array.from(text) : [] };
      }

      if (!line) {
        return { kind: 'cells', segments: [{ type: 'space', chars: ['\u2800'] }] };
      }

      const tokens = line.split(/([\s\u2800]+)/);
      const segments: BrfCellSegment[] = [];
      for (const token of tokens) {
        if (!token) continue;
        if (/^[\s\u2800]+$/.test(token)) {
          segments.push({ type: 'space', chars: Array.from(token) });
        } else {
          segments.push({
            type: 'word',
            wordIndex: wordIndex++,
            chars: Array.from(token),
          });
        }
      }
      return { kind: 'cells', segments };
    });
    return { pageIndex, lines };
  });
}
