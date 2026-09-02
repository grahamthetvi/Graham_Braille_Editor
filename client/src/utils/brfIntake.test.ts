import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asciiToUnicodeBraille } from './braille';
import { classifyBrfContent, normalizeBrfBuffer } from './brfIntake';
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
