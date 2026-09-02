/** Base URL for bundled onnxruntime-web WASM assets (see scripts/setup-onnx-wasm.js). */
export function getOnnxWasmBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${base.endsWith('/') ? '' : '/'}ort/`;
}

/**
 * Multi-threaded ONNX WASM needs SharedArrayBuffer, which is only available
 * when the page is cross-origin isolated (COOP + COEP).
 */
export function isCrossOriginIsolatedEnv(
  isolated: boolean | undefined = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : undefined,
): boolean {
  return isolated === true;
}

export function getOnnxWasmThreadCount(
  isolated: boolean | undefined = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : undefined,
  hardwareConcurrency: number | undefined = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
): number {
  if (!isCrossOriginIsolatedEnv(isolated)) return 1;
  const n = hardwareConcurrency && hardwareConcurrency > 0 ? hardwareConcurrency : 4;
  return Math.max(1, Math.min(n, 8));
}

let ortModule: typeof import('onnxruntime-web') | null = null;

export function applyOnnxWasmConfig(
  ort: typeof import('onnxruntime-web'),
  isolated: boolean | undefined = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : undefined,
  hardwareConcurrency: number | undefined = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
): void {
  ort.env.wasm.wasmPaths = getOnnxWasmBaseUrl();
  ort.env.wasm.numThreads = getOnnxWasmThreadCount(isolated, hardwareConcurrency);
  ort.env.wasm.simd = true;
}

/** Point onnxruntime-web at same-origin WASM files before any TTS engine loads. */
export async function ensureOnnxWasmConfigured(): Promise<void> {
  const ort = ortModule ?? (ortModule = await import('onnxruntime-web'));
  // Re-apply each call: kitten-tts-js 0.1.2 overwrites numThreads if from_pretrained runs.
  applyOnnxWasmConfig(ort);
}
