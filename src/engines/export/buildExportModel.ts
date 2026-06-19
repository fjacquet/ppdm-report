import type { Palette } from '../../theme/palette'
import { DARK, LIGHT } from '../../theme/palette'
import type { MetricKey, MetricProvenance, ReportView, ServerView } from '../../types/reportView'
import {
  fmtInt,
  fmtPercent,
  fmtPercentValue,
  fmtPercentWhole,
  formatBytes,
  gbToBytes,
} from '../../utils/format'
import { type ExportFlavor, SECTION_ORDER, type SectionId } from './sectionOrder'
import { immutableTone, toneHex } from './tone'
import type {
  DeckBar,
  DeckStack,
  ExportKpi,
  ExportModel,
  ExportSection,
  ExportTheme,
  ExportTone,
} from './types'

/** Minimal translator surface (i18next TFunction, resolving `ns:key`). */
type TFn = (key: string, opts?: Record<string, unknown>) => string

/** Localized provenance caveat for a detail-only section; '' when fully available. */
function provenanceCaveat(p: MetricProvenance, t: TFn): string {
  if (p.available && p.serversCovered >= p.serversTotal) return ''
  if (!p.available) return t('dashboard:provenance.unavailable')
  return p.assetsCovered !== undefined && p.assetsTotal !== undefined
    ? t('dashboard:provenance.partialAssets', {
        covered: p.serversCovered,
        total: p.serversTotal,
        assetsCovered: p.assetsCovered,
        assetsTotal: p.assetsTotal,
      })
    : t('dashboard:provenance.partial', { covered: p.serversCovered, total: p.serversTotal })
}

/** Fold a provenance caveat into a section's notes + deck caveat. */
function withCaveat(
  section: ExportSection,
  key: MetricKey,
  view: ReportView,
  t: TFn,
): ExportSection {
  const note = provenanceCaveat(view.provenance[key], t)
  if (!note) return section
  return {
    ...section,
    notes: [...(section.notes ?? []), note],
    deck: { ...section.deck, caveat: [section.deck?.caveat, note].filter(Boolean).join(' · ') },
  }
}

/** Build ratio-normalized bars from (label, magnitude) pairs.
 * magnitude may be a 0..1 ratio (percent bars fill relative to 100%) or a raw count (bars normalize to the largest value). */
function toBars(
  rows: { label: string; magnitude: number; value: string; tone: ExportTone }[],
  pal: Palette,
): DeckBar[] {
  const max = Math.max(1, ...rows.map((r) => r.magnitude))
  return rows.map((r) => ({
    label: r.label,
    ratio: r.magnitude / max,
    value: r.value,
    color: toneHex(r.tone, pal),
  }))
}

