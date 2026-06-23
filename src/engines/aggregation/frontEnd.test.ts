import { describe, expect, it } from 'vitest'
import { emptyFrontEnd, mergeFrontEnd } from './frontEnd'

describe('frontEnd helpers', () => {
  it('emptyFrontEnd is an empty, zero value', () => {
    expect(emptyFrontEnd()).toEqual({ byType: [], excludedCount: 0 })
  })

  it('mergeFrontEnd unions types and sums defined fields, keeping undefined until a reporter', () => {
    const a = { byType: [{ type: 'VM', protectedFetbGb: 10 }], excludedCount: 1 }
    const b = {
      byType: [{ type: 'VM', protectedFetbGb: 5, protectedDiscoveredGb: 20 }, { type: 'FS', protectedFetbGb: 3 }],
      excludedCount: 2,
    }
    const m = mergeFrontEnd([a, b])
    const vm = m.byType.find((r) => r.type === 'VM')
    expect(vm).toEqual({ type: 'VM', protectedFetbGb: 15, protectedDiscoveredGb: 20 })
    expect(m.byType.find((r) => r.type === 'FS')?.protectedFetbGb).toBe(3)
    expect(m.excludedCount).toBe(3)
  })
})
