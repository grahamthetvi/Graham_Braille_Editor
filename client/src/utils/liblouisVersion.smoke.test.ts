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

  function translate(table: string, text: string): string | null {
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
      [table, inPtr, inLen, outPtr, outLen, 0, 0, 0]
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
});
