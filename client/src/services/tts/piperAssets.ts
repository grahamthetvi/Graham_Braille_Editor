/** Same-origin Piper phonemize WASM (see scripts/setup-piper-phonemize.js). */
export function getPiperPhonemizeBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}${base.endsWith('/') ? '' : '/'}piper/piper_phonemize`;
}

export function getPiperWasmPaths(onnxWasmBaseUrl: string): {
  onnxWasm: string;
  piperData: string;
  piperWasm: string;
} {
  const phonemize = getPiperPhonemizeBaseUrl();
  return {
    onnxWasm: onnxWasmBaseUrl,
    piperData: `${phonemize}.data`,
    piperWasm: `${phonemize}.wasm`,
  };
}

/**
 * Piper `en_US-lessac-medium` stays the default.
 * `en_US-lessac-low` is the same ~63 MB ONNX download in the bundled voice list,
 * so it would not speed up first-run downloads and would drop quality.
 */
export const PIPER_VOICE = 'en_US-lessac-medium' as const;
