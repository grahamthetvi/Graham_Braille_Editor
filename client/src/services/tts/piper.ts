import { TtsSession } from '@mintplex-labs/piper-tts-web';
import { wrapTtsFailure } from './errors';
import { ensureOnnxWasmConfigured, getOnnxWasmBaseUrl } from './onnxWasm';
import { getPiperWasmPaths, PIPER_VOICE } from './piperAssets';
import { wavBytesToPcm } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

export async function synthesizePiperPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  onProgress?.({ phase: 'loading', messageKey: 'app.file.downloadMp3.status.loadingPiper' });
  await ensureOnnxWasmConfigured();

  // Drop a failed singleton so retries pick up local onnxWasm / phonemize paths.
  const existing = TtsSession._instance;
  if (existing) {
    try {
      await existing.waitReady;
    } catch {
      TtsSession._instance = null;
    }
  }

  try {
    const session = await TtsSession.create({
      voiceId: PIPER_VOICE,
      wasmPaths: getPiperWasmPaths(getOnnxWasmBaseUrl()),
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
  } catch (err) {
    TtsSession._instance = null;
    throw wrapTtsFailure(err);
  }
}
