/**
 * tableRegistry.ts
 *
 * Curated registry of liblouis braille tables shipped in public/tables/
 * (engine pin: client/scripts/build-liblouis/VERSION).
 *
 * Tables are grouped for display in a <select> with <optgroup> elements.
 * The `file` field is the exact filename passed to liblouis.translateString().
 *
 * Sources:
 *   • liblouis documentation: https://liblouis.io/documentation/
 *   • Math tables (nemeth/marburg/ukmaths/wiskunde) from liblouisutdml
 */

export interface BrailleTableEntry {
  /** Human-readable label shown in the dropdown. */
  name: string;
  /** Filename in public/tables/ — passed directly to liblouis translateString(). */
  file: string;
}

export interface BrailleTableGroup {
  group: string;
  tables: BrailleTableEntry[];
}

/**
 * Map obsolete / renamed table filenames (saved in localStorage or bookmarks)
 * to their modern equivalents after the 3.38 upgrade.
 */
export const TABLE_RENAMES: Readonly<Record<string, string>> = {
  'Fr-Fr-g2.ctb': 'fr-bfu-g2.ctb',
  'Fr-Ca-g2.ctb': 'fr-bfu-g2.ctb',
  'fr-fr-g1.utb': 'fr-bfu-comp6.utb',
  'fr-ca-g1.utb': 'fr-bfu-comp6.utb',
  'de-de-g0.utb': 'de-g0.utb',
  'de-de-g1.ctb': 'de-g1.ctb',
  'de-de-g2.ctb': 'de-g2.ctb',
  'de-ch-g0.utb': 'de-g0.utb',
  'de-ch-g1.ctb': 'de-g1.ctb',
  'de-ch-g2.ctb': 'de-g2.ctb',
  'ru-compbrl.ctb': 'ru-comp6.utb',
  'ru.ctb': 'ru-comp8.utb',
  'sv-1989.ctb': 'sv-6g0d.utb',
  'sv-1996.ctb': 'sv-8g0d.utb',
  'se-se.ctb': 'smi-6g0.utb',
  'lt.ctb': 'lt-8dot.utb',
  'vi-g1.ctb': 'vi-vn-g1.ctb',
  'vi.ctb': 'vi-vn-g1.ctb',
  'et.ctb': 'et-g0.utb',
  'Es-Es-g1.utb': 'es-g1.ctb',
  'Es-Es-G0.utb': 'es-g1.ctb',
  'UEBC-g1.utb': 'en-ueb-g1.ctb',
  'UEBC-g2.ctb': 'en-ueb-g2.ctb',
};

/** Resolve a possibly-obsolete table filename to one that exists in 3.38+. */
export function migrateTableFilename(file: string): string {
  return TABLE_RENAMES[file] ?? file;
}

