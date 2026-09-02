/**
 * Unified BRF intake: normalize → classify → route decisions for import,
 * paste, and session restore.
 *
 * Music Braille (Sao Mai piano or single-staff melody) classifies as `music-brf`
 * so import/paste can open Music Player Mode. Saved sessions may also restore
 * as music-brf via explicit session flags.
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
 * Returns `music-brf` when the buffer looks like Music Braille (hand signs,
 * meter + notes, Sao Mai single-staff labels, etc.).
 */
export function classifyBrfContent(
  raw: string,
  opts: ClassifyBrfOptions = {},
): ClassifyBrfResult {
  const normalized = normalizeBrfBuffer(raw ?? '');
  if (!normalized.trim()) {
    return { kind: 'plain', normalized };
  }
  if (isLikelyMusicBrailleBrf(raw ?? '') || isLikelyMusicBrailleBrf(normalized)) {
    return { kind: 'music-brf', normalized };
  }
  if (opts.isBrfFile || isPredominantlyUnicodeBraille(raw ?? '')) {
    return { kind: 'literary-brf', normalized };
  }
  return { kind: 'plain', normalized };
}

/**
 * True when a text change is a paste/import of Music Braille rather than a
 * small in-editor edit. Incremental typing must not flip Music mode on.
 */
export function shouldAutoRouteMusicOnTextChange(prev: string, next: string): boolean {
  const prevText = prev ?? '';
  const nextText = next ?? '';
  if (!nextText.trim()) return false;
  const delta = nextText.length - prevText.length;
  const isTinyEdit =
    prevText.length > 0 &&
    Math.abs(delta) <= 2 &&
    (nextText.startsWith(prevText) || prevText.startsWith(nextText));
  if (isTinyEdit) return false;
  return isLikelyMusicBrailleBrf(nextText);
}
