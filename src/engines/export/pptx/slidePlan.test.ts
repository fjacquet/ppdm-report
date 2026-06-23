// src/engines/export/pptx/slidePlan.test.ts
import { describe, expect, it } from 'vitest'
import type { ExportSection } from '../types'
import { planSlides } from './slidePlan'

const sec = (id: string): ExportSection => ({ id, title: id })
const secWithTable = (id: string): ExportSection => ({
  id,
  title: id,
  table: { columns: ['a'], rows: [['1']] },
})

describe('planSlides', () => {
  it('assessment order: pairs around a full-width idle single', () => {
    const ids = ['coverage', 'exposure', 'idle', 'jobs', 'resilience', 'capacity', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) => {
        if (p.kind === 'single') return `single:${p.section.id}`
        if (p.kind === 'table') return `table:${p.section.id}`
        return `pair:${p.top.id}+${p.bottom?.id}`
      }),
    ).toEqual([
      'pair:coverage+exposure',
      'single:idle',
      'pair:jobs+resilience',
      'pair:capacity+policies',
    ])
  })

  it('ops order: idle single lands after the pair holding its predecessor', () => {
    const ids = ['jobs', 'resilience', 'capacity', 'coverage', 'exposure', 'idle', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) => {
        if (p.kind === 'single') return `single:${p.section.id}`
        if (p.kind === 'table') return `table:${p.section.id}`
        return `pair:${p.top.id}+${p.bottom?.id}`
      }),
    ).toEqual([
      'pair:jobs+resilience',
      'pair:capacity+coverage',
      'pair:exposure+policies',
      'single:idle',
    ])
  })

  it('no idle: just consecutive pairs', () => {
    const plan = planSlides(['coverage', 'exposure', 'jobs', 'resilience'].map(sec))
    expect(
      plan.map((p) => (p.kind === 'pair' ? `${p.top.id}+${p.bottom?.id}` : p.section.id)),
    ).toEqual(['coverage+exposure', 'jobs+resilience'])
  })

  it('odd non-idle count: trailing section is a lone pair (bottom undefined)', () => {
    const plan = planSlides(['coverage', 'exposure', 'jobs'].map(sec))
    expect(plan[1]).toEqual({
      kind: 'pair',
      top: expect.objectContaining({ id: 'jobs' }),
      bottom: undefined,
    })
  })

  it('appends a full-width table slide for each section that has table rows', () => {
    const withTable = (id: string): ExportSection => ({
      id,
      title: id,
      table: { columns: ['a'], rows: [['1']] },
    })
    const plan = planSlides([sec('coverage'), withTable('policies')])
    const kinds = plan.map((p) => (p.kind === 'table' ? `table:${p.section.id}` : p.kind))
    expect(kinds).toContain('table:policies')
    // the band pair still comes before the appendix
    expect(kinds.indexOf('pair')).toBeLessThan(kinds.indexOf('table:policies'))
  })

  it('renders volumetry as one in-place table slide, not paired, not in the appendix', () => {
    const plan = planSlides([
      sec('coverage'),
      sec('exposure'),
      secWithTable('volumetry'),
      sec('jobs'),
    ])
    const tableItems = plan.filter((p) => p.kind === 'table')
    expect(tableItems.length).toBe(1)
    const firstTable = tableItems[0]
    expect(firstTable).toBeDefined()
    expect(firstTable?.kind === 'table' && firstTable.section.id).toBe('volumetry')
    // volumetry must appear before the jobs pair, i.e. not pushed to the trailing appendix
    const volIdx = plan.findIndex((p) => p.kind === 'table' && p.section.id === 'volumetry')
    const jobsIdx = plan.findIndex(
      (p) => p.kind === 'pair' && (p.top.id === 'jobs' || p.bottom?.id === 'jobs'),
    )
    expect(volIdx).toBeLessThan(jobsIdx)
  })

  it('still renders idle as a full-width single in place (regression)', () => {
    const plan = planSlides([sec('coverage'), sec('exposure'), sec('idle'), sec('jobs')])
    expect(plan.some((p) => p.kind === 'single' && p.section.id === 'idle')).toBe(true)
  })

  it('two co-anchored full-widths keep section order: volumetry (table) before idle (single)', () => {
    const ids = [
      'coverage',
      'exposure',
      'volumetry',
      'idle',
      'jobs',
      'resilience',
      'capacity',
      'policies',
    ]
    const sections = ids.map((id) => (id === 'volumetry' ? secWithTable(id) : sec(id)))
    const plan = planSlides(sections)
    expect(
      plan.map((p) => {
        if (p.kind === 'single') return `single:${p.section.id}`
        if (p.kind === 'table') return `table:${p.section.id}`
        return `pair:${p.top.id}+${p.bottom?.id}`
      }),
    ).toEqual([
      'pair:coverage+exposure',
      'table:volumetry',
      'single:idle',
      'pair:jobs+resilience',
      'pair:capacity+policies',
    ])
  })
})
