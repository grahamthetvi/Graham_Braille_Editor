import { describe, expect, it } from 'vitest';
import en from '../../i18n/locales/en.json';
import { classifyTtsFailure, TTS_FAILURE_I18N_KEYS, wrapTtsFailure } from './errors';
import { TtsExportError } from './types';

describe('classifyTtsFailure', () => {
  it('maps fetch/network failures to download', () => {
    expect(classifyTtsFailure(new TypeError('Failed to fetch'))).toBe('download');
    expect(classifyTtsFailure(new Error('NetworkError when attempting to fetch resource.'))).toBe('download');
    expect(classifyTtsFailure(new Error('HTTP 403 fetching https://huggingface.co/foo'))).toBe('download');
    expect(classifyTtsFailure(new Error('Could not retrieve voices file from huggingface'))).toBe('download');
  });

  it('maps quota / private-mode failures to storage', () => {
    const quota = new Error('The quota has been exceeded.');
    quota.name = 'QuotaExceededError';
    expect(classifyTtsFailure(quota)).toBe('storage');
    expect(classifyTtsFailure(new Error('OPFS is unavailable in this context'))).toBe('storage');
  });

  it('maps unknown errors to runtime', () => {
    expect(classifyTtsFailure(new Error('ORT session failed'))).toBe('runtime');
  });

  it('wraps raw fetch errors as localized TtsExportError', () => {
    const wrapped = wrapTtsFailure(new TypeError('Failed to fetch'));
    expect(wrapped).toBeInstanceOf(TtsExportError);
    expect(wrapped.i18nKey).toBe(TTS_FAILURE_I18N_KEYS.download);
    expect(en.app.file.downloadMp3.errors.modelDownloadFailed).toMatch(/Hugging Face/);
    expect(en.app.file.downloadMp3.errors.storageQuota).toMatch(/private browsing/i);
    expect(en.app.file.downloadMp3.errors.runtimeFailed).toMatch(/Speech synthesis failed/);
  });

  it('preserves existing TtsExportError keys', () => {
    const original = new TtsExportError('app.file.downloadMp3.errors.emptyText');
    expect(wrapTtsFailure(original)).toBe(original);
  });
});
