import { describe, expect, it } from 'vitest';
import {
  getKittenLoadOptions,
  hfResolveUrl,
  kittenFileCandidates,
  KITTEN_GPU_MODEL_ID,
  KITTEN_WASM_MODEL_ID,
  prefersKittenGpu,
  selectKittenModelId,
} from './kittenModel';

describe('kitten model helpers', () => {
  it('selects the WebGPU ONNX export when GPU is advertised', () => {
    expect(prefersKittenGpu({})).toBe(true);
    expect(prefersKittenGpu(undefined)).toBe(false);
    expect(selectKittenModelId(true)).toBe(KITTEN_GPU_MODEL_ID);
    expect(selectKittenModelId(false)).toBe(KITTEN_WASM_MODEL_ID);
  });

  it('builds Hugging Face resolve URLs and browser file candidates', () => {
    expect(hfResolveUrl(KITTEN_GPU_MODEL_ID, 'onnx/model.onnx')).toBe(
      `https://huggingface.co/${KITTEN_GPU_MODEL_ID}/resolve/main/onnx/model.onnx`,
    );
    expect(kittenFileCandidates(KITTEN_GPU_MODEL_ID).modelFiles).toContain('onnx/model.onnx');
    expect(kittenFileCandidates(KITTEN_WASM_MODEL_ID).modelFiles).toContain('kitten_tts_nano_v0_8.onnx');
  });

  it('requests GPU runtime with WASM thread/SIMD fallbacks', () => {
    expect(getKittenLoadOptions(4)).toEqual({ runtime: 'gpu', wasmThreads: 4, wasmSimd: true });
  });
});
