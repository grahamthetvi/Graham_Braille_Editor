import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  applyDocumentLocale,
  DEFAULT_UI_LOCALE,
  isUiLocaleId,
  type UiLocaleId,
} from './locales';
import en from './locales/en.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';
import ru from './locales/ru.json';
import ur from './locales/ur.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
  pt: { translation: pt },
  zh: { translation: zh },
  ru: { translation: ru },
  ur: { translation: ur },
} as const;

function initialLocale(): UiLocaleId {
  if (typeof localStorage === 'undefined') return DEFAULT_UI_LOCALE;
  try {
    const v = localStorage.getItem('graham-braille-ui-locale');
    if (v && isUiLocaleId(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_LOCALE;
}

const startLocale = initialLocale();

void i18n.use(initReactI18next).init({
  resources,
  lng: startLocale,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLocale(startLocale);

export async function changeUiLocale(id: UiLocaleId): Promise<void> {
  await i18n.changeLanguage(id);
  applyDocumentLocale(id);
}

export default i18n;
