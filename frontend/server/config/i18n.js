import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import middleware from 'i18next-express-middleware';

// Initialize i18next
i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    lng: 'en', // default language
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    backend: {
      loadPath: './locales/{{lng}}.json'
    },
    
    detection: {
      order: ['header', 'cookie', 'querystring'],
      caches: ['cookie']
    }
  });

export default i18next;
export { middleware };
