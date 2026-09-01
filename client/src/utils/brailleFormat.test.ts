import { describe, it, expect } from 'vitest';
import {
  buildPlainTextToMatchBrailleWrap,
  SOFT_LINE_BREAK_CHAR,
  formatBrfForOutput,
  defaultPrintLayoutTextFilename,
  defaultGradingPrintLayoutFilename,
  convertToRtf,
  buildBrfDownloadPayload,
  buildGmailComposeUrl,
  buildPrintLayoutRtfBody,
  buildPrintLayoutRtf,
  buildGradingPrintLayoutRtf,
  formatGradingSheetHeader,
  printLayoutPageMetrics,
  paginatePrintLines,
} from './brailleFormat';

function formFeedCount(s: string): number {
  return (s.match(/\f/g) ?? []).length;
}

describe('buildPlainTextToMatchBrailleWrap', () => {
  it('m not equal n: one braille token spanning rows packs multiple words on early rows (long line)', () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i + 1}`);
    const source = words.join(' ');
    const asciiBrf = 'A'.repeat(20);
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 5);
    const rows = result.split(SOFT_LINE_BREAK_CHAR);
    expect(rows.length).toBe(4);
    const counts = rows.map((r) => r.trim().split(/\s+/).filter(Boolean).length);
    expect(Math.max(...counts)).toBeGreaterThan(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it('m equals n: four braille words and four literary words stays aligned', () => {
    const source = 'cat dog ewe ram';
    const asciiBrf = 'A B C D';
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40);
    expect(result).not.toContain(SOFT_LINE_BREAK_CHAR);
    expect(result.trim()).toBe(source.trim());
  });

  it('simple multi-word line without forced soft breaks when braille fits one row', () => {
    const source = 'hello brave world';
    const asciiBrf = 'ABC';
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40);
    expect(result).not.toContain(SOFT_LINE_BREAK_CHAR);
    expect(result.trim()).toBe(source.trim());
  });

  it('preserves paragraph newlines between logical lines', () => {
    const source = 'first line here\nsecond line there';
    const asciiBrf = 'AAAAAAAA\nBBBBBBBB';
    const out = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 4);
    const para = out.split('\n');
    expect(para.length).toBe(2);
    expect(para[0].includes(SOFT_LINE_BREAK_CHAR)).toBe(true);
    expect(para[1].includes(SOFT_LINE_BREAK_CHAR)).toBe(true);
  });

  it('preserves form feeds between segments', () => {
    const source = 'page one\fpage two';
    const asciiBrf = 'AAAA\fBBBB';
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40);
    expect(result).toBe('page one\fpage two');
  });
});

describe('formatBrfForOutput', () => {
  it('replaces all pipe characters with backslashes', () => {
    const rawBrf = 'j|rney |r way';
    const result = formatBrfForOutput(rawBrf, 40, 25, false);
    expect(result).toBe('j\\rney \\r way\r\n');
  });

  it('replaces pipe characters with backslashes when paginated with form feeds', () => {
    const rawBrf = 'j|rney\f|r way';
    const result = formatBrfForOutput(rawBrf, 40, 25, false);
    expect(result).toBe('j\\rney\r\n\f\\r way\r\n');
  });
});

describe('defaultPrintLayoutTextFilename', () => {
  it('generates filename with correct prefix, date pattern, and extension', () => {
    const name = defaultPrintLayoutTextFilename();
    expect(name).toMatch(/^print-layout-\d{4}-\d{2}-\d{2}-\d{4}\.rtf$/);
  });
});

describe('defaultGradingPrintLayoutFilename', () => {
  it('generates filename with correct prefix, date pattern, and extension', () => {
    const name = defaultGradingPrintLayoutFilename();
    expect(name).toMatch(/^grading-print-layout-\d{4}-\d{2}-\d{2}-\d{4}\.rtf$/);
  });
});

describe('convertToRtf', () => {
  it('correctly escapes special characters and formats newlines', () => {
    const text = 'hello {world} \\ backslash\ntwo';
    const rtf = convertToRtf(text);
    expect(rtf).toContain('hello \\{world\\} \\\\ backslash\\par\r\ntwo');
    expect(rtf).toContain('\\f0\\fmodern\\fprq1\\fcharset0 Courier New;');
  });

  it('converts form feeds to RTF page break commands', () => {
    const text = 'first page\fsecond page';
    const rtf = convertToRtf(text);
    expect(rtf).toContain('first page\\page\\par\r\nsecond page');
  });
});

describe('horizontal word alignment', () => {
  it('aligns print words to matching braille start positions', () => {
    const source = 'hello brave world';
    const asciiBrf = ',hello brave world';
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40);
    expect(result).toBe('hello  brave world');
  });

  it('respects paragraph margins', () => {
    const source = 'hello world';
    const asciiBrf = 'hello world';
    const result = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40, { firstLineStartCell: 3, runoverStartCell: 5 });
    expect(result).toBe('  hello world');
  });
});

describe('buildBrfDownloadPayload', () => {
  it('returns the same formatted BRF as formatBrfForOutput', async () => {
    const raw = 'hello world';
    const payload = buildBrfDownloadPayload(raw, 40, 25, false);
    expect(payload.formatted).toBe(formatBrfForOutput(raw, 40, 25, false));
    expect(payload.filename).toMatch(/^braille-\d{4}-\d{2}-\d{2}-\d{4}\.brf$/);
    expect(payload.blob.type).toContain('text/plain');
    expect(await payload.blob.text()).toBe(payload.formatted);
  });
});

describe('buildGmailComposeUrl', () => {
  it('builds a Gmail compose URL with encoded subject and body', () => {
    const url = buildGmailComposeUrl('Braille file (.brf)', 'Attach {{filename}}\n\nSend to yourself first.');
    expect(url.startsWith('https://mail.google.com/mail/?')).toBe(true);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('view')).toBe('cm');
    expect(parsed.searchParams.get('fs')).toBe('1');
    expect(parsed.searchParams.get('su')).toBe('Braille file (.brf)');
    expect(parsed.searchParams.get('body')).toContain('Send to yourself first.');
  });
});

describe('paginatePrintLines', () => {
  it('matches BRF form-feed count for the same wrapped line count', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line${String(i).padStart(2, '0')} text`);
    const source = lines.join('\n');
    const asciiBrf = source;
    const cells = 40;
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, cells);
    for (const includePageNumbers of [false, true]) {
      const printOut = paginatePrintLines(inner, 5, includePageNumbers, cells);
      const brfOut = formatBrfForOutput(asciiBrf, cells, 5, includePageNumbers);
      expect(formFeedCount(printOut)).toBe(formFeedCount(brfOut));
    }
  });

  it('starts a new pagination block at a source form feed', () => {
    const source = 'aaaa\nbbbb\ncccc\nffff\neeee\fzzzz';
    const asciiBrf = source;
    const cells = 40;
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, cells);
    const printOut = paginatePrintLines(inner, 25, false, cells);
    const brfOut = formatBrfForOutput(asciiBrf, cells, 25, false);
    expect(formFeedCount(printOut)).toBe(formFeedCount(brfOut));
    expect(formFeedCount(printOut)).toBe(1);
  });

  it('right-aligns Arabic page numbers to cellsPerRow', () => {
    const inner = 'only line';
    const out = paginatePrintLines(inner, 3, true, 10);
    const pages = out.split('\f');
    expect(pages.length).toBe(1);
    const last = pages[0].split('\n').at(-1) ?? '';
    expect(last).toBe('         1');
    expect(last.length).toBe(10);
  });
});

