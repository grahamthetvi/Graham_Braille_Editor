/**
 * Formats a Unicode braille string into an array of page strings for display.
 * Each page contains at most linesPerPage lines; each line is at most cellsPerRow
 * characters wide (longer lines are hard-wrapped).
 */
export function formatBrfPages(
  unicodeBraille: string,
  cellsPerRow: number,
  linesPerPage: number,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);

  const rawLines = unicodeBraille.split('\n');
  const wrappedLines: string[] = [];

  for (const line of rawLines) {
    if (line.length === 0) {
      wrappedLines.push('');
    } else {
      for (let i = 0; i < line.length; i += cells) {
        wrappedLines.push(line.slice(i, i + cells));
      }
    }
  }

  // Trim trailing blank lines so the last page isn't mostly empty
  while (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] === '') {
    wrappedLines.pop();
  }

  if (wrappedLines.length === 0) return [''];

  const pages: string[] = [];
  for (let i = 0; i < wrappedLines.length; i += lines) {
    pages.push(wrappedLines.slice(i, i + lines).join('\n'));
  }
  return pages;
}

/**
 * Formats raw ASCII BRF for download / embosser printing.
 * Hard-wraps at cellsPerRow, paginates with form-feed characters (0x0C),
 * and uses CRLF line endings as required by most embosser drivers.
 */
export function formatBrfForOutput(
  rawBrf: string,
  cellsPerRow: number,
  linesPerPage: number,
): string {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);

  const rawLines = rawBrf.split('\n');
  const wrapped: string[] = [];

  for (const line of rawLines) {
    if (!line) {
      wrapped.push('');
      continue;
    }
    for (let i = 0; i < line.length; i += cells) {
      wrapped.push(line.slice(i, i + cells));
    }
  }

  // Trim trailing blank lines
  while (wrapped.length > 0 && wrapped[wrapped.length - 1] === '') {
    wrapped.pop();
  }

  const pageChunks: string[] = [];
  for (let i = 0; i < wrapped.length; i += lines) {
    pageChunks.push(wrapped.slice(i, i + lines).join('\r\n'));
  }

  // Join pages with form feed; add trailing CRLF
  return pageChunks.join('\r\n\f') + '\r\n';
}
