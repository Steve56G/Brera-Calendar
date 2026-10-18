import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import it from '../locales/it.json';
import en from '../locales/en.json';

export const SUPPORTED_LANGUAGES = ['it', 'en'];
export const DEFAULT_LANGUAGE = 'it';

export const i18n = new I18n({ it, en });
i18n.defaultLocale = DEFAULT_LANGUAGE;
i18n.locale = DEFAULT_LANGUAGE;
i18n.enableFallback = true;

// Lingua del dispositivo se supportata (italiano o inglese), altrimenti inglese.
export function detectLanguage() {
  const code = getLocales()[0]?.languageCode;
  if (SUPPORTED_LANGUAGES.includes(code)) return code;
  return 'en';
}
