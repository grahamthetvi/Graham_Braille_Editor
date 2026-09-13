import { encodeMp3FromFloat32 } from './encodeMp3';
import { wrapTtsFailure } from './errors';
import { normalizeSpeechText } from './wav';
import {
  DEFAULT_TTS_ENGINE,
  TtsExportError,
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
    throw new TtsExportError('app.file.downloadMp3.errors.emptyText');
  }
  if ([...cleaned].length > MAX_TTS_CHARS) {
    throw new TtsExportError('app.file.downloadMp3.errors.textTooLong', { limit: MAX_TTS_CHARS.toLocaleString() });
  }

  try {
    const pcm =
      engine === 'espeak'
        ? await (await import('./espeak')).synthesizeEspeakPcm(cleaned, onProgress)
        : engine === 'piper'
          ? await (await import('./piper')).synthesizePiperPcm(cleaned, onProgress)
          : await (await import('./kitten')).synthesizeKittenPcm(cleaned, onProgress);

    if (pcm.samples.length === 0) {
      throw new TtsExportError('app.file.downloadMp3.errors.emptyAudio');
    }

    onProgress?.({ phase: 'encoding', messageKey: 'app.file.downloadMp3.status.encodingMp3' });
    return encodeMp3FromFloat32(pcm.samples, pcm.sampleRate);
  } catch (err) {
    throw wrapTtsFailure(err);
  }
}

export {
  DEFAULT_TTS_ENGINE,
  TTS_ENGINE_IDS,
  TTS_ENGINE_STORAGE_KEY,
  TtsExportError,
  isTtsEngineId,
  type TtsEngineId,
  type TtsProgress,
  type TtsProgressCallback,
} from './types';
export { classifyTtsFailure, wrapTtsFailure } from './errors';
