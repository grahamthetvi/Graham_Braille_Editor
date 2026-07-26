import { TtsSession } from '@mintplex-labs/piper-tts-web';
import { ensureOnnxWasmConfigured, getOnnxWasmBaseUrl } from './onnxWasm';
import { wavBytesToPcm } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

/** Solid English voice; downloaded once into OPFS. */
const PIPER_VOICE = 'en_US-lessac-medium' as const;

const PIPER_PHONEMIZE_BASE =
  'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

export async function synthesizePiperPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  onProgress?.({ phase: 'loading', messageKey: 'app.file.downloadMp3.status.loadingPiper' });
  await ensureOnnxWasmConfigured();

  const session = await TtsSession.create({
    voiceId: PIPER_VOICE,
    wasmPaths: {
      onnxWasm: getOnnxWasmBaseUrl(),
      piperData: `${PIPER_PHONEMIZE_BASE}.data`,
      piperWasm: `${PIPER_PHONEMIZE_BASE}.wasm`,
    },
    progress: progress => {
      if (progress.total > 0) {
        onProgress?.({
          phase: 'loading',
          messageKey: 'app.file.downloadMp3.status.downloadingPiper',
          messageParams: { percent: Math.round((progress.loaded * 100) / progress.total) },
          ratio: progress.loaded / progress.total,
        });
      }
    },
  });

  onProgress?.({ phase: 'synthesizing', messageKey: 'app.file.downloadMp3.status.decodingPiper' });
  const wavBlob = await session.predict(text);
  const bytes = new Uint8Array(await wavBlob.arrayBuffer());
  return wavBytesToPcm(bytes);
}
