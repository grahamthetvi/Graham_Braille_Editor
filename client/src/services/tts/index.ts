import { encodeMp3FromFloat32 } from './encodeMp3';
import { normalizeSpeechText } from './wav';
import {
  DEFAULT_TTS_ENGINE,
  type TtsEngineId,
  type TtsProgressCallback,
} from './types';

const MAX_TTS_CHARS = 100_000;

/**
 * Synthesize editor text to an MP3 Blob in the browser (no bridge).
 * Kitten is the default; eSpeak NG and Piper are optional engines.
 * Engines are loaded on demand so WASM/models are not in the initial bundle.
 */
export async function synthesizeMp3InBrowser(
  text: string,
  engine: TtsEngineId = DEFAULT_TTS_ENGINE,
  onProgress?: TtsProgressCallback,
): Promise<Blob> {
  const cleaned = normalizeSpeechText(text);
  if (!cleaned) {
    throw new Error('Nothing to speak — enter some text first.');
  }
  if ([...cleaned].length > MAX_TTS_CHARS) {
    throw new Error(`Text exceeds ${MAX_TTS_CHARS.toLocaleString()} character limit for audio export.`);
  }

  const pcm =
    engine === 'espeak'
      ? await (await import('./espeak')).synthesizeEspeakPcm(cleaned, onProgress)
      : engine === 'piper'
        ? await (await import('./piper')).synthesizePiperPcm(cleaned, onProgress)
        : await (await import('./kitten')).synthesizeKittenPcm(cleaned, onProgress);

  if (pcm.samples.length === 0) {
    throw new Error('TTS produced empty audio.');
  }

  onProgress?.({ phase: 'encoding', message: 'Encoding MP3…' });
  return encodeMp3FromFloat32(pcm.samples, pcm.sampleRate);
}

export {
  DEFAULT_TTS_ENGINE,
  TTS_ENGINES,
  TTS_ENGINE_STORAGE_KEY,
  isTtsEngineId,
  type TtsEngineId,
  type TtsProgress,
  type TtsProgressCallback,
} from './types';
