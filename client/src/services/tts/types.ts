/** Supported client-side TTS engines for MP3 export. */
export type TtsEngineId = 'kitten' | 'espeak' | 'piper';

export const TTS_ENGINE_IDS: TtsEngineId[] = ['kitten', 'espeak', 'piper'];

export const DEFAULT_TTS_ENGINE: TtsEngineId = 'kitten';

export const TTS_ENGINE_STORAGE_KEY = 'graham-tts-engine';

export type TtsProgress = {
  phase: 'loading' | 'synthesizing' | 'encoding';
  /** i18n key under app.file.downloadMp3.status.* */
  messageKey: string;
  messageParams?: Record<string, string | number>;
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

/** Thrown with an i18n key so the UI can localize TTS failures. */
export class TtsExportError extends Error {
  readonly i18nKey: string;
  readonly i18nParams?: Record<string, string | number>;

  constructor(i18nKey: string, i18nParams?: Record<string, string | number>) {
    super(i18nKey);
    this.name = 'TtsExportError';
    this.i18nKey = i18nKey;
    this.i18nParams = i18nParams;
  }
}
