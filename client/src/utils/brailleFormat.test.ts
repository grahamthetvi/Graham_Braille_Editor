import { describe, it, expect } from 'vitest';
import { buildPlainTextToMatchBrailleWrap, SOFT_LINE_BREAK_CHAR, formatBrfForOutput, defaultPrintLayoutTextFilename, defaultGradingPrintLayoutFilename, convertToRtf, buildBrfDownloadPayload, buildGmailComposeUrl } from './brailleFormat';

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

