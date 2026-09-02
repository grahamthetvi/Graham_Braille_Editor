import { describe, expect, it } from 'vitest';
import { JUMBO_LINE_MARKER } from '../../utils/braille';
import { buildBrfPageModels } from './braillePreviewModel';

describe('buildBrfPageModels', () => {
  it('assigns monotonic word indices across pages', () => {
    const pages = ['⠁⠃ ⠉⠙', '⠑'];
    const models = buildBrfPageModels(pages);
    expect(models).toHaveLength(2);
    const words = models.flatMap((p) =>
      p.lines.flatMap((l) =>
        l.kind === 'cells'
          ? l.segments.filter((s) => s.type === 'word').map((s) => s.wordIndex)
          : [],
      ),
    );
    expect(words).toEqual([0, 1, 2]);
  });

  it('hello, blank line, world is three rows with a blank in the middle', () => {
    const [page] = buildBrfPageModels(['⠁\n\n⠃']);
    expect(page.lines).toEqual([
      {
        kind: 'cells',
        segments: [{ type: 'word', wordIndex: 0, chars: ['⠁'] }],
      },
      { kind: 'blank' },
      {
        kind: 'cells',
        segments: [{ type: 'word', wordIndex: 1, chars: ['⠃'] }],
      },
    ]);
  });

  it('parses jumbo lines', () => {
    const line = `${JUMBO_LINE_MARKER}48${JUMBO_LINE_MARKER}AB`;
    const [page] = buildBrfPageModels([line]);
    expect(page.lines[0]).toEqual({
      kind: 'jumbo',
      sizePx: 48,
      chars: ['A', 'B'],
    });
  });
});
