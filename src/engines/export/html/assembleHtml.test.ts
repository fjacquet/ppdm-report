import { describe, expect, it } from 'vitest'
import type { ExportModel } from '../types'
import { assembleHtml } from './assembleHtml'

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
      chart: {
        kind: 'pie',
        slices: [
          { name: 'Protected', value: 703, color: '#16a34a' },
          { name: 'Unprotected', value: 281, color: '#dc2626' },
        ],
      },
      notes: ['71.4% of assets protected'],
    },
    {
      id: 'gaps',
      title: 'Protection Gaps',
      table: {
        columns: ['Name', 'Type', 'Size'],
        rows: [['HR_PAYROLL', 'MSSQL', '842.6 GB']],
        caption: 'Top 1 of 281',
      },
    },
    {
      id: 'jobs',
      title: 'Job Activity',
      notes: ['Based on most recent 10,000 — a window, not the full set'],
    },
  ],
  footer: 'WHO · 27.2.5.278 · 2026-06-15 · base-10 units',
}

describe('assembleHtml', () => {
  it('produces a self-contained HTML document with a CSP meta and no scripts', () => {
    const html = assembleHtml(model, 'light')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Content-Security-Policy')
    expect(html).not.toContain('<script')
  })

  it('renders customer, KPIs, the coverage note, the gaps caption and the capped caveat', () => {
    const html = assembleHtml(model, 'light')
    expect(html).toContain('WHO')
    expect(html).toContain('71.4%')
    expect(html).toContain('Top 1 of 281')
    expect(html).toContain('a window, not the full set')
    expect(html).toContain('HR_PAYROLL')
  })

  it('theme-matches the background (light vs dark differ)', () => {
    expect(assembleHtml(model, 'light')).toContain('#ffffff')
    expect(assembleHtml(model, 'dark')).toContain('#0b1220')
  })

  it('escapes user-supplied text', () => {
    const evil: ExportModel = { ...model, customer: '<img src=x onerror=alert(1)>' }
    const html = assembleHtml(evil, 'light')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})
