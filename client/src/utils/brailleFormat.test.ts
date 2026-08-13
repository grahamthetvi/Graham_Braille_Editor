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
  paginatePrintLines,
  formatPlainTextForPrintDownload,
  RTF_FS_BASE,
  RTF_FS_MIN,
} from './brailleFormat';

/** Reconstruct word start cells from a print-layout RTF inner line (base grid = \fs24). */
function rtfLineWordStarts(line: string): { word: string; fs: number; startCell: number }[] {
  const words: { word: string; fs: number; startCell: number }[] = [];
  let cell = 0;
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('{\\fs', i)) {
      const m = line.slice(i).match(/^\{\\fs(\d+) /);
      if (!m) {
        i++;
        continue;
      }
      const fs = Number(m[1]);
      const contentStart = i + m[0].length;
      const end = line.indexOf('}', contentStart);
      const text = end >= 0 ? line.slice(contentStart, end) : '';
      if (text.length > 0) {
        words.push({ word: text, fs, startCell: cell });
        cell += (text.length * fs) / RTF_FS_BASE;
      }
      i = end >= 0 ? end + 1 : i + 1;
      continue;
    }
    if (line[i] === ' ') {
      cell += 1;
      i++;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== ' ' && line[j] !== '{') j++;
    const text = line.slice(i, j);
    words.push({ word: text, fs: RTF_FS_BASE, startCell: cell });
    cell += text.length;
    i = j;
  }
  return words;
}

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

describe('buildPrintLayoutRtfBody slot scaling', () => {
  it('shrinks Grade 2 "the" (1 cell) so "cat" starts on the same cell as BRF', () => {
    const source = 'the cat';
    const asciiBrf = '! cat';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    expect(inner).toMatch(/\\fs(\d+)/);
    const fsMatch = inner.match(/\\fs(\d+)/);
    const fs = Number(fsMatch?.[1]);
    expect(fs).toBeGreaterThanOrEqual(RTF_FS_MIN);
    expect(fs).toBeLessThan(RTF_FS_BASE);
    expect(inner).toContain('the');
    const starts = rtfLineWordStarts(inner.split('\n')[0]);
    const theWord = starts.find(w => w.word === 'the');
    const catWord = starts.find(w => w.word === 'cat');
    expect(theWord).toBeDefined();
    expect(catWord).toBeDefined();
    expect(theWord?.fs).toBeLessThan(RTF_FS_BASE);
    expect(catWord?.startCell).toBe(2);
    expect(catWord?.fs).toBe(RTF_FS_BASE);
  });

  it('does not emit \\fs below the 8pt floor; the next word may drift', () => {
    const source = 'abcde f';
    const asciiBrf = 'x f';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    const fsValues = [...inner.matchAll(/\\fs(\d+)/g)].map(m => Number(m[1]));
    expect(fsValues.length).toBeGreaterThan(0);
    expect(Math.min(...fsValues)).toBeGreaterThanOrEqual(RTF_FS_MIN);
    const starts = rtfLineWordStarts(inner.split('\n')[0]);
    const second = starts.find(w => w.word === 'f');
    expect(second).toBeDefined();
    expect(second!.startCell).toBeGreaterThan(2);
  });

  it('keeps uncontracted equal-length words at base size with column padding', () => {
    const source = 'hello brave world';
    const asciiBrf = ',hello brave world';
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, 40);
    expect(inner).not.toMatch(/\\fs\d+/);
    expect(inner).toBe('hello  brave world');
    const wrap = buildPlainTextToMatchBrailleWrap(source, asciiBrf, 40);
    expect(inner).toBe(wrap);
  });

  it('preserves paragraph 3-1 wrap after pagination', () => {
    const source = 'The quick brown fox jumps over the lazy dog again today';
    const asciiBrf = source;
    const cells = 20;
    const paragraphStarts = { firstLineStartCell: 3, runoverStartCell: 1 };
    const wrap = formatPlainTextForPrintDownload(
      buildPlainTextToMatchBrailleWrap(source, asciiBrf, cells, paragraphStarts),
    );
    const inner = buildPrintLayoutRtfBody(source, asciiBrf, cells, paragraphStarts);
    expect(inner).toBe(wrap);
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

