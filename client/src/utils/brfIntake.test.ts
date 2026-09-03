import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asciiToUnicodeBraille } from './braille';
import {
  classifyBrfContent,
  cleanAndUnwrapBrf,
  isContractedBrf,
  normalizeBrfBuffer,
  parseBraillePageNumber,
  stripBraillePageNumbersAndPadding,
  unwrapBrailleRunovers,
} from './brfIntake';
import { normalizeImportedBrf } from './brailleFormat';

const dir = dirname(fileURLToPath(import.meta.url));
const FUR_ELISE_PATH = join(dir, 'fixtures/fur-elise.brf');
const FUR_ELISE_EASY_PATH = join(dir, 'fixtures/fur-elise-easy.brf');

describe('normalizeBrfBuffer / normalizeImportedBrf', () => {
  it('converts Unicode braille to ASCII and normalizes line endings', () => {
    const unicode = asciiToUnicodeBraille(',hello\r\n,world');
    const normalized = normalizeBrfBuffer(unicode);
    expect(normalized).toBe(',HELLO\n,WORLD');
    expect(normalizeImportedBrf(unicode)).toBe(normalized);
  });

  it('turns form feeds into blank lines', () => {
    expect(normalizeImportedBrf(',hello\f,world')).toBe(',hello\n\n,world');
  });
});

describe('classifyBrfContent', () => {
  it('treats Unicode Music Braille as literary-brf unless Music mode is on', () => {
    const full = readFileSync(FUR_ELISE_PATH, 'utf8');
    const { kind, normalized } = classifyBrfContent(full);
    expect(kind).toBe('literary-brf');
    expect(normalized.includes('.>') || normalized.includes('>')).toBe(true);
  });

  it('treats ASCII music paste as plain (user must turn on Music Player Mode)', () => {
    const ascii = normalizeBrfBuffer(readFileSync(FUR_ELISE_PATH, 'utf8'));
    expect(classifyBrfContent(ascii).kind).toBe('plain');
  });

  it('treats a .brf file as literary-brf even when it is Music Braille', () => {
    const full = readFileSync(FUR_ELISE_PATH, 'utf8');
    expect(classifyBrfContent(full, { isBrfFile: true }).kind).toBe('literary-brf');
    const easy = readFileSync(FUR_ELISE_EASY_PATH, 'utf8');
    expect(classifyBrfContent(easy).kind).toBe('literary-brf');
    expect(classifyBrfContent(easy, { isBrfFile: true }).kind).toBe('literary-brf');
  });

  it('classifies quoted literary catalog prose as plain, not music', () => {
    const catalog = `Cheyenne Meneghetti
Springfield, IL
"Frail One"
Paraffin and crayon Wax
Not For Sale
`;
    expect(classifyBrfContent(catalog).kind).toBe('plain');
  });

  it('classifies plain prose as plain', () => {
    expect(classifyBrfContent('Hello brave world').kind).toBe('plain');
  });

  it('classifies Unicode literary BRF as literary-brf', () => {
    const literary = asciiToUnicodeBraille(',hello ,world');
    expect(classifyBrfContent(literary).kind).toBe('literary-brf');
  });

  it('classifies ASCII .brf file as literary-brf', () => {
    const { kind } = classifyBrfContent(',hello ,world', { isBrfFile: true });
    expect(kind).toBe('literary-brf');
  });
});

describe('parseBraillePageNumber', () => {
  it('parses braille letter page numbers (a-j / A-J)', () => {
    expect(parseBraillePageNumber('A')).toBe(1);
    expect(parseBraillePageNumber('B')).toBe(2);
    expect(parseBraillePageNumber('J')).toBe(0);
    expect(parseBraillePageNumber('AJ')).toBe(10);
    expect(parseBraillePageNumber('AA')).toBe(11);
    expect(parseBraillePageNumber('ab')).toBe(12);
  });

  it('parses number-sign prefixed braille page numbers', () => {
    expect(parseBraillePageNumber('#1')).toBe(1);
    expect(parseBraillePageNumber('#A')).toBe(1);
    expect(parseBraillePageNumber('#AJ')).toBe(10);
    expect(parseBraillePageNumber('#25')).toBe(25);
  });

  it('returns null for invalid or empty page tokens', () => {
    expect(parseBraillePageNumber('')).toBeNull();
    expect(parseBraillePageNumber('#')).toBeNull();
    expect(parseBraillePageNumber('XYZ')).toBeNull();
  });
});