describe('buildPrintLayoutRtfBody line matching', () => {
  it('keeps contracted words at one size with a space between them', () => {
    const source = 'the cat';
    const asciiBrf = '! cat';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    expect(inner).toBe('the cat');
    expect(inner).not.toMatch(/\\fs\d+/);
  });

  it('puts the same print words on a line as the wrapped braille line', () => {
    const source = 'the cat sat on the mat';
    const asciiBrf = '! cat sat on ! mat';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 15);
    expect(inner).toBe('the cat sat on the\nmat');
    expect(inner).not.toMatch(/\\fs\d+/);
  });

  it('does not emit mid-line \\fs for long uncontracted words', () => {
    const source = 'abcde f';
    const asciiBrf = 'x f';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    expect(inner).not.toMatch(/\\fs\d+/);
    expect(inner).toContain('abcde');
    expect(inner).toContain(' f');
  });

  it('joins uncontracted words with ordinary spaces, not cell-column padding', () => {
    const source = 'hello brave world';
    const asciiBrf = ',hello brave world';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    expect(inner).not.toMatch(/\\fs\d+/);
    expect(inner).toBe('hello brave world');
  });

  it('preserves paragraph 3-1 wrap after pagination', () => {
    const source = 'The quick brown fox jumps over the lazy dog again today';
    const asciiBrf = source;
    const cells = 20;
    const paragraphStarts = { firstLineStartCell: 3, runoverStartCell: 1 };
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, cells, paragraphStarts);
    const visualLines = inner.split('\n');
    expect(visualLines.length).toBeGreaterThan(1);
    expect(visualLines[0].startsWith('  ')).toBe(true);
    expect(visualLines[1].startsWith(' ')).toBe(false);
    const paginated = paginatePrintLines(inner, 2, false, cells);
    const firstPageLines = paginated.split('\f')[0].split('\n');
    expect(firstPageLines[0].startsWith('  ')).toBe(true);
    expect(firstPageLines[0]).toBe(visualLines[0]);
  });
});

