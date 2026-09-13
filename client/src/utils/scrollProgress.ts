/** Map a content line (plus fraction through that line) to a 0–1 scroll progress. */
export function progressFromLine(
  lineIndex0: number,
  fracInLine: number,
  lineCount: number,
): number {
  if (lineCount <= 1) return 0;
  const pos = Math.min(
    lineCount - 1,
    Math.max(0, lineIndex0) + Math.max(0, Math.min(1, fracInLine)),
  );
  return pos / (lineCount - 1);
}

/** Inverse of {@link progressFromLine}. */
export function lineFromProgress(
  progress: number,
  lineCount: number,
): { lineIndex0: number; frac: number } {
  if (lineCount <= 1) return { lineIndex0: 0, frac: 0 };
  const pos = Math.max(0, Math.min(1, progress)) * (lineCount - 1);
  const lineIndex0 = Math.min(lineCount - 1, Math.floor(pos));
  return { lineIndex0, frac: pos - lineIndex0 };
}
