import type { Palette } from '../../theme/palette'
import { DARK, LIGHT } from '../../theme/palette'
import type { MetricKey, MetricProvenance, ReportView, ServerView } from '../../types/reportView'
import {
  fmtInt,
  fmtNum,
  fmtPercent,
  fmtPercentValue,
  fmtPercentWhole,
  formatBytes,
  formatGbOrUnknown,
  gbToBytes,
} from '../../utils/format'
import { FRONT_END_METRICS } from '../aggregation/frontEnd'
import { type ExportFlavor, SECTION_ORDER, type SectionId } from './sectionOrder'
import {
  appConsistentTone,
  atRiskTone,
  coverageTone,
  immutableTone,
  jobSuccessTone,
  replicatedTone,
  utilizationTone,
} from './thresholds'
import { toneHex } from './tone'
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
  const {
    coverage,
    gaps,
    jobs,
    compliance,
    capacity,
    policies,
    meta,
    idleAgents,
    frontEnd,
    opsInsights,
  } = view

  const execKpis = [
    {
      label: t('dashboard:kpi.coverage'),
      value: fmtPercent(coverage.overall.pct, locale),
      detail: t('dashboard:coverage.inclExcluded'),
      tone: coverageTone(coverage.overall.pct),
    },
    {
      label: t('dashboard:kpi.unprotected'),
      value: formatGbOrUnknown(gaps.totalCapacityGb, locale, t('common:sizeUnknown')),
      detail: t('dashboard:kpi.unprotectedDetail'),
      tone: 'warn' as const,
    },
    {
      label: t('dashboard:kpi.jobSuccess'),
      value: fmtPercent(jobs.successPct, locale),
      detail: t('dashboard:kpi.jobSuccessDetail'),
      tone: jobSuccessTone(jobs.successPct),
    },
    {
      label: t('dashboard:kpi.immutable'),
      value: fmtPercent(compliance.immutablePct, locale),
      detail: t('dashboard:kpi.immutableDetail'),
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
            tone: coverageTone(b.pct),
          })),
        pal,
      ),
    },
  }

  const gapsKpis: ExportKpi[] = [
    {
      label: t('dashboard:exposure.unprotectedTb'),
      value: formatGbOrUnknown(gaps.totalCapacityGb, locale, t('common:sizeUnknown')),
      tone: 'bad',
    },
    { label: t('dashboard:exposure.assets'), value: fmtInt(gaps.count, locale), tone: 'warn' },
  ]
  const gapsSection: ExportSection = {
    id: 'exposure',
    title: t('dashboard:exposure.title'),
    kpis: gapsKpis,
    table: {
      columns: [t('common:col.name'), t('common:col.type'), t('common:col.size')],
      rows: gaps.top.items.map((a) => [
        a.name,
        a.type,
        formatGbOrUnknown(a.sizeGb, locale, t('common:sizeUnknown')),
      ]),
      caption: t('common:topOf', { shown: gaps.top.shown, total: gaps.top.total }),
    },
    deck: {
      subtitle: t('dashboard:exposure.takeaway', { count: fmtInt(gaps.count, locale) }),
      kpiChips: gapsKpis,
      caveat: `${t('common:topOf', { shown: Math.min(10, gaps.top.items.length), total: gaps.top.total })} · ${t('common:fullListInExcel')}`,
      bars: toBars(
        gaps.top.items
          .filter((a) => a.sizeGb !== undefined)
          .slice(0, 10)
          .map((a) => ({
            label: a.name,
            magnitude: a.sizeGb as number,
            value: formatBytes(gbToBytes(a.sizeGb as number), locale),
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
              t('dashboard:exposure.assets'),
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
      subtitle: t('dashboard:jobs.takeaway', { pct: fmtPercent(jobs.successPct, locale) }),
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
    id: 'resilience',
    title: t('dashboard:resilience.title'),
    kpis: [
      {
        label: t('dashboard:resilience.appConsistent'),
        value: fmtPercent(compliance.appConsistentPct, locale),
        tone: appConsistentTone(compliance.appConsistentPct),
      },
      {
        label: t('dashboard:resilience.immutable'),
        value: fmtPercent(compliance.immutablePct, locale),
        tone: immutableTone(compliance.immutablePct),
      },
      {
        label: t('dashboard:resilience.replicated'),
        value: fmtPercent(compliance.replicatedPct, locale),
        tone: replicatedTone(compliance.replicatedPct),
      },
    ],
    table:
      Object.keys(compliance.backupLevelMix).length > 0
        ? {
            columns: [t('dashboard:resilience.level'), t('dashboard:resilience.count')],
            rows: Object.entries(compliance.backupLevelMix).map(([lvl, n]) => [
              lvl,
              fmtInt(n, locale),
            ]),
          }
        : undefined,
    notes: compliance.capped
      ? [t('common:capped', { n: fmtInt(compliance.windowSize, locale) })]
      : [],
    deck: {
      subtitle: t('dashboard:resilience.takeaway', {
        pct: fmtPercent(compliance.immutablePct, locale),
      }),
      caveat: compliance.capped
        ? t('common:capped', { n: fmtInt(compliance.windowSize, locale) })
        : undefined,
      bars: toBars(
        [
          {
            label: t('dashboard:resilience.appConsistent'),
            magnitude: compliance.appConsistentPct,
            value: fmtPercent(compliance.appConsistentPct, locale),
            tone: appConsistentTone(compliance.appConsistentPct),
          },
          {
            label: t('dashboard:resilience.replicated'),
            magnitude: compliance.replicatedPct,
            value: fmtPercent(compliance.replicatedPct, locale),
            tone: replicatedTone(compliance.replicatedPct),
          },
          {
            label: t('dashboard:resilience.immutable'),
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
      columns: [
        t('common:col.name'),
        t('dashboard:capacity.utilization'),
        t('dashboard:capacity.used'),
        t('dashboard:capacity.total'),
        t('dashboard:capacity.free'),
      ],
      rows: capacity.targets.map((tg) => [
        tg.name,
        fmtPercentValue(tg.utilizationPct, locale),
        formatGbOrUnknown(tg.usedGb, locale, t('common:sizeUnknown')),
        formatGbOrUnknown(tg.totalGb, locale, t('common:sizeUnknown')),
        formatGbOrUnknown(tg.freeGb, locale, t('common:sizeUnknown')),
      ]),
    },
    notes: [t('dashboard:capacity.mtrees', { count: fmtInt(capacity.mtreeCount, locale) })],
    deck: {
      subtitle: t('dashboard:capacity.takeaway', {
        count: fmtInt(capacity.flagged.length, locale),
      }),
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
            tone: utilizationTone(tg.utilizationPct),
          })),
        pal,
      ),
    },
  }

  const hasAnyPolicies = policies.count > 0
  const policiesKpis: ExportKpi[] = hasAnyPolicies
    ? [
        {
          label: t('dashboard:policies.title'),
          value: fmtInt(policies.count, locale),
          tone: 'accent',
        },
      ]
    : []
  const policiesByPurposeBars = hasAnyPolicies
    ? toBars(
        Object.entries(policies.byPurpose).map(([purpose, n], i) => ({
          label: purpose,
          magnitude: n,
          value: fmtInt(n, locale),
          tone: i === 0 ? ('accent' as const) : ('muted' as const),
        })),
        pal,
      )
    : []
  const policiesSection: ExportSection = {
    id: 'policies',
    title: t('dashboard:policies.title'),
    kpis: hasAnyPolicies ? policiesKpis : undefined,
    table: {
      columns: [
        t('dashboard:policies.col.policy'),
        t('dashboard:policies.col.purpose'),
        t('dashboard:policies.col.assets'),
        t('dashboard:policies.col.capacity'),
      ],
      rows: policies.perPolicy.map((pp) => [
        pp.name,
        pp.purpose,
        fmtInt(pp.assetCount, locale),
        formatBytes(gbToBytes(pp.protectionCapacityGb), locale),
      ]),
    },
    deck: {
      subtitle: t('dashboard:policies.takeaway', { count: fmtInt(policies.count, locale) }),
      kpiChips: hasAnyPolicies ? policiesKpis : [],
      bars: policiesByPurposeBars,
    },
  }

  const b10 = meta.baseTen
  const bytesOf = (gb: number) => formatBytes(gbToBytes(gb, b10), locale, b10)

  const { agentVersions, atRisk, longestBackups } = opsInsights

  const agentVersionsSection: ExportSection = {
    id: 'agentVersions',
    title: t('dashboard:agentVersions.title'),
    table: {
      columns: [t('dashboard:agentVersions.col.version'), t('dashboard:agentVersions.col.count')],
      rows: agentVersions.map((r) => [r.version, fmtInt(r.count, locale)]),
      caption: t('dashboard:agentVersions.caption'),
    },
    deck:
      agentVersions.length > 0
        ? {
            subtitle: t('dashboard:agentVersions.takeaway', {
              count: fmtInt(agentVersions.length, locale),
            }),
            kpiChips: [
              {
                label: t('dashboard:agentVersions.title'),
                value: fmtInt(agentVersions.length, locale),
                tone: 'accent',
              },
            ],
            bars: toBars(
              agentVersions.slice(0, 8).map((r) => ({
                label: r.version,
                magnitude: r.count,
                value: fmtInt(r.count, locale),
                tone: (r.version === 'Unknown' ? 'warn' : 'accent') as ExportTone,
              })),
              pal,
            ),
          }
        : undefined,
  }

  const atRiskRows: string[][] = [
    ...atRisk.overtime.items.map((c) => [
      c.name,
      c.clientType ?? '',
      t('dashboard:atRisk.risk.overtime'),
    ]),
    ...atRisk.staleBackups.items.map((c) => [
      c.name,
      c.clientType ?? '',
      t('dashboard:atRisk.risk.stale'),
    ]),
  ]
  const atRiskSection: ExportSection = {
    id: 'atRisk',
    title: t('dashboard:atRisk.title'),
    table: {
      columns: [
        t('dashboard:atRisk.col.client'),
        t('dashboard:atRisk.col.type'),
        t('dashboard:atRisk.col.risk'),
      ],
      rows: atRiskRows,
      caption: t('dashboard:atRisk.caption', {
        shown: atRiskRows.length,
        total: atRisk.overtime.total + atRisk.staleBackups.total,
      }),
    },
    deck:
      atRiskRows.length > 0
        ? {
            subtitle: t('dashboard:atRisk.takeaway', {
              overtime: fmtInt(atRisk.overtime.total, locale),
              stale: fmtInt(atRisk.staleBackups.total, locale),
            }),
            kpiChips: [
              {
                label: t('dashboard:atRisk.overtimeChip'),
                value: fmtInt(atRisk.overtime.total, locale),
                tone: atRiskTone(atRisk.overtime.total),
              },
              {
                label: t('dashboard:atRisk.staleChip'),
                value: fmtInt(atRisk.staleBackups.total, locale),
                tone: atRiskTone(atRisk.staleBackups.total),
              },
            ],
          }
        : undefined,
  }

  const longestBackupsSection: ExportSection = {
    id: 'longestBackups',
    title: t('dashboard:longestBackups.title'),
    table: {
      columns: [
        t('dashboard:longestBackups.col.server'),
        t('dashboard:longestBackups.col.type'),
        t('dashboard:longestBackups.col.duration'),
        t('dashboard:longestBackups.col.capacity'),
        t('dashboard:longestBackups.col.throughput'),
      ],
      rows: longestBackups.items.map((r) => [
        r.server,
        r.policyType,
        fmtNum(r.durationHr, locale, 1),
        r.capacityGb === undefined ? t('common:sizeUnknown') : bytesOf(r.capacityGb),
        r.throughputMbSec === undefined
          ? t('common:sizeUnknown')
          : fmtNum(r.throughputMbSec, locale, 1),
      ]),
      caption: t('dashboard:longestBackups.caption', {
        shown: longestBackups.shown,
        total: longestBackups.total,
      }),
    },
    deck:
      longestBackups.items.length > 0
        ? {
            subtitle: t('dashboard:longestBackups.takeaway', {
              hours: fmtNum(longestBackups.items[0]?.durationHr ?? 0, locale, 1),
            }),
          }
        : undefined,
  }

  const feBytes = (gb: number) => formatBytes(gbToBytes(gb), locale)
  const feCell = (gb: number | undefined) => formatGbOrUnknown(gb, locale, t('common:sizeUnknown'))
  const feTotalCell = (k: (typeof FRONT_END_METRICS)[number]): string => {
    const defined = frontEnd.byType.filter((r) => r[k] !== undefined)
    if (defined.length === 0) return t('common:sizeUnknown')
    const sum = defined.reduce((acc, r) => acc + (r[k] as number), 0)
    const cell = feBytes(sum)
    return defined.length < frontEnd.byType.length ? `≥ ${cell}` : cell
  }
  const feHasPartial = FRONT_END_METRICS.some((k) => {
    const def = frontEnd.byType.filter((r) => r[k] !== undefined).length
    return def > 0 && def < frontEnd.byType.length
  })
  const feProtFetb = frontEnd.byType.reduce((a, r) => a + (r.protectedFetbGb ?? 0), 0)
  const feUnprotDisc = frontEnd.byType.reduce((a, r) => a + (r.unprotectedDiscoveredGb ?? 0), 0)
  const hasFrontEnd = frontEnd.byType.length > 0

  const volumetrySection: ExportSection = {
    id: 'volumetry',
    title: t('dashboard:volumetry.title'),
    table: {
      columns: [
        t('dashboard:volumetry.col.type'),
        t('dashboard:volumetry.col.protectedDiscovered'),
        t('dashboard:volumetry.col.protectedFetb'),
        t('dashboard:volumetry.col.unprotectedDiscovered'),
        t('dashboard:volumetry.col.unprotectedFetb'),
      ],
      rows: [
        ...frontEnd.byType.map((r) => [
          r.type,
          feCell(r.protectedDiscoveredGb),
          feCell(r.protectedFetbGb),
          feCell(r.unprotectedDiscoveredGb),
          feCell(r.unprotectedFetbGb),
        ]),
        ...(hasFrontEnd
          ? [
              [
                t('dashboard:volumetry.total'),
                feTotalCell('protectedDiscoveredGb'),
                feTotalCell('protectedFetbGb'),
                feTotalCell('unprotectedDiscoveredGb'),
                feTotalCell('unprotectedFetbGb'),
              ],
            ]
          : []),
      ],
      caption: [
        frontEnd.excludedCount > 0
          ? t('dashboard:volumetry.excludedNote', { count: fmtInt(frontEnd.excludedCount, locale) })
          : '',
        feHasPartial ? t('dashboard:volumetry.partialNote') : '',
        t('dashboard:volumetry.sizingNote'),
        provenanceCaveat(view.provenance.frontEnd, t),
      ]
        .filter(Boolean)
        .join(' · '),
    },
    ...(hasFrontEnd
      ? {
          deck: {
            subtitle: t('dashboard:volumetry.takeaway', { fetb: feBytes(feProtFetb) }),
            kpiChips: [
              {
                label: t('dashboard:volumetry.col.protectedFetb'),
                value: feBytes(feProtFetb),
                tone: 'accent' as const,
              },
              {
                label: t('dashboard:volumetry.col.unprotectedDiscovered'),
                value: feBytes(feUnprotDisc),
                tone: 'warn' as const,
              },
            ],
          },
        }
      : {}),
  }

  const byId: Record<SectionId, ExportSection | null> = {
    perServer: perServerSection,
    coverage: withCaveat(coverageSection, 'coverageByType', view, t),
    exposure: withCaveat(gapsSection, 'gapsList', view, t),
    volumetry: volumetrySection,
    idle: idleSection,
    jobs: jobsSection,
    resilience: withCaveat(complianceSection, 'compliance', view, t),
    capacity: withCaveat(capacitySection, 'storageTargets', view, t),
    policies: policiesSection,
    atRisk: atRiskSection,
    agentVersions: agentVersionsSection,
    longestBackups: longestBackupsSection,
  }
  const allSections = SECTION_ORDER[flavor]
    .map((id) => byId[id])
    .filter((s): s is ExportSection => s !== null)

  const isRenderable = (s: ExportSection): boolean => {
    const d = s.deck
    const hasDeck = Boolean(
      d && (d.donut || d.tiles?.length || d.bars?.length || d.kpiChips?.length),
    )
    const hasTable = (s.table?.rows.length ?? 0) > 0
    const hasKpis = (s.kpis?.length ?? 0) > 0
    return hasDeck || hasTable || hasKpis
  }
  const dropped = allSections.filter((s) => !isRenderable(s))
  const sections = allSections.filter(isRenderable)
  const suppressionNotes = dropped.map((s) => t('common:sectionUnavailable', { title: s.title }))

  const captured = meta.capturedAt ? meta.capturedAt.slice(0, 10) : ''
  const footerParts = [
    meta.customer,
    meta.collectorBuild,
    captured,
    meta.baseTen ? t('common:units.base10') : t('common:units.base2'),
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
    warnings: [...new Set([...view.warnings, ...suppressionNotes])],
    warningsTitle: t('common:warnings.title'),
    posture,
  }
}
