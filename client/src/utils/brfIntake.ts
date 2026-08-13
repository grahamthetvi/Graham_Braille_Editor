/**
 * Unified BRF intake: normalize → classify → route decisions for import,
 * paste, and session restore.
 *
 * Music mode is not inferred here — the user must toggle Music Player Mode.
 * Saved sessions may still restore as music-brf via explicit session flags.
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
 * Never returns `music-brf` — music is entered only via the Music mode toggle
 * (or restoring a session already saved as music).
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

/**
 * @deprecated Music mode is no longer auto-routed on paste/import.
 * Always returns false; kept so call sites can be removed cleanly.
 */
export function shouldAutoRouteMusicOnTextChange(_prev: string, _next: string): boolean {
  return false;
}
