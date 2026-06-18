// src/engines/export/pptx/slidePlan.test.ts
import { describe, expect, it } from 'vitest'
import type { ExportSection } from '../types'
import { planSlides } from './slidePlan'

const sec = (id: string): ExportSection => ({ id, title: id })

describe('planSlides', () => {
  it('assessment order: pairs around a full-width idle single', () => {
    const ids = ['coverage', 'gaps', 'idle', 'jobs', 'compliance', 'capacity', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
    ).toEqual([
      'pair:coverage+gaps',
      'single:idle',
      'pair:jobs+compliance',
      'pair:capacity+policies',
    ])
  })

  it('ops order: idle single lands after the pair holding its predecessor', () => {
    const ids = ['jobs', 'compliance', 'capacity', 'coverage', 'gaps', 'idle', 'policies']
    const plan = planSlides(ids.map(sec))
    expect(
      plan.map((p) =>
        p.kind === 'single' ? `single:${p.section.id}` : `pair:${p.top.id}+${p.bottom?.id}`,
      ),
    ).toEqual([
      'pair:jobs+compliance',
      'pair:capacity+coverage',
      'pair:gaps+policies',
      'single:idle',
    ])
  })

  it('no idle: just consecutive pairs', () => {
    const plan = planSlides(['coverage', 'gaps', 'jobs', 'compliance'].map(sec))
    expect(
      plan.map((p) => (p.kind === 'pair' ? `${p.top.id}+${p.bottom?.id}` : p.section.id)),
    ).toEqual(['coverage+gaps', 'jobs+compliance'])
  })

  it('odd non-idle count: trailing section is a lone pair (bottom undefined)', () => {
    const plan = planSlides(['coverage', 'gaps', 'jobs'].map(sec))
    expect(plan[1]).toEqual({
      kind: 'pair',
      top: expect.objectContaining({ id: 'jobs' }),
      bottom: undefined,
    })
  })
})
