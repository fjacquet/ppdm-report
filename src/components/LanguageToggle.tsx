import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'

export function LanguageToggle() {
  const { i18n, t } = useTranslation('common')
  const current = i18n.language as SupportedLanguage

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-gray-500">{t('lang.label')}:</span>
      <select
        value={current}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className="text-sm rounded border border-gray-300 bg-white px-1 py-0.5 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        aria-label={t('lang.label')}
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {t(`lang.${lng}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
