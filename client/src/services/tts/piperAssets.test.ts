import { describe, expect, it } from 'vitest';
import { getPiperPhonemizeBaseUrl, getPiperWasmPaths, PIPER_VOICE } from './piperAssets';

describe('piper asset helpers', () => {
  it('keeps the medium Lessac voice', () => {
    expect(PIPER_VOICE).toBe('en_US-lessac-medium');
  });

  it('serves phonemize WASM from the app origin', () => {
    const base = getPiperPhonemizeBaseUrl();
    expect(base).toMatch(/\/piper\/piper_phonemize$/);
    expect(base.startsWith('http')).toBe(false);

    const paths = getPiperWasmPaths('/ort/');
    expect(paths.onnxWasm).toBe('/ort/');
    expect(paths.piperWasm).toBe(`${base}.wasm`);
    expect(paths.piperData).toBe(`${base}.data`);
  });
});
