import { KittenTTS } from 'kitten-tts-js';
import { concatFloat32 } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

/** Browser-friendly Nano model (WASM; WebGPU optional). */
const KITTEN_MODEL = 'onnx-community/KittenTTS-Nano-v0.8-ONNX';
const KITTEN_VOICE = 'Luna';

let kittenPromise: Promise<KittenTTS> | null = null;

async function getKitten(onProgress?: TtsProgressCallback): Promise<KittenTTS> {
  if (!kittenPromise) {
    onProgress?.({ phase: 'loading', messageKey: 'app.file.downloadMp3.status.loadingKitten' });
    // runtime/wasm options exist at runtime; published .d.ts only lists dtype/cacheDir
    const load = KittenTTS.from_pretrained as (
      modelId?: string,
      opts?: Record<string, unknown>,
    ) => Promise<KittenTTS>;
    kittenPromise = load(KITTEN_MODEL, {
      runtime: 'cpu',
      wasmSimd: true,
    }).catch(err => {
      kittenPromise = null;
      throw err;
    });
  }
  return kittenPromise;
}

export async function synthesizeKittenPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  const tts = await getKitten(onProgress);
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
