// src/engines/export/pptx/slidePlan.test.ts
import { describe, expect, it } from 'vitest'
import type { ExportSection } from '../types'
import { planSlides } from './slidePlan'

const sec = (id: string): ExportSection => ({ id, title: id })

describe('planSlides', () => {
  it('assessment order: pairs around a full-width idle single', () => {
    const ids = ['coverage', 'exposure', 'idle', 'jobs', 'resilience', 'capacity', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
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
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
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
})