describe('printLayoutPageMetrics', () => {
  it('fills wide tractor paper for 40×25', () => {
    const m = printLayoutPageMetrics({ cellsPerRow: 40, linesPerPage: 25, paperFormat: 'wide' });
    expect(m.paperWidthTwips).toBe(16560);
    expect(m.paperHeightTwips).toBe(15840);
    expect(m.fsBase).toBe(60);
    expect(m.slTwips).toBe(576);
  });

  it('fills US Letter for 32×25', () => {
    const m = printLayoutPageMetrics({ cellsPerRow: 32, linesPerPage: 25, paperFormat: 'us-letter' });
    expect(m.paperWidthTwips).toBe(12240);
    expect(m.fsBase).toBe(56);
  });
});

describe('buildPrintLayoutRtf', () => {
  it('emits paper size and scaled Courier in the RTF header', () => {
    const rtf = buildPrintLayoutRtf('hello', 'hello', {
      cellsPerRow: 40,
      linesPerPage: 25,
      paperFormat: 'wide',
    });
    expect(rtf).toContain('\\paperw16560');
    expect(rtf).toContain('\\paperh15840');
    expect(rtf).toContain('\\fs60');
    expect(rtf).toContain('\\sl576');
    expect(rtf.match(/\\fs\d+/g)?.every(tok => tok === '\\fs60')).toBe(true);
  });
});

describe('formatGradingSheetHeader', () => {
  it('wraps separator lines to cellsPerRow', () => {
    const header = formatGradingSheetHeader(32, 100, 500);
    const lines = header.split('\n');
    expect(lines[0].length).toBe(32);
    expect(lines[0]).toBe('='.repeat(32));
  });
});

describe('buildGradingPrintLayoutRtf', () => {
  it('prepends a cell-width grading header', () => {
    const rtf = buildGradingPrintLayoutRtf('hello', 'hello', 1, 5, false, {
      cellsPerRow: 32,
      linesPerPage: 25,
      paperFormat: 'us-letter',
    });
    expect(rtf).toContain('GRADING SHEET');
    expect(rtf).toContain('\\paperw12240');
  });
});

describe('convertToRtf unicode and mid-line size runs', () => {
  it('emits \\uN? for non-ASCII characters', () => {
    const rtf = convertToRtf('café');
    expect(rtf).toContain('\\u233?');
    expect(rtf).toContain('caf');
  });

  it('keeps mid-line \\fsN runs when the body is already RTF', () => {
    const rtf = convertToRtf('{\\fs16 the}cat', { bodyIsRtf: true });
    expect(rtf).toContain('{\\fs16 the}cat');
    expect(rtf).not.toContain('\\{\\fs16');
  });
});

