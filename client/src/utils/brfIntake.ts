/**
 * Unified BRF intake: normalize → classify → route decisions for import,
 * paste, and session restore.
 *
 * Music Player Mode is an explicit user choice (toolbar toggle, session restore
 * of a session saved in that mode, or importing while Music mode is already on).
 * Content is never classified as music by heuristic.
 */

import { isPredominantlyUnicodeBraille, unicodeBrailleToAscii } from './braille';
import { normalizeImportedBrf } from './brailleFormat';

/** Canonical buffer form used by playback, export, and literary round-trip. */
export type ContentKind = 'music-brf' | 'literary-brf' | 'plain';

export interface ClassifyBrfOptions {
  /** True when the source is a `.brf` file (ASCII literary BRF still routes as literary). */
  isBrfFile?: boolean;
  /** Whether to unwrap runover continuation lines based on indentation (default: true). */
  unwrap?: boolean;
  /** Whether to strip embossed page numbers and padding blank lines (default: true). */
  stripPageNumbers?: boolean;
}

export interface ClassifyBrfResult {
  kind: ContentKind;
  /** Line-ending + Unicode→ASCII normalized buffer. */
  normalized: string;
  /** True if Grade 2 contractions are detected in the BRF content. */
  isContracted: boolean;
  /** Normalized buffer with embossed page numbers, padding, and runovers cleaned. */
  cleaned: string;
}

/** Alias: same as {@link normalizeImportedBrf}. */
export const normalizeBrfBuffer = normalizeImportedBrf;

/**
 * Parses a Braille page number representation (e.g. "A" -> 1, "AJ" -> 10, "#1" -> 1).
 * In Braille ASCII, digits 1-9,0 are represented as letters a-j / A-J (dots 1, 1-2, 1-4, etc.).
 */
