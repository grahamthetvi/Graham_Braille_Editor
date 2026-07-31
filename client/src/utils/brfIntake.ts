/**
 * Unified BRF intake: normalize → classify → route decisions for import,
 * paste, and session restore. Music BRF never goes through liblouis.
 */

import { isPredominantlyUnicodeBraille } from './braille';
import { normalizeImportedBrf } from './brailleFormat';
import { isLikelyMusicBrailleBrf } from './musicBraille';

/** Canonical buffer form used by playback, export, and literary round-trip. */
export type ContentKind = 'music-brf' | 'literary-brf' | 'plain';

export interface ClassifyBrfOptions {
  /** True when the source is a `.brf` file (ASCII literary BRF still routes as literary). */
  isBrfFile?: boolean;
}

export interface ClassifyBrfResult {
  kind: ContentKind;
  /** Line-ending + Unicode→ASCII normalized buffer. */
  normalized: string;
}

/** Alias: same as {@link normalizeImportedBrf}. */
export const normalizeBrfBuffer = normalizeImportedBrf;

/**
 * Classify raw editor/file content before liblouis.
 * Music always wins over literary back-translate.
 */
export function classifyBrfContent(
  raw: string,
  opts: ClassifyBrfOptions = {},
): ClassifyBrfResult {
  const normalized = normalizeBrfBuffer(raw ?? '');
  if (!normalized.trim()) {
    return { kind: 'plain', normalized };
  }
  if (isLikelyMusicBrailleBrf(normalized)) {
    return { kind: 'music-brf', normalized };
  }
  if (opts.isBrfFile || isPredominantlyUnicodeBraille(raw ?? '')) {
    return { kind: 'literary-brf', normalized };
  }
  return { kind: 'plain', normalized };
}

/**
 * True when a text-change should auto-switch to Music mode.
 * Requires music classification and a paste/load-sized jump so typing
 * note-by-note does not flip modes mid-edit.
 */
export function shouldAutoRouteMusicOnTextChange(prev: string, next: string): boolean {
  if (!isLikelyMusicBrailleBrf(next)) return false;
  const prevLen = (prev ?? '').length;
  const nextLen = (next ?? '').length;
  if (prevLen === 0) return true;
  if (nextLen - prevLen >= 40) return true;
  if (nextLen >= 2 * prevLen && nextLen - prevLen >= 20) return true;
  return false;
}
