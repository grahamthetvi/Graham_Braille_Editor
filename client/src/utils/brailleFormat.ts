/**
 * Word-wraps a single braille line to at most `cells` characters.
 *
 * `space` is the word-separator character:
 *   - '\u2800' (U+2800, BRAILLE PATTERN BLANK) for Unicode braille strings
 *   - ' '  (0x20) for raw ASCII BRF strings
 *
 * Words that fit on the current line are appended with a leading space.
 * Words longer than `cells` are hard-broken at the character limit (the only
 * case where a word is split mid-character, matching the user's requirement).
 */
function wrapBrailleLine(line: string, cells: number, space: string): string[] {
  const words = line.split(space);
  const result: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length === 0) continue; // skip empty segments (consecutive spaces)

    if (word.length > cells) {
      // Single word exceeds a full row — hard-break at the character limit
      if (current.length > 0) {
        result.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += cells) {
        const chunk = word.slice(i, i + cells);
        if (chunk.length === cells) {
          result.push(chunk);
        } else {
          current = chunk; // final partial chunk continues on next line
        }
      }
    } else {
      // Normal word — does it fit on the current line?
      const needed = current.length === 0
        ? word.length
        : current.length + 1 + word.length; // +1 for the space separator
      if (needed <= cells) {
        current = current.length === 0 ? word : current + space + word;
      } else {
        if (current.length > 0) result.push(current);
        current = word;
      }
    }
  }

  if (current.length > 0) result.push(current);
  return result;
}

/**
 * Formats a Unicode braille string into an array of page strings for display.
 * Each page contains at most linesPerPage lines; each line is at most cellsPerRow
 * characters wide. Lines that exceed cellsPerRow are word-wrapped — whole braille
 * words move to the next line. Only words longer than cellsPerRow are hard-broken.
 */
export function formatBrfPages(
  unicodeBraille: string,
  cellsPerRow: number,
  linesPerPage: number,
): string[] {
  const cells = Math.max(1, cellsPerRow);
  const lines = Math.max(1, linesPerPage);

  // In Unicode braille, ASCII space (0x20) was converted to U+2800 (blank braille pattern)
  const BRAILLE_SPACE = '\u2800';

  const rawLines = unicodeBraille.split('\n');
  const wrappedLines: string[] = [];

  for (const line of rawLines) {
    if (line.length === 0) {
      wrappedLines.push(''); // preserve blank lines (e.g. from Enter key presses)
    } else if (line.length <= cells) {
      wrappedLines.push(line); // fits — no wrapping needed
    } else {
      wrappedLines.push(...wrapBrailleLine(line, cells, BRAILLE_SPACE));
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
 * Hard-wraps at cellsPerRow using word-aware wrapping, paginates with
 * form-feed characters (0x0C), and uses CRLF line endings as required
 * by most embosser drivers.
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
    if (line.length <= cells) {
      wrapped.push(line);
    } else {
      wrapped.push(...wrapBrailleLine(line, cells, ' '));
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
