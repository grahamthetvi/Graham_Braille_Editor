/** Supported client-side TTS engines for MP3 export. */
export type TtsEngineId = 'kitten' | 'espeak' | 'piper';

export const TTS_ENGINES: {
  id: TtsEngineId;
  label: string;
  description: string;
}[] = [
  {
    id: 'kitten',
    label: 'Kitten (default)',
    description: 'Lightweight neural voice (~25–60 MB first download)',
  },
  {
    id: 'espeak',
    label: 'eSpeak NG',
    description: 'Very small robotic voice; fastest load',
  },
  {
    id: 'piper',
    label: 'Piper',
    description: 'Higher-quality neural voice (larger download)',
  },
];

export const DEFAULT_TTS_ENGINE: TtsEngineId = 'kitten';

export const TTS_ENGINE_STORAGE_KEY = 'graham-tts-engine';

export type TtsProgress = {
  phase: 'loading' | 'synthesizing' | 'encoding';
  message: string;
  /** 0–1 when known */
  ratio?: number;
};

export type TtsProgressCallback = (progress: TtsProgress) => void;

export type PcmAudio = {
  samples: Float32Array;
  sampleRate: number;
};

export function isTtsEngineId(value: string): value is TtsEngineId {
  return value === 'kitten' || value === 'espeak' || value === 'piper';
}
