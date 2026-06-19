import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
import { allAvailable } from '../aggregation/provenance'
import { buildExportModel } from './buildExportModel'

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string

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
      'gaps',
      'idle',
      'jobs',
      'compliance',
      'capacity',
      'policies',
    ])
    const ops = buildExportModel(view, 'ops', 'light', t, 'en').sections.map((s) => s.id)
    expect(ops.slice(0, 3)).toEqual(['jobs', 'compliance', 'capacity'])
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
      (s) => s.id === 'gaps',
    )
    expect(gaps?.table?.caption).toBe('Top 1 of 281')
    expect(gaps?.table?.rows[0]?.[0]).toBe('HR_PAYROLL')
  })

  it('renders capped-window caveats for jobs and compliance (no silent caps)', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    const jobs = model.sections.find((s) => s.id === 'jobs')
    const compliance = model.sections.find((s) => s.id === 'compliance')
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

  it('includes customer and base-10 note in the footer', () => {
    const model = buildExportModel(view, 'assessment', 'light', t, 'en')
    expect(model.footer).toContain('WHO')
    expect(model.footer).toContain('base-10')
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
    const immut = byId.compliance?.deck?.bars?.find((b) => b.value === '0%')
    expect(immut?.color).toBe('#dc2626')

    // capacity: flagged target colored warn + a flagged KPI chip
    expect(byId.capacity?.deck?.bars?.[0]).toMatchObject({ label: 'dd1', color: '#d97706' })
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
      (s) => s.id === 'gaps',
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
    const dup: ReportView = { ...view, warnings: ['cap note', 'cap note', 'merge note'] }
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
})
