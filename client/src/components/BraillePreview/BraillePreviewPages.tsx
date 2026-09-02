import {
  forwardRef,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BrailleCell, type BrailleCellVariant } from '../BrailleCell';
import { buildBrfPageModels, type BrfPageModel } from './braillePreviewModel';
import './BraillePreview.css';

export interface BraillePreviewPagesHandle {
  setScrollPercentage: (percentage: number) => void;
  scrollToPage: (pageIndex: number) => void;
  getScrollElement: () => HTMLDivElement | null;
}

export interface BraillePreviewPagesProps {
  pages: string[];
  brailleSize: number;
  inactiveDotSize: number;
  showEmptyDots: boolean;
  cellVariant: BrailleCellVariant;
  linesPerPage: number;
  activeWordRange: [number, number] | null;
  onScrollPercentage: (percentage: number) => void;
  onActivePageChange: (pageNumber1Based: number) => void;
  ariaLabel: string;
}

const OVERSCAN_PAGES = 2;

function estimatePageHeightPx(brailleSize: number, linesPerPage: number): number {
  const lineH = brailleSize + brailleSize * 0.5;
  const chrome = 36 + 24;
  return Math.max(120, linesPerPage * lineH + chrome);
}

function pageOffset(heights: number[], index: number, fallback: number): number {
  let top = 0;
  for (let i = 0; i < index; i++) {
    top += heights[i] ?? fallback;
  }
  return top;
}

function totalHeight(heights: number[], count: number, fallback: number): number {
  let h = 0;
  for (let i = 0; i < count; i++) {
    h += heights[i] ?? fallback;
  }
  return h;
}

