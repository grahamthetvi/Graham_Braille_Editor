import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asciiToUnicodeBraille } from './braille';
import {
  classifyBrfContent,
  normalizeBrfBuffer,
  shouldAutoRouteMusicOnTextChange,
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
  it('classifies Für Elise Unicode BRF as literary-brf (music is toggle-only)', () => {
    const full = readFileSync(FUR_ELISE_PATH, 'utf8');
    const { kind, normalized } = classifyBrfContent(full);
    expect(kind).toBe('literary-brf');
    expect(normalized.includes('.>') || normalized.includes('>')).toBe(true);
  });

  it('classifies ASCII music paste as plain (not auto music)', () => {
    const ascii = normalizeBrfBuffer(readFileSync(FUR_ELISE_PATH, 'utf8'));
    expect(classifyBrfContent(ascii).kind).toBe('plain');
  });

  it('classifies easy-version Für Elise as literary-brf, not music-brf', () => {
    const full = readFileSync(FUR_ELISE_EASY_PATH, 'utf8');
    expect(classifyBrfContent(full).kind).toBe('literary-brf');
    expect(classifyBrfContent(full, { isBrfFile: true }).kind).toBe('literary-brf');
  });

  it('classifies plain prose as plain', () => {
    expect(classifyBrfContent('Hello brave world').kind).toBe('plain');
  });

  it('classifies Unicode literary BRF as literary-brf', () => {
    const literary = asciiToUnicodeBraille(',hello ,world');
    expect(classifyBrfContent(literary).kind).toBe('literary-brf');
  });

  it('classifies non-music .brf file as literary-brf', () => {
    const { kind } = classifyBrfContent(',hello ,world', { isBrfFile: true });
    expect(kind).toBe('literary-brf');
  });

  it('classifies Für Elise .brf file as literary-brf (back-translate path)', () => {
    const full = readFileSync(FUR_ELISE_PATH, 'utf8');
    expect(classifyBrfContent(full, { isBrfFile: true }).kind).toBe('literary-brf');
  });
});

describe('shouldAutoRouteMusicOnTextChange', () => {
  it('never auto-routes music on paste (toggle-only)', () => {
    const music = normalizeBrfBuffer(readFileSync(FUR_ELISE_PATH, 'utf8'));
    expect(shouldAutoRouteMusicOnTextChange('', music)).toBe(false);
    expect(shouldAutoRouteMusicOnTextChange('hi', music)).toBe(false);
    const easy = readFileSync(FUR_ELISE_EASY_PATH, 'utf8');
    expect(shouldAutoRouteMusicOnTextChange('', easy)).toBe(false);
  });

  it('does not route small incremental ASCII edits', () => {
    const base = 'a >/l#c8 >pp';
    expect(shouldAutoRouteMusicOnTextChange(base, base + 'x')).toBe(false);
  });

  it('does not route non-music large pastes', () => {
    const prose = 'A'.repeat(100);
    expect(shouldAutoRouteMusicOnTextChange('', prose)).toBe(false);
  });
});
