import { memo } from 'react';
import { extractDots, unicodeBrailleToAscii } from '../utils/braille';

export type BrailleCellVariant = 'unicode' | 'dots';

export interface BrailleCellProps {
  char: string;
  showEmptyDots?: boolean;
  /** When true, emphasize this cell during Music Braille playback. */
  isActive?: boolean;
  /**
   * `unicode` (default): one text node — fast for long documents / scrolling.
   * `dots`: classic 6/8-dot visual cell.
   */
  variant?: BrailleCellVariant;
}

function buildTooltip(char: string, isSpace: boolean, dots: boolean[]): string {
  if (isSpace) return 'Space';
  const isEightDot = dots[6] || dots[7];
  const activeDots: number[] = [];
  for (let i = 0; i < (isEightDot ? 8 : 6); i++) {
    if (dots[i]) activeDots.push(i + 1);
  }
  const ascii = unicodeBrailleToAscii(char);
  const dotsStr = activeDots.length > 0 ? `Dots ${activeDots.join(',')}` : 'Empty Cell';
  const asciiChar = ascii && ascii !== char ? ` '${ascii}'` : '';
  return `Braille${asciiChar} (${dotsStr})`;
}

function BrailleCellComponent({
  char,
  showEmptyDots = true,
  isActive = false,
  variant = 'unicode',
}: BrailleCellProps) {
  const isSpace = char === ' ' || char === '\u2800';

  if (variant === 'unicode') {
    return (
      <span
        className={`braille-cell braille-cell--unicode${isSpace ? ' braille-cell--space' : ''}${isActive ? ' braille-cell--music-active' : ''}`}
        aria-hidden={isSpace ? true : undefined}
        data-music-active={isActive ? 'true' : undefined}
      >
        {isSpace ? '\u2800' : char}
      </span>
    );
  }

  const dots = extractDots(char);
  const isEightDot = !!(dots[6] || dots[7]);
  const dotIndexes = isEightDot ? [0, 3, 1, 4, 2, 5, 6, 7] : [0, 3, 1, 4, 2, 5];
  const tooltip = buildTooltip(char, isSpace, dots);

  return (
    <span
      className={`braille-cell ${isEightDot ? 'braille-cell--8dot' : 'braille-cell--6dot'} ${isSpace ? 'braille-cell--space' : ''}${isActive ? ' braille-cell--music-active' : ''}`}
      role="img"
      aria-label={tooltip}
      title={tooltip}
      data-music-active={isActive ? 'true' : undefined}
    >
      <span className="visually-hidden-char">{char}</span>
      <span className="braille-dots-container" aria-hidden="true">
        {dotIndexes.map((dotIdx) => {
          const filled = !isSpace && dots[dotIdx];
          if (!filled && !showEmptyDots) {
            return <span key={dotIdx} className="braille-dot braille-dot--empty-hidden" />;
          }
          return (
            <span
              key={dotIdx}
              className={`braille-dot ${filled ? 'braille-dot--active' : 'braille-dot--inactive'}`}
            />
          );
        })}
      </span>
    </span>
  );
}

export const BrailleCell = memo(BrailleCellComponent);
