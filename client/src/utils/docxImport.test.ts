import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  DOCX_MAX_BYTES,
  DOCX_OOXML_MIME,
  DocxImportError,
  PAGE_BREAK_SENTINEL,
  docxHtmlToEditorText,
  htmlToTableGrids,
  importDocxTables,
  importDocxToEditorText,
  isDocxFile,
  isLegacyDocFile,
  mergeImportedTableGrids,
} from './docxImport';
import { tableGridToTsv } from '../types/table';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function wrapDocument(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}">
  <w:body>
${bodyInner}
  </w:body>
</w:document>`;
}

function p(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function listP(text: string, numId: string): string {
  return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function wTc(text: string): string {
  return `<w:tc><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
}

function wTbl(rows: string[][]): string {
  const trs = rows
    .map((row) => `<w:tr>${row.map((cell) => wTc(cell)).join('')}</w:tr>`)
    .join('');
  return `<w:tbl>${trs}</w:tbl>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:outlineLvl w:val="1"/></w:pPr>
  </w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val=""/>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

async function buildDocx(documentXml: string, extra: Record<string, string> = {}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', ROOT_RELS);
  zip.file('word/_rels/document.xml.rels', DOC_RELS);
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/numbering.xml', NUMBERING_XML);
  zip.file('word/document.xml', documentXml);
  for (const [name, contents] of Object.entries(extra)) {
    zip.file(name, contents);
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

async function maybeWriteFixture(name: string, buffer: ArrayBuffer): Promise<void> {
  if (process.env.WRITE_DOCX_FIXTURES !== '1') return;
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(join(FIXTURE_DIR, name), Buffer.from(buffer));
}

function fakeFile(name: string, type = ''): File {
  return new File([new Uint8Array([0])], name, type ? { type } : undefined);
}

describe('isDocxFile / isLegacyDocFile', () => {
  it('detects .docx by name even without a MIME type', () => {
    expect(isDocxFile(fakeFile('Lesson.docx'))).toBe(true);
    expect(isLegacyDocFile(fakeFile('Lesson.docx'))).toBe(false);
  });

  it('detects OOXML MIME without relying on the extension', () => {
    expect(isDocxFile(fakeFile('download', DOCX_OOXML_MIME))).toBe(true);
  });

  it('rejects legacy .doc and .dot', () => {
    expect(isLegacyDocFile(fakeFile('old.doc'))).toBe(true);
    expect(isLegacyDocFile(fakeFile('old.DOC'))).toBe(true);
    expect(isLegacyDocFile(fakeFile('template.dot'))).toBe(true);
    expect(isDocxFile(fakeFile('old.doc'))).toBe(false);
  });

  it('does not treat .docx as a legacy .doc', () => {
    expect(isLegacyDocFile(fakeFile('file.docx', 'application/msword'))).toBe(false);
    expect(isDocxFile(fakeFile('file.docx', 'application/msword'))).toBe(true);
  });
});

describe('docxHtmlToEditorText', () => {
  it('turns headings into plain paragraphs without markdown hashes', async () => {
    const text = await docxHtmlToEditorText('<h1>Chapter One</h1><p>Hello world.</p>');
    expect(text).toBe('Chapter One\n\nHello world.');
    expect(text.includes('#')).toBe(false);
  });

  it('keeps lists as one item per line with print prefixes', async () => {
    const html = '<p>Intro</p><ul><li>Apples</li><li>Bananas</li></ul><ol><li>First</li><li>Second</li></ol>';
    const text = await docxHtmlToEditorText(html);
    expect(text).toBe('Intro\n\n- Apples\n- Bananas\n\n1. First\n2. Second');
  });

  it('keeps visible hyperlink text only', async () => {
    const text = await docxHtmlToEditorText('<p>See <a href="https://example.com/secret">the guide</a> please.</p>');
    expect(text).toBe('See the guide please.');
    expect(text.includes('https://')).toBe(false);
  });

  it('inserts image alt text and skips images without alt', async () => {
    const withAlt = await docxHtmlToEditorText('<p>Before</p><p><img alt="A water cycle diagram" src="data:image/png;base64,xx"/></p><p>After</p>');
    expect(withAlt).toBe('Before\n\n[Image: A water cycle diagram]\n\nAfter');
    const noAlt = await docxHtmlToEditorText('<p>Before</p><p><img src="x.png"/></p><p>After</p>');
    expect(noAlt).toBe('Before\n\nAfter');
  });

  it('turns page-break sentinels into blank-line paragraph breaks', async () => {
    const text = await docxHtmlToEditorText(`<p>Page one</p><p>${PAGE_BREAK_SENTINEL}</p><p>Page two</p>`);
    expect(text).toBe('Page one\n\nPage two');
  });

  it('turns HTML tables into print-source :::table fences', async () => {
    const html =
      '<p>Intro</p><table><thead><tr><th>Animal</th><th>Size</th></tr></thead><tbody><tr><td>cat</td><td>small</td></tr><tr><td>dog</td><td>large</td></tr></tbody></table><p>Outro</p>';
    const text = await docxHtmlToEditorText(html);
    expect(text.startsWith('Intro')).toBe(true);
    expect(text).toContain(':::table print');
    expect(text).toContain('Animal\tSize');
    expect(text).toContain('cat\tsmall');
    expect(text).toContain('dog\tlarge');
    expect(text).toMatch(/Outro$/);
    expect(text).not.toContain('"3');
    expect(text).not.toMatch(/,qu>t}/);
  });

  it('keeps empty cells so columns stay aligned', async () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td></td></tr></table>';
    const text = await docxHtmlToEditorText(html);
    expect(text).toContain(':::table print');
    expect(text).toContain('A\tB');
    expect(text).toContain('x\t');
  });

  it('joins wrapped paragraphs inside a table cell with spaces', async () => {
    const html =
      '<table><tr><td>antics</td><td><p>Ridiculous and</p><p>unpredictable behavior</p></td></tr></table>';
    const text = await docxHtmlToEditorText(html, {
      formatTable: (spec) => spec.cells.map((row) => row.join('|')).join('\n'),
    });
    expect(text).toBe('antics|Ridiculous and unpredictable behavior');
  });

  it('merges adjacent page-split HTML tables that repeat the header', async () => {
    const html =
      '<table><tr><th>Word</th><th>Def</th></tr><tr><td>antics</td><td>pranks</td></tr></table>' +
      '<table><tr><th>Word</th><th>Def</th></tr><tr><td>invalidate</td><td>cancel</td></tr></table>';
    const text = await docxHtmlToEditorText(html);
    expect(text.match(/:::table print/g)?.length).toBe(1);
    expect(text).toContain('antics\tpranks');
    expect(text).toContain('invalidate\tcancel');
  });

  it('expands colspan so later columns line up', async () => {
    const html =
      '<table><tr><td colspan="2">Name</td><td>Age</td></tr><tr><td>Ada</td><td>Lovelace</td><td>36</td></tr></table>';
    const text = await docxHtmlToEditorText(html, {
      formatTable: (spec) => spec.cells.map((row) => row.join('|')).join('\n'),
    });
    expect(text).toBe('Name||Age\nAda|Lovelace|36');
  });

  it('flattens nested tables into the parent cell instead of extra rows', async () => {
    const html =
      '<table><tr><td>outer</td><td><table><tr><td>inner</td></tr></table></td></tr><tr><td>r2c1</td><td>r2c2</td></tr></table>';
    const text = await docxHtmlToEditorText(html, {
      formatTable: (spec) => spec.cells.map((row) => row.join('|')).join('\n'),
    });
    expect(text).toBe('outer|inner\nr2c1|r2c2');
  });

  it('flattens tables that exceed column limits', async () => {
    const cols = Array.from({ length: 21 }, (_, i) => `<td>c${i}</td>`).join('');
    const html = `<table><tr>${cols}</tr></table>`;
    const text = await docxHtmlToEditorText(html);
    expect(text.includes(':::table')).toBe(false);
    expect(text).toContain('c0');
    expect(text).toContain('c20');
  });
});

const UNIT2_VOCAB: string[][] = [
  ['antics', 'n. pl.', 'Ridiculous and unpredictable behavior or actions', 'pranks, shenanigans', 'N/A'],
  ['avowed', 'adj., part.', 'Declared openly and without shame, acknowledged', 'admitted, sworn', 'unacknowledged, undisclosed'],
  ['banter', 'v., n.', '(v.) To exchange playful remarks, tease; (n.) talk that is playful and teasing', 'joking, raillery', 'serious talk'],
  ['bountiful', 'adj.', 'Giving freely, generous; plentiful, given abundantly', 'liberal, abundant, copious', 'scarce, scanty, in short supply'],
  ['congested', 'adj., part.', 'Overcrowded, filled or occupied to excess', 'jammed, packed, choked', 'uncluttered, unimpeded'],
  ['detriment', 'n.', 'Harm or loss; injury, damage; a disadvantage; a cause of harm, injury, loss, or damage', 'hindrance, liability', 'advantage, help, plus'],
  ['durable', 'adj., n. pl.', '(adj.) Sturdy, long-lasting; (n. pl.) consumer goods used repeatedly over a series of years', 'long-lasting, enduring', 'fragile, perishable, fleeting, ephemeral'],
  ['enterprising', 'adj.', 'Energetic, willing and able to start something new, showing boldness and imagination', 'vigorous, ambitious, aggressive, audacious', 'lazy, indolent, timid, diffident'],
  ['frugal', 'adj.', 'Economical, avoiding waste and luxury; scanty, poor, meager', 'thrifty, skimpy', 'wasteful, improvident, lavish, extravagant'],
  ['gingerly', 'adj., adv.', 'With extreme care or caution', 'cautiously, warily, circumspectly', 'firmly, confidently, aggressively'],
  ['glut', 'v., n.', '(v.) To provide more than is needed or wanted; to feed or fill to the point of overstuffing; (n.) an oversupply', '(v.) flood, inundate; (n.) surplus, plethora', '(n.) shortage, scarcity, dearth, paucity'],
  ['incognito', 'adj., adv., n.', '(adj., adv.) In a disguised state, under an assumed name or identity; (n.) the state of being disguised; a person in disguise', 'disguised', 'undisguised'],
  ['invalidate', 'v.', 'To make valueless, take away all force or effect', 'cancel, annul, disapprove, discredit', 'support, confirm, back up, legalize'],
  ['legendary', 'adj.', 'Described in well-known stories; existing in old stories (legends) rather than in real life', 'mythical, fabulous, famous, celebrated', 'N/A'],
  ['maim', 'v.', 'To cripple, disable, injure, mar, disfigure, mutilate', 'cripple, disable, injure, mutilate', 'N/A'],
  ['minimize', 'v.', 'To make as small as possible, make the least of; to make smaller than before', 'belittle, downplay, underrate', 'magnify, enlarge, exaggerate'],
  ['oblique', 'adj.', 'Slanting or sloping; not straightforward or direct', 'diagonal, indirect', 'direct, straight to the point'],
  ['veer', 'v.', 'To change direction or course suddenly, turn aside, shift, swerve', 'swerve, turn aside, shift', 'N/A'],
  ['venerate', 'v.', 'To regard with reverence, look up to with great respect', 'worship, revere, idolize', 'despise, detest, ridicule, deride'],
  ['wanton', 'adj., n.', '(adj.) Reckless; heartless, unjustifiable; loose in morals; (n.) a spoiled, pampered person; one with low morals', 'rash, malicious, spiteful, unprovoked', 'justified, morally strict, responsible'],
];

describe('htmlToTableGrids / mergeImportedTableGrids', () => {
  it('extracts a 5-column vocabulary table with wrapped cell text', () => {
    const html = `
      <p>Unit 2 Vocabulary List</p>
      <table>
        <tr>
          <th>Word</th><th><p>Part(s) of</p><p>Speech</p></th><th>Definition</th><th>Synonyms</th><th>Antonyms</th>
        </tr>
        <tr>
          <td>antics</td>
          <td>n. pl.</td>
          <td><p>Ridiculous and</p><p>unpredictable behavior or actions</p></td>
          <td><p>pranks,</p><p>shenanigans</p></td>
          <td>N/A</td>
        </tr>
        <tr>
          <td>avowed</td>
          <td>adj., part.</td>
          <td>Declared openly and without shame, acknowledged</td>
          <td>admitted, sworn</td>
          <td><p>unacknowledged,</p><p>undisclosed</p></td>
        </tr>
      </table>`;
    const grids = htmlToTableGrids(html);
    expect(grids).toHaveLength(1);
    expect(grids[0][0]).toEqual(['Word', 'Part(s) of Speech', 'Definition', 'Synonyms', 'Antonyms']);
    expect(grids[0][1][0]).toBe('antics');
    expect(grids[0][1][2]).toBe('Ridiculous and unpredictable behavior or actions');
    expect(grids[0][1][3]).toBe('pranks, shenanigans');
    expect(grids[0][2][0]).toBe('avowed');
    expect(grids[0][2][4]).toBe('unacknowledged, undisclosed');
  });

  it('expands colspan into empty following cells', () => {
    const html = '<table><tr><td colspan="2">Name</td><td>Date</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></table>';
    const [grid] = htmlToTableGrids(html);
    expect(grid[0]).toEqual(['Name', '', 'Date']);
    expect(grid[1]).toEqual(['a', 'b', 'c']);
  });

  it('merges page-split tables and drops a repeated header row', () => {
    const page1 = [
      ['Word', 'Definition'],
      ['antics', 'pranks'],
      ['incognito', 'in a disguised state'],
    ];
    const page2 = [
      ['Word', 'Definition'],
      ['invalidate', 'to make valueless'],
    ];
    const merged = mergeImportedTableGrids([page1, page2]);
    expect(merged).toEqual([
      ['Word', 'Definition'],
      ['antics', 'pranks'],
      ['incognito', 'in a disguised state'],
      ['invalidate', 'to make valueless'],
    ]);
  });

  it('prefers the widest data table when a 2-column name block sits above', () => {
    const nameBlock = [
      ['Name', ''],
      ['Quiz Date', ''],
    ];
    const vocab = [
      ['Word', 'Part(s) of Speech', 'Definition'],
      ['antics', 'n. pl.', 'Ridiculous behavior'],
    ];
    const merged = mergeImportedTableGrids([nameBlock, vocab]);
    expect(merged[0]).toEqual(['Word', 'Part(s) of Speech', 'Definition']);
    expect(merged).toHaveLength(2);
  });

  it('serializes grids to TSV for the print editor', () => {
    expect(tableGridToTsv([['a', 'b'], ['1', '2']])).toBe('a\tb\n1\t2');
  });

  it('recovers every Unit 2 vocabulary row from a Word-like HTML table', () => {
    const rows = UNIT2_VOCAB.map(
      ([word, pos, def, syn, ant]) =>
        `<tr><td>${word}</td><td>${pos}</td><td>${def}</td><td>${syn}</td><td>${ant}</td></tr>`,
    ).join('');
    const html = `<table><tr><th>Word</th><th>Part(s) of Speech</th><th>Definition</th><th>Synonyms</th><th>Antonyms</th></tr>${rows}</table>`;
    const [grid] = htmlToTableGrids(html);
    expect(grid).toHaveLength(UNIT2_VOCAB.length + 1);
    expect(grid[0]).toEqual(['Word', 'Part(s) of Speech', 'Definition', 'Synonyms', 'Antonyms']);
    for (let i = 0; i < UNIT2_VOCAB.length; i++) {
      expect(grid[i + 1][0]).toBe(UNIT2_VOCAB[i][0]);
      expect(grid[i + 1][2]).toContain(UNIT2_VOCAB[i][2].slice(0, 20));
    }
    expect(grid.map((r) => r[0]).slice(1)).toEqual(UNIT2_VOCAB.map((r) => r[0]));
  });
});

describe('importDocxToEditorText', () => {
  it('converts headings and paragraphs from a real OOXML package', async () => {
    const xml = wrapDocument(
      p('Chapter Title', 'Heading1') + p('Hello paragraph.') + p('A second paragraph.'),
    );
    const buffer = await buildDocx(xml);
    await maybeWriteFixture('headings-paragraphs.docx', buffer);
    const { text } = await importDocxToEditorText(buffer);
    expect(text).toContain('Chapter Title');
    expect(text).toContain('Hello paragraph.');
    expect(text).toContain('A second paragraph.');
    expect(text.includes('# Chapter')).toBe(false);
    expect(text).toBe('Chapter Title\n\nHello paragraph.\n\nA second paragraph.');
  });

  it('converts numbered and bulleted lists', async () => {
    const xml = wrapDocument(
      p('Supplies') + listP('Pencils', '1') + listP('Paper', '1') + listP('Open the book', '2') + listP('Read the page', '2'),
    );
    const buffer = await buildDocx(xml);
    await maybeWriteFixture('simple-lists.docx', buffer);
    const { text } = await importDocxToEditorText(buffer);
    expect(text).toContain('- Pencils');
    expect(text).toContain('- Paper');
    expect(text).toContain('1. Open the book');
    expect(text).toContain('2. Read the page');
  });

  it('converts Word tables into print-source :::table fences', async () => {
    const xml = wrapDocument(
      p('Roster') +
        wTbl([
          ['Animal', 'Size'],
          ['cat', 'small'],
          ['dog', 'large'],
        ]),
    );
    const buffer = await buildDocx(xml);
    await maybeWriteFixture('simple-table.docx', buffer);
    const { text } = await importDocxToEditorText(buffer);
    expect(text).toContain('Roster');
    expect(text).toContain(':::table print');
    expect(text).toContain('Animal\tSize');
    expect(text).toContain('cat\tsmall');
    expect(text.trimEnd().endsWith(':::')).toBe(true);
    expect(text).not.toContain('"3');
  });

  it('keeps hyperlink display text and treats page breaks as paragraph breaks', async () => {
    const xml = wrapDocument(
      `<w:p><w:r><w:t>Visit </w:t></w:r><w:hyperlink r:id="rId9" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:t>the library</w:t></w:r></w:hyperlink><w:r><w:t> today.</w:t></w:r></w:p>` +
        `<w:p><w:r><w:br w:type="page"/><w:t>After the break.</w:t></w:r></w:p>`,
    );
    const buffer = await buildDocx(xml, {
      'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/library" TargetMode="External"/>
</Relationships>`,
    });
    await maybeWriteFixture('link-and-page-break.docx', buffer);
    const { text } = await importDocxToEditorText(buffer);
    expect(text).toContain('the library');
    expect(text.includes('https://example.com')).toBe(false);
    expect(text).toContain('After the break.');
    expect(text).toMatch(/Visit the library today\.\n\nAfter the break\./);
  });

  it('reads checked-in heading and list fixtures', async () => {
    const headings = readFileSync(join(FIXTURE_DIR, 'headings-paragraphs.docx'));
    const lists = readFileSync(join(FIXTURE_DIR, 'simple-lists.docx'));
    const headingText = (await importDocxToEditorText(toArrayBuffer(headings))).text;
    const listText = (await importDocxToEditorText(toArrayBuffer(lists))).text;
    expect(headingText).toBe('Chapter Title\n\nHello paragraph.\n\nA second paragraph.');
    expect(listText).toContain('- Pencils');
    expect(listText).toContain('1. Open the book');
  });

  it('throws too-large for buffers over the size cap', async () => {
    const huge = new ArrayBuffer(DOCX_MAX_BYTES + 1);
    await expect(importDocxToEditorText(huge)).rejects.toMatchObject({ code: 'too-large' });
  });

  it('throws not-docx for random bytes', async () => {
    const buf = new TextEncoder().encode('this is not a zip').buffer;
    await expect(importDocxToEditorText(buf)).rejects.toMatchObject({ code: 'not-docx' });
  });

  it('throws not-docx for OLE compound files (.doc magic)', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(importDocxToEditorText(ole.buffer)).rejects.toMatchObject({ code: 'not-docx' });
  });

  it('throws not-docx for a zip that is not OOXML Word', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(importDocxToEditorText(buf)).rejects.toMatchObject({ code: 'not-docx' });
  });

  it('throws encrypted when the package is a passworded OOXML file', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.file('EncryptionInfo', 'secret');
    zip.file('EncryptedPackage', 'cipher');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(importDocxToEditorText(buf)).rejects.toMatchObject({ code: 'encrypted' });
  });

  it('throws empty for a Word document with no readable text', async () => {
    const xml = wrapDocument('<w:p/>');
    const buffer = await buildDocx(xml);
    await expect(importDocxToEditorText(buffer)).rejects.toMatchObject({ code: 'empty' });
  });

  it('uses DocxImportError for typed failures', async () => {
    try {
      await importDocxToEditorText(new ArrayBuffer(4));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DocxImportError);
      expect((err as DocxImportError).code).toBe('not-docx');
    }
  });

  it('extracts an OOXML table with wrapped cell paragraphs as a print grid', async () => {
    const xml = wrapDocument(
      p('Unit 2 Vocabulary List') +
        wTblParas([
          [['Word'], ['Part(s) of', 'Speech'], ['Definition'], ['Synonyms'], ['Antonyms']],
          [
            ['antics'],
            ['n. pl.'],
            ['Ridiculous and', 'unpredictable behavior or actions'],
            ['pranks,', 'shenanigans'],
            ['N/A'],
          ],
          [
            ['avowed'],
            ['adj., part.'],
            ['Declared openly and without shame, acknowledged'],
            ['admitted, sworn'],
            ['unacknowledged,', 'undisclosed'],
          ],
        ]),
    );
    const buffer = await buildDocx(xml);
    await maybeWriteFixture('vocab-table.docx', buffer);

    const editor = await importDocxToEditorText(buffer);
    expect(editor.text).toContain('Unit 2 Vocabulary List');
    expect(editor.text).toContain(':::table print');
    expect(editor.text).toMatch(/antics\t/);
    expect(editor.text).toContain('Ridiculous and unpredictable behavior or actions');
    expect(editor.text).toContain('pranks, shenanigans');
    expect(editor.text).not.toMatch(/,qu>t}/);

    const { primary, tables } = await importDocxTables(buffer);
    expect(tables).toHaveLength(1);
    expect(primary[0]).toEqual(['Word', 'Part(s) of Speech', 'Definition', 'Synonyms', 'Antonyms']);
    expect(primary[1][0]).toBe('antics');
    expect(primary[1][2]).toBe('Ridiculous and unpredictable behavior or actions');
    expect(primary[2][0]).toBe('avowed');
    expect(primary[2][4]).toBe('unacknowledged, undisclosed');
  });

  it('merges two OOXML tables that repeat the same header (page split)', async () => {
    const header = [['Word'], ['Definition']];
    const xml = wrapDocument(
      wTblParas([header, [['antics'], ['pranks']]]) + wTblParas([header, [['invalidate'], ['cancel']]]),
    );
    const buffer = await buildDocx(xml);
    const { primary, tables } = await importDocxTables(buffer);
    expect(tables).toHaveLength(2);
    expect(primary.map((r) => r[0])).toEqual(['Word', 'antics', 'invalidate']);
    const editor = await importDocxToEditorText(buffer);
    expect(editor.text).toContain('antics');
    expect(editor.text).toContain('invalidate');
    expect(editor.text).toContain(':::table print');
  });

  it('throws empty when a Word file has no tables', async () => {
    const xml = wrapDocument(p('No tables here.'));
    const buffer = await buildDocx(xml);
    await expect(importDocxTables(buffer)).rejects.toMatchObject({ code: 'empty' });
  });
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** OOXML table: rows of cells of paragraphs. */
function wTblParas(rows: string[][][]): string {
  const body = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map((paras) => {
            const pXml = paras
              .map((t) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r></w:p>`)
              .join('');
            return `<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>${pXml}</w:tc>`;
          })
          .join('')}</w:tr>`,
    )
    .join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${body}</w:tbl>`;
}
