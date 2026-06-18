import { DARK, LIGHT } from '../../theme/palette'
import type { ReportView } from '../../types/reportView'
import { fmtInt, fmtPercent, fmtPercentValue, formatBytes, gbToBytes } from '../../utils/format'
import { type ExportFlavor, SECTION_ORDER, type SectionId } from './sectionOrder'
import { immutableTone } from './tone'
import type { ExportModel, ExportSection, ExportTheme } from './types'

/** Minimal translator surface (i18next TFunction, resolving `ns:key`). */
type TFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Pure: turn a ReportView into a render-ready, localized, flavor-ordered ExportModel.
 * In-use asset types only (idle ones are listed in their own section, never given
 * their own — req #6/#7). Lists are capped via the engine's TopList; capped windows
 * carry a caveat note. No metric recomputation — reads ReportView fields only.
 */
export function buildExportModel(
  view: ReportView,
  flavor: ExportFlavor,
  theme: ExportTheme,
  t: TFn,
  locale: string,
): ExportModel {
  const pal = theme === 'dark' ? DARK : LIGHT
  const { coverage, gaps, jobs, compliance, capacity, policies, meta, idleAgents } = view

  const execKpis = [
    {
      label: t('dashboard:kpi.coverage'),
      value: fmtPercent(coverage.overall.pct, locale),
      detail: t('dashboard:coverage.inclExcluded'),
      tone: 'ok' as const,
    },
    {
      label: t('dashboard:kpi.unprotected'),
      value: formatBytes(gbToBytes(gaps.totalCapacityGb), locale),
      tone: 'warn' as const,
    },
    {
      label: t('dashboard:kpi.jobSuccess'),
      value: fmtPercent(jobs.successPct, locale),
      tone: 'ok' as const,
    },
    {
      label: t('dashboard:kpi.immutable'),
      value: fmtPercent(compliance.immutablePct, locale),
      tone: immutableTone(compliance.immutablePct),
    },
  ]

  const coverageSection: ExportSection = {
    id: 'coverage',
    title: t('dashboard:coverage.title'),
    chart: {
      kind: 'pie',
      slices: [
        {
          name: t('dashboard:coverage.protected'),
          value: coverage.overall.protected,
          color: pal.ok,
        },
        {
          name: t('dashboard:coverage.unprotected'),
          value: coverage.overall.unprotected,
          color: pal.bad,
        },
        {
          name: t('dashboard:coverage.excluded'),
          value: coverage.overall.excluded,
          color: pal.excluded,
        },
      ],
    },
    table: {
      columns: [
        t('common:col.type'),
        t('dashboard:kpi.coverage'),
        t('dashboard:coverage.protected'),
        t('dashboard:coverage.unprotected'),
        t('dashboard:coverage.excluded'),
      ],
      rows: Object.entries(coverage.byType).map(([type, b]) => [
        type,
        fmtPercent(b.pct, locale),
        fmtInt(b.protected, locale),
        fmtInt(b.unprotected, locale),
        fmtInt(b.excluded, locale),
      ]),
    },
    notes: [
      t('dashboard:coverage.headline', { pct: fmtPercent(coverage.overall.pct, locale) }),
      `${t('dashboard:coverage.inclExcluded')}: ${fmtPercent(coverage.overall.pctInclExcluded, locale)}`,
    ],
  }

  const gapsSection: ExportSection = {
    id: 'gaps',
    title: t('dashboard:gaps.title'),
    kpis: [
      {
        label: t('dashboard:gaps.unprotectedTb'),
        value: formatBytes(gbToBytes(gaps.totalCapacityGb), locale),
        tone: 'bad',
      },
      { label: t('dashboard:gaps.assets'), value: fmtInt(gaps.count, locale), tone: 'warn' },
    ],
    table: {
      columns: [t('common:col.name'), t('common:col.type'), t('common:col.size')],
      rows: gaps.top.items.map((a) => [a.name, a.type, formatBytes(gbToBytes(a.sizeGb), locale)]),
      caption: t('common:topOf', { shown: gaps.top.shown, total: gaps.top.total }),
    },
  }

  const idleSection: ExportSection | null =
    idleAgents.length > 0
      ? {
          id: 'idle',
          title: t('dashboard:idle.title'),
          notes: [t('dashboard:idle.subtitle')],
          table: { columns: [t('dashboard:idle.title')], rows: idleAgents.map((n) => [n]) },
        }
      : null

  const jobsSection: ExportSection = {
    id: 'jobs',
    title: t('dashboard:jobs.title'),
    kpis: [
      {
        label: t('dashboard:jobs.success'),
        value: fmtPercent(jobs.successPct, locale),
        tone: 'ok',
      },
    ],
    notes: [
      ...Object.entries(jobs.counts).map(([status, n]) => `${status}: ${fmtInt(n, locale)}`),
      ...(jobs.capped ? [t('common:capped', { n: fmtInt(jobs.windowSize, locale) })] : []),
    ],
  }

  const complianceSection: ExportSection = {
    id: 'compliance',
    title: t('dashboard:compliance.title'),
    kpis: [
      {
        label: t('dashboard:compliance.appConsistent'),
        value: fmtPercent(compliance.appConsistentPct, locale),
        tone: 'ok',
      },
      {
        label: t('dashboard:compliance.immutable'),
        value: fmtPercent(compliance.immutablePct, locale),
        tone: immutableTone(compliance.immutablePct),
      },
      {
        label: t('dashboard:compliance.replicated'),
        value: fmtPercent(compliance.replicatedPct, locale),
        tone: 'accent',
      },
    ],
    notes: compliance.capped
      ? [t('common:capped', { n: fmtInt(compliance.windowSize, locale) })]
      : [],
  }

  const capacitySection: ExportSection = {
    id: 'capacity',
    title: t('dashboard:capacity.title'),
    table: {
      columns: [t('common:col.name'), t('common:col.type'), t('dashboard:capacity.utilization')],
      rows: capacity.targets.map((tg) => [
        tg.name,
        tg.type,
        fmtPercentValue(tg.utilizationPct, locale),
      ]),
    },
    notes: [t('dashboard:capacity.mtrees', { count: fmtInt(capacity.mtreeCount, locale) })],
  }

  const policiesSection: ExportSection = {
    id: 'policies',
    title: t('dashboard:policies.title'),
    kpis: [
      {
        label: t('dashboard:policies.title'),
        value: fmtInt(policies.count, locale),
        tone: 'accent',
      },
    ],
    table: {
      columns: [t('dashboard:policies.col.purpose'), t('dashboard:policies.col.count')],
      rows: Object.entries(policies.byPurpose).map(([purpose, n]) => [purpose, fmtInt(n, locale)]),
    },
  }

  const byId: Record<SectionId, ExportSection | null> = {
    coverage: coverageSection,
    gaps: gapsSection,
    idle: idleSection,
    jobs: jobsSection,
    compliance: complianceSection,
    capacity: capacitySection,
    policies: policiesSection,
  }
  const sections = SECTION_ORDER[flavor]
    .map((id) => byId[id])
    .filter((s): s is ExportSection => s !== null)

  const captured = meta.capturedAt ? meta.capturedAt.slice(0, 10) : ''
  const footerParts = [
    meta.customer,
    meta.collectorBuild,
    captured,
    t('common:units.base10'),
  ].filter(Boolean)

  return {
    title: t('common:appTitle'),
    customer: meta.customer,
    subtitle: [t(`common:flavor.${flavor}`), captured].filter(Boolean).join(' · '),
    execTitle: t('dashboard:execSummary'),
    locale,
    kpis: execKpis,
    sections,
    footer: footerParts.join(' · '),
  }
}
