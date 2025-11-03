import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation resources
import en from '../locales/en.json';
import es from '../locales/es.json';
import hi from '../locales/hi.json';
import te from '../locales/te.json';
import kn from '../locales/kn.json';
import ta from '../locales/ta.json';
import bn from '../locales/bn.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  hi: { translation: hi },
  te: { translation: te },
  kn: { translation: kn },
  ta: { translation: ta },
  bn: { translation: bn },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });

export default i18n;