describe('isContractedBrf', () => {
  it('detects strong whole-word contractions', () => {
    expect(isContractedBrf('&')).toBe(true);
    expect(isContractedBrf('=')).toBe(true);
    expect(isContractedBrf('! book')).toBe(true);
    expect(isContractedBrf('( text')).toBe(true);
    expect(isContractedBrf('? you')).toBe(true);
  });

  it('detects single-letter whole-word contractions and group contractions', () => {
    expect(isContractedBrf('N For SALE')).toBe(true);
    expect(isContractedBrf('W FOLL/')).toBe(true);
    expect(isContractedBrf('PARAffIN AND CRAYON WAX CASTED')).toBe(false);
    expect(isContractedBrf('P+Y B,DS')).toBe(true);
  });

  it('identifies uncontracted Grade 1 BRF as false', () => {
    expect(isContractedBrf(',HELLO ,WORLD')).toBe(false);
    expect(isContractedBrf(',THIS IS ,UNCONTRACTED')).toBe(false);
    expect(isContractedBrf('')).toBe(false);
  });
});

describe('stripBraillePageNumbersAndPadding', () => {
  it('strips standalone bottom page numbers and blank line padding', () => {
    const raw = [
      '  FIRST ENTRY',
      '  DETAILS',
      '                         A',
      '',
      '',
      '',
      '\f',
      '  SECOND ENTRY',
      '  MORE DETAILS',
      '                         B',
    ].join('\n');

    const stripped = stripBraillePageNumbersAndPadding(raw);
    expect(stripped).not.toMatch(/\s{3,}[AB]$/m);
    expect(stripped).toContain('FIRST ENTRY');
    expect(stripped).toContain('SECOND ENTRY');
  });

  it('strips inline page numbers at the right margin of content lines', () => {
    const raw = [
      '  PARAGRAPH END       D',
      '',
      '',
      '\f',
      '  NEXT PAGE',
    ].join('\n');

    const stripped = stripBraillePageNumbersAndPadding(raw);
    expect(stripped).toContain('  PARAGRAPH END');
    expect(stripped).not.toContain('       D');
    expect(stripped).toContain('  NEXT PAGE');
  });
});

describe('unwrapBrailleRunovers', () => {
  it('unwraps hanging indentation runover lines into the starting line', () => {
    const raw = [
      '  MATERIALS: ROAM,',
      '    BURLAP, NAILS, WIRE,',
      '    PONY BEADS',
      '  NOT FOR SALE',
    ].join('\n');

    const unwrapped = unwrapBrailleRunovers(raw);
    const lines = unwrapped.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('  MATERIALS: ROAM, BURLAP, NAILS, WIRE, PONY BEADS');
    expect(lines[1]).toBe('  NOT FOR SALE');
  });

  it('preserves hyphenated words without inserting spaces', () => {
    const raw = [
      '  PAPIER-',
      '    MACHE',
    ].join('\n');

    const unwrapped = unwrapBrailleRunovers(raw);
    expect(unwrapped).toBe('  PAPIER-MACHE');
  });
});

describe('cleanAndUnwrapBrf', () => {
  it('cleans page numbers, padding, and unwraps runovers end-to-end', () => {
    const raw = [
      '  TITLE: "SAMPLE"',
      '  MATERIALS: ROAM,',
      '    BURLAP, NAILS, WIRE,',
      '    PONY BEADS',
      '  NOT FOR SALE',
      '                         A',
      '',
      '',
      '\f',
      '  SECOND ITEM',
      '  CITY, ST       B',
    ].join('\n');

    const cleaned = cleanAndUnwrapBrf(raw);
    expect(cleaned).not.toMatch(/\s{3,}[AB]$/m);
    expect(cleaned).toContain('MATERIALS: ROAM, BURLAP, NAILS, WIRE, PONY BEADS');
    expect(cleaned).toContain('SECOND ITEM\n  CITY, ST');
  });
});

describe('classifyBrfContent with contraction detection and cleaning', () => {
  it('returns isContracted: true and cleaned text for contracted BRF', () => {
    const sample = [
      '  TITLE: "B]NICE"',
      '  MAT]IALS: ROAM,',
      '    BURLAP, NAILS, WIRE,',
      '    PONY B,DS',
      '  N = SALE',
      '                         A',
    ].join('\n');

    const result = classifyBrfContent(sample, { isBrfFile: true });
    expect(result.kind).toBe('literary-brf');
    expect(result.isContracted).toBe(true);
    expect(result.cleaned).toContain('MAT]IALS: ROAM, BURLAP, NAILS, WIRE, PONY B,DS');
    expect(result.cleaned).not.toMatch(/\s{3,}A$/m);
  });
});
