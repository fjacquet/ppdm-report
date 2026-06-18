import { describe, expect, it } from 'vitest'
import { topN } from './topN'

describe('topN', () => {
  it('returns the top N by descending score with total and shown', () => {
    const items = [{ s: 3 }, { s: 1 }, { s: 5 }, { s: 2 }]
    const r = topN(items, 2, (x) => x.s)
    expect(r.items).toEqual([{ s: 5 }, { s: 3 }])
    expect(r.total).toBe(4)
    expect(r.shown).toBe(2)
  })

  it('shown never exceeds total', () => {
    const r = topN([{ s: 1 }], 25, (x) => x.s)
    expect(r.total).toBe(1)
    expect(r.shown).toBe(1)
    expect(r.items).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const items = [{ s: 1 }, { s: 2 }]
    topN(items, 1, (x) => x.s)
    expect(items).toEqual([{ s: 1 }, { s: 2 }])
  })
})
