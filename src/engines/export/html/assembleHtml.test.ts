import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import type { ReportView } from '../../../types/reportView'
import { buildExportModel } from '../buildExportModel'
import { assembleHtml } from './assembleHtml'

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
  warnings: [],
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
}

const model = (locale = 'en') => buildExportModel(view, 'assessment', 'light', t, locale)

describe('assembleHtml (deck)', () => {
  it('produces a self-contained HTML document with a CSP meta and no scripts', async () => {
    await i18n.changeLanguage('en')
    const html = assembleHtml(model(), 'light')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Content-Security-Policy')
    expect(html).not.toContain('<script')
  })

  it('renders deck visuals (bars, donut, posture, tiles) and drops data tables', async () => {
    await i18n.changeLanguage('en')
    const html = assembleHtml(model(), 'light')
    expect(html).toContain('WHO')
    expect(html).toContain('class="bars"')
    expect(html).toContain('class="donut"')
    expect(html).toContain('class="posture"')
    expect(html).toContain('class="tiles"')
    expect(html).toContain('Oracle Databases') // complete idle tile list
    expect(html).not.toContain('<table') // tables are gone
  })

  it('theme-matches the background (light vs dark differ)', async () => {
    await i18n.changeLanguage('en')
    const m = model()
    expect(assembleHtml(m, 'light')).toContain('#ffffff')
    expect(assembleHtml(m, 'dark')).toContain('#0b1220')
  })

  it('escapes user-supplied text', async () => {
    await i18n.changeLanguage('en')
    const evil: ReportView = {
      ...view,
      meta: { ...view.meta, customer: '<img src=x onerror=alert(1)>' },
    }
    const html = assembleHtml(buildExportModel(evil, 'assessment', 'light', t, 'en'), 'light')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})

const baseModel: import('../types').ExportModel = {
  title: 'PPDM Report',
  customer: 'ACME',
  subtitle: 'Assessment',
  execTitle: 'Executive summary',
  locale: 'en',
  kpis: [],
  sections: [],
  footer: 'ACME',
  warnings: ['blended window note'],
}

describe('assembleHtml warnings', () => {
  it('renders the warnings block', () => {
    const html = assembleHtml(baseModel, 'light')
    expect(html).toContain('blended window note')
  })

  it('omits the warnings block when none', () => {
    const html = assembleHtml({ ...baseModel, warnings: [] }, 'light')
    expect(html).not.toContain('class="warnings"')
  })
})
