import { useTranslation } from 'react-i18next'
import { ProductSection } from './components/dashboard/ProductSection'
import { ExportButtons } from './components/ExportButtons'
import { FlavorToggle } from './components/FlavorToggle'
import { LanguageToggle } from './components/LanguageToggle'
import { PwaUpdater } from './components/PwaUpdater'
import { ServerList } from './components/ServerList'
import { ThemeToggle } from './components/ThemeToggle'
import { UploadZone } from './components/UploadZone'
import { useReportView } from './hooks/useReportView'

export default function App() {
  const { t } = useTranslation('common')
  const report = useReportView()

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-xl font-bold">{t('appTitle')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="https://github.com/fjacquet/ppdm-report/blob/main/docs/USER-GUIDE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {t('docs')}
          </a>
          <FlavorToggle />
          <LanguageToggle />
          <ThemeToggle />
          <ExportButtons document={report} />
        </div>
      </header>
      <main className="space-y-6 p-6">
        <UploadZone />
        <ServerList />
        {report?.products.map((pe) => (
          <ProductSection key={pe.product} product={pe.product} estate={pe.estate} />
        ))}
      </main>
      <PwaUpdater />
    </div>
  )
}