export function parseBraillePageNumber(token: string): number | null {
  const clean = token.replace(/^#/, '');
  if (!clean) return null;
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  if (/^[a-jA-J]+$/.test(clean)) {
    const map: Record<string, string> = {
      a: '1', b: '2', c: '3', d: '4', e: '5',
      f: '6', g: '7', h: '8', i: '9', j: '0',
    };
    const digits = clean.toLowerCase().split('').map((ch) => map[ch]).join('');
    const num = parseInt(digits, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Detects whether a BRF buffer contains Grade 2 (contracted) braille rather than
 * Grade 1 (uncontracted) braille.
 */
export function isContractedBrf(raw: string): boolean {
  if (!raw || !raw.trim()) return false;
  const ascii = isPredominantlyUnicodeBraille(raw) ? unicodeBrailleToAscii(raw) : raw;

  // Standalone strong word contractions: & (and), = (for), ! (the), ( (of), ? (with)
  const strongWords = (ascii.match(/(?:^|[\s"'])(?:[&=(?!])(?=[\s"',.:;!?]|$)/g) || []).length;

  // Standalone single-letter words (excluding A and I, which exist in Grade 1/uncontracted)
  const consonantWords = (ascii.match(/(?:^|[\s"'])[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z](?=[\s"',.:;!?]|$)/g) || []).length;

  // Common group contractions embedded in words: + (ing), $ (ed), ] (er), > (ar), < (in), % (ch), / (st), \ (ou)
  const groupContractions = (ascii.match(/[+$\]><%\\]/g) || []).length;

  if (strongWords >= 1) return true;
  if (consonantWords >= 1) return true;
  if (groupContractions >= 2) return true;
  if (groupContractions >= 1 && consonantWords >= 1) return true;

  return false;
}

/**
 * Splits a BRF document into pages, respecting form feeds (\f) or standalone page number markers.
 */
export function splitBrfPages(raw: string): string[][] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.includes('\f')) {
    return normalized.split('\f').map((p) => p.split('\n'));
  }

  const lines = normalized.split('\n');
  const pages: string[][] = [];
  let curPage: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    curPage.push(line);

    const isStandalonePageNum = /^\s{3,}(?:#?[A-Ja-j]{1,4}|#?\d{1,4})\s*$/.test(line);
    if (isStandalonePageNum) {
      let nextNonEmpty = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) {
          nextNonEmpty = j;
          break;
        }
      }
      if (nextNonEmpty !== -1) {
        pages.push(curPage);
        curPage = [];
      }
    }
  }

  if (curPage.length > 0) {
    pages.push(curPage);
  }
  return pages.length > 0 ? pages : [lines];
}

/**
 * Strips embossed braille page numbers (at page top/bottom or end-of-line right margin)
 * and trims embosser blank line padding.
 */
export function stripBraillePageNumbersAndPadding(raw: string): string {
  const pages = splitBrfPages(raw);
  const cleanedPages: string[] = [];

  for (const pageLines of pages) {
    let end = pageLines.length - 1;
    while (end >= 0 && !pageLines[end].trim()) {
      end--;
    }
    if (end < 0) continue;

    let lines = pageLines.slice(0, end + 1);

    const lastLine = lines[lines.length - 1];
    const standaloneLast = lastLine.match(/^\s*(?:#?[A-Ja-j]{1,4}|#?\d{1,4})\s*$/);
    const inlineLast = lastLine.match(/^(.*?)(?:\s{3,}(?:#?[A-Ja-j]{1,4}|#?\d{1,4}))\s*$/);

    if (standaloneLast && (lines.length > 1 || /^\s{3,}/.test(lastLine))) {
      lines.pop();
    } else if (inlineLast) {
      lines[lines.length - 1] = inlineLast[1];
    }

    while (lines.length > 0 && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    if (lines.length > 0) {
      const firstLine = lines[0];
      const standaloneFirst = firstLine.match(/^\s*(?:#?[A-Ja-j]{1,4}|#?\d{1,4})\s*$/);
      const inlineFirst = firstLine.match(/^(.*?)(?:\s{3,}(?:#?[A-Ja-j]{1,4}|#?\d{1,4}))\s*$/);
      if (standaloneFirst && /^\s{3,}/.test(firstLine)) {
        lines.shift();
      } else if (inlineFirst && /^\s{3,}/.test(firstLine)) {
        lines[0] = inlineFirst[1];
      }
    }

    if (lines.length > 0) {
      cleanedPages.push(lines.join('\n'));
    }
  }

  return cleanedPages.join('\n\n');
}

/**
 * Unwraps braille runover / continuation lines based on indentation.
 * Lines indented deeper than the initial entry line are joined to form continuous text.
 */
export function unwrapBrailleRunovers(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      result.push('');
      i++;
      continue;
    }

    const baseIndent = line.search(/\S|$/);
    let combined = line;
    i++;

    while (i < lines.length) {
      const nextLine = lines[i];
      if (!nextLine.trim()) {
        break;
      }
      const nextIndent = nextLine.search(/\S|$/);
      if (nextIndent > baseIndent) {
        const nextContent = nextLine.trimStart();
        if (combined.endsWith('-')) {
          combined += nextContent;
        } else {
          combined += ' ' + nextContent;
        }
        i++;
      } else {
        break;
      }
    }
    result.push(combined);
  }

  return result.join('\n');
}

export interface CleanBrfOptions {
  unwrap?: boolean;
  stripPageNumbers?: boolean;
}

/**
 * Normalizes, strips embossed page numbers and padding, and unwraps runovers for BRF import.
 */
export function cleanAndUnwrapBrf(raw: string, options: CleanBrfOptions = {}): string {
  const { unwrap = true, stripPageNumbers = true } = options;
  let text = unicodeBrailleToAscii(raw ?? '');
  if (stripPageNumbers) {
    text = stripBraillePageNumbersAndPadding(text);
  } else {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  if (unwrap) {
    text = unwrapBrailleRunovers(text);
  }
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Classify raw editor/file content before liblouis.
 * Returns `literary-brf` for .brf files and Unicode braille, otherwise `plain`.
 * Never returns `music-brf` — music is entered only via the Music mode toggle
 * (or restoring a session already saved as music).
 */
export function classifyBrfContent(
  raw: string,
  opts: ClassifyBrfOptions = {},
): ClassifyBrfResult {
  const normalized = normalizeBrfBuffer(raw ?? '');
  if (!normalized.trim()) {
    return { kind: 'plain', normalized, isContracted: false, cleaned: normalized };
  }
  if (opts.isBrfFile || isPredominantlyUnicodeBraille(raw ?? '')) {
    const contracted = isContractedBrf(normalized);
    const cleaned = cleanAndUnwrapBrf(raw ?? '', {
      unwrap: opts.unwrap ?? true,
      stripPageNumbers: opts.stripPageNumbers ?? true,
    });
    return { kind: 'literary-brf', normalized, isContracted: contracted, cleaned };
  }
  return { kind: 'plain', normalized, isContracted: false, cleaned: normalized };
}