export const TABLE_GROUPS: BrailleTableGroup[] = [
  {
    group: 'English',
    tables: [
      { name: 'English — UEB Grade 2 (Contracted)', file: 'en-ueb-g2.ctb' },
      { name: 'English — UEB Grade 1 (Uncontracted, default)', file: 'en-ueb-g1.ctb' },
      { name: 'English — Grade 3 (highly contracted)', file: 'en-g3.ctb' },
      { name: 'English — US Grade 2 (EBAE Contracted)', file: 'en-us-g2.ctb' },
      { name: 'English — US Grade 1 (EBAE)', file: 'en-us-g1.ctb' },
      { name: 'English — US Computer (6-dot)', file: 'en-us-comp6.ctb' },
      { name: 'English — US Computer (8-dot)', file: 'en-us-comp8.ctb' },
      { name: 'English — US Computer Extended (8-dot)', file: 'en-us-comp8-ext.utb' },
      { name: 'English — US NABCC', file: 'en-nabcc.utb' },
      { name: 'English — US Interline', file: 'en-us-interline.ctb' },
      { name: 'English — Canada', file: 'en_CA.ctb' },
      { name: 'English — GB Grade 2', file: 'en-GB-g2.ctb' },
      { name: 'English — GB Grade 1', file: 'en-gb-g1.utb' },
      { name: 'English — GB Computer (8-dot)', file: 'en-gb-comp8.ctb' },
      { name: 'English — India Grade 1', file: 'en-in-g1.ctb' },
      { name: 'English — UEB Math', file: 'en-ueb-math.ctb' },
      { name: 'English — Chess Notation', file: 'en-chess.ctb' },
    ],
  },
  {
    group: 'Mathematics',
    tables: [
      { name: 'Nemeth Braille Code (US Math)', file: 'nemeth.ctb' },
      { name: 'Marburg Math (UK/International)', file: 'marburg.ctb' },
      { name: 'UK Mathematics (RNIB)', file: 'ukmaths.ctb' },
      { name: 'Dutch Mathematics (Wiskunde)', file: 'wiskunde.ctb' },
      { name: 'English US Math Text', file: 'en-us-mathtext.ctb' },
    ],
  },
  {
    group: 'French',
    tables: [
      { name: 'French — BFU Grade 2 (France/Canada)', file: 'fr-bfu-g2.ctb' },
      { name: 'French — BFU Computer (6-dot)', file: 'fr-bfu-comp6.utb' },
      { name: 'French — BFU Computer (8-dot)', file: 'fr-bfu-comp8.utb' },
    ],
  },
  {
    group: 'German',
    tables: [
      { name: 'German — Grade 0 (Uncontracted)', file: 'de-g0.utb' },
      { name: 'German — Grade 1', file: 'de-g1.ctb' },
      { name: 'German — Grade 2', file: 'de-g2.ctb' },
      { name: 'German — Grade 0 Detailed', file: 'de-g0-detailed.utb' },
      { name: 'German — Grade 1 Detailed', file: 'de-g1-detailed.ctb' },
      { name: 'German — Grade 2 Detailed', file: 'de-g2-detailed.ctb' },
      { name: 'German — Computer (6-dot)', file: 'de-comp6.utb' },
      { name: 'German — Computer (8-dot)', file: 'de-de-comp8.ctb' },
      { name: 'German — Chess Notation', file: 'de-chess.ctb' },
    ],
  },
  {
    group: 'Spanish & Portuguese',
    tables: [
      { name: 'Spanish — Grade 1', file: 'es-g1.ctb' },
      { name: 'Spanish — Grade 2', file: 'es-g2.ctb' },
      { name: 'Spanish — Norwegian rules', file: 'es-no.utb' },
      { name: 'Portuguese — Portugal Grade 1', file: 'pt-pt-g1.utb' },
      { name: 'Portuguese — Portugal Grade 2', file: 'pt-pt-g2.ctb' },
      { name: 'Portuguese — Computer (6-dot)', file: 'pt-comp6.utb' },
      { name: 'Portuguese — Computer (8-dot)', file: 'pt-pt-comp8.ctb' },
    ],
  },
  {
    group: 'Nordic Languages',
    tables: [
      { name: 'Danish — Grade 0.8', file: 'da-dk-g08.ctb' },
      { name: 'Danish — Grade 1.6', file: 'da-dk-g16.ctb' },
      { name: 'Danish — Grade 1.8', file: 'da-dk-g18.ctb' },
      { name: 'Danish — Grade 2.6', file: 'da-dk-g26.ctb' },
      { name: 'Danish — Grade 2.8', file: 'da-dk-g28.ctb' },
      { name: 'Norwegian — Grade 0', file: 'no-no-g0.utb' },
      { name: 'Norwegian — Grade 1', file: 'no-no-g1.ctb' },
      { name: 'Norwegian — Grade 2', file: 'no-no-g2.ctb' },
      { name: 'Norwegian — Grade 3', file: 'no-no-g3.ctb' },
      { name: 'Norwegian — Computer (8-dot)', file: 'no-no-comp8.ctb' },
      { name: 'Norwegian — 8-dot literary', file: 'no-no-8dot.utb' },
      { name: 'Swedish — 6-dot Grade 0', file: 'sv-6g0d.utb' },
      { name: 'Swedish — 6-dot Grade 1', file: 'sv-6g1d.ctb' },
      { name: 'Swedish — 6-dot Grade 2', file: 'sv-6g2d.ctb' },
      { name: 'Swedish — 8-dot Grade 0', file: 'sv-8g0d.utb' },
      { name: 'Swedish — 8-dot Grade 1', file: 'sv-8g1d.ctb' },
      { name: 'Swedish — 8-dot Grade 2', file: 'sv-8g2d.ctb' },
      { name: 'Swedish — Legacy alias Grade 0', file: 'sv-g0.utb' },
      { name: 'Swedish — Legacy alias Grade 1', file: 'sv-g1.ctb' },
      { name: 'Swedish — Legacy alias Grade 2', file: 'sv-g2.ctb' },
      { name: 'Northern Sami — 6-dot', file: 'smi-6g0.utb' },
      { name: 'Northern Sami — 8-dot', file: 'smi-8g0.utb' },
      { name: 'Elfdalian — 6-dot', file: 'ovd-6g0.utb' },
      { name: 'Elfdalian — 8-dot', file: 'ovd-8g0.utb' },
      { name: 'Finnish — Literary', file: 'fi.utb' },
      { name: 'Finnish — 8-dot', file: 'fi-fi-8dot.ctb' },
      { name: 'Icelandic', file: 'is.ctb' },
    ],
  },
  {
    group: 'Dutch & Italian',
    tables: [
      { name: 'Dutch — Netherlands Grade 0', file: 'nl-NL-g0.utb' },
      { name: 'Dutch — Computer (8-dot)', file: 'nl-comp8.utb' },
      { name: 'Italian — Computer (6-dot)', file: 'it-it-comp6.utb' },
      { name: 'Italian — Computer (8-dot)', file: 'it-it-comp8.utb' },
    ],
  },
  {
    group: 'Slavic Languages',
    tables: [
      { name: 'Bulgarian — Literary', file: 'bg.utb' },
      { name: 'Bulgarian — Computer', file: 'bg.ctb' },
      { name: 'Czech — Grade 1', file: 'cs-g1.ctb' },
      { name: 'Czech — Computer (8-dot)', file: 'cs-comp8.utb' },
      { name: 'Polish — Grade 1', file: 'Pl-Pl-g1.utb' },
      { name: 'Polish — Computer (8-dot)', file: 'pl-pl-comp8.ctb' },
      { name: 'Romanian — Grade 0', file: 'ro-g0.utb' },
      { name: 'Romanian', file: 'ro.ctb' },
      { name: 'Russian — Literary', file: 'ru-litbrl.ctb' },
      { name: 'Russian — Literary Detailed', file: 'ru-litbrl-detailed.utb' },
      { name: 'Russian — Grade 1', file: 'ru-ru-g1.ctb' },
      { name: 'Russian — Computer (6-dot)', file: 'ru-comp6.utb' },
      { name: 'Russian — Computer (8-dot)', file: 'ru-comp8.utb' },
      { name: 'Serbian — Grade 1 (Latin)', file: 'sr-g1.ctb' },
      { name: 'Serbian — Cyrillic', file: 'sr-Cyrl.ctb' },
      { name: 'Slovak — Grade 1', file: 'sk-g1.ctb' },
      { name: 'Slovenian — Grade 1', file: 'sl-si-g1.utb' },
      { name: 'Slovenian — Computer (8-dot)', file: 'sl-si-comp8.ctb' },
      { name: 'Croatian — Grade 1', file: 'hr-g1.ctb' },
      { name: 'Croatian — Computer (8-dot)', file: 'hr-comp8.utb' },
      { name: 'Ukrainian', file: 'uk.utb' },
      { name: 'Ukrainian — Computer', file: 'uk-comp.utb' },
      { name: 'Macedonian — Grade 1', file: 'mk-g1.utb' },
      { name: 'Belarusian', file: 'bel.utb' },
    ],
  },
  {
    group: 'Other European',
    tables: [
      { name: 'Catalan — Grade 1', file: 'ca-g1.ctb' },
      { name: 'Greek (Modern)', file: 'el.ctb' },
      { name: 'Hungarian — Grade 1', file: 'hu-hu-g1.ctb' },
      { name: 'Hungarian — Grade 2', file: 'hu-hu-g2.ctb' },
      { name: 'Hungarian — Computer (8-dot)', file: 'hu-hu-comp8.ctb' },
      { name: 'Irish — Grade 1', file: 'ga-g1.utb' },
      { name: 'Irish — Grade 2', file: 'ga-g2.ctb' },
      { name: 'Welsh — Grade 1', file: 'cy-cy-g1.utb' },
      { name: 'Welsh — Grade 2', file: 'cy-cy-g2.ctb' },
      { name: 'Lithuanian — 6-dot', file: 'lt-6dot.utb' },
      { name: 'Lithuanian — 8-dot', file: 'lt-8dot.utb' },
      { name: 'Latvian — Grade 1', file: 'Lv-Lv-g1.utb' },
      { name: 'Estonian — 6-dot', file: 'et-6dot.utb' },
      { name: 'Estonian — Computer', file: 'et-g0.utb' },
      { name: 'Maltese', file: 'mt.ctb' },
      { name: 'Turkish — Grade 1', file: 'tr-g1.ctb' },
      { name: 'Turkish — Grade 2', file: 'tr-g2.ctb' },
      { name: 'Esperanto — Grade 1', file: 'eo-g1.ctb' },
      { name: 'IPA (International Phonetic Alphabet)', file: 'IPA.utb' },
    ],
  },
  {
    group: 'Middle East & Arabic Script',
    tables: [
      { name: 'Arabic — Grade 1', file: 'ar-ar-g1.utb' },
      { name: 'Arabic — Grade 2', file: 'ar-ar-g2.ctb' },
      { name: 'Arabic — Computer (8-dot)', file: 'ar-ar-comp8.utb' },
      { name: 'Arabic (alias)', file: 'ar.tbl' },
      { name: 'Hebrew (Israel)', file: 'he-IL.utb' },
      { name: 'Hebrew — Computer (8-dot)', file: 'he-IL-comp8.utb' },
      { name: 'Biblical Hebrew (IHBC)', file: 'hbo.utb' },
      { name: 'Biblical Hebrew — Cantillated', file: 'hbo-cantillated.utb' },
      { name: 'Biblical Hebrew — Slim', file: 'hbo-slim.utb' },
      { name: 'Persian — Grade 1', file: 'fa-ir-g1.utb' },
      { name: 'Persian — Computer (8-dot)', file: 'fa-ir-comp8.ctb' },
      { name: 'Kurdish (Sorani) — Grade 1', file: 'ckb-g1.ctb' },
      { name: 'Urdu — Grade 1', file: 'ur-pk-g1.utb' },
      { name: 'Urdu — Grade 2', file: 'ur-pk-g2.ctb' },
      { name: 'Yiddish', file: 'yi.utb' },
    ],
  },
  {
    group: 'South & Southeast Asian',
    tables: [
      { name: 'Hindi — Grade 1', file: 'hi-in-g1.utb' },
      { name: 'Bengali — Grade 1', file: 'bn.tbl' },
      { name: 'Gujarati — Grade 1', file: 'gu-in-g1.utb' },
      { name: 'Kannada', file: 'kn.tbl' },
      { name: 'Malayalam — Grade 1', file: 'ml-in-g1.utb' },
      { name: 'Marathi — Grade 1', file: 'mr-in-g1.utb' },
      { name: 'Nepali', file: 'ne.ctb' },
      { name: 'Odia — Grade 1', file: 'or-in-g1.utb' },
      { name: 'Punjabi — Grade 1', file: 'pu-in-g1.utb' },
      { name: 'Sanskrit — Grade 1', file: 'sa-in-g1.utb' },
      { name: 'Tamil — Grade 1', file: 'ta-ta-g1.ctb' },
      { name: 'Tamil — General', file: 'ta.ctb' },
      { name: 'Telugu — Grade 1', file: 'te-in-g1.utb' },
      { name: 'Assamese — Grade 1', file: 'as-in-g1.utb' },
      { name: 'Sinhala', file: 'sin.utb' },
      { name: 'Thai — Grade 0', file: 'th-g0.utb' },
      { name: 'Thai — Grade 1', file: 'th-g1.utb' },
      { name: 'Thai — Grade 2', file: 'th-g2.ctb' },
      { name: 'Vietnamese — Grade 0', file: 'vi-vn-g0.utb' },
      { name: 'Vietnamese — Grade 1', file: 'vi-vn-g1.ctb' },
      { name: 'Vietnamese — Grade 2', file: 'vi-vn-g2.ctb' },
      { name: 'Khmer — Grade 1', file: 'km-g1.utb' },
      { name: 'Lao — Grade 1', file: 'lo-g1.utb' },
      { name: 'Myanmar — Grade 1', file: 'my-g1.utb' },
      { name: 'Myanmar — Grade 2', file: 'my-g2.ctb' },
      { name: 'Malay — Grade 2', file: 'ms-my-g2.ctb' },
      { name: 'Filipino — Grade 2', file: 'fil-g2.ctb' },
      { name: 'Tibetan', file: 'bo.ctb' },
      { name: 'Pali', file: 'pi.ctb' },
    ],
  },
  {
    group: 'East Asian',
    tables: [
      { name: 'Chinese — Mainland (Mandarin)', file: 'zh-chn.ctb' },
      { name: 'Chinese — Mainland Grade 1', file: 'zhcn-g1.ctb' },
      { name: 'Chinese — Mainland Grade 2', file: 'zhcn-g2.ctb' },
      { name: 'Chinese — Hong Kong (Cantonese)', file: 'zh-hk.ctb' },
      { name: 'Chinese — Taiwan', file: 'zh-tw.ctb' },
      { name: 'Korean — Grade 1', file: 'ko-g1.ctb' },
      { name: 'Korean — Grade 2', file: 'ko-g2.ctb' },
      { name: 'Korean 2006 — Grade 1', file: 'ko-2006-g1.ctb' },
      { name: 'Korean 2006 — Grade 2', file: 'ko-2006-g2.ctb' },
      { name: 'Japanese — Kantenji', file: 'ja-kantenji.utb' },
      { name: 'Japanese — Rokuten Kanji', file: 'ja-rokutenkanji.utb' },
      { name: 'Mongolian — Grade 1', file: 'mn-MN-g1.utb' },
      { name: 'Mongolian — Grade 2', file: 'mn-MN-g2.ctb' },
    ],
  },
  {
    group: 'African Languages',
    tables: [
      { name: 'Afrikaans — Grade 1', file: 'afr-za-g1.ctb' },
      { name: 'Afrikaans — Grade 2', file: 'afr-za-g2.ctb' },
      { name: 'Sesotho — Grade 1', file: 'sot-za-g1.ctb' },
      { name: 'Sesotho — Grade 2', file: 'sot-za-g2.ctb' },
      { name: 'Tswana — Grade 1', file: 'tsn-za-g1.ctb' },
      { name: 'Tswana — Grade 2', file: 'tsn-za-g2.ctb' },
      { name: 'Xhosa — Grade 1', file: 'xh-za-g1.utb' },
      { name: 'Xhosa — Grade 2', file: 'xh-za-g2.ctb' },
      { name: 'Zulu — Grade 1', file: 'zu-za-g1.utb' },
      { name: 'Zulu — Grade 2', file: 'zu-za-g2.ctb' },
      { name: 'Northern Sotho — Grade 1', file: 'nso-za-g1.utb' },
      { name: 'Swahili (Kenya) — Grade 1', file: 'sw-ke-g1.utb' },
      { name: 'Swahili (Kenya) — Grade 2', file: 'sw-ke-g2.ctb' },
      { name: 'Luganda — Grade 1', file: 'lg-ug-g1.utb' },
      { name: 'Ethiopic — Grade 1', file: 'ethio-g1.ctb' },
    ],
  },
  {
    group: 'Indigenous & Other',
    tables: [
      { name: 'Cherokee (US)', file: 'chr-us-g1.ctb' },
      { name: 'Hawaiian (US)', file: 'haw-us-g1.ctb' },
      { name: 'Inuktitut (Canada)', file: 'iu-ca-g1.ctb' },
      { name: 'Maori — New Zealand Grade 1', file: 'mao-nz-g1.ctb' },
      { name: 'Armenian', file: 'hy.ctb' },
      { name: 'Georgian', file: 'ka.utb' },
      { name: 'Kazakh', file: 'kk.utb' },
      { name: 'Uzbek — Grade 1', file: 'uz-g1.utb' },
    ],
  },
];

/** Flat list of all table entries for look-ups by filename. */
export const ALL_TABLES: BrailleTableEntry[] = TABLE_GROUPS.flatMap((g) => g.tables);

/** The default table filename used across the app. */
export const DEFAULT_TABLE = 'en-ueb-g1.ctb';

/** Return the human-readable name for a given table filename, or the filename itself if not found. */
export function tableLabel(file: string): string {
  const migrated = migrateTableFilename(file);
  return ALL_TABLES.find((t) => t.file === migrated)?.name ?? migrated;
}

/** True if `file` (after rename migration) is in the registry. */
export function isKnownTable(file: string): boolean {
  const migrated = migrateTableFilename(file);
  return ALL_TABLES.some((t) => t.file === migrated);
}
