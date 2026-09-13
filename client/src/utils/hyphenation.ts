/**
 * TeX/liblouis hyphenation dictionaries (`hyph_*.dic` in public/tables/).
 *
 * Used for hyphenation-aware BRF wrap (see brailleFormat.ts). liblouis
 * `lou_hyphenate` is also exported from WASM for when the binary is rebuilt;
 * wrap itself uses this JS Liang implementation so it works without a rebuild.
 */

export type HyphenateAsciiWord = (asciiWord: string) => number[];

export type HyphenationPatterns = {
  patterns: Map<string, number[]>;
  leftmin: number;
  rightmin: number;
};

/** All hyphenation dictionaries shipped next to the liblouis tables. */
export const HYPHEN_DICTIONARIES = [
  'hyph_cs_CZ.dic',
  'hyph_da_DK.dic',
  'hyph_de_DE.dic',
  'hyph_en_US.dic',
  'hyph_eo.dic',
  'hyph_es_ES.dic',
  'hyph_fr_FR.dic',
  'hyph_hu_HU.dic',
  'hyph_it_IT.dic',
  'hyph_nb_NO.dic',
  'hyph_nl_NL.dic',
  'hyph_nn_NO.dic',
  'hyph_pl_PL.dic',
  'hyph_pt_PT.dic',
  'hyph_ru.dic',
  'hyph_sv_SE.dic',
] as const;

export type HyphenDictionaryFile = (typeof HYPHEN_DICTIONARIES)[number];

const DEFAULT_HYPHEN_DIC: HyphenDictionaryFile = 'hyph_en_US.dic';

type TablePrefixRule = { test: (table: string) => boolean; dic: HyphenDictionaryFile };

const TABLE_HYPHEN_RULES: TablePrefixRule[] = [
  { test: (t) => t.startsWith('cs') || t.startsWith('cz'), dic: 'hyph_cs_CZ.dic' },
  { test: (t) => t.startsWith('da'), dic: 'hyph_da_DK.dic' },
  { test: (t) => t.startsWith('de'), dic: 'hyph_de_DE.dic' },
  { test: (t) => t.startsWith('eo'), dic: 'hyph_eo.dic' },
  { test: (t) => t.startsWith('es'), dic: 'hyph_es_ES.dic' },
  { test: (t) => t.startsWith('fr'), dic: 'hyph_fr_FR.dic' },
  { test: (t) => t.startsWith('hu'), dic: 'hyph_hu_HU.dic' },
  { test: (t) => t.startsWith('it'), dic: 'hyph_it_IT.dic' },
  { test: (t) => t.startsWith('nn'), dic: 'hyph_nn_NO.dic' },
  { test: (t) => t.startsWith('nb') || t.startsWith('no'), dic: 'hyph_nb_NO.dic' },
  { test: (t) => t.startsWith('nl'), dic: 'hyph_nl_NL.dic' },
  { test: (t) => t.startsWith('pl'), dic: 'hyph_pl_PL.dic' },
  { test: (t) => t.startsWith('pt'), dic: 'hyph_pt_PT.dic' },
  { test: (t) => t.startsWith('ru'), dic: 'hyph_ru.dic' },
  { test: (t) => t.startsWith('sv') || t.startsWith('se'), dic: 'hyph_sv_SE.dic' },
  { test: (t) => t.startsWith('en'), dic: 'hyph_en_US.dic' },
];

/** Pick a `hyph_*.dic` filename for a liblouis table, defaulting to US English. */
export function hyphenDictionaryForTable(table: string): HyphenDictionaryFile {
  const base = table.split(/[/\\]/).pop() ?? table;
  const lower = base.toLowerCase();
  for (const rule of TABLE_HYPHEN_RULES) {
    if (rule.test(lower)) return rule.dic;
  }
  return DEFAULT_HYPHEN_DIC;
}

function looksLikeEncodingLine(line: string): boolean {
  if (!line) return false;
  if (/^(ISO|UTF|KOI|CP|latin|windows)/i.test(line) && !/\d/.test(line)) return true;
  return false;
}

function parsePatternLine(pat: string, patterns: Map<string, number[]>): void {
  const letters: string[] = [];
  const values: number[] = [];
  let pending = 0;
  for (const ch of pat) {
    if (ch >= '0' && ch <= '9') {
      pending = ch.charCodeAt(0) - 48;
      continue;
    }
    values.push(pending);
    pending = 0;
    letters.push(ch.toLowerCase());
  }
  values.push(pending);
  if (letters.length === 0) return;
  patterns.set(letters.join(''), values);
}

/** Parse a liblouis/TeX `hyph_*.dic` (encoding line + Liang patterns). */
export function parseTexHyphenDic(source: string): HyphenationPatterns {
  const patterns = new Map<string, number[]>();
  const lines = source.split(/\r?\n/);
  let start = 0;
  if (lines.length > 0 && looksLikeEncodingLine(lines[0].trim())) {
    start = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('%') || looksLikeEncodingLine(line)) continue;
    parsePatternLine(line, patterns);
  }
  return { patterns, leftmin: 2, rightmin: 3 };
}

/**
 * Liang hyphenation. Returned indices are split points: a hyphen may be inserted
 * *before* `word[i]` (i.e. `word.slice(0, i) + '-' + word.slice(i)`).
 */
export function hyphenateWord(word: string, dict: HyphenationPatterns): number[] {
  const letters = word.toLowerCase();
  if (letters.length < dict.leftmin + dict.rightmin) return [];

  const padded = `.${letters}.`;
  const levels = new Array<number>(padded.length + 1).fill(0);

  for (let i = 0; i < padded.length; i++) {
    for (let j = i + 1; j <= padded.length; j++) {
      const values = dict.patterns.get(padded.slice(i, j));
      if (!values) continue;
      for (let k = 0; k < values.length; k++) {
        const idx = i + k;
        if (idx < levels.length && values[k] > levels[idx]) {
          levels[idx] = values[k];
        }
      }
    }
  }

  const points: number[] = [];
  for (let i = dict.leftmin; i <= letters.length - dict.rightmin; i++) {
    // levels[i + 1] sits at the boundary between word[i-1] and word[i].
    if (levels[i + 1] % 2 === 1) {
      points.push(i);
    }
  }
  return points;
}

export function createHyphenator(dicText: string): HyphenateAsciiWord {
  const dict = parseTexHyphenDic(dicText);
  return (asciiWord: string) => hyphenateWord(asciiWord, dict);
}
