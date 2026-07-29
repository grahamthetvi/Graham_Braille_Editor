import { extractDots, unicodeBrailleToAscii } from '../utils/braille';

interface BrailleCellProps {
  char: string;
  showEmptyDots?: boolean;
  /** When true, emphasize this cell during Music Braille playback. */
  isActive?: boolean;
}

export function BrailleCell({ char, showEmptyDots = true, isActive = false }: BrailleCellProps) {
  const isSpace = char === ' ' || char === '\u2800';
  const dots = extractDots(char);
  
  // Render 8 dots if dot 7 or dot 8 is active. Otherwise render 6 dots.
  const isEightDot = dots[6] || dots[7];
  
  // Grid layout indexes in row-major order:
  // 6-dot cell:
  // Row 1: dot 1 (index 0), dot 4 (index 3)
  // Row 2: dot 2 (index 1), dot 5 (index 4)
  // Row 3: dot 3 (index 2), dot 6 (index 5)
  const dotIndexes6 = [0, 3, 1, 4, 2, 5];
  
  // 8-dot cell:
  // Row 1: dot 1 (index 0), dot 4 (index 3)
  // Row 2: dot 2 (index 1), dot 5 (index 4)
  // Row 3: dot 3 (index 2), dot 6 (index 5)
  // Row 4: dot 7 (index 6), dot 8 (index 7)
  const dotIndexes8 = [0, 3, 1, 4, 2, 5, 6, 7];
  
  const dotIndexes = isEightDot ? dotIndexes8 : dotIndexes6;
  
  // Generate descriptive tooltip
  const ascii = unicodeBrailleToAscii(char);
  const activeDots: number[] = [];
  for (let i = 0; i < (isEightDot ? 8 : 6); i++) {
    if (dots[i]) {
      activeDots.push(i + 1);
    }
  }
  
  let tooltip = '';
  if (isSpace) {
    tooltip = 'Space';
  } else {
    const dotsStr = activeDots.length > 0 ? `Dots ${activeDots.join(',')}` : 'Empty Cell';
    const asciiChar = ascii && ascii !== char ? ` '${ascii}'` : '';
    tooltip = `Braille${asciiChar} (${dotsStr})`;
  }

  return (
    <span
      className={`braille-cell ${isEightDot ? 'braille-cell--8dot' : 'braille-cell--6dot'} ${isSpace ? 'braille-cell--space' : ''}${isActive ? ' braille-cell--music-active' : ''}`}
      role="img"
      aria-label={tooltip}
      title={tooltip}
      data-music-active={isActive ? 'true' : undefined}
    >
      {/* Hidden character to support screen readers and standard copy-paste selecting */}
      <span className="visually-hidden-char">{char}</span>
      
      <span className="braille-dots-container" aria-hidden="true">
        {dotIndexes.map((dotIdx) => {
          const isActive = !isSpace && dots[dotIdx];
          if (!isActive && !showEmptyDots) {
            return <span key={dotIdx} className="braille-dot braille-dot--empty-hidden" />;
          }
          return (
            <span
              key={dotIdx}
              className={`braille-dot ${isActive ? 'braille-dot--active' : 'braille-dot--inactive'}`}
            />
          );
        })}
      </span>
    </span>
  );
}
