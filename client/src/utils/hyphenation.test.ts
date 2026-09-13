import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  createHyphenator,
  hyphenateWord,
  hyphenDictionaryForTable,
  HYPHEN_DICTIONARIES,
  parseTexHyphenDic,
} from './hyphenation';

const tablesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/tables');

describe('hyphenDictionaryForTable', () => {
  it('maps literary tables onto the 16 shipped hyph_*.dic files', () => {
    expect(hyphenDictionaryForTable('en-ueb-g1.ctb')).toBe('hyph_en_US.dic');
    expect(hyphenDictionaryForTable('de-g2.ctb')).toBe('hyph_de_DE.dic');
    expect(hyphenDictionaryForTable('fr-bfu-g2.ctb')).toBe('hyph_fr_FR.dic');
    expect(hyphenDictionaryForTable('es-g1.ctb')).toBe('hyph_es_ES.dic');
    expect(hyphenDictionaryForTable('nl-NL-g0.utb')).toBe('hyph_nl_NL.dic');
    expect(hyphenDictionaryForTable('no-no-g1.ctb')).toBe('hyph_nb_NO.dic');
    expect(hyphenDictionaryForTable('nn.ctb')).toBe('hyph_nn_NO.dic');
    expect(hyphenDictionaryForTable('hi-in-g1.utb')).toBe('hyph_en_US.dic');
  });

  it('every listed dictionary exists under public/tables/', () => {
    expect(HYPHEN_DICTIONARIES).toHaveLength(16);
    const missing = HYPHEN_DICTIONARIES.filter((f) => !existsSync(join(tablesDir, f)));
    expect(missing).toEqual([]);
    const onDisk = readdirSync(tablesDir).filter((n) => n.startsWith('hyph_') && n.endsWith('.dic'));
    expect(onDisk.sort()).toEqual([...HYPHEN_DICTIONARIES].sort());
  });
});

describe('TeX hyphenation', () => {
  it('hyphenates from inline patterns', () => {
    const dict = parseTexHyphenDic('UTF-8\nhy3ph\n4en\n');
    const points = hyphenateWord('hyphen', dict);
    expect(points).toContain(2);
  });

  it('loads hyph_en_US.dic and hyphenates a long English word', () => {
    const text = readFileSync(join(tablesDir, 'hyph_en_US.dic'), 'utf8');
    const hyphenate = createHyphenator(text);
    const points = hyphenate('international');
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => p > 0 && p < 'international'.length)).toBe(true);
    const pieces: string[] = [];
    let last = 0;
    for (const p of points) {
      pieces.push('international'.slice(last, p));
      last = p;
    }
    pieces.push('international'.slice(last));
    expect(pieces.join('')).toBe('international');
    expect(pieces.length).toBeGreaterThan(1);
  });

  it('does not treat Grade-2 contraction cell strings as English syllables', () => {
    const text = readFileSync(join(tablesDir, 'hyph_en_US.dic'), 'utf8');
    const hyphenate = createHyphenator(text);
    expect(hyphenate('&!?(+$]')).toEqual([]);
    expect(hyphenate('&')).toEqual([]);
  });
});
