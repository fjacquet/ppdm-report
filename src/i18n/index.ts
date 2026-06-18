import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import deCommon from './locales/de/common.json'
import deDashboard from './locales/de/dashboard.json'
import dePptx from './locales/de/pptx.json'
import deReport from './locales/de/report.json'
import enCommon from './locales/en/common.json'
import enDashboard from './locales/en/dashboard.json'
import enPptx from './locales/en/pptx.json'
import enReport from './locales/en/report.json'
import frCommon from './locales/fr/common.json'
import frDashboard from './locales/fr/dashboard.json'
import frPptx from './locales/fr/pptx.json'
import frReport from './locales/fr/report.json'
import itCommon from './locales/it/common.json'
import itDashboard from './locales/it/dashboard.json'
import itPptx from './locales/it/pptx.json'
import itReport from './locales/it/report.json'

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'de', 'it'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const NAMESPACES = ['common', 'dashboard', 'report', 'pptx'] as const
export const DEFAULT_NS = 'common' satisfies (typeof NAMESPACES)[number]

export const resources = {
  en: {
    common: enCommon,
    dashboard: enDashboard,
    report: enReport,
    pptx: enPptx,
  },
  fr: {
    common: frCommon,
    dashboard: frDashboard,
    report: frReport,
    pptx: frPptx,
  },
  de: {
    common: deCommon,
    dashboard: deDashboard,
    report: deReport,
    pptx: dePptx,
  },
  it: {
    common: itCommon,
    dashboard: itDashboard,
    report: itReport,
    pptx: itPptx,
  },
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
