/**
 * Unified BRF intake: normalize → classify → route decisions for import,
 * paste, and session restore.
 *
 * Music Player Mode is an explicit user choice (toolbar toggle, session restore
 * of a session saved in that mode, or importing while Music mode is already on).
 * Content is never classified as music by heuristic.
 */

import { isPredominantlyUnicodeBraille } from './braille';
import { normalizeImportedBrf } from './brailleFormat';

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
 * Returns `literary-brf` for .brf files and Unicode braille, otherwise `plain`.
 */
export function classifyBrfContent(
  raw: string,
  opts: ClassifyBrfOptions = {},
): ClassifyBrfResult {
  const normalized = normalizeBrfBuffer(raw ?? '');
  if (!normalized.trim()) {
    return { kind: 'plain', normalized };
  }
  if (opts.isBrfFile || isPredominantlyUnicodeBraille(raw ?? '')) {
    return { kind: 'literary-brf', normalized };
  }
  return { kind: 'plain', normalized };
}
