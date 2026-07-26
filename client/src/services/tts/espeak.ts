import espeakWasmUrl from 'espeak-ng/dist/espeak-ng.wasm?url';
import { wavBytesToPcm } from './wav';
import type { PcmAudio, TtsProgressCallback } from './types';

type ESpeakFactory = (opts: {
  arguments?: string[];
  preRun?: Array<(mod: ESpeakModule) => void>;
  locateFile?: (path: string) => string;
}) => Promise<ESpeakModule>;

type ESpeakModule = {
  FS: {
    writeFile: (path: string, data: string | Uint8Array) => void;
    readFile: (path: string, opts?: { encoding?: string }) => Uint8Array | string;
  };
};

let espeakFactory: ESpeakFactory | null = null;

async function loadESpeakFactory(): Promise<ESpeakFactory> {
  if (espeakFactory) return espeakFactory;
  const mod = await import('espeak-ng');
  espeakFactory = (mod.default ?? mod) as ESpeakFactory;
  return espeakFactory;
}

export async function synthesizeEspeakPcm(
  text: string,
  onProgress?: TtsProgressCallback,
): Promise<PcmAudio> {
  onProgress?.({ phase: 'loading', message: 'Loading eSpeak NG…' });
  const factory = await loadESpeakFactory();

  onProgress?.({ phase: 'synthesizing', message: 'Synthesizing with eSpeak NG…' });
  const espeak = await factory({
    locateFile: (path: string) => (path.endsWith('.wasm') ? espeakWasmUrl : path),
    preRun: [
      mod => {
        mod.FS.writeFile('/in.txt', text);
      },
    ],
    arguments: ['-w', '/out.wav', '-v', 'en-us', '-f', '/in.txt'],
  });

  const wav = espeak.FS.readFile('/out.wav') as Uint8Array;
  return wavBytesToPcm(wav);
}
