import { describe, expect, it } from 'vitest';
import { getOnnxWasmThreadCount, isCrossOriginIsolatedEnv } from './onnxWasm';

describe('onnx WASM thread selection', () => {
  it('uses a single thread when the page is not cross-origin isolated', () => {
    expect(isCrossOriginIsolatedEnv(false)).toBe(false);
    expect(getOnnxWasmThreadCount(false, 16)).toBe(1);
    expect(getOnnxWasmThreadCount(undefined, 8)).toBe(1);
  });

  it('uses hardwareConcurrency when isolated, capped', () => {
    expect(isCrossOriginIsolatedEnv(true)).toBe(true);
    expect(getOnnxWasmThreadCount(true, 4)).toBe(4);
    expect(getOnnxWasmThreadCount(true, 32)).toBe(8);
    expect(getOnnxWasmThreadCount(true, 0)).toBe(4);
  });
});
