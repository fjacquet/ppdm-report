import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import deCommon from './locales/de/common.json'
import deDashboard from './locales/de/dashboard.json'
import enCommon from './locales/en/common.json'
import enDashboard from './locales/en/dashboard.json'
import frCommon from './locales/fr/common.json'
import frDashboard from './locales/fr/dashboard.json'
import itCommon from './locales/it/common.json'
import itDashboard from './locales/it/dashboard.json'

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'it'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const NAMESPACES = ['common', 'dashboard'] as const
export const DEFAULT_NS = 'common' satisfies (typeof NAMESPACES)[number]

export const resources = {
  en: { common: enCommon, dashboard: enDashboard },
  fr: { common: frCommon, dashboard: frDashboard },
  de: { common: deCommon, dashboard: deDashboard },
  it: { common: itCommon, dashboard: itDashboard },
} as const

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: DEFAULT_NS,
    ns: NAMESPACES,
    // React already escapes interpolated values; double-escaping mangles
    // characters like `&` and `<` in tooltip text.
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'ppdm-report-lang',
      caches: ['localStorage'],
    },
  })

export default i18n