const PageView = memo(function PageView({
  model,
  pageLabel,
  pageMarker,
  showEmptyDots,
  cellVariant,
  brailleSize,
  inactiveDotSize,
  activeWordRange,
  onHeight,
}: {
  model: BrfPageModel;
  pageLabel: string;
  pageMarker: string;
  showEmptyDots: boolean;
  cellVariant: BrailleCellVariant;
  brailleSize: number;
  inactiveDotSize: number;
  activeWordRange: [number, number] | null;
  onHeight: (pageIndex: number, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onHeight(model.pageIndex, el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [model.pageIndex, onHeight, model.lines.length]);

  return (
    <div ref={ref} className="brf-page" aria-label={pageLabel}>
      <div className="brf-page-number" aria-hidden="true">
        {pageMarker}
      </div>
      <div className="brf-page-content">
        {model.lines.map((line, lineIdx) => {
          if (line.kind === 'jumbo') {
            const size = line.sizePx;
            const jumboStyles = {
              fontSize: `${size}px`,
              '--braille-cell-height': `${size}px`,
              '--braille-cell-width': `${size * 0.64}px`,
              '--braille-cell-gap': `${size * 0.4}px`,
              '--braille-dot-size-active': `${size * 0.22}px`,
              '--braille-dot-size-inactive': `${
                size * 0.22 * (inactiveDotSize / Math.max(1, brailleSize * 0.22))
              }px`,
              '--braille-cell-height-8dot': `${size * 1.33}px`,
              '--braille-line-gap': `${size * 0.5}px`,
            } as React.CSSProperties;

            return (
              <div key={lineIdx} className="brf-jumbo-line" style={jumboStyles}>
                {line.chars.length > 0 ? (
                  line.chars.map((char, charIdx) => (
                    <BrailleCell
                      key={charIdx}
                      char={char}
                      showEmptyDots={showEmptyDots}
                      variant={cellVariant}
                    />
                  ))
                ) : (
                  '\u00a0'
                )}
              </div>
            );
          }

          const isBlankLine =
            line.segments.length === 0 ||
            line.segments.every((seg) => seg.type === 'space');

          return (
            <div
              key={lineIdx}
              className={`brf-page-line${isBlankLine ? ' brf-page-line--blank' : ''}`}
            >
              {line.segments.length === 0 ? (
                <BrailleCell
                  char={'\u2800'}
                  showEmptyDots={showEmptyDots}
                  variant={cellVariant}
                />
              ) : (
              line.segments.map((seg, segIdx) => {
                if (seg.type === 'space') {
                  return seg.chars.map((char, charIdx) => (
                    <BrailleCell
                      key={`${segIdx}-${charIdx}`}
                      char={char}
                      showEmptyDots={showEmptyDots}
                      variant={cellVariant}
                    />
                  ));
                }

                const isActive =
                  activeWordRange != null &&
                  seg.wordIndex >= activeWordRange[0] &&
                  seg.wordIndex <= activeWordRange[1];

                const wordCells = seg.chars.map((char, charIdx) => (
                  <BrailleCell
                    key={charIdx}
                    char={char}
                    showEmptyDots={showEmptyDots}
                    variant={cellVariant}
                  />
                ));

                return isActive ? (
                  <span key={`w${segIdx}`} className="braille-highlight">
                    {wordCells}
                  </span>
                ) : (
                  <Fragment key={`w${segIdx}`}>{wordCells}</Fragment>
                );
              }))}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const BraillePreviewPages = forwardRef<
  BraillePreviewPagesHandle,
  BraillePreviewPagesProps
>(function BraillePreviewPages(
  {
    pages,
    brailleSize,
    inactiveDotSize,
    showEmptyDots,
    cellVariant,
    linesPerPage,
    activeWordRange,
    onScrollPercentage,
    onActivePageChange,
    ariaLabel,
  },
  ref,
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const heightsRef = useRef<number[]>([]);
  const fallbackH = estimatePageHeightPx(brailleSize, linesPerPage);
  const [windowRange, setWindowRange] = useState({
    start: 0,
    end: Math.max(0, Math.min(pages.length, 5) - 1),
  });
  const [spacer, setSpacer] = useState({ top: 0, bottom: 0 });
  const [prevPages, setPrevPages] = useState(pages);
  const lastPageRef = useRef(1);
  const pageChangeRafRef = useRef<number | null>(null);

  const models = useMemo(() => buildBrfPageModels(pages), [pages]);

  if (pages !== prevPages) {
    setPrevPages(pages);
    setWindowRange({ start: 0, end: Math.max(0, Math.min(pages.length, 5) - 1) });
    setSpacer({ top: 0, bottom: 0 });
  }

  useEffect(() => {
    heightsRef.current = [];
  }, [pages]);

  const updateWindowFromScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || pages.length === 0) return;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const heights = heightsRef.current;

    let acc = 0;
    let start = 0;
    for (let i = 0; i < pages.length; i++) {
      const h = heights[i] ?? fallbackH;
      if (acc + h > scrollTop) {
        start = i;
        break;
      }
      acc += h;
      start = i;
    }

    let end = start;
    let visible = 0;
    for (let i = start; i < pages.length; i++) {
      visible += heights[i] ?? fallbackH;
      end = i;
      if (visible >= clientHeight + fallbackH) break;
    }

    const nextStart = Math.max(0, start - OVERSCAN_PAGES);
    const nextEnd = Math.min(pages.length - 1, end + OVERSCAN_PAGES);
    setWindowRange((prev) =>
      prev.start === nextStart && prev.end === nextEnd ? prev : { start: nextStart, end: nextEnd },
    );
    setSpacer({
      top: pageOffset(heights, nextStart, fallbackH),
      bottom: Math.max(
        0,
        totalHeight(heights, pages.length, fallbackH) -
          pageOffset(heights, nextEnd + 1, fallbackH),
      ),
    });

    const mid = scrollTop + clientHeight / 2;
    let active = 0;
    let top = 0;
    for (let i = 0; i < pages.length; i++) {
      const h = heights[i] ?? fallbackH;
      if (top + h > mid) {
        active = i;
        break;
      }
      top += h;
      active = i;
    }
    const pageNum = active + 1;
    if (pageNum !== lastPageRef.current) {
      lastPageRef.current = pageNum;
      onActivePageChange(pageNum);
    }
  }, [fallbackH, onActivePageChange, pages.length]);

  const onHeight = useCallback(
    (pageIndex: number, height: number) => {
      if (height <= 0) return;
      const prev = heightsRef.current[pageIndex];
      if (prev != null && Math.abs(prev - height) < 1) return;
      heightsRef.current[pageIndex] = height;
      updateWindowFromScroll();
    },
    [updateWindowFromScroll],
  );

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
        if (Math.abs(container.scrollTop - target) > 1) {
          container.scrollTop = target;
        }
      },
      scrollToPage: (pageIndex: number) => {
        const container = containerRef.current;
        if (!container || pageIndex < 0 || pageIndex >= pages.length) return;
        const top = pageOffset(heightsRef.current, pageIndex, fallbackH);
        container.scrollTo({ top, behavior: 'smooth' });
      },
    }),
    [fallbackH, pages.length],
  );

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScroll > 0) {
      const percentage = Math.max(0, Math.min(container.scrollTop, maxScroll)) / maxScroll;
      onScrollPercentage(percentage);
    }
    if (pageChangeRafRef.current != null) cancelAnimationFrame(pageChangeRafRef.current);
    pageChangeRafRef.current = requestAnimationFrame(() => {
      pageChangeRafRef.current = null;
      updateWindowFromScroll();
    });
  }, [onScrollPercentage, updateWindowFromScroll]);

  const visibleModels = models.slice(
    Math.max(0, windowRange.start),
    Math.max(0, windowRange.end) + 1,
  );

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
      {spacer.top > 0 ? (
        <div className="brf-virtual-spacer" style={{ height: spacer.top }} aria-hidden="true" />
      ) : null}
      {visibleModels.map((model) => (
        <PageView
          key={model.pageIndex}
          model={model}
          pageLabel={t('app.layoutSettings.pageLabel', {
            page: model.pageIndex + 1,
            total: pages.length,
          })}
          pageMarker={t('app.layoutSettings.pageMarker', { page: model.pageIndex + 1 })}
          showEmptyDots={showEmptyDots}
          cellVariant={cellVariant}
          brailleSize={brailleSize}
          inactiveDotSize={inactiveDotSize}
          activeWordRange={activeWordRange}
          onHeight={onHeight}
        />
      ))}
      {spacer.bottom > 0 ? (
        <div className="brf-virtual-spacer" style={{ height: spacer.bottom }} aria-hidden="true" />
      ) : null}
    </div>
  );
});
