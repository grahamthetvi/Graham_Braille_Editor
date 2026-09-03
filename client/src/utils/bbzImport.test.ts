import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  BBZ_LOCATION_FILE,
  BBZ_MAX_BYTES,
  BbzImportError,
  bbxXmlToEditorText,
  importBbzToEditorText,
  isBbzFile,
  normalizeZipEntryPath,
} from './bbzImport';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readFixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(FIXTURE_DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function fakeFile(name: string): File {
  return new File([new Uint8Array([0])], name);
}

describe('bbzImport', () => {
  it('detects .bbz files by extension', () => {
    expect(isBbzFile(fakeFile('hello.bbz'))).toBe(true);
    expect(isBbzFile(fakeFile('hello.BBZ'))).toBe(true);
    expect(isBbzFile(fakeFile('hello.brf'))).toBe(false);
  });

  it('normalizes zip entry paths', () => {
    expect(normalizeZipEntryPath('/document.bbx')).toBe('document.bbx');
    expect(normalizeZipEntryPath('document.bbx')).toBe('document.bbx');
  });

  it('extracts hello world from sample BBZ', async () => {
    const { text, bbxPath } = await importBbzToEditorText(readFixture('hello_world.bbz'));
    expect(bbxPath).toBe('blankTemplate.bbx');
    expect(text).toBe('hello world');
  });

  it('extracts artist label lines from ECVI BBZ', async () => {
    const { text, bbxPath } = await importBbzToEditorText(readFixture('braille_labels_ecvi.bbz'));
    expect(bbxPath).toBe('document.bbx');
    expect(text).toContain('Teddy Armstrong');
    expect(text).toContain('Springfield, IL');
    expect(text).toContain('Title: “Bernice”');
    expect(text).toContain('Mina (Mimow) Edmondson');
    expect(text).toContain('Not For Sale');
    const teddyIdx = text.indexOf('Teddy Armstrong');
    const minaIdx = text.indexOf('Mina (Mimow) Edmondson');
    expect(teddyIdx).toBeGreaterThanOrEqual(0);
    expect(minaIdx).toBeGreaterThan(teddyIdx);
    expect(text.slice(teddyIdx, minaIdx)).toMatch(/\n\n/);
    expect(text.split('\n')).toContain('Teddy Armstrong');
    expect(text.split('\n')).toContain('Springfield, IL');
  });

  it('bbxXmlToEditorText preserves blank lines from utd:newLine', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bbdoc xmlns="http://brailleblaster.org/ns/bb" xmlns:bb="http://brailleblaster.org/ns/bb" xmlns:utd="http://brailleblaster.org/ns/utd">
<head><bb:version>4</bb:version></head>
<SECTION bb:type="ROOT"><SECTION bb:type="OTHER">
<BLOCK bb:type="DEFAULT">Line one</BLOCK>
<BLOCK bb:type="DEFAULT">Line two</BLOCK>
<utd:newLine/>
<utd:newLine/>
<BLOCK bb:type="DEFAULT">Line three</BLOCK>
</SECTION></SECTION>
</bbdoc>`;
    expect(bbxXmlToEditorText(xml)).toBe('Line one\nLine two\n\n\nLine three');
  });

  it('rejects non-zip buffers', async () => {
    const buf = new TextEncoder().encode('not a zip').buffer;
    await expect(importBbzToEditorText(buf)).rejects.toMatchObject({ code: 'not-bbz' });
  });

  it('rejects zip without bbx_location', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'hello');
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(importBbzToEditorText(buf)).rejects.toMatchObject({ code: 'not-bbz' });
  });

  it('rejects empty BBX content', async () => {
    const zip = new JSZip();
    zip.file(BBZ_LOCATION_FILE, '/empty.bbx');
    zip.file(
      'empty.bbx',
      `<?xml version="1.0" encoding="UTF-8"?>
<bbdoc xmlns="http://brailleblaster.org/ns/bb" xmlns:bb="http://brailleblaster.org/ns/bb" xmlns:utd="http://brailleblaster.org/ns/utd">
<head><bb:version>4</bb:version></head>
<SECTION bb:type="ROOT"><SECTION bb:type="OTHER"></SECTION></SECTION>
</bbdoc>`,
    );
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    await expect(importBbzToEditorText(buf)).rejects.toMatchObject({ code: 'empty' });
  });

  it('exports a reasonable max size', () => {
    expect(BBZ_MAX_BYTES).toBeGreaterThan(10 * 1024 * 1024);
  });

  it('throws BbzImportError with code', () => {
    const err = new BbzImportError('empty');
    expect(err).toBeInstanceOf(BbzImportError);
    expect(err.code).toBe('empty');
  });
});
