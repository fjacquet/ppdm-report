import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
import { emptyActivity } from '../aggregation/activity'
import { emptyCapacityTrend } from '../aggregation/capacityTrend'
import { emptyEfficiency } from '../aggregation/efficiency'
import { computeHygiene, emptyHygiene } from '../aggregation/hygiene'
import { emptyOpsInsights } from '../aggregation/opsInsights'
import { allAvailable, allUnavailable } from '../aggregation/provenance'
import { emptyReliability } from '../aggregation/reliability'
import { buildExportModel } from './buildExportModel'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string

function baseView(over: Partial<ReportView> = {}): ReportView {
  return { ...view, ...over }
}

const view: ReportView = {
  meta: {
    projectId: '1',
    customer: 'WHO',
    collectorBuild: '27.2.5.278',
    capturedAt: '2026-06-15T00:00:00.000Z',
    baseTen: true,
  },
  inUse: ['SQL Databases'],
  idleAgents: ['Oracle Databases', 'NAS'],
  warnings: ['Sheet "Copies" reached the cap'],
  coverage: {
    byType: {
      'SQL Databases': {
        protected: 380,
        unprotected: 150,
        excluded: 224,
        pct: 0.717,
        pctInclExcluded: 0.504,
      },
    },
    overall: {
      protected: 703,
      unprotected: 281,
      excluded: 377,
      pct: 0.714,
      pctInclExcluded: 0.517,
    },
  },
  gaps: {
    count: 281,
    totalCapacityGb: 263000,
    top: { items: [{ name: 'HR_PAYROLL', type: 'MSSQL', sizeGb: 842.6 }], total: 281, shown: 1 },
  },
  jobs: {
    counts: { SUCCESS: 9297, RETRIED: 635 },
    total: 10000,
    successPct: 0.93,
    capped: true,
    windowSize: 10000,
  },
  compliance: {
    appConsistentPct: 0.77,
    immutablePct: 0,
    replicatedPct: 0.32,
    appConsistentCount: 7700,
    immutableCount: 0,
    replicatedCount: 3200,
    backupLevelMix: {},
    windowSize: 10000,
    capped: true,
  },
  capacity: {
    targets: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    flagged: [{ name: 'dd1', type: 'DATA_DOMAIN_SYSTEM', utilizationPct: 87.6, flagged: true }],
    mtreeCount: 17,
  },
  policies: { count: 32, byPurpose: { CENTRALIZED: 29, EXCLUSION: 3 }, perPolicy: [] },
  frontEnd: { byType: [], excludedCount: 0 },
  opsInsights: emptyOpsInsights(),
  reliability: emptyReliability(),
  efficiency: emptyEfficiency(),
  capacityTrend: emptyCapacityTrend(),
  hygiene: emptyHygiene(),
  activity: emptyActivity(),
  provenance: allAvailable(0),
}

