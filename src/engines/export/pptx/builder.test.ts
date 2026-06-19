import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import type { ReportView } from '../../../types/reportView'
import { buildExportModel } from '../buildExportModel'
import { buildPptx } from './builder'

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

describe('buildPptx (deck)', () => {
  it('produces a valid .pptx for both themes and both flavors', async () => {
    const prevLanguage = i18n.language
    await i18n.changeLanguage('en')
    try {
      for (const flavor of ['assessment', 'ops'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          const model = buildExportModel(view, flavor, theme, t, 'en')
          const buf = await buildPptx(model, theme)
          expect(buf.byteLength).toBeGreaterThan(20000)
          const head = new Uint8Array(buf.slice(0, 2))
          expect(head[0]).toBe(0x50) // 'P'
          expect(head[1]).toBe(0x4b) // 'K'
        }
      }
    } finally {
      await i18n.changeLanguage(prevLanguage)
    }
  })
})
