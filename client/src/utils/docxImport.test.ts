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
  importDocxToEditorText,
  isDocxFile,
  isLegacyDocFile,
} from './docxImport';

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
  it('turns headings into plain paragraphs without markdown hashes', () => {
    const text = docxHtmlToEditorText('<h1>Chapter One</h1><p>Hello world.</p>');
    expect(text).toBe('Chapter One\n\nHello world.');
    expect(text.includes('#')).toBe(false);
  });

  it('keeps lists as one item per line with print prefixes', () => {
    const html = '<p>Intro</p><ul><li>Apples</li><li>Bananas</li></ul><ol><li>First</li><li>Second</li></ol>';
    const text = docxHtmlToEditorText(html);
    expect(text).toBe('Intro\n\n- Apples\n- Bananas\n\n1. First\n2. Second');
  });

  it('keeps visible hyperlink text only', () => {
    const text = docxHtmlToEditorText('<p>See <a href="https://example.com/secret">the guide</a> please.</p>');
    expect(text).toBe('See the guide please.');
    expect(text.includes('https://')).toBe(false);
  });

  it('inserts image alt text and skips images without alt', () => {
    const withAlt = docxHtmlToEditorText('<p>Before</p><p><img alt="A water cycle diagram" src="data:image/png;base64,xx"/></p><p>After</p>');
    expect(withAlt).toBe('Before\n\n[Image: A water cycle diagram]\n\nAfter');
    const noAlt = docxHtmlToEditorText('<p>Before</p><p><img src="x.png"/></p><p>After</p>');
    expect(noAlt).toBe('Before\n\nAfter');
  });

  it('turns page-break sentinels into blank-line paragraph breaks', () => {
    const text = docxHtmlToEditorText(`<p>Page one</p><p>${PAGE_BREAK_SENTINEL}</p><p>Page two</p>`);
    expect(text).toBe('Page one\n\nPage two');
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
});
