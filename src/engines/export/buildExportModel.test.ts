import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import type { ReportView } from '../../types/reportView'
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
})