const JOB_TONE: Record<string, ExportTone> = {
  SUCCESS: 'ok',
  RETRIED: 'warn',
  SKIPPED: 'muted',
  CANCELED: 'bad',
  FAILED: 'bad',
}

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
  perServer: ServerView[] = [],
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
    deck: {
      subtitle: t('dashboard:coverage.headline', { pct: fmtPercent(coverage.overall.pct, locale) }),
      caveat: `${t('dashboard:coverage.inclExcluded')}: ${fmtPercent(coverage.overall.pctInclExcluded, locale)}`,
      donut: {
        center: fmtPercentWhole(coverage.overall.pct, locale),
        slices: [
          { value: coverage.overall.protected, color: pal.ok },
          { value: coverage.overall.unprotected, color: pal.bad },
          { value: coverage.overall.excluded, color: pal.excluded },
        ],
      },
      bars: toBars(
        Object.entries(coverage.byType)
          .sort(([, a], [, b]) => b.pct - a.pct)
          .slice(0, 6)
          .map(([type, b]) => ({
            label: type,
            magnitude: b.pct,
            value: fmtPercent(b.pct, locale),
            tone: b.pct < 0.5 ? ('warn' as const) : ('ok' as const),
          })),
        pal,
      ),
    },
  }

  const gapsKpis: ExportKpi[] = [
    {
      label: t('dashboard:gaps.unprotectedTb'),
      value: formatBytes(gbToBytes(gaps.totalCapacityGb), locale),
      tone: 'bad',
    },
    { label: t('dashboard:gaps.assets'), value: fmtInt(gaps.count, locale), tone: 'warn' },
  ]
  const gapsSection: ExportSection = {
    id: 'gaps',
    title: t('dashboard:gaps.title'),
    kpis: gapsKpis,
    table: {
      columns: [t('common:col.name'), t('common:col.type'), t('common:col.size')],
      rows: gaps.top.items.map((a) => [a.name, a.type, formatBytes(gbToBytes(a.sizeGb), locale)]),
      caption: t('common:topOf', { shown: gaps.top.shown, total: gaps.top.total }),
    },
    deck: {
      kpiChips: gapsKpis,
      caveat: `${t('common:topOf', { shown: Math.min(10, gaps.top.items.length), total: gaps.top.total })} · ${t('common:fullListInExcel')}`,
      bars: toBars(
        gaps.top.items.slice(0, 10).map((a) => ({
          label: a.name,
          magnitude: a.sizeGb,
          value: formatBytes(gbToBytes(a.sizeGb), locale),
          tone: 'bad' as const,
        })),
        pal,
      ),
    },
  }

  const perServerSection: ExportSection | null =
    perServer.length > 1
      ? {
          id: 'perServer',
          title: t('dashboard:perServer.title'),
          table: {
            columns: [
              t('dashboard:perServer.col.server'),
              t('dashboard:kpi.coverage'),
              t('dashboard:gaps.assets'),
              t('dashboard:jobs.success'),
            ],
            rows: perServer.map((s) => [
              s.label,
              fmtPercent(s.view.coverage.overall.pct, locale),
              fmtInt(s.view.gaps.count, locale),
              fmtPercent(s.view.jobs.successPct, locale),
            ]),
          },
          deck: {
            kpiChips: [
              {
                label: t('dashboard:perServer.title'),
                value: fmtInt(perServer.length, locale),
                tone: 'accent',
              },
            ],
            bars: toBars(
              perServer.map((s) => ({
                label: s.label,
                magnitude: s.view.coverage.overall.pct,
                value: fmtPercent(s.view.coverage.overall.pct, locale),
                tone: s.view.coverage.overall.pct < 0.5 ? ('warn' as const) : ('ok' as const),
              })),
              pal,
            ),
          },
        }
      : null

  const idleSection: ExportSection | null =
    idleAgents.length > 0
      ? {
          id: 'idle',
          title: t('dashboard:idle.title'),
          notes: [t('dashboard:idle.subtitle')],
          table: { columns: [t('dashboard:idle.title')], rows: idleAgents.map((n) => [n]) },
          deck: {
            subtitle: t('dashboard:idle.subtitle'),
            tiles: idleAgents,
          },
        }
      : null

  const jobsKpis: ExportKpi[] = [
    {
      label: t('dashboard:jobs.success'),
      value: fmtPercent(jobs.successPct, locale),
      tone: 'ok',
    },
  ]
  const jobsSection: ExportSection = {
    id: 'jobs',
    title: t('dashboard:jobs.title'),
    kpis: jobsKpis,
    notes: [
      ...Object.entries(jobs.counts).map(([status, n]) => `${status}: ${fmtInt(n, locale)}`),
      ...(jobs.capped ? [t('common:capped', { n: fmtInt(jobs.windowSize, locale) })] : []),
    ],
    deck: {
      kpiChips: jobsKpis,
      caveat: jobs.capped ? t('common:capped', { n: fmtInt(jobs.windowSize, locale) }) : undefined,
      bars: toBars(
        Object.entries(jobs.counts).map(([status, n]) => ({
          label: status,
          magnitude: n,
          value: fmtInt(n, locale),
          tone: (JOB_TONE[status] ?? 'accent') as ExportTone,
        })),
        pal,
      ),
    },
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
    deck: {
      caveat: compliance.capped
        ? t('common:capped', { n: fmtInt(compliance.windowSize, locale) })
        : undefined,
      bars: toBars(
        [
          {
            label: t('dashboard:compliance.appConsistent'),
            magnitude: compliance.appConsistentPct,
            value: fmtPercent(compliance.appConsistentPct, locale),
            tone: 'ok' as const,
          },
          {
            label: t('dashboard:compliance.replicated'),
            magnitude: compliance.replicatedPct,
            value: fmtPercent(compliance.replicatedPct, locale),
            tone: 'accent' as const,
          },
          {
            label: t('dashboard:compliance.immutable'),
            magnitude: compliance.immutablePct,
            value: fmtPercent(compliance.immutablePct, locale),
            tone: immutableTone(compliance.immutablePct),
          },
        ],
        pal,
      ),
    },
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
    deck: {
      kpiChips: [
        {
          label: t('dashboard:capacity.mtrees', { count: '' }).trim(),
          value: fmtInt(capacity.mtreeCount, locale),
          tone: 'accent',
        },
        {
          label: t('dashboard:capacity.flagged', { count: '' }).trim(),
          value: fmtInt(capacity.flagged.length, locale),
          tone: 'warn',
        },
      ],
      bars: toBars(
        capacity.targets
          .slice()
          .sort((a, b) => b.utilizationPct - a.utilizationPct)
          .slice(0, 6)
          .map((tg) => ({
            label: tg.name,
            // utilization is 0..100; divide by 100 so the bar fills absolutely
            // (89.6% → 89.6% of the track), not relative to the busiest target.
            magnitude: tg.utilizationPct / 100,
            value: fmtPercentValue(tg.utilizationPct, locale),
            tone: tg.flagged ? ('warn' as const) : ('accent' as const),
          })),
        pal,
      ),
    },
  }

  const policiesKpis: ExportKpi[] = [
    {
      label: t('dashboard:policies.title'),
      value: fmtInt(policies.count, locale),
      tone: 'accent',
    },
  ]
  const policiesSection: ExportSection = {
    id: 'policies',
    title: t('dashboard:policies.title'),
    kpis: policiesKpis,
    table: {
      columns: [t('dashboard:policies.col.purpose'), t('dashboard:policies.col.count')],
      rows: Object.entries(policies.byPurpose).map(([purpose, n]) => [purpose, fmtInt(n, locale)]),
    },
    deck: {
      kpiChips: policiesKpis,
      bars: toBars(
        Object.entries(policies.byPurpose).map(([purpose, n], i) => ({
          label: purpose,
          magnitude: n,
          value: fmtInt(n, locale),
          tone: i === 0 ? ('accent' as const) : ('muted' as const),
        })),
        pal,
      ),
    },
  }

  const byId: Record<SectionId, ExportSection | null> = {
    perServer: perServerSection,
    coverage: withCaveat(coverageSection, 'coverageByType', view, t),
    gaps: withCaveat(gapsSection, 'gapsList', view, t),
    idle: idleSection,
    jobs: jobsSection,
    compliance: withCaveat(complianceSection, 'compliance', view, t),
    capacity: withCaveat(capacitySection, 'storageTargets', view, t),
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

  const posture: DeckStack = ((): DeckStack => {
    const o = coverage.overall
    const total = Math.max(1, o.protected + o.unprotected + o.excluded)
    return {
      segments: [
        {
          ratio: o.protected / total,
          color: pal.ok,
          label: t('dashboard:coverage.protected'),
          value: fmtInt(o.protected, locale),
        },
        {
          ratio: o.unprotected / total,
          color: pal.bad,
          label: t('dashboard:coverage.unprotected'),
          value: fmtInt(o.unprotected, locale),
        },
        {
          ratio: o.excluded / total,
          color: pal.excluded,
          label: t('dashboard:coverage.excluded'),
          value: fmtInt(o.excluded, locale),
        },
      ],
    }
  })()

  return {
    title: t('common:appTitle'),
    customer: meta.customer,
    subtitle: [t(`common:flavor.${flavor}`), captured].filter(Boolean).join(' · '),
    execTitle: t('dashboard:execSummary'),
    locale,
    kpis: execKpis,
    sections,
    footer: footerParts.join(' · '),
    warnings: [...new Set(view.warnings)],
    warningsTitle: t('common:warnings.title'),
    posture,
  }
}