describe('buildExportModel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('builds exec KPIs with the immutable card flagged bad when 0%', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.kpis).toHaveLength(4)
    expect(model.kpis[0]?.value).toBe('71.4%')
    expect(model.kpis[1]?.value).toBe('263.0 TB')
    const immutable = model.kpis.find((k) => k.label === t('dashboard:kpi.immutable'))
    expect(immutable?.value).toBe('0%')
    expect(immutable?.tone).toBe('bad')
  })

  it('orders sections by flavor', () => {
    const assessment = buildExportModel(view, 'assessment', 'light', t, 'en').sections.map(
      (s) => s.id,
    )
    expect(assessment).toEqual([
      'coverage',
      'exposure',
      'idle',
      'jobs',
      'resilience',
      'capacity',
      'policies',
    ])
    const ops = buildExportModel(view, 'ops', 'light', t, 'en').sections.map((s) => s.id)
    expect(ops.slice(0, 3)).toEqual(['jobs', 'resilience', 'capacity'])
  })

  it('omits the idle section when no idle agents are present', () => {
    const model = buildExportModel({ ...view, idleAgents: [] }, 'assessment', 'light', t, 'en')
    expect(model.sections.find((s) => s.id === 'idle')).toBeUndefined()
  })

  it('lists idle agents (present-but-unused) in their own section', () => {
    const idle = buildExportModel(view, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'idle',
    )
    expect(idle?.table?.rows).toEqual([['Oracle Databases'], ['NAS']])
  })

  it('caps the gaps list and shows the honest top-of caption', () => {
    const gaps = buildExportModel(view, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'exposure',
    )
    expect(gaps?.table?.caption).toBe('Top 1 of 281')
    expect(gaps?.table?.rows[0]?.[0]).toBe('HR_PAYROLL')
  })

  it('keeps the size column and TB KPIs when the estate carries gap sizes', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const gaps = model.sections.find((s) => s.id === 'exposure')
    expect(gaps?.table?.columns).toEqual(['Name', 'Type', 'Size'])
    expect(gaps?.table?.rows[0]?.slice(0, 2)).toEqual(['HR_PAYROLL', 'MSSQL'])
    expect(gaps?.table?.rows[0]?.[2]).not.toBe('Size unknown')
    expect(gaps?.kpis?.map((k) => k.label)).toEqual([
      t('dashboard:exposure.unprotectedTb'),
      t('dashboard:exposure.assets'),
    ])
    const unprotected = model.kpis.find((k) => k.label === t('dashboard:kpi.unprotected'))
    expect(unprotected?.value).toBe('263.0 TB')
    expect(gaps?.notes ?? []).not.toContain(t('dashboard:exposure.noSizesNote'))
  })

  it('suppresses the size column and TB KPIs when the estate carries no gap sizes (Avamar/NetWorker)', () => {
    const noSizes: ReportView = {
      ...view,
      gaps: {
        count: 281,
        totalCapacityGb: undefined,
        top: {
          items: [{ name: 'client01.corp', type: 'Client', sizeGb: undefined }],
          total: 281,
          shown: 1,
        },
      },
    }
    const model = buildExportModel(noSizes, 'assessment', 'light', t, 'en')
    const gaps = model.sections.find((s) => s.id === 'exposure')
    expect(gaps?.table?.columns).toEqual(['Name', 'Type'])
    expect(gaps?.table?.rows[0]).toEqual(['client01.corp', 'Client'])
    expect(gaps?.kpis?.map((k) => k.label)).toEqual([t('dashboard:exposure.assets')])
    const unprotected = model.kpis.find((k) => k.label === t('dashboard:kpi.unprotected'))
    expect(unprotected).toBeUndefined()
    const assetsExecKpi = model.kpis.find((k) => k.label === t('dashboard:exposure.assets'))
    expect(assetsExecKpi?.value).toBe('281')
    expect(gaps?.notes).toContain(t('dashboard:exposure.noSizesNote'))
    expect(gaps?.deck?.caveat).toContain(t('dashboard:exposure.noSizesNote'))
  })

  it('renders capped-window caveats for jobs and compliance (no silent caps)', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const jobs = model.sections.find((s) => s.id === 'jobs')
    const compliance = model.sections.find((s) => s.id === 'resilience')
    expect(jobs?.notes?.some((n) => /10,000/.test(n))).toBe(true)
    expect(compliance?.notes?.some((n) => /window/i.test(n))).toBe(true)
  })

  it('colors the coverage pie from the active theme palette', () => {
    const light = buildExportModel(view, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'coverage',
    )
    const dark = buildExportModel(view, 'assessment', 'dark', t, 'en').sections.find(
      (s) => s.id === 'coverage',
    )
    expect(light?.chart?.slices[0]?.color).toBe('#16a34a')
    expect(dark?.chart?.slices[0]?.color).toBe('#22c55e')
  })

  it('renders the coverage headline with a single percent sign (no double %)', () => {
    const cov = buildExportModel(view, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'coverage',
    )
    const headline = cov?.notes?.[0] ?? ''
    expect(headline).toContain('71.4%')
    expect((headline.match(/%/g) ?? []).length).toBe(1)
  })

  it('includes customer and base-10 note in the footer when meta.baseTen is true', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.footer).toContain('WHO')
    expect(model.footer).toContain('base-10')
    expect(model.footer).not.toContain('base-2')
  })

  it('uses base-2 note in the footer when meta.baseTen is false', () => {
    const base2View: ReportView = { ...view, meta: { ...view.meta, baseTen: false } }
    const model = buildExportModel(base2View, 'assessment', 'light', t, 'en')
    expect(model.footer).toContain('base-2')
    expect(model.footer).not.toContain('base-10')
  })

  it('formats volumetry and policy capacity in base-2 (GiB/TiB) when meta.baseTen is false', () => {
    const base2View: ReportView = {
      ...view,
      meta: { ...view.meta, baseTen: false },
      frontEnd: {
        byType: [
          {
            type: 'VMs',
            protectedDiscoveredGb: 1024,
            protectedFetbGb: 1024,
            unprotectedDiscoveredGb: 512,
            unprotectedFetbGb: 512,
          },
        ],
        excludedCount: 0,
      },
      policies: {
        count: 1,
        byPurpose: { CENTRALIZED: 1 },
        perPolicy: [
          { name: 'P1', purpose: 'CENTRALIZED', assetCount: 1, protectionCapacityGb: 1024 },
        ],
      },
    }
    const model = buildExportModel(base2View, 'assessment', 'light', t, 'en')
    // volumetry section: 1024 base-2 GiB = 1.0 TiB (not 1.0 TB)
    const vol = model.sections.find((s) => s.id === 'volumetry')
    const row0 = vol?.table?.rows[0]
    expect(row0?.some((cell) => /TiB|GiB/.test(cell))).toBe(true)
    expect(row0?.some((cell) => /\bTB\b|\bGB\b/.test(cell))).toBe(false)
    // policies section: per-policy capacity 1024 base-2 GiB = 1.0 TiB (not 1.0 TB)
    const pol = model.sections.find((s) => s.id === 'policies')
    const polRow = pol?.table?.rows[0]
    expect(polRow?.some((cell) => /TiB|GiB/.test(cell))).toBe(true)
    expect(polRow?.some((cell) => /\bTB\b|\bGB\b/.test(cell))).toBe(false)
  })

  it('formats volumetry and policy capacity in base-10 (GB/TB) when meta.baseTen is true', () => {
    const v: ReportView = {
      ...view,
      frontEnd: {
        byType: [
          {
            type: 'VMs',
            protectedDiscoveredGb: 1000,
            protectedFetbGb: 1000,
            unprotectedDiscoveredGb: 500,
            unprotectedFetbGb: 500,
          },
        ],
        excludedCount: 0,
      },
      policies: {
        count: 1,
        byPurpose: { CENTRALIZED: 1 },
        perPolicy: [
          { name: 'P1', purpose: 'CENTRALIZED', assetCount: 1, protectionCapacityGb: 1000 },
        ],
      },
    }
    const model = buildExportModel(v, 'assessment', 'light', t, 'en')
    const vol = model.sections.find((s) => s.id === 'volumetry')
    const row0 = vol?.table?.rows[0]
    expect(row0?.some((cell) => /\bTB\b|\bGB\b/.test(cell))).toBe(true)
    expect(row0?.some((cell) => /TiB|GiB/.test(cell))).toBe(false)
    const pol = model.sections.find((s) => s.id === 'policies')
    const polRow = pol?.table?.rows[0]
    expect(polRow?.some((cell) => /\bTB\b|\bGB\b/.test(cell))).toBe(true)
    expect(polRow?.some((cell) => /TiB|GiB/.test(cell))).toBe(false)
  })

  it('builds a deck for every section + a posture stack', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const byId = Object.fromEntries(model.sections.map((s) => [s.id, s]))

    // coverage: mini-donut (overall) + per-type bars
    expect(byId.coverage?.deck?.donut?.center).toBe('71%')
    expect(byId.coverage?.deck?.donut?.slices.map((s) => s.color)).toEqual([
      '#16a34a',
      '#dc2626',
      '#cbd5e1',
    ])
    expect(byId.coverage?.deck?.bars?.[0]).toMatchObject({
      label: 'SQL Databases',
      value: '71.7%',
    })

    // jobs: status bars derived from counts, success colored ok
    const success = byId.jobs?.deck?.bars?.find((b) => b.label === 'SUCCESS')
    expect(success).toMatchObject({ value: '9,297', color: '#16a34a' })

    // compliance: three percent bars; immutable (0%) colored bad
    const immut = byId.resilience?.deck?.bars?.find((b) => b.value === '0%')
    expect(immut?.color).toBe('#dc2626')

    // capacity: 87.6% ≥ 85 → bad (#dc2626) per utilizationTone thresholds
    expect(byId.capacity?.deck?.bars?.[0]).toMatchObject({ label: 'dd1', color: '#dc2626' })
    // utilization bars scale absolutely (87.6% → 0.876 of the track), not to the local max
    expect(byId.capacity?.deck?.bars?.[0]?.ratio).toBeCloseTo(0.876, 3)
    expect(byId.capacity?.deck?.kpiChips?.some((k) => /near capacity/.test(k.label))).toBe(true)

    // policies: by-purpose bars
    expect(byId.policies?.deck?.bars?.map((b) => b.label)).toEqual(['CENTRALIZED', 'EXCLUSION'])

    // idle: complete tile list (never truncated)
    expect(byId.idle?.deck?.tiles).toEqual(['Oracle Databases', 'NAS'])

    // exec posture: protected / unprotected / excluded segments
    expect(model.posture?.segments.map((s) => s.color)).toEqual(['#16a34a', '#dc2626', '#cbd5e1'])

    // deck caveats: jobs shows window cap only (not raw counts), coverage shows incl-excluded pct, capacity has none
    expect(byId.jobs?.deck?.caveat).toMatch(/10,000/)
    expect(byId.jobs?.deck?.caveat).not.toMatch(/SUCCESS/)
    expect(byId.coverage?.deck?.caveat).toContain('51.7%')
    expect(byId.capacity?.deck?.caveat).toBeUndefined()
  })

  it('caps deck gap bars at 10 and notes the Excel fallback', () => {
    const many = {
      ...view,
      gaps: {
        ...view.gaps,
        top: {
          total: 281,
          shown: 12,
          items: Array.from({ length: 12 }, (_, i) => ({
            name: `A${i}`,
            type: 'FILE_SYSTEM',
            sizeGb: 100 - i,
          })),
        },
      },
    }
    const gaps = buildExportModel(many, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'exposure',
    )
    expect(gaps?.deck?.bars).toHaveLength(10)
    expect(gaps?.deck?.caveat).toMatch(/Excel/)
  })

  it('omits the per-server section for a single source', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.sections.find((s) => s.id === 'perServer')).toBeUndefined()
  })

  it('emits a per-server section with one bar per server when multi-source', () => {
    const perServer = [
      { label: 'ppdm-a', version: '19.22', view },
      { label: 'ppdm-b', version: '19.21', view },
    ]
    const model = buildExportModel(view, 'assessment', 'light', t, 'en', perServer)
    const section = model.sections.find((s) => s.id === 'perServer')
    expect(section).toBeDefined()
    expect(section?.deck?.bars).toHaveLength(2)
    expect(model.sections[0]?.id).toBe('perServer')
  })

  it('passes deduplicated warnings into the model', () => {
    const dup: ReportView = {
      ...view,
      warnings: ['cap note', 'cap note', 'merge note'],
      // non-empty frontEnd so volumetry renders and adds no suppression warning
      frontEnd: {
        byType: [
          {
            type: 'Virtual Machines',
            protectedDiscoveredGb: 10,
            protectedFetbGb: 5,
            unprotectedDiscoveredGb: 2,
            unprotectedFetbGb: 1,
          },
        ],
        excludedCount: 0,
      },
      // non-empty opsInsights so atRisk/agentVersions/longestBackups render and add no suppression warnings
      opsInsights: {
        agentVersions: [{ version: '19.4', count: 1 }],
        atRisk: {
          overtime: { items: [{ name: 'c1' }], total: 1, shown: 1 },
          staleBackups: { items: [], total: 0, shown: 0 },
        },
        longestBackups: {
          items: [{ server: 's1', policyType: 'FS', durationHr: 2 }],
          total: 1,
          shown: 1,
        },
      },
      // non-empty reliability so the reliability section renders and adds no suppression warning
      reliability: {
        repeatFailures: {
          items: [{ host: 'bad-client', failureDays: 3, failedJobs: 3 }],
          total: 1,
          shown: 1,
        },
        runtime: { le15m: 1, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 0 },
        runtimeTotal: 1,
        capped: false,
      },
      // non-empty efficiency so the efficiency section renders and adds no suppression warning
      efficiency: {
        retention: {
          totalGbByBucket: { r30: 10, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
          perPolicyType: [],
        },
      },
      // non-empty capacityTrend so the capacityTrend section renders and adds no suppression warning
      capacityTrend: {
        targets: [
          {
            target: 'dd1',
            currentPct: 50,
            minPct: 40,
            maxPct: 50,
            windowStart: '2026-05-01',
            windowEnd: '2026-06-30',
            sampleCount: 60,
            series: [],
          },
        ],
      },
      // non-empty hygiene so the hygiene section renders and adds no suppression warning
      hygiene: computeHygiene([{ kind: 'datasetUnused', name: 'ds1' }]),
      // non-empty activity so activity/largestBackups/slowestBackups render and add no suppression warnings
      activity: {
        byType: [{ type: 'FILESYSTEM', capacityGb: 10, clients: 1, files: 5 }],
        largest: { items: [{ host: 'h1', type: 'FILESYSTEM', sizeGb: 10 }], total: 1, shown: 1 },
        slowest: {
          items: [{ host: 'h1', type: 'FILESYSTEM', throughputMbSec: 5, sizeGb: 10 }],
          total: 1,
          shown: 1,
        },
        daily: [{ day: '2026-06-15', gb: 10, jobs: 1 }],
      },
    }
    const model = buildExportModel(dup, 'assessment', 'light', t, 'en')
    expect(model.warnings).toEqual(['cap note', 'merge note'])
  })

  it('includes the localized warnings title', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.warningsTitle).toBe('Data caveats')
  })

  it('coverage deck bars are capped at 6 and sorted descending by pct', () => {
    const localView = {
      ...view,
      coverage: {
        ...view.coverage,
        byType: {
          TypeA: { protected: 10, unprotected: 90, excluded: 0, pct: 0.1, pctInclExcluded: 0.1 },
          TypeB: { protected: 80, unprotected: 20, excluded: 0, pct: 0.8, pctInclExcluded: 0.8 },
          TypeC: { protected: 50, unprotected: 50, excluded: 0, pct: 0.5, pctInclExcluded: 0.5 },
          TypeD: { protected: 95, unprotected: 5, excluded: 0, pct: 0.95, pctInclExcluded: 0.95 },
          TypeE: { protected: 30, unprotected: 70, excluded: 0, pct: 0.3, pctInclExcluded: 0.3 },
          TypeF: { protected: 70, unprotected: 30, excluded: 0, pct: 0.7, pctInclExcluded: 0.7 },
          TypeG: { protected: 60, unprotected: 40, excluded: 0, pct: 0.6, pctInclExcluded: 0.6 },
        },
      },
    }
    const cov = buildExportModel(localView, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'coverage',
    )
    expect(cov?.deck?.bars).toHaveLength(6)
    expect(cov?.deck?.bars?.[0]?.label).toBe('TypeD')
  })

  it('appends an unavailable caveat to detail-only sections for summary provenance', () => {
    const summaryView: ReportView = { ...view, provenance: allUnavailable(100) }
    const model = buildExportModel(summaryView, 'assessment', 'light', t, 'en', [])
    const compliance = model.sections.find((s) => s.id === 'resilience')
    expect(compliance?.deck?.caveat ?? compliance?.notes?.join(' ')).toMatch(/not available/i)
  })

  it('adds a partialAssets caveat when compliance has partial asset coverage', () => {
    const partialView: ReportView = {
      ...view,
      opsInsights: emptyOpsInsights(),
      provenance: {
        ...allAvailable(3886),
        compliance: {
          available: true,
          serversCovered: 1,
          serversTotal: 2,
          assetsCovered: 370,
          assetsTotal: 3886,
        },
      },
    }
    const model = buildExportModel(partialView, 'assessment', 'light', t, 'en', [])
    const compliance = model.sections.find((s) => s.id === 'resilience')
    const caveatOrNotes = compliance?.deck?.caveat ?? compliance?.notes?.join(' ') ?? ''
    expect(caveatOrNotes).toMatch(/1 of 2 servers/)
    expect(caveatOrNotes).toMatch(/370 of 3886 assets/)
  })

  it('gives each section a plain-language takeaway subtitle', () => {
    const m = buildExportModel(view, 'assessment', 'light', t, 'en')
    const byId = Object.fromEntries(m.sections.map((s) => [s.id, s]))
    expect(byId.jobs?.deck?.subtitle).toBe('93% of recent backup jobs succeeded')
    expect(byId.capacity?.deck?.subtitle).toMatch(/near capacity/)
    expect(byId.policies?.deck?.subtitle).toBe('32 protection policies in force')
    const unprotected = m.kpis.find((k) => k.label === t('dashboard:kpi.unprotected'))
    expect(unprotected?.detail).toBe('Data with no protection policy')
  })

  it('renders a per-policy governance table from perPolicy', () => {
    const v: ReportView = {
      ...view,
      policies: {
        count: 1,
        byPurpose: { CENTRALIZED: 1 },
        perPolicy: [
          {
            name: 'SQL - Prod',
            purpose: 'CENTRALIZED',
            assetCount: 6,
            protectionCapacityGb: 19732,
          },
        ],
      },
    }
    const policies = buildExportModel(v, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'policies',
    )
    expect(policies?.table?.columns).toEqual(['Policy', 'Purpose', 'Assets', 'Capacity'])
    expect(policies?.table?.rows[0]?.[0]).toBe('SQL - Prod')
    expect(policies?.table?.rows[0]?.[2]).toBe('6')
  })

  it('suppresses an all-empty section and records it in caveats', () => {
    const empty: ReportView = {
      ...view,
      policies: { count: 0, byPurpose: {}, perPolicy: [] },
    }
    const m = buildExportModel(empty, 'assessment', 'light', t, 'en')
    expect(m.sections.find((s) => s.id === 'policies')).toBeUndefined()
    expect(m.warnings?.some((w) => /Policies: no data/.test(w))).toBe(true)
  })

  it('renders the backup-level mix as the resilience detail table', () => {
    const v: ReportView = {
      ...view,
      compliance: { ...view.compliance, backupLevelMix: { FULL: 150, INCR: 2000 } },
    }
    const res = buildExportModel(v, 'assessment', 'light', t, 'en').sections.find(
      (s) => s.id === 'resilience',
    )
    expect(res?.table?.columns).toEqual(['Backup level', 'Copies'])
    expect(res?.table?.rows).toEqual([
      ['FULL', '150'],
      ['INCR', '2,000'],
    ])
  })

  it('does not add a caveat when provenance is fully available (byte-identical detail export)', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en', [])
    const compliance = model.sections.find((s) => s.id === 'resilience')
    const coverage = model.sections.find((s) => s.id === 'coverage')
    const gaps = model.sections.find((s) => s.id === 'exposure')
    const capacity = model.sections.find((s) => s.id === 'capacity')
    // none of the four detail-only sections should carry a provenance caveat
    const hasUnavailable = (notes?: string[]) => (notes ?? []).some((n) => /not available/i.test(n))
    expect(hasUnavailable(compliance?.notes)).toBe(false)
    expect(hasUnavailable(coverage?.notes)).toBe(false)
    expect(hasUnavailable(gaps?.notes)).toBe(false)
    expect(hasUnavailable(capacity?.notes)).toBe(false)
  })

  it('renders a volumetry section with a TOTAL row and ≥ floor for no-figure columns', () => {
    const v = baseView({
      frontEnd: {
        byType: [
          {
            type: 'Virtual Machines',
            protectedDiscoveredGb: 100,
            protectedFetbGb: 60,
            unprotectedDiscoveredGb: 30,
            unprotectedFetbGb: 3,
          },
          {
            type: 'SQL Databases',
            protectedDiscoveredGb: undefined,
            protectedFetbGb: 15,
            unprotectedDiscoveredGb: undefined,
            unprotectedFetbGb: 2,
          },
        ],
        excludedCount: 5,
      },
    })
    const model = buildExportModel(v, 'assessment', 'light', t, 'en')
    const sec = model.sections.find((s) => s.id === 'volumetry')
    expect(sec?.table?.rows.length).toBe(3) // 2 types + TOTAL
    const total = sec?.table?.rows[2]
    expect(total?.[2]).toBe('75.0 GB') // protected FETB exact: 60 + 15
    expect(total?.[1]?.startsWith('≥')).toBe(true) // protected discovered: SQL missing → floor
    expect(sec?.table?.caption).toContain('5') // excluded footnote
  })

  it('suppresses the volumetry section when there is no per-type data (Avamar)', () => {
    const v = baseView({ frontEnd: { byType: [], excludedCount: 0 } })
    const model = buildExportModel(v, 'assessment', 'light', t, 'en')
    expect(model.sections.find((s) => s.id === 'volumetry')).toBeUndefined()
  })

  it('renders the three ops-insight sections when opsInsights is populated', () => {
    const v = baseView({
      opsInsights: {
        agentVersions: [{ version: '19.4', count: 4 }],
        atRisk: {
          overtime: { items: [{ name: 'c1', clientType: 'VM' }], total: 1, shown: 1 },
          staleBackups: { items: [{ name: 'c2' }], total: 1, shown: 1 },
        },
        longestBackups: {
          items: [
            { server: 's1', policyType: 'FS', durationHr: 10, capacityGb: 5, throughputMbSec: 2 },
          ],
          total: 1,
          shown: 1,
        },
      },
    })
    const model = buildExportModel(v, 'ops', 'light', t, 'en-US')
    const ids = model.sections.map((s) => s.id)
    expect(ids).toContain('agentVersions')
    expect(ids).toContain('atRisk')
    expect(ids).toContain('longestBackups')
    const atRisk = model.sections.find((s) => s.id === 'atRisk')
    expect(atRisk?.table?.rows.length).toBe(2) // overtime + stale flattened
  })

  it('suppresses ops-insight sections when opsInsights is empty', () => {
    const model = buildExportModel(baseView({}), 'ops', 'light', t, 'en-US')
    const ids = model.sections.map((s) => s.id)
    expect(ids).not.toContain('agentVersions')
    expect(ids).not.toContain('atRisk')
    expect(ids).not.toContain('longestBackups')
  })

  describe('reliability section', () => {
    it('renders repeat-failure table, runtime bars, and queue chip', () => {
      const v = baseView({
        reliability: {
          repeatFailures: {
            items: [{ host: 'bad-client', failureDays: 4, failedJobs: 9, daysSinceSuccess: 2 }],
            total: 1,
            shown: 1,
          },
          runtime: { le15m: 10, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 1 },
          runtimeTotal: 11,
          queue: {
            delayedCount: 2,
            total: 10,
            delayedPct: 0.2,
            top: { items: [{ host: 'slow', queuedHours: 2 }], total: 2, shown: 1 },
          },
          windowStart: '2026-06-01',
          windowEnd: '2026-06-30',
          capped: false,
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'reliability')
      expect(section).toBeDefined()
      expect(section?.table?.rows[0]?.[0]).toBe('bad-client')
      expect(section?.deck?.kpiChips?.some((k) => k.value === '1')).toBe(true)
      expect(section?.deck?.bars?.length).toBe(7)
    })

    it('is suppressed when reliability is empty (e.g. PPDM)', () => {
      const v = baseView({ reliability: emptyReliability() })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      expect(model.sections.find((s) => s.id === 'reliability')).toBeUndefined()
    })
  })

  describe('efficiency section', () => {
    it('renders dedupe chip, retention table, and bucket bars', () => {
      const v = baseView({
        efficiency: {
          dedupe: {
            common: { num: 9200, den: 100 },
            lowDedupe: { items: [], total: 0, shown: 0 },
          },
          retention: {
            totalGbByBucket: { r30: 100, r60: 50, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
            perPolicyType: [
              {
                type: 'SQL',
                gbByBucket: { r30: 100, r60: 50, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
              },
            ],
          },
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'efficiency')
      expect(section).toBeDefined()
      expect(section?.table?.rows.some((r) => r[0] === 'SQL')).toBe(true)
      expect(section?.deck?.bars?.length).toBe(6)
    })

    it('is suppressed when efficiency is empty (PPDM) and resilience gains replication health when present', () => {
      const empty = buildExportModel(
        baseView({ efficiency: emptyEfficiency() }),
        'assessment',
        'light',
        t,
        'en',
      )
      expect(empty.sections.find((s) => s.id === 'efficiency')).toBeUndefined()

      const withRep = buildExportModel(
        baseView({
          efficiency: {
            replicationHealth: {
              counts: { success: 90, exceptions: 4, partial: 3, cancelled: 1, failed: 2 },
              total: 100,
            },
          },
        }),
        'assessment',
        'light',
        t,
        'en',
      )
      const resilience = withRep.sections.find((s) => s.id === 'resilience')
      expect(resilience?.deck?.bars?.some((b) => b.label.length > 0)).toBe(true)
      expect(resilience?.deck?.kpiChips?.some((k) => k.value === '5')).toBe(true) // failed+partial
    })
  })

  describe('capacityTrend section', () => {
    it('renders a growth table row per target, utilization bars, and a fastest-growth chip', () => {
      const v = baseView({
        capacityTrend: {
          targets: [
            {
              target: 'dd1',
              currentPct: 70,
              minPct: 40,
              maxPct: 70,
              windowStart: '2026-05-01',
              windowEnd: '2026-06-30',
              sampleCount: 60,
              slopePer30d: 2.5,
              series: [],
            },
            {
              target: 'dd2',
              currentPct: 30,
              minPct: 25,
              maxPct: 32,
              windowStart: '2026-05-01',
              windowEnd: '2026-06-30',
              sampleCount: 60,
              series: [],
            },
          ],
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'capacityTrend')
      expect(section).toBeDefined()
      expect(section?.table?.rows.length).toBe(2)
      expect(section?.deck?.bars?.length).toBe(2)
      const chip = section?.deck?.kpiChips?.find(
        (k) => k.label === t('dashboard:capacityTrend.chip'),
      )
      expect(chip?.value).toBe('+2.5')
      expect(chip?.tone).toBe('bad')
    })

    it('renders a declining target with a signed-minus slope, no growth chip, and no leading plus', () => {
      const v = baseView({
        capacityTrend: {
          targets: [
            {
              target: 'dd1',
              currentPct: 40,
              minPct: 40,
              maxPct: 55,
              windowStart: '2026-05-01',
              windowEnd: '2026-06-30',
              sampleCount: 60,
              slopePer30d: -3,
              series: [],
            },
          ],
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'capacityTrend')
      expect(section).toBeDefined()
      expect(section?.table?.rows.length).toBe(1)
      expect(section?.deck?.bars?.length).toBe(1)
      const chip = section?.deck?.kpiChips?.find(
        (k) => k.label === t('dashboard:capacityTrend.chip'),
      )
      expect(chip).toBeUndefined()
      const barValue = section?.deck?.bars?.[0]?.value ?? ''
      expect(barValue).not.toContain('+-')
      expect(barValue).toContain('-3')
    })

    it('is suppressed when capacityTrend is empty', () => {
      const model = buildExportModel(
        baseView({ capacityTrend: emptyCapacityTrend() }),
        'assessment',
        'light',
        t,
        'en',
      )
      expect(model.sections.find((s) => s.id === 'capacityTrend')).toBeUndefined()
    })
  })

  describe('hygiene section', () => {
    it('renders table rows, a warn cleanup chip, and a bad license chip when a license is expired', () => {
      const v = baseView({
        hygiene: computeHygiene([
          { kind: 'datasetUnused', name: 'ds1', detail: 'Never used' },
          { kind: 'clientInactive', name: 'client1' },
          { kind: 'license', name: 'lic1', licenseStatus: 'expired' },
          { kind: 'license', name: 'lic2', licenseStatus: 'expiring' },
        ]),
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'hygiene')
      expect(section).toBeDefined()
      expect(section?.table?.rows.length).toBe(4)
      expect(section?.table?.rows[0]).toEqual([
        t('dashboard:hygiene.kind.datasetUnused'),
        'ds1',
        'Never used',
        '',
      ])
      const cleanupChip = section?.deck?.kpiChips?.find(
        (k) => k.label === t('dashboard:hygiene.cleanupChip'),
      )
      expect(cleanupChip?.value).toBe('2')
      expect(cleanupChip?.tone).toBe('warn')
      const licenseChip = section?.deck?.kpiChips?.find(
        (k) => k.label === t('dashboard:hygiene.licenseChip'),
      )
      expect(licenseChip?.value).toBe('2')
      expect(licenseChip?.tone).toBe('bad')
    })

    it('gives the license bar a warn tone when a license is expiring but none are expired', () => {
      const v = baseView({
        hygiene: computeHygiene([
          { kind: 'datasetUnused', name: 'ds1' },
          { kind: 'license', name: 'lic1', licenseStatus: 'expiring' },
        ]),
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'hygiene')
      const licenseBar = section?.deck?.bars?.find(
        (b) => b.label === t('dashboard:hygiene.kind.license'),
      )
      expect(licenseBar).toBeDefined()
      expect(licenseBar?.color).toBe('#d97706')
    })

    it('is suppressed when hygiene is empty', () => {
      const model = buildExportModel(
        baseView({ hygiene: emptyHygiene() }),
        'assessment',
        'light',
        t,
        'en',
      )
      expect(model.sections.find((s) => s.id === 'hygiene')).toBeUndefined()
    })
  })

  describe('activity family sections', () => {
    const populatedActivity = {
      byType: [
        { type: 'FILESYSTEM', capacityGb: 100, clients: 3, files: 900 },
        {
          type: 'VIRTUAL_MACHINES',
          capacityGb: 40,
          clients: 1,
          files: 10,
          changeRate: { num: 5, den: 50 },
        },
      ],
      largest: {
        items: [
          { host: 'big1', type: 'FILESYSTEM', sizeGb: 80, files: 500 },
          { host: 'big2', type: 'VIRTUAL_MACHINES', sizeGb: 40 },
        ],
        total: 2,
        shown: 2,
      },
      slowest: {
        items: [{ host: 'slow1', type: 'FILESYSTEM', throughputMbSec: 3.2, sizeGb: 12 }],
        total: 1,
        shown: 1,
      },
      daily: [
        { day: '2026-06-15', gb: 10, jobs: 2 }, // week of 2026-06-15
        { day: '2026-06-17', gb: 5, jobs: 1 }, // week of 2026-06-15
        { day: '2026-06-22', gb: 8, jobs: 3 }, // week of 2026-06-22
      ],
      osSplit: { counts: { Windows: 4, Linux: 2, Other: 1 } },
    }

    it('renders the per-type table, weekly + OS deck bars, and the takeaway', () => {
      const v = baseView({ activity: populatedActivity })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'activity')
      expect(section).toBeDefined()
      expect(section?.table?.columns).toEqual([
        'Policy type',
        'Capacity',
        'Clients',
        'Files',
        'Change rate',
      ])
      expect(section?.table?.rows).toEqual([
        ['FILESYSTEM', '100.0 GB', '3', '900', '–'],
        ['VIRTUAL_MACHINES', '40.0 GB', '1', '10', '10%'],
      ])
      // Two weekly buckets (2026-06-15, 2026-06-22) + 3 OS bars
      expect(section?.deck?.bars?.length).toBe(5)
      expect(section?.deck?.subtitle).toBe(
        t('dashboard:activity.takeaway', { gb: '23.0 GB', jobs: '6' }),
      )
    })

    it('is suppressed entirely when activity is empty', () => {
      const model = buildExportModel(baseView({}), 'assessment', 'light', t, 'en')
      const ids = model.sections.map((s) => s.id)
      expect(ids).not.toContain('activity')
      expect(ids).not.toContain('largestBackups')
      expect(ids).not.toContain('slowestBackups')
    })

    it('renders the largest-backups table sorted by size, sizes formatted per baseTen', () => {
      const v = baseView({ activity: populatedActivity, meta: { ...view.meta, baseTen: false } })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'largestBackups')
      expect(section).toBeDefined()
      expect(section?.table?.columns).toEqual(['Client', 'Type', 'Size', 'Files'])
      expect(section?.table?.rows).toEqual([
        ['big1', 'FILESYSTEM', '80.0 GiB', '500'],
        ['big2', 'VIRTUAL_MACHINES', '40.0 GiB', '–'],
      ])
      expect(section?.table?.caption).toBe(t('dashboard:activity.caption', { shown: 2, total: 2 }))
    })

    it('renders the slowest-backups table with the throughput floor note in the caption', () => {
      const v = baseView({ activity: populatedActivity })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'slowestBackups')
      expect(section).toBeDefined()
      expect(section?.table?.rows).toEqual([['slow1', 'FILESYSTEM', '3.2', '12.0 GB']])
      expect(section?.table?.caption).toContain(t('dashboard:activity.slowest.floorNote'))
    })

    it('suppresses slowestBackups alone when there are no throughput rows (e.g. NetWorker)', () => {
      const v = baseView({
        activity: { ...populatedActivity, slowest: { items: [], total: 0, shown: 0 } },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const ids = model.sections.map((s) => s.id)
      expect(ids).toContain('activity')
      expect(ids).toContain('largestBackups')
      expect(ids).not.toContain('slowestBackups')
    })

    it('places activity/largestBackups/slowestBackups adjacent to longestBackups in both flavors', () => {
      const v = baseView({
        activity: populatedActivity,
        opsInsights: {
          agentVersions: [],
          atRisk: {
            overtime: { items: [], total: 0, shown: 0 },
            staleBackups: { items: [], total: 0, shown: 0 },
          },
          longestBackups: {
            items: [{ server: 's1', policyType: 'FS', durationHr: 2 }],
            total: 1,
            shown: 1,
          },
        },
      })
      const assessmentIds = buildExportModel(v, 'assessment', 'light', t, 'en').sections.map(
        (s) => s.id,
      )
      const assessmentTail = assessmentIds.slice(-4)
      expect(assessmentTail).toEqual([
        'longestBackups',
        'activity',
        'largestBackups',
        'slowestBackups',
      ])

      const opsIds = buildExportModel(v, 'ops', 'light', t, 'en').sections.map((s) => s.id)
      const jobsIdx = opsIds.indexOf('jobs')
      expect(opsIds[jobsIdx + 1]).toBe('activity')
      const longestIdx = opsIds.indexOf('longestBackups')
      expect(opsIds.slice(longestIdx, longestIdx + 3)).toEqual([
        'longestBackups',
        'largestBackups',
        'slowestBackups',
      ])
    })
  })

  describe('sizing section', () => {
    const fullyAvailableProvenance = {
      ...allAvailable(0),
      reliability: { available: true, serversCovered: 1, serversTotal: 1 },
      efficiency: { available: true, serversCovered: 1, serversTotal: 1 },
      capacityTrend: { available: true, serversCovered: 1, serversTotal: 1 },
      hygiene: { available: true, serversCovered: 1, serversTotal: 1 },
    }

    const fullSizingView = baseView({
      provenance: fullyAvailableProvenance,
      frontEnd: {
        byType: [
          { type: 'SQL', protectedFetbGb: 100 },
          { type: 'FILESYSTEM', protectedFetbGb: 50 },
        ],
        excludedCount: 0,
      },
      efficiency: {
        changeRate: { sentBytes: 10, processedBytes: 100 },
        dedupe: {
          common: { num: 9200, den: 100 },
          lowDedupe: { items: [], total: 0, shown: 0 },
          global: { logicalGb: 300, usedGb: 100 },
        },
        retention: {
          totalGbByBucket: { r30: 10, r60: 20, r180: 999, r1y: 5, r7y: 3, r7yPlus: 2 },
          perPolicyType: [],
        },
      },
      capacityTrend: {
        targets: [
          {
            target: 'dd1',
            currentPct: 70,
            minPct: 40,
            maxPct: 70,
            windowStart: '2026-05-01',
            windowEnd: '2026-06-30',
            sampleCount: 60,
            slopePer30d: 2.5,
            series: [],
          },
          {
            target: 'dd2',
            currentPct: 30,
            minPct: 25,
            maxPct: 32,
            windowStart: '2026-05-01',
            windowEnd: '2026-06-30',
            sampleCount: 60,
            slopePer30d: 5.1,
            series: [],
          },
        ],
      },
      reliability: {
        repeatFailures: { items: [], total: 0, shown: 0 },
        runtime: { le15m: 0, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 4 },
        runtimeTotal: 4,
        queue: {
          delayedCount: 20,
          total: 100,
          delayedPct: 0.2,
          top: { items: [], total: 0, shown: 0 },
        },
        capped: false,
      },
      hygiene: computeHygiene([
        { kind: 'clientInactive', name: 'c1' },
        { kind: 'clientInactive', name: 'c2' },
        { kind: 'datasetUnused', name: 'd1' },
      ]),
    })

    it('renders all 9 rows with correct labels, values, and basis when every family is populated', () => {
      const model = buildExportModel(fullSizingView, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      expect(section).toBeDefined()
      expect(section?.table?.columns).toEqual([
        t('dashboard:sizing.col.metric'),
        t('dashboard:sizing.col.value'),
        t('dashboard:sizing.col.basis'),
      ])
      expect(section?.table?.rows).toEqual([
        [t('dashboard:sizing.rows.fetb'), '150.0 GB', t('dashboard:sizing.basis.measured')],
        [t('dashboard:sizing.rows.change'), '10%', t('dashboard:sizing.basis.observed')],
        [t('dashboard:sizing.rows.dedupe'), '92%', t('dashboard:sizing.basis.observed')],
        [t('dashboard:sizing.rows.reduction'), '×3', t('dashboard:sizing.basis.observed')],
        [
          t('dashboard:sizing.rows.retentionShort'),
          '30.0 GB',
          t('dashboard:sizing.basis.measured'),
        ],
        [t('dashboard:sizing.rows.retentionLong'), '10.0 GB', t('dashboard:sizing.basis.measured')],
        [
          t('dashboard:sizing.rows.growth'),
          t('dashboard:sizing.growthValue', { slope: '+5.1', target: 'dd2' }),
          t('dashboard:sizing.basis.observed'),
        ],
        [
          t('dashboard:sizing.rows.window'),
          t('dashboard:sizing.windowValue', { pct: '20%', count: '4' }),
          t('dashboard:sizing.basis.observed'),
        ],
        [t('dashboard:sizing.rows.inactive'), '2', t('dashboard:sizing.basis.observed')],
      ])
    })

    it('omits the fetb row entirely when no byType row has a defined protectedFetbGb', () => {
      const v = baseView({
        provenance: fullyAvailableProvenance,
        frontEnd: {
          byType: [
            { type: 'SQL', protectedFetbGb: undefined },
            { type: 'FILESYSTEM', protectedFetbGb: undefined },
          ],
          excludedCount: 0,
        },
        efficiency: fullSizingView.efficiency,
        capacityTrend: fullSizingView.capacityTrend,
        reliability: fullSizingView.reliability,
        hygiene: fullSizingView.hygiene,
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const rowKeys = section?.table?.rows.map((r) => r[0])
      expect(rowKeys).not.toContain(t('dashboard:sizing.rows.fetb'))
    })

    it('prefixes the fetb sum with "≥" when only some byType rows have a defined protectedFetbGb', () => {
      const v = baseView({
        provenance: fullyAvailableProvenance,
        frontEnd: {
          byType: [
            { type: 'SQL', protectedFetbGb: 100 },
            { type: 'FILESYSTEM', protectedFetbGb: undefined },
          ],
          excludedCount: 0,
        },
        efficiency: fullSizingView.efficiency,
        capacityTrend: fullSizingView.capacityTrend,
        reliability: fullSizingView.reliability,
        hygiene: fullSizingView.hygiene,
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const fetbRow = section?.table?.rows.find((r) => r[0] === t('dashboard:sizing.rows.fetb'))
      expect(fetbRow?.[1]).toBe('≥ 100.0 GB')
    })

    it('omits the growth row when every target slope is flat or shrinking', () => {
      const v = baseView({
        provenance: fullyAvailableProvenance,
        frontEnd: fullSizingView.frontEnd,
        efficiency: fullSizingView.efficiency,
        reliability: fullSizingView.reliability,
        hygiene: fullSizingView.hygiene,
        capacityTrend: {
          targets: [
            {
              target: 'dd1',
              currentPct: 70,
              minPct: 40,
              maxPct: 70,
              windowStart: '2026-05-01',
              windowEnd: '2026-06-30',
              sampleCount: 60,
              slopePer30d: 0,
              series: [],
            },
            {
              target: 'dd2',
              currentPct: 30,
              minPct: 25,
              maxPct: 32,
              windowStart: '2026-05-01',
              windowEnd: '2026-06-30',
              sampleCount: 60,
              slopePer30d: -1.2,
              series: [],
            },
          ],
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const rowKeys = section?.table?.rows.map((r) => r[0])
      expect(rowKeys).not.toContain(t('dashboard:sizing.rows.growth'))
    })

    it('renders the growth row with a "+"-signed slope when the fastest target is genuinely growing', () => {
      const model = buildExportModel(fullSizingView, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const growthRow = section?.table?.rows.find((r) => r[0] === t('dashboard:sizing.rows.growth'))
      expect(growthRow?.[1]).toBe(
        t('dashboard:sizing.growthValue', { slope: '+5.1', target: 'dd2' }),
      )
    })

    it('builds FETB + change-rate + reduction deck chips (reduction present, so no dedupe chip)', () => {
      const model = buildExportModel(fullSizingView, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const chipLabels = section?.deck?.kpiChips?.map((c) => c.label)
      expect(chipLabels).toEqual([
        t('dashboard:sizing.rows.fetb'),
        t('dashboard:sizing.rows.change'),
        t('dashboard:sizing.rows.reduction'),
      ])
    })

    it('falls back to a dedupe chip when no reduction figure is available', () => {
      const v = baseView({
        provenance: fullyAvailableProvenance,
        efficiency: {
          dedupe: {
            common: { num: 9200, den: 100 },
            lowDedupe: { items: [], total: 0, shown: 0 },
          },
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      const chipLabels = section?.deck?.kpiChips?.map((c) => c.label)
      expect(chipLabels).toEqual([t('dashboard:sizing.rows.dedupe')])
    })

    it('renders only the available rows for a sparse view (efficiency change+dedupe only)', () => {
      const v = baseView({
        provenance: {
          ...allAvailable(0),
          efficiency: { available: true, serversCovered: 1, serversTotal: 1 },
        },
        efficiency: {
          changeRate: { sentBytes: 10, processedBytes: 100 },
          dedupe: { common: { num: 9200, den: 100 }, lowDedupe: { items: [], total: 0, shown: 0 } },
        },
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      expect(section).toBeDefined()
      expect(section?.table?.rows).toEqual([
        [t('dashboard:sizing.rows.change'), '10%', t('dashboard:sizing.basis.observed')],
        [t('dashboard:sizing.rows.dedupe'), '92%', t('dashboard:sizing.basis.observed')],
      ])
    })

    it('drops rows whose source family is unavailable even when the data exists', () => {
      const v = baseView({
        provenance: allAvailable(0), // efficiency/capacityTrend/reliability/hygiene all unavailable here
        efficiency: fullSizingView.efficiency,
        capacityTrend: fullSizingView.capacityTrend,
        reliability: fullSizingView.reliability,
        hygiene: fullSizingView.hygiene,
      })
      const model = buildExportModel(v, 'assessment', 'light', t, 'en')
      const section = model.sections.find((s) => s.id === 'sizing')
      // frontEnd IS available in allAvailable(0), but byType is empty here, so no fetb row either.
      expect(section).toBeUndefined()
    })

    it('is suppressed when nothing is available', () => {
      const model = buildExportModel(baseView({}), 'assessment', 'light', t, 'en')
      expect(model.sections.find((s) => s.id === 'sizing')).toBeUndefined()
    })

    it('is placed right after perServer in assessment and near the end in ops', () => {
      const assessmentIds = buildExportModel(
        fullSizingView,
        'assessment',
        'light',
        t,
        'en',
      ).sections.map((s) => s.id)
      expect(assessmentIds[0]).toBe('sizing')

      const opsIds = buildExportModel(fullSizingView, 'ops', 'light', t, 'en').sections.map(
        (s) => s.id,
      )
      // 'sizing' sits right before the PPDM-classic tail (coverage/exposure/idle/…) in ops.
      expect(opsIds[opsIds.indexOf('coverage') - 1]).toBe('sizing')
    })
  })
})
