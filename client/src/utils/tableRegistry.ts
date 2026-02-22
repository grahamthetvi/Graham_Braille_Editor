/**
 * tableRegistry.ts
 *
 * Curated, human-readable registry of every liblouis braille table that ships
 * with the liblouis-js npm package and is available in public/tables/.
 *
 * Tables are grouped for display in a <select> with <optgroup> elements.
 * The `file` field is the exact filename passed to liblouis.translateString().
 *
 * Sources / references:
 *   • liblouis table documentation: https://liblouis.io/documentation/
 *   • BrailleBlaster table list (APH): https://github.com/aphtech/brailleblaster
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

export const TABLE_GROUPS: BrailleTableGroup[] = [
  {
    group: 'English',
    tables: [
      { name: 'English — UEB Grade 2  (Contracted, default)', file: 'en-ueb-g2.ctb' },
      { name: 'English — UEB Grade 1  (Uncontracted)',        file: 'en-ueb-g1.ctb' },
      { name: 'English — US Grade 2   (EBAE Contracted)',     file: 'en-us-g2.ctb' },
      { name: 'English — US Grade 1   (EBAE)',                file: 'en-us-g1.ctb' },
      { name: 'English — US Computer  (6-dot)',               file: 'en-us-comp6.ctb' },
      { name: 'English — US Computer  (8-dot)',               file: 'en-us-comp8.ctb' },
      { name: 'English — GB Grade 2',                         file: 'en-GB-g2.ctb' },
      { name: 'English — GB Computer  (8-dot)',               file: 'en-gb-comp8.ctb' },
      { name: 'English — India Grade 1',                      file: 'en-in-g1.ctb' },
      { name: 'English — UEB Math',                           file: 'en-ueb-math.ctb' },
      { name: 'English — Chess Notation',                     file: 'en-chess.ctb' },
    ],
  },
  {
    group: 'Mathematics',
    tables: [
      { name: 'Nemeth Braille Code (US Math)',        file: 'nemeth.ctb' },
      { name: 'Marburg Math (UK/International)',       file: 'marburg.ctb' },
      { name: 'UK Mathematics (RNIB)',                 file: 'ukmaths.ctb' },
      { name: 'Dutch Mathematics (Wiskunde)',          file: 'wiskunde.ctb' },
      { name: 'English US Math Text',                 file: 'en-us-mathtext.ctb' },
    ],
  },
  {
    group: 'French',
    tables: [
      { name: 'French — Canada Grade 2', file: 'Fr-Ca-g2.ctb' },
      { name: 'French — France Grade 2', file: 'Fr-Fr-g2.ctb' },
    ],
  },
  {
    group: 'German',
    tables: [
      { name: 'German — Grade 1',             file: 'de-de-g1.ctb' },
      { name: 'German — Grade 2',             file: 'de-de-g2.ctb' },
      { name: 'German — Computer (8-dot)',    file: 'de-de-comp8.ctb' },
      { name: 'German — Switzerland Grade 1', file: 'de-ch-g1.ctb' },
      { name: 'German — Switzerland Grade 2', file: 'de-ch-g2.ctb' },
      { name: 'German — Chess Notation',      file: 'de-chess.ctb' },
    ],
  },
  {
    group: 'Spanish & Portuguese',
    tables: [
      { name: 'Portuguese — Portugal Grade 2',        file: 'pt-pt-g2.ctb' },
      { name: 'Portuguese — Computer (8-dot)',        file: 'pt-pt-comp8.ctb' },
    ],
  },
  {
    group: 'Nordic Languages',
    tables: [
      { name: 'Danish — Grade 0.8',         file: 'da-dk-g08.ctb' },
      { name: 'Danish — Grade 1.6',         file: 'da-dk-g16.ctb' },
      { name: 'Danish — Grade 1.8',         file: 'da-dk-g18.ctb' },
      { name: 'Danish — Grade 2.6',         file: 'da-dk-g26.ctb' },
      { name: 'Danish — Grade 2.8',         file: 'da-dk-g28.ctb' },
      { name: 'Norwegian — Grade 1',        file: 'no-no-g1.ctb' },
      { name: 'Norwegian — Grade 2',        file: 'no-no-g2.ctb' },
      { name: 'Norwegian — Grade 3',        file: 'no-no-g3.ctb' },
      { name: 'Norwegian — Computer (8-dot)', file: 'no-no-comp8.ctb' },
      { name: 'Swedish — 1989 Standard',    file: 'sv-1989.ctb' },
      { name: 'Swedish — 1996 Standard',    file: 'sv-1996.ctb' },
      { name: 'Northern Sami',              file: 'se-se.ctb' },
    ],
  },
  {
    group: 'Slavic Languages',
    tables: [
      { name: 'Bulgarian',                     file: 'bg.ctb' },
      { name: 'Czech — Grade 1',               file: 'cs-g1.ctb' },
      { name: 'Polish — Computer (8-dot)',     file: 'pl-pl-comp8.ctb' },
      { name: 'Romanian',                      file: 'ro.ctb' },
      { name: 'Russian — Literary',            file: 'ru-litbrl.ctb' },
      { name: 'Russian — Computer',            file: 'ru-compbrl.ctb' },
      { name: 'Serbian — Grade 1',             file: 'sr-g1.ctb' },
      { name: 'Slovak — Grade 1',              file: 'sk-g1.ctb' },
      { name: 'Slovenian — Computer (8-dot)', file: 'sl-si-comp8.ctb' },
    ],
  },
  {
    group: 'Other European',
    tables: [
      { name: 'Catalan — Grade 1',  file: 'ca-g1.ctb' },
      { name: 'Greek',              file: 'el.ctb' },
      { name: 'Lithuanian',         file: 'lt.ctb' },
      { name: 'Maltese',            file: 'mt.ctb' },
      { name: 'Turkish — Grade 1',  file: 'tr-g1.ctb' },
      { name: 'Turkish — General',  file: 'tr.ctb' },
      { name: 'Welsh — Grade 2',    file: 'cy-cy-g2.ctb' },
    ],
  },
  {
    group: 'Middle East & Arabic Script',
    tables: [
      { name: 'Arabic',                      file: 'ar.tbl' },
      { name: 'Kurdish (Sorani) — Grade 1',  file: 'ckb-g1.ctb' },
      { name: 'Urdu — Grade 2',              file: 'ur-pk-g2.ctb' },
    ],
  },
  {
    group: 'South & Southeast Asian',
    tables: [
      { name: 'Tamil — Grade 1',     file: 'ta-ta-g1.ctb' },
      { name: 'Tamil — General',     file: 'ta.ctb' },
      { name: 'Vietnamese — Grade 1', file: 'vi-g1.ctb' },
      { name: 'Vietnamese — General', file: 'vi.ctb' },
      { name: 'Tibetan',              file: 'bo.ctb' },
      { name: 'Pali',                 file: 'pi.ctb' },
    ],
  },
  {
    group: 'East Asian',
    tables: [
      { name: 'Chinese — Mainland China (Mandarin)', file: 'zh-chn.ctb' },
      { name: 'Chinese — Hong Kong (Cantonese)',     file: 'zh-hk.ctb' },
      { name: 'Chinese — Taiwan',                    file: 'zh-tw.ctb' },
    ],
  },
  {
    group: 'African Languages',
    tables: [
      { name: 'Afrikaans — Grade 1',  file: 'afr-za-g1.ctb' },
      { name: 'Sesotho — Grade 1',    file: 'sot-za-g1.ctb' },
      { name: 'Tswana — Grade 1',     file: 'tsn-za-g1.ctb' },
    ],
  },
  {
    group: 'Indigenous & Other',
    tables: [
      { name: 'Cherokee (US)',           file: 'chr-us-g1.ctb' },
      { name: 'Maori — New Zealand Grade 1', file: 'mao-nz-g1.ctb' },
    ],
  },
];

/** Flat list of all table entries for look-ups by filename. */
export const ALL_TABLES: BrailleTableEntry[] = TABLE_GROUPS.flatMap(g => g.tables);

/** The default table filename used across the app. */
export const DEFAULT_TABLE = 'en-ueb-g2.ctb';

/** Return the human-readable name for a given table filename, or the filename itself if not found. */
export function tableLabel(file: string): string {
  return ALL_TABLES.find(t => t.file === file)?.name ?? file;
}
