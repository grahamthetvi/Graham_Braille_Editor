import { TtsExportError } from './types';

export type TtsFailureKind = 'download' | 'storage' | 'runtime';

export const TTS_FAILURE_I18N_KEYS = {
  download: 'app.file.downloadMp3.errors.modelDownloadFailed',
  storage: 'app.file.downloadMp3.errors.storageQuota',
  runtime: 'app.file.downloadMp3.errors.runtimeFailed',
} as const;

function errorText(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return { name: '', message: String(err) };
}

/** Classify TTS failures so the UI can show a localized explanation. */
export function classifyTtsFailure(err: unknown): TtsFailureKind {
  if (err instanceof TtsExportError) {
    if (err.i18nKey === TTS_FAILURE_I18N_KEYS.download) return 'download';
    if (err.i18nKey === TTS_FAILURE_I18N_KEYS.storage) return 'storage';
    if (err.i18nKey === TTS_FAILURE_I18N_KEYS.runtime) return 'runtime';
    return 'runtime';
  }

  const { name, message } = errorText(err);
  const combined = `${name} ${message}`.toLowerCase();

  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    combined.includes('quotaexceeded') ||
    combined.includes('quota exceeded') ||
    combined.includes('the quota has been exceeded') ||
    combined.includes('storage quota') ||
    combined.includes('opfs') && (combined.includes('unavailable') || combined.includes('denied')) ||
    combined.includes('private browsing') ||
    combined.includes('the operation is insecure')
  ) {
    return 'storage';
  }

  if (
    (name === 'TypeError' && /fetch|network|load failed|failed to fetch|networkerror/i.test(message)) ||
    combined.includes('failed to fetch') ||
    combined.includes('networkerror') ||
    combined.includes('load failed') ||
    combined.includes('net::') ||
    combined.includes('err_blocked') ||
    combined.includes('err_failed') ||
    combined.includes('err_connection') ||
    combined.includes('econnreset') ||
    combined.includes('enotfound') ||
    combined.includes('eai_again') ||
    combined.includes('huggingface') ||
    combined.includes('jsdelivr') ||
    combined.includes('cors') ||
    /\bhttp [45]\d\d\b/.test(combined) ||
    combined.includes('could not retrieve voices')
  ) {
    return 'download';
  }

  return 'runtime';
}

/** Map any TTS failure to a TtsExportError with a user-facing i18n key. */
export function wrapTtsFailure(err: unknown): TtsExportError {
  if (err instanceof TtsExportError) return err;
  return new TtsExportError(TTS_FAILURE_I18N_KEYS[classifyTtsFailure(err)]);
}
