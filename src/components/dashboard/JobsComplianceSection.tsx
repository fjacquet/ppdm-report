import type { EChartsOption } from 'echarts/types/dist/shared'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { immutableTone } from '../../engines/export/tone'
import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent } from '../../utils/format'
import { Chart } from '../Chart'
import { Details } from '../Details'
import { KpiCard } from '../KpiCard'
import { type BarDatum, horizontalBarOption } from './barOption'
import { ProvenanceNote } from './ProvenanceNote'

interface JobsComplianceSectionProps {
  view: ReportView
  dark: boolean
}

export function JobsComplianceSection({ view, dark }: JobsComplianceSectionProps) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const palette = dark ? DARK : LIGHT
  const { jobs, compliance } = view

  const jobBars: BarDatum[] = useMemo(() => {
    const jobColor: Record<string, string> = {
      SUCCESS: palette.ok,
      RETRIED: palette.warn,
      SKIPPED: palette.muted,
      CANCELED: palette.bad,
      FAILED: palette.bad,
    }
    return Object.entries(jobs.counts).map(([status, n]) => ({
      label: status,
      value: n,
      valueText: fmtInt(n, locale),
      color: jobColor[status] ?? palette.accent,
    }))
  }, [jobs.counts, locale, palette])
  const jobOption: EChartsOption = useMemo(
    () => horizontalBarOption(jobBars, palette),
    [jobBars, palette],
  )
  const jobBarHeight = Math.max(110, jobBars.length * 30)

  const compBars: BarDatum[] = useMemo(
    () => [
      {
        label: t('dashboard:resilience.appConsistent'),
        value: compliance.appConsistentPct,
        valueText: fmtPercent(compliance.appConsistentPct, locale),
        color: palette.ok,
      },
      {
        label: t('dashboard:resilience.replicated'),
        value: compliance.replicatedPct,
        valueText: fmtPercent(compliance.replicatedPct, locale),
        color: palette.accent,
      },
      {
        label: t('dashboard:resilience.immutable'),
        value: compliance.immutablePct,
        valueText: fmtPercent(compliance.immutablePct, locale),
        color: immutableTone(compliance.immutablePct) === 'bad' ? palette.bad : palette.ok,
      },
    ],
    [
      compliance.appConsistentPct,
      compliance.replicatedPct,
      compliance.immutablePct,
      locale,
      palette,
      t,
    ],
  )
  // percentages are 0..1 → absolute scale (max 1)
  const compOption: EChartsOption = useMemo(
    () => horizontalBarOption(compBars, palette, 1),
    [compBars, palette],
  )

  return (
    <section aria-label={t('dashboard:jobs.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:jobs.title')}
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard
          value={fmtPercent(jobs.successPct, locale)}
          label={t('dashboard:jobs.success')}
          tone="ok"
        />
        <KpiCard
          value={fmtInt(jobs.total, locale)}
          label={t('dashboard:jobs.total')}
          tone="muted"
        />
      </div>

      {jobBars.length > 0 && (
        <>
          <Chart
            option={jobOption}
            dark={dark}
            testId="jobs-bars"
            style={{ minHeight: jobBarHeight, width: '100%' }}
          />
          <Details summary={t('common:showDetails')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(jobs.counts).map(([status, count]) => (
                    <tr key={status} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">{status}</td>
                      <td className="py-1 text-right font-semibold text-gray-900 dark:text-gray-100">
                        {fmtInt(count, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Details>
        </>
      )}

      {jobs.capped && (
        <p className="mt-3 mb-4 text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(jobs.windowSize, locale) })}
        </p>
      )}

      <h3 className="mb-3 mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
        {t('dashboard:resilience.title')}
      </h3>
      <Chart
        option={compOption}
        dark={dark}
        testId="compliance-bars"
        style={{ minHeight: 150, width: '100%' }}
      />

      {compliance.capped && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          {t('common:capped', { n: fmtInt(compliance.windowSize, locale) })}
        </p>
      )}
      <ProvenanceNote p={view.provenance.compliance} dark={dark} />
    </section>
  )
}
