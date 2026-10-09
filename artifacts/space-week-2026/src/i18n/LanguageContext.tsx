import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translations } from '../translations.js';

export type Language = 'ar' | 'en';
type TranslationCatalog = typeof translations.ar;
type LanguageContextValue = {
  language: Language;
  direction: 'rtl' | 'ltr';
  t: TranslationCatalog;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = 'space-week-language';

function getInitialLanguage(): Language {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const direction: 'rtl' | 'ltr' = language === 'ar' ? 'rtl' : 'ltr';
  const t = translations[language] as TranslationCatalog;

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
    document.title = translations[language].document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = translations[language].document.description;
    const openGraphTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (openGraphTitle) openGraphTitle.content = translations[language].document.title;
    const openGraphDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (openGraphDescription) openGraphDescription.content = translations[language].document.description;
    const socialTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
    if (socialTitle) socialTitle.content = translations[language].document.title;
    const socialDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
    if (socialDescription) socialDescription.content = translations[language].document.description;
    document.documentElement.style.fontFamily = language === 'ar'
      ? "'Tajawal', sans-serif"
      : "'Tajawal', Arial, sans-serif";
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The site still works if browser storage is disabled.
    }
  }, [language, direction]);

  const value = useMemo(() => ({ language, direction, t, setLanguage }), [language, direction, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
