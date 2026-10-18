import { createContext, useCallback, useContext, useMemo } from 'react';
import { DAY_KEYS } from '../constants/schedule';
import { usePersistentState } from '../services/storage';
import { changeLabel, levelLabel, professorLabel, reasonLabel, roomText, tagLabel } from './dataLabels';
import { detectLanguage, i18n, SUPPORTED_LANGUAGES } from './index';

const LanguageContext = createContext(null);

// Fornisce traduzioni e lingua corrente. La scelta dell'utente è salvata in AsyncStorage
// (chiave "@orario/language"); finché non ne esiste una si usa la lingua del dispositivo.
export function LanguageProvider({ children }) {
  const [stored, setStored, loaded] = usePersistentState('language', null);
  const language = SUPPORTED_LANGUAGES.includes(stored) ? stored : detectLanguage();

  const setLanguage = useCallback(
    (code) => {
      if (SUPPORTED_LANGUAGES.includes(code)) setStored(code);
    },
    [setStored]
  );

  const value = useMemo(() => {
    const t = (key, options = {}) => i18n.t(key, { locale: language, ...options });
    const dayName = (index) => t(`days.long.${DAY_KEYS[index]}`);
    return {
      t,
      language,
      setLanguage,
      dayName,
      dayShort: (index) => t(`days.short.${DAY_KEYS[index]}`),
      level: (level) => levelLabel(t, level),
      reason: (reason) => reasonLabel(t, reason),
      professor: (professor) => professorLabel(t, professor),
      tag: (tag) => tagLabel(t, tag),
      room: (text) => roomText(t, text),
      change: (entry) => changeLabel(t, dayName, entry),
    };
  }, [language, setLanguage]);

  if (!loaded) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useTranslation deve essere usato dentro LanguageProvider');
  return context;
}
