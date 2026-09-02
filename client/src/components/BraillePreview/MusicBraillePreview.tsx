import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BrailleCell, type BrailleCellVariant } from '../BrailleCell';
import './BraillePreview.css';

export interface MusicBraillePreviewHandle {
  setScrollPercentage: (percentage: number) => void;
  getScrollElement: () => HTMLDivElement | null;
}

export interface MusicBraillePreviewProps {
  lines: Array<Array<{ char: string; index: number }>>;
  brailleSize: number;
  inactiveDotSize: number;
  showEmptyDots: boolean;
  cellVariant: BrailleCellVariant;
  activeCharIndex: number | null;
  onScrollPercentage: (percentage: number) => void;
  ariaLabel: string;
  pageLabel: string;
}

const OVERSCAN_LINES = 8;

const MusicLine = memo(function MusicLine({
  line,
  showEmptyDots,
  cellVariant,
  activeCharIndex,
}: {
  line: Array<{ char: string; index: number }>;
  showEmptyDots: boolean;
  cellVariant: BrailleCellVariant;
  activeCharIndex: number | null;
}) {
  if (line.length === 0) {
    return <div className="brf-page-line">{'\u00a0'}</div>;
  }
  return (
    <div className="brf-page-line">
      {line.map(({ char, index }) => (
        <BrailleCell
          key={index}
          char={char}
          showEmptyDots={showEmptyDots}
          variant={cellVariant}
          isActive={activeCharIndex === index}
        />
      ))}
    </div>
  );
});

export const MusicBraillePreview = forwardRef<
  MusicBraillePreviewHandle,
  MusicBraillePreviewProps
>(function MusicBraillePreview(
  {
    lines,
    brailleSize,
    inactiveDotSize,
    showEmptyDots,
    cellVariant,
    activeCharIndex,
    onScrollPercentage,
    ariaLabel,
    pageLabel,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressScrollReportRef = useRef(false);
  const lineHeight = useMemo(
    () => Math.max(16, brailleSize + brailleSize * 0.5),
    [brailleSize],
  );
  const initialEnd = Math.max(0, Math.min(lines.length, 40) - 1);
  const [range, setRange] = useState({ start: 0, end: initialEnd });
  const [prevLines, setPrevLines] = useState(lines);
  const linesKey = lines.length;

  if (lines !== prevLines) {
    setPrevLines(lines);
    setRange({ start: 0, end: Math.max(0, Math.min(lines.length, 40) - 1) });
  }

  const updateRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || linesKey === 0) {
      setRange((prev) => (prev.start === 0 && prev.end === -1 ? prev : { start: 0, end: -1 }));
      return;
    }
    const start = Math.max(0, Math.floor(container.scrollTop / lineHeight) - OVERSCAN_LINES);
    const visibleCount = Math.ceil(container.clientHeight / lineHeight) + OVERSCAN_LINES * 2;
    const end = Math.min(linesKey - 1, start + visibleCount);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [lineHeight, linesKey]);

  useImperativeHandle(
    ref,
    () => ({
      getScrollElement: () => containerRef.current,
      setScrollPercentage: (percentage: number) => {
        const container = containerRef.current;
        if (!container) return;
        const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
        if (maxScroll <= 0) return;
        const target = percentage * maxScroll;
        if (Math.abs(container.scrollTop - target) <= 1) return;
        suppressScrollReportRef.current = true;
        container.scrollTop = target;
        suppressScrollReportRef.current = false;
        updateRange();
      },
    }),
    [updateRange],
  );

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!suppressScrollReportRef.current) {
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
      if (maxScroll > 0) {
        onScrollPercentage(Math.max(0, Math.min(container.scrollTop, maxScroll)) / maxScroll);
      }
    }
    updateRange();
  }, [onScrollPercentage, updateRange]);

  // Follow the sounding cell into view without React scroll state.
  useEffect(() => {
    if (activeCharIndex == null) return;
    const container = containerRef.current;
    if (!container) return;
    let lineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].some((c) => c.index === activeCharIndex)) {
        lineIdx = i;
        break;
      }
    }
    if (lineIdx < 0) return;
    const top = lineIdx * lineHeight;
    const bottom = top + lineHeight;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (top < viewTop || bottom > viewBottom) {
      container.scrollTop = Math.max(0, top - container.clientHeight * 0.35);
    }
  }, [activeCharIndex, lineHeight, lines]);

  const padTop = range.start * lineHeight;
  const padBottom = Math.max(0, (lines.length - range.end - 1) * lineHeight);
  const visible = lines.slice(range.start, range.end + 1);

  return (
    <div
      className="brf-pages-container"
      aria-label={ariaLabel}
      ref={containerRef}
      onScroll={handleScroll}
      style={
        {
          '--braille-cell-height': `${brailleSize}px`,
          '--braille-cell-width': `${brailleSize * 0.64}px`,
          '--braille-cell-gap': `${brailleSize * 0.4}px`,
          '--braille-dot-size-active': `${brailleSize * 0.22}px`,
          '--braille-dot-size-inactive': `${inactiveDotSize}px`,
          '--braille-cell-height-8dot': `${brailleSize * 1.33}px`,
          '--braille-line-gap': `${brailleSize * 0.5}px`,
        } as React.CSSProperties
      }
    >
      <div className="brf-page" aria-label={pageLabel}>
        <div className="brf-page-content">
          {padTop > 0 ? (
            <div className="brf-virtual-spacer" style={{ height: padTop }} aria-hidden="true" />
          ) : null}
          {visible.map((line, i) => (
            <MusicLine
              key={range.start + i}
              line={line}
              showEmptyDots={showEmptyDots}
              cellVariant={cellVariant}
              activeCharIndex={activeCharIndex}
            />
          ))}
          {padBottom > 0 ? (
            <div className="brf-virtual-spacer" style={{ height: padBottom }} aria-hidden="true" />
          ) : null}
        </div>
      </div>
    </div>
  );
});
