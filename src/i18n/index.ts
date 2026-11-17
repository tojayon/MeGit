import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locales/zh-CN';
import en from './locales/en';

export const resources = { 'zh-CN': { translation: zh }, en: { translation: en } } as const;
export const i18n = i18next.createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  supportedLngs: Object.keys(resources),
  defaultNS: 'translation',
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof zh };
    strictKeyChecks: true;
  }
}
