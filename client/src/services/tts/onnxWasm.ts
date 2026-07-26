/** Base URL for bundled onnxruntime-web WASM assets (see scripts/setup-onnx-wasm.js). */
export function getOnnxWasmBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${base.endsWith('/') ? '' : '/'}ort/`;
}

let configured = false;

/** Point onnxruntime-web at same-origin WASM files before any TTS engine loads. */
export async function ensureOnnxWasmConfigured(): Promise<void> {
  if (configured) return;
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = getOnnxWasmBaseUrl();
  ort.env.wasm.numThreads =
    typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
  ort.env.wasm.simd = true;
  configured = true;
}
