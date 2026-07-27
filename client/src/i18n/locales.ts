/**
 * UI locale registry: supported website languages, text direction,
 * and the default liblouis braille table to pair with each locale.
 */

export type UiLocaleId = 'en' | 'ar' | 'fr' | 'de' | 'es' | 'pt' | 'zh' | 'ru' | 'ur';

export type TextDirection = 'ltr' | 'rtl';

export interface UiLocale {
  id: UiLocaleId;
  /** Native-script label shown in the Language select. */
  nativeLabel: string;
  dir: TextDirection;
  /** Default braille table filename when auto-pair is enabled. */
  defaultTable: string;
  /** BCP 47 language tag for <html lang>. */
  htmlLang: string;
}

export const UI_LOCALES: readonly UiLocale[] = [
  { id: 'en', nativeLabel: 'English', dir: 'ltr', defaultTable: 'en-ueb-g1.ctb', htmlLang: 'en' },
  { id: 'ar', nativeLabel: 'العربية', dir: 'rtl', defaultTable: 'ar-ar-g1.utb', htmlLang: 'ar' },
  { id: 'fr', nativeLabel: 'Français', dir: 'ltr', defaultTable: 'fr-bfu-g2.ctb', htmlLang: 'fr' },
  { id: 'de', nativeLabel: 'Deutsch', dir: 'ltr', defaultTable: 'de-g1.ctb', htmlLang: 'de' },
  { id: 'es', nativeLabel: 'Español', dir: 'ltr', defaultTable: 'es-g1.ctb', htmlLang: 'es' },
  { id: 'pt', nativeLabel: 'Português', dir: 'ltr', defaultTable: 'pt-pt-g2.ctb', htmlLang: 'pt' },
  { id: 'zh', nativeLabel: '中文', dir: 'ltr', defaultTable: 'zh-chn.ctb', htmlLang: 'zh-CN' },
  { id: 'ru', nativeLabel: 'Русский', dir: 'ltr', defaultTable: 'ru-litbrl.ctb', htmlLang: 'ru' },
  { id: 'ur', nativeLabel: 'اردو', dir: 'rtl', defaultTable: 'ur-pk-g2.ctb', htmlLang: 'ur' },
] as const;

export const DEFAULT_UI_LOCALE: UiLocaleId = 'en';

export const UI_LOCALE_STORAGE_KEY = 'graham-braille-ui-locale';
export const AUTO_PAIR_TABLE_STORAGE_KEY = 'graham-braille-auto-pair-table';

const localeById = new Map(UI_LOCALES.map((l) => [l.id, l]));

export function isUiLocaleId(value: string): value is UiLocaleId {
  return localeById.has(value as UiLocaleId);
}

export function getUiLocale(id: UiLocaleId): UiLocale {
  return localeById.get(id) ?? UI_LOCALES[0];
}

export function defaultTableForLocale(id: UiLocaleId): string {
  return getUiLocale(id).defaultTable;
}

export function readStoredUiLocale(): UiLocaleId {
  try {
    const v = localStorage.getItem(UI_LOCALE_STORAGE_KEY);
    if (v && isUiLocaleId(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_LOCALE;
}

/** Auto-pair defaults to ON when unset. */
export function readStoredAutoPairTable(): boolean {
  try {
    const v = localStorage.getItem(AUTO_PAIR_TABLE_STORAGE_KEY);
    if (v === 'false') return false;
    if (v === 'true') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function applyDocumentLocale(id: UiLocaleId): void {
  const locale = getUiLocale(id);
  document.documentElement.lang = locale.htmlLang;
  document.documentElement.dir = locale.dir;
}
