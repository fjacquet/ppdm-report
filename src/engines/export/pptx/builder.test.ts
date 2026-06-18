import { describe, expect, it } from 'vitest'
import type { ExportModel } from '../types'
import { buildPptx } from './builder'

const model: ExportModel = {
  title: 'PPDM Report',
  customer: 'WHO',
  subtitle: 'Assessment · 2026-06-15',
  execTitle: 'Executive summary',
  locale: 'en',
  kpis: [
    { label: 'Coverage', value: '71.4%', tone: 'ok' },
    { label: 'Immutable', value: '0%', tone: 'bad' },
  ],
  sections: [
    {
      id: 'coverage',
      title: 'Asset Coverage',
      kpis: [{ label: 'Coverage', value: '71.4%', tone: 'ok' }],
      chart: {
        kind: 'pie',
        slices: [
          { name: 'Protected', value: 703, color: '#16a34a' },
          { name: 'Unprotected', value: 281, color: '#dc2626' },
        ],
      },
      table: { columns: ['Type', 'Coverage'], rows: [['SQL', '71.7%']], caption: 'Top 1 of 281' },
      notes: ['71.4% of assets protected'],
    },
  ],
  footer: 'WHO · 27.2.5.278 · base-10 units',
}

describe('buildPptx', () => {
  it('produces a non-empty .pptx (PK zip header) in light and dark', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const buf = await buildPptx(model, theme)
      expect(buf.byteLength).toBeGreaterThan(1000)
      const head = new Uint8Array(buf.slice(0, 2))
      // .pptx is a zip — starts with "PK"
      expect(head[0]).toBe(0x50)
      expect(head[1]).toBe(0x4b)
    }
  })
})
