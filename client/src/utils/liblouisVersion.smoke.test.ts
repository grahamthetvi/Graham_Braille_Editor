/**
 * liblouisVersion.smoke.test.ts — load real WASM and smoke-translate.
 *
 * Preloads public/tables into MEMFS (no NODEFS / createLazyFile needed).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const wasmDir = resolve(root, 'public/wasm');
const tablesDir = resolve(root, 'public/tables');
const versionPin = readFileSync(
  resolve(root, 'scripts/build-liblouis/VERSION'),
  'utf8'
).trim();

interface LiblouisModule {
  ccall: (name: string, ret: string, types: string[], args: unknown[]) => unknown;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  stringToUTF16: (s: string, ptr: number, max: number) => void;
  setValue: (ptr: number, value: number, type: string) => void;
  getValue: (ptr: number, type: string) => number;
  HEAP16: Int16Array;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
  };
}

describe('liblouis WASM smoke', () => {
  let capi: LiblouisModule;

  beforeAll(async () => {
    const wasmPath = resolve(wasmDir, 'liblouis.wasm');
    const header = readFileSync(wasmPath).subarray(0, 4);
    expect([...header]).toEqual([0x00, 0x61, 0x73, 0x6d]);

    // Write a temporary CJS loader so emscripten glue can use module.exports
    // without conflicting with ESM top-level await in vitest.
    const tmpDir = resolve(root, 'node_modules/.cache/liblouis-smoke');
    mkdirSync(tmpDir, { recursive: true });
    const glueSrc = readFileSync(resolve(wasmDir, 'liblouis.js'), 'utf8');
    const loaderPath = join(tmpDir, 'liblouis-loader.cjs');
    writeFileSync(
      loaderPath,
      glueSrc + '\nmodule.exports = (typeof liblouis_emscripten !== "undefined") ? liblouis_emscripten : module.exports;\n'
    );

    const require = createRequire(import.meta.url);
    const factory = require(loaderPath) as (arg?: {
      wasmBinary?: Buffer;
      locateFile?: (p: string) => string;
    }) => Promise<LiblouisModule>;

    capi = await factory({
      wasmBinary: readFileSync(wasmPath),
      locateFile: (p) => resolve(wasmDir, p),
    });

    for (const name of readdirSync(tablesDir)) {
      const data = readFileSync(join(tablesDir, name));
      capi.FS.writeFile('/' + name, new Uint8Array(data));
    }
  }, 60_000);

  function translate(table: string, text: string, mode = 0): string | null {
    const L = text.length;
    const maxOut = Math.max(100, L * 10);
    const inPtr = capi._malloc((L + 1) * 2);
    const outPtr = capi._malloc(maxOut * 2);
    capi.stringToUTF16(text, inPtr, (L + 1) * 2);
    const inLen = capi._malloc(4);
    const outLen = capi._malloc(4);
    capi.setValue(inLen, L, 'i32');
    capi.setValue(outLen, maxOut, 'i32');
    const ok = capi.ccall(
      'lou_translateString',
      'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number'],
      [table, inPtr, inLen, outPtr, outLen, 0, 0, mode]
    ) as number;
    if (!ok) {
      for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
      return null;
    }
    const n = capi.getValue(outLen, 'i32');
    const chars = capi.HEAP16.subarray(outPtr >> 1, (outPtr >> 1) + n);
    const s = String.fromCharCode(...Array.from(chars));
    for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
    return s;
  }

  function translateWithTypeform(table: string, text: string, bits: number): string | null {
    const L = text.length;
    const maxOut = Math.max(100, L * 10);
    const inPtr = capi._malloc((L + 1) * 2);
    const outPtr = capi._malloc(maxOut * 2);
    const typeformPtr = capi._malloc(maxOut * 2);
    capi.stringToUTF16(text, inPtr, (L + 1) * 2);
    for (let i = 0; i < maxOut; i++) capi.setValue(typeformPtr + i * 2, 0, 'i16');
    for (let i = 0; i < L; i++) capi.setValue(typeformPtr + i * 2, bits, 'i16');
    const inLen = capi._malloc(4);
    const outLen = capi._malloc(4);
    capi.setValue(inLen, L, 'i32');
    capi.setValue(outLen, maxOut, 'i32');
    const ok = capi.ccall(
      'lou_translateString',
      'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number'],
      [table, inPtr, inLen, outPtr, outLen, typeformPtr, 0, 128]
    ) as number;
    if (!ok) {
      for (const p of [inPtr, outPtr, inLen, outLen, typeformPtr]) capi._free(p);
      return null;
    }
    const n = capi.getValue(outLen, 'i32');
    const chars = capi.HEAP16.subarray(outPtr >> 1, (outPtr >> 1) + n);
    const s = String.fromCharCode(...Array.from(chars));
    for (const p of [inPtr, outPtr, inLen, outLen, typeformPtr]) capi._free(p);
    return s;
  }

  function translateWithPos(table: string, text: string): { output: string; outputPos: number[] } | null {
    const L = text.length;
    const maxOut = Math.max(100, L * 10);
    const inPtr = capi._malloc((L + 1) * 2);
    const outPtr = capi._malloc(maxOut * 2);
    capi.stringToUTF16(text, inPtr, (L + 1) * 2);
    const inLen = capi._malloc(4);
    const outLen = capi._malloc(4);
    capi.setValue(inLen, L, 'i32');
    capi.setValue(outLen, maxOut, 'i32');
    const outputPosPtr = capi._malloc(L * 4);
    const ok = capi.ccall(
      'lou_translate',
      'number',
      [
        'string',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
      ],
      [table, inPtr, inLen, outPtr, outLen, 0, 0, outputPosPtr, 0, 0, 0]
    ) as number;
    if (!ok) {
      for (const p of [inPtr, outPtr, inLen, outLen, outputPosPtr]) capi._free(p);
      return null;
    }
    const n = capi.getValue(outLen, 'i32');
    const chars = capi.HEAP16.subarray(outPtr >> 1, (outPtr >> 1) + n);
    const output = String.fromCharCode(...Array.from(chars));
    const outputPos: number[] = [];
    for (let i = 0; i < L; i++) {
      outputPos.push(capi.getValue(outputPosPtr + i * 4, 'i32'));
    }
    for (const p of [inPtr, outPtr, inLen, outLen, outputPosPtr]) capi._free(p);
    return { output, outputPos };
  }

  function backTranslate(table: string, brf: string, mode = 128): string | null {
    const L = brf.length;
    const maxOut = Math.max(100, L * 10);
    const inPtr = capi._malloc((L + 1) * 2);
    const outPtr = capi._malloc(maxOut * 2);
    capi.stringToUTF16(brf, inPtr, (L + 1) * 2);
    const inLen = capi._malloc(4);
    const outLen = capi._malloc(4);
    capi.setValue(inLen, L, 'i32');
    capi.setValue(outLen, maxOut, 'i32');
    const ok = capi.ccall(
      'lou_backTranslateString',
      'number',
      ['string', 'number', 'number', 'number', 'number', 'number', 'number'],
      [table, inPtr, inLen, outPtr, outLen, 0, 0, mode]
    ) as number;
    if (!ok) {
      for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
      return null;
    }
    const n = capi.getValue(outLen, 'i32');
    const chars = capi.HEAP16.subarray(outPtr >> 1, (outPtr >> 1) + n);
    const s = String.fromCharCode(...Array.from(chars));
    for (const p of [inPtr, outPtr, inLen, outLen]) capi._free(p);
    return s;
  }

  it(`reports lou_version matching pin ${versionPin}`, () => {
    const v = capi.ccall('lou_version', 'string', [], []) as string;
    expect(v.startsWith(versionPin.split('.').slice(0, 2).join('.'))).toBe(true);
    expect(v).toContain(versionPin);
  });

  it('translates UEB grade 1', () => {
    const out = translate('en-ueb-g1.ctb', 'Hello');
    expect(out).toBeTruthy();
    expect(out!.length).toBeGreaterThan(0);
  });

  it('translates UEB grade 2 contraction', () => {
    const out = translate('en-ueb-g2.ctb', 'and');
    expect(out).toBeTruthy();
    expect(out!.length).toBeGreaterThan(0);
    expect(out!.length).toBeLessThan(5);
  });

  it('translates Hindi, French BFU, and German', () => {
    expect(translate('hi-in-g1.utb', 'नमस्ते')).toBeTruthy();
    expect(translate('fr-bfu-g2.ctb', 'bonjour')).toBeTruthy();
    expect(translate('de-g1.ctb', 'Hallo')).toBeTruthy();
  });

  it('translates Nemeth sample', () => {
    expect(translate('nemeth.ctb', 'x+y')).toBeTruthy();
  });

  it('provides outputPos mapping for highlight', () => {
    const res = translateWithPos('en-ueb-g1.ctb', 'Hi');
    expect(res).toBeTruthy();
    expect(res!.outputPos.length).toBe(2);
  });

  it('UEB italic typeform adds emphasis indicators', () => {
    const plain = translate('en-ueb-g1.ctb', 'Hello', 128);
    const italic = translateWithTypeform('en-ueb-g1.ctb', 'Hello', 0x0001);
    expect(plain).toBeTruthy();
    expect(italic).toBeTruthy();
    expect(italic).not.toBe(plain);
    expect(italic!.length).toBeGreaterThan(plain!.length);
  });

  it('noUndefined mode still translates defined text', () => {
    const out = translate('en-ueb-g1.ctb', 'Hello', 128);
    expect(out).toBeTruthy();
    expect(out).not.toMatch(/\\x[0-9a-f]{4}/i);
    expect(out).not.toMatch(/\\\d+\//);
  });

  it('noUndefined suppresses undefined-cell dump on reverse', () => {
    const dumped = backTranslate('en-ueb-g1.ctb', '\u28ff', 0);
    const quiet = backTranslate('en-ueb-g1.ctb', '\u28ff', 128);
    expect(quiet ?? '').not.toMatch(/\\x[0-9a-f]{4}/i);
    expect(quiet ?? '').not.toMatch(/\\\d+\//);
    if (dumped && /\\\d+\//.test(dumped)) {
      expect(quiet).not.toBe(dumped);
    }
  });

  it('back-translates North American BRF with en-us-brf.dis', () => {
    const withDis = backTranslate('en-us-brf.dis,en-ueb-g1.ctb', ',hello');
    expect(withDis).toBeTruthy();
    expect(withDis!.toLowerCase()).toContain('hello');
    expect(withDis).not.toMatch(/\\\d+\//);
  });

  it('does not emit 8-dot slash junk for uppercase ASCII BRF', () => {
    const withoutDis = backTranslate('en-ueb-g1.ctb', ',HELLO');
    expect(withoutDis ?? '').not.toMatch(/\\\d+\//);
    const withDis = backTranslate('en-us-brf.dis,en-ueb-g1.ctb', ',HELLO');
    expect(withDis ?? '').not.toMatch(/\\\d+\//);
  });

  it('round-trips a Grade 1 phrase approximately', () => {
    const brf = translate('en-ueb-g1.ctb', 'Hello world', 128);
    expect(brf).toBeTruthy();
    const print = backTranslate('en-us-brf.dis,en-ueb-g1.ctb', brf!);
    expect(print).toBeTruthy();
    expect(print!.replace(/[^a-zA-Z ]/g, '').toLowerCase()).toContain('hello');
    expect(print!.replace(/[^a-zA-Z ]/g, '').toLowerCase()).toContain('world');
  });

  it('contracts and reverse-translates UEB Grade 2 "and"', () => {
    const brf = translate('en-ueb-g2.ctb', 'and', 128);
    expect(brf).toBeTruthy();
    expect(brf!.length).toBeLessThan(5);
    const print = backTranslate('en-us-brf.dis,en-ueb-g2.ctb', brf!);
    expect(print?.toLowerCase()).toContain('and');
  });

  it('translates UEB G2 shortform and whereabouts\'s', () => {
    expect(translate('en-ueb-g2.ctb', 'about', 128)).toBeTruthy();
    expect(translate('en-ueb-g2.ctb', "whereabouts's", 128)).toBeTruthy();
  });

  it('loads Portuguese G1, Maori NZ, and 3.39 NZ English / Haitian tables', () => {
    expect(translate('pt-pt-g1.utb', 'olá', 128)).toBeTruthy();
    expect(translate('mao-nz-g1.ctb', 'kia ora', 128)).toBeTruthy();
    expect(translate('en-nz-g1.utb', 'Hello', 128)).toBeTruthy();
    expect(translate('en-nz-g2.ctb', 'and', 128)).toBeTruthy();
    expect(translate('ht-g1.utb', 'bonjou', 128)).toBeTruthy();
  });

  it('exports lou_hyphenate and hyphenates international', () => {
    const hyphenate = (capi as { _lou_hyphenate?: unknown })._lou_hyphenate;
    expect(typeof hyphenate).toBe('function');
    const word = 'international';
    const L = word.length;
    const inPtr = capi._malloc((L + 1) * 2);
    const hyphPtr = capi._malloc(L + 1);
    capi.stringToUTF16(word, inPtr, (L + 1) * 2);
    const ok = capi.ccall(
      'lou_hyphenate',
      'number',
      ['string', 'number', 'number', 'number', 'number'],
      ['en-ueb-g1.ctb,hyph_en_US.dic', inPtr, L, hyphPtr, 0]
    ) as number;
    expect(ok).toBeTruthy();
    capi._free(inPtr);
    capi._free(hyphPtr);
  });
});
