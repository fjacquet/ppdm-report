import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import i18n from '../../../i18n'
import { DARK } from '../../../theme/palette'
import type { ReportView } from '../../../types/reportView'
import { allAvailable } from '../../aggregation/provenance'
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
  frontEnd: { byType: [], excludedCount: 0 },
  provenance: allAvailable(0),
}

describe('buildPptx (deck)', () => {
  it('builds without throwing when a section carries a detail table', async () => {
    const prevLanguage = i18n.language
    await i18n.changeLanguage('en')
    try {
      const model = buildExportModel(view, 'assessment', 'light', t, 'en')
      const bytes = await buildPptx(model, 'light')
      expect(bytes.byteLength).toBeGreaterThan(0)
    } finally {
      await i18n.changeLanguage(prevLanguage)
    }
  })

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

  it('keeps autoPaged table-overflow slides on the themed background (dark mode)', async () => {
    const prevLanguage = i18n.language
    await i18n.changeLanguage('en')
    try {
      const slideRe = /^ppt\/slides\/slide\d+\.xml$/
      const policyView = (n: number): ReportView => ({
        ...view,
        policies: {
          count: n,
          byPurpose: { CENTRALIZED: n },
          perPolicy: Array.from({ length: n }, (_, i) => ({
            name: `Protection Policy ${i}`,
            purpose: 'CENTRALIZED',
            assetCount: i,
            protectionCapacityGb: i * 100,
          })),
        },
      })

      // A long per-policy table forces pptxgenjs autoPage to spawn overflow slides.
      const buf = await buildPptx(
        buildExportModel(policyView(80), 'assessment', 'dark', t, 'en'),
        'dark',
      )
      const zip = await JSZip.loadAsync(buf)

      // Layouts that carry the dark background (pptxgenjs uppercases the hex).
      const darkHex = DARK.bg.replace('#', '').toUpperCase()
      const darkLayouts = new Set<string>()
      for (const path of Object.keys(zip.files)) {
        const layoutName = path.match(/^ppt\/slideLayouts\/(slideLayout\d+\.xml)$/)?.[1]
        const entry = zip.files[path]
        if (!layoutName || !entry) continue
        const xml = await entry.async('string')
        if (xml.toUpperCase().includes(darkHex)) darkLayouts.add(layoutName)
      }
      expect(darkLayouts.size).toBeGreaterThan(0)

      // Overflow actually happened: 80 policies produce more slides than 1 does.
      const fewBuf = await buildPptx(
        buildExportModel(policyView(1), 'assessment', 'dark', t, 'en'),
        'dark',
      )
      const fewZip = await JSZip.loadAsync(fewBuf)
      const fewCount = Object.keys(fewZip.files).filter((p) => slideRe.test(p)).length
      const slidePaths = Object.keys(zip.files).filter((p) => slideRe.test(p))
      expect(slidePaths.length).toBeGreaterThan(fewCount)

      // Every slide — including the autoPaged overflow ones — must reference a
      // dark-background layout (the regression: overflow slides fell back to the
      // white DEFAULT layout).
      for (const sp of slidePaths) {
        const relEntry = zip.files[`ppt/slides/_rels/${sp.split('/').pop()}.rels`]
        if (!relEntry) throw new Error(`${sp} has no .rels`)
        const layout = (await relEntry.async('string')).match(/slideLayout\d+\.xml/)?.[0]
        expect(layout, `${sp} references no layout`).toBeTruthy()
        expect(darkLayouts.has(layout ?? ''), `${sp} → ${layout} is not a dark-bg layout`).toBe(
          true,
        )
      }
    } finally {
      await i18n.changeLanguage(prevLanguage)
    }
  })
})
