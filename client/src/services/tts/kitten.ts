import { KittenTTS, loadNpz } from 'kitten-tts-js';
import { classifyTtsFailure, wrapTtsFailure } from './errors';
import {
  downloadKittenModelAssets,
  getKittenLoadOptions,
  KITTEN_JS_FALLBACK_MODEL_ID,
  KITTEN_VOICE,
  prefersKittenGpu,
  selectKittenModelId,
  type KittenModelAssets,
} from './kittenModel';
import { ensureOnnxWasmConfigured, getOnnxWasmThreadCount } from './onnxWasm';
import { concatFloat32 } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

type KittenCtor = new (
  session: unknown,
  voices: unknown,
  config: unknown,
) => KittenTTS;

let kittenPromise: Promise<KittenTTS> | null = null;
let forceWasmOnly = false;
let cachedAssets: KittenModelAssets | null = null;
let cachedRepoId: string | null = null;
let cachedVoices: unknown = null;

function constructKitten(session: unknown, voices: unknown, config: unknown): KittenTTS {
  return new (KittenTTS as unknown as KittenCtor)(session, voices, config);
}

async function createKittenSession(
  modelBuffer: ArrayBuffer,
  preferGpu: boolean,
): Promise<unknown> {
  const ort = await import('onnxruntime-web');
  if (preferGpu) {
    try {
      return await ort.InferenceSession.create(modelBuffer, { executionProviders: ['webgpu'] });
    } catch {
      // WebGPU session create often fails without an adapter; WASM is the fallback.
    }
  }
  return ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'] });
}

async function loadKittenFromAssets(
  onProgress: TtsProgressCallback | undefined,
  preferGpu: boolean,
): Promise<KittenTTS> {
  await ensureOnnxWasmConfigured();
  const repoId = selectKittenModelId(preferGpu && !forceWasmOnly);
  onProgress?.({ phase: 'loading', messageKey: 'app.file.downloadMp3.status.loadingKitten' });
  if (!cachedAssets || cachedRepoId !== repoId) {
    cachedAssets = await downloadKittenModelAssets(repoId, onProgress);
    cachedRepoId = repoId;
    cachedVoices = await loadNpz(cachedAssets.voicesBuffer);
  }
  const session = await createKittenSession(cachedAssets.modelBuffer, preferGpu && !forceWasmOnly);
  return constructKitten(session, cachedVoices, cachedAssets.config);
}

async function getKitten(onProgress?: TtsProgressCallback): Promise<KittenTTS> {
  if (!kittenPromise) {
    kittenPromise = (async () => {
      try {
        return await loadKittenFromAssets(onProgress, prefersKittenGpu());
      } catch (primaryErr) {
        // Published kitten-tts-js 0.1.2 only knows KittenML/kitten-tts-nano-0.8.
        onProgress?.({ phase: 'loading', messageKey: 'app.file.downloadMp3.status.loadingKitten' });
        await ensureOnnxWasmConfigured();
        const threads = getOnnxWasmThreadCount();
        try {
          return await KittenTTS.from_pretrained(
            KITTEN_JS_FALLBACK_MODEL_ID,
            getKittenLoadOptions(threads) as { cacheDir?: string },
          );
        } catch {
          throw primaryErr;
        }
      }
    })().catch(err => {
      kittenPromise = null;
      throw wrapTtsFailure(err);
    });
  }
  return kittenPromise;
}

async function pcmFromKitten(tts: KittenTTS, text: string, onProgress?: TtsProgressCallback): Promise<PcmAudio> {
  onProgress?.({ phase: 'synthesizing', messageKey: 'app.file.downloadMp3.status.synthesizingKitten' });

  const chunks: Float32Array[] = [];
  let sampleRate = 24000;
  for await (const { audio } of tts.stream(text, { voice: KITTEN_VOICE, clean: true })) {
    chunks.push(audio.data);
    sampleRate = audio.sampling_rate;
  }

  if (chunks.length === 0) {
    const audio = await tts.generate(text, { voice: KITTEN_VOICE, clean: true });
    return { samples: audio.data, sampleRate: audio.sampling_rate };
  }

  return { samples: concatFloat32(chunks), sampleRate };
}

export async function synthesizeKittenPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  try {
    const tts = await getKitten(onProgress);
    return await pcmFromKitten(tts, text, onProgress);
  } catch (err) {
    if (!forceWasmOnly && prefersKittenGpu() && classifyTtsFailure(err) === 'runtime') {
      forceWasmOnly = true;
      kittenPromise = null;
      try {
        const tts = await getKitten(onProgress);
        return await pcmFromKitten(tts, text, onProgress);
      } catch (retryErr) {
        throw wrapTtsFailure(retryErr);
      }
    }
    throw wrapTtsFailure(err);
  }
}
