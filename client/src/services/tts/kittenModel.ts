import type { TtsProgressCallback } from './types';

/** Browser-friendly FP32 export; WebGPU-capable in ONNX Runtime Web. */
export const KITTEN_GPU_MODEL_ID = 'onnx-community/KittenTTS-Nano-v0.8-ONNX';

/**
 * Smaller INT8 weights for WASM-only machines.
 * kitten-tts-js 0.1.2 does not list this id, so we download it ourselves.
 */
export const KITTEN_WASM_MODEL_ID = 'KittenML/kitten-tts-nano-0.8-int8';

/** Last-resort id that kitten-tts-js 0.1.2 can load via from_pretrained. */
export const KITTEN_JS_FALLBACK_MODEL_ID = 'KittenML/kitten-tts-nano-0.8';

export const KITTEN_VOICE = 'Luna';

const CACHE_NAME = 'kitten-tts';

export function hfResolveUrl(repoId: string, filename: string): string {
  return `https://huggingface.co/${repoId}/resolve/main/${filename}`;
}

export function prefersKittenGpu(
  gpu: unknown = typeof navigator !== 'undefined' ? (navigator as Navigator & { gpu?: unknown }).gpu : undefined,
): boolean {
  return gpu != null;
}

export function selectKittenModelId(gpuAvailable: boolean): string {
  return gpuAvailable ? KITTEN_GPU_MODEL_ID : KITTEN_WASM_MODEL_ID;
}

export function kittenFileCandidates(repoId: string): {
  configFiles: string[];
  modelFiles: string[];
  voicesFiles: string[];
} {
  if (repoId === KITTEN_GPU_MODEL_ID) {
    return {
      configFiles: ['kitten_config.json', 'config.json'],
      modelFiles: ['onnx/model.onnx', 'kitten_tts_nano_v0_8.onnx'],
      voicesFiles: ['voices.npz'],
    };
  }
  return {
    configFiles: ['config.json', 'kitten_config.json'],
    modelFiles: ['kitten_tts_nano_v0_8.onnx', 'onnx/model.onnx'],
    voicesFiles: ['voices.npz'],
  };
}

/** Options matching newer kitten-tts-js (ignored by published 0.1.2). */
export function getKittenLoadOptions(wasmThreads: number): {
  runtime: 'gpu';
  wasmThreads: number;
  wasmSimd: true;
} {
  return { runtime: 'gpu', wasmThreads, wasmSimd: true };
}

function cacheKey(repoId: string, filename: string): string {
  return `/${repoId.replace('/', '__')}__${filename.replace(/\//g, '_')}`;
}

async function cacheGet(key: string): Promise<ArrayBuffer | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const resp = await cache.match(key);
    return resp ? resp.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(key, new Response(buffer));
}

async function fetchWithProgress(
  url: string,
  onBytes?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const total = Number(resp.headers.get('content-length')) || 0;
  if (!resp.body || !onBytes) return resp.arrayBuffer();

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

async function fetchCachedFile(
  repoId: string,
  filename: string,
  onProgress?: TtsProgressCallback,
): Promise<ArrayBuffer> {
  const key = cacheKey(repoId, filename);
  const cached = await cacheGet(key);
  if (cached) return cached;

  const url = hfResolveUrl(repoId, filename);
  const buffer = await fetchWithProgress(url, (loaded, total) => {
    if (total > 0) {
      onProgress?.({
        phase: 'loading',
        messageKey: 'app.file.downloadMp3.status.downloadingKitten',
        messageParams: { percent: Math.round((loaded * 100) / total) },
        ratio: loaded / total,
      });
    }
  });
  try {
    await cacheSet(key, buffer);
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'QuotaExceededError' || /quota/i.test(String(err))) throw err;
  }
  return buffer;
}

async function fetchFirstAvailable(
  repoId: string,
  filenames: string[],
  onProgress?: TtsProgressCallback,
): Promise<ArrayBuffer> {
  const errors: string[] = [];
  for (const filename of filenames) {
    try {
      return await fetchCachedFile(repoId, filename, onProgress);
    } catch (err) {
      errors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`HTTP 404 fetching ${hfResolveUrl(repoId, filenames[0] ?? '')} (${errors.join('; ')})`);
}

function decodeJson(buffer: ArrayBuffer): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(buffer)) as Record<string, unknown>;
}

export type KittenModelAssets = {
  modelBuffer: ArrayBuffer;
  voicesBuffer: ArrayBuffer;
  config: Record<string, unknown>;
};

export async function downloadKittenModelAssets(
  repoId: string,
  onProgress?: TtsProgressCallback,
): Promise<KittenModelAssets> {
  const files = kittenFileCandidates(repoId);
  const configBuffer = await fetchFirstAvailable(repoId, files.configFiles, onProgress);
  const config = decodeJson(configBuffer);
  const modelFile = typeof config.model_file === 'string' ? config.model_file : '';
  const voicesFile = typeof config.voices === 'string' ? config.voices : '';
  const modelFiles = modelFile ? [modelFile, `onnx/${modelFile}`, ...files.modelFiles] : files.modelFiles;
  const voicesFiles = voicesFile ? [voicesFile, ...files.voicesFiles] : files.voicesFiles;

  const [modelBuffer, voicesBuffer] = await Promise.all([
    fetchFirstAvailable(repoId, [...new Set(modelFiles)], onProgress),
    fetchFirstAvailable(repoId, [...new Set(voicesFiles)], onProgress),
  ]);

  return { modelBuffer, voicesBuffer, config };
}
