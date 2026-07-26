import * as piper from '@mintplex-labs/piper-tts-web';
import { wavBytesToPcm } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

/** Solid English voice; downloaded once into OPFS. */
const PIPER_VOICE = 'en_US-lessac-medium' as const;

export async function synthesizePiperPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  onProgress?.({ phase: 'loading', message: 'Loading Piper voice (first run downloads the model)…' });

  const wavBlob = await piper.predict(
    { text, voiceId: PIPER_VOICE },
    progress => {
      if (progress.total > 0) {
        onProgress?.({
          phase: 'loading',
          message: `Downloading Piper model… ${Math.round((progress.loaded * 100) / progress.total)}%`,
          ratio: progress.loaded / progress.total,
        });
      }
    },
  );

  onProgress?.({ phase: 'synthesizing', message: 'Decoding Piper audio…' });
  const bytes = new Uint8Array(await wavBlob.arrayBuffer());
  return wavBytesToPcm(bytes);
}
