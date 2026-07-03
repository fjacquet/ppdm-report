import { describe, expect, it } from 'vitest'
import {
  type ActivityJob,
  computeActivity,
  emptyActivity,
  LARGEST_N,
  mergeActivity,
  SLOWEST_MIN_GB,
  SLOWEST_N,
} from './activity'

const j = (over: Partial<ActivityJob> = {}): ActivityJob => ({
  host: 'h1',
  type: 'Filesystem',
  os: '',
  day: '',
  ...over,
})

describe('computeActivity — byType', () => {
  it('aggregates capacity, distinct clients, and files per type', () => {
    const a = computeActivity([
      j({ host: 'a', type: 'Filesystem', sizeGb: 10, files: 100 }),
      j({ host: 'b', type: 'Filesystem', sizeGb: 20, files: 200 }),
      j({ host: 'a', type: 'Filesystem', sizeGb: 5, files: 50 }), // same host again — not double counted
      j({ host: 'c', type: 'VM', sizeGb: 1, files: 1 }),
    ])
    const fs = a.byType.find((t) => t.type === 'Filesystem')
    expect(fs).toMatchObject({ capacityGb: 35, clients: 2, files: 350 })
  })

  it('skips rows with a blank type', () => {
    const a = computeActivity([j({ type: '', sizeGb: 10 }), j({ type: 'VM', sizeGb: 5 })])
    expect(a.byType).toHaveLength(1)
    expect(a.byType[0]?.type).toBe('VM')
  })

  it('sorts byType rows by capacityGb descending', () => {
    const a = computeActivity([
      j({ type: 'Small', sizeGb: 1 }),
      j({ type: 'Big', sizeGb: 100 }),
      j({ type: 'Mid', sizeGb: 10 }),
    ])
    expect(a.byType.map((t) => t.type)).toEqual(['Big', 'Mid', 'Small'])
  })

  it('changeRate folds only rows where both sentBytes and processedBytes are defined', () => {
    const a = computeActivity([
      j({ type: 'VM', sentBytes: 100, processedBytes: 1000 }),
      j({ type: 'VM', sentBytes: 50, processedBytes: 500 }),
      j({ type: 'VM', sentBytes: 999 }), // missing processedBytes — excluded from the pair fold
      j({ type: 'VM', processedBytes: 999 }), // missing sentBytes — excluded
    ])
    expect(a.byType[0]?.changeRate).toEqual({ num: 150, den: 1500 })
  })

  it('changeRate is undefined when no row has both fields defined', () => {
    const a = computeActivity([j({ type: 'VM', sentBytes: 100 }), j({ type: 'VM' })])
    expect(a.byType[0]?.changeRate).toBeUndefined()
  })

  it('capacityGb, files ignore rows where the field is undefined', () => {
    const a = computeActivity([j({ type: 'VM' }), j({ type: 'VM', sizeGb: 10, files: 5 })])
    expect(a.byType[0]).toMatchObject({ capacityGb: 10, files: 5 })
  })
})

describe('computeActivity — largest', () => {
  it('ranks the top LARGEST_N rows by sizeGb descending, dropping rows without sizeGb', () => {
    const jobs = Array.from({ length: LARGEST_N + 5 }, (_, i) =>
      j({ host: `h${i}`, sizeGb: i + 1 }),
    )
    jobs.push(j({ host: 'no-size' })) // no sizeGb — never ranks
    const a = computeActivity(jobs)
    expect(a.largest.items).toHaveLength(LARGEST_N)
    expect(a.largest.total).toBe(LARGEST_N + 5) // "no-size" row excluded from total too
    expect(a.largest.items[0]?.sizeGb).toBe(LARGEST_N + 5)
    expect(a.largest.items.every((b) => b.sizeGb > 0)).toBe(true)
  })

  it('carries host, type, sizeGb, and optional files on each row', () => {
    const a = computeActivity([j({ host: 'a', type: 'VM', sizeGb: 12, files: 4 })])
    expect(a.largest.items[0]).toEqual({ host: 'a', type: 'VM', sizeGb: 12, files: 4 })
  })
})

describe('computeActivity — slowest', () => {
  it('excludes jobs below SLOWEST_MIN_GB regardless of how bad their throughput is', () => {
    const a = computeActivity([
      j({ host: 'tiny', throughputMbSec: 0.01, sizeGb: 0.5 }), // below floor — must not rank
      j({ host: 'big', throughputMbSec: 50, sizeGb: 10 }),
    ])
    expect(a.slowest.items.find((s) => s.host === 'tiny')).toBeUndefined()
    expect(a.slowest.items.map((s) => s.host)).toEqual(['big'])
  })

  it('requires a defined throughput to rank', () => {
    const a = computeActivity([j({ host: 'a', sizeGb: 10 })])
    expect(a.slowest.items).toHaveLength(0)
  })

  it('orders ascending by throughput (slowest first) and caps at SLOWEST_N', () => {
    const jobs = Array.from({ length: SLOWEST_N + 3 }, (_, i) =>
      j({ host: `h${i}`, throughputMbSec: i + 1, sizeGb: SLOWEST_MIN_GB }),
    )
    const a = computeActivity(jobs)
    expect(a.slowest.items).toHaveLength(SLOWEST_N)
    const throughputs = a.slowest.items.map((s) => s.throughputMbSec)
    expect(throughputs).toEqual([...throughputs].sort((x, y) => x - y))
    expect(throughputs[0]).toBe(1) // slowest of all candidates
  })

  it('a job exactly at SLOWEST_MIN_GB is eligible', () => {
    const a = computeActivity([j({ host: 'a', throughputMbSec: 5, sizeGb: SLOWEST_MIN_GB })])
    expect(a.slowest.items).toHaveLength(1)
  })
})

describe('computeActivity — daily', () => {
  it('sums gb and counts jobs per day, skipping blank days', () => {
    const a = computeActivity([
      j({ day: '2026-06-02', sizeGb: 5 }),
      j({ day: '2026-06-01', sizeGb: 10 }),
      j({ day: '2026-06-01', sizeGb: 2 }),
      j({ day: '', sizeGb: 999 }), // blank day — excluded
    ])
    expect(a.daily).toEqual([
      { day: '2026-06-01', gb: 12, jobs: 2 },
      { day: '2026-06-02', gb: 5, jobs: 1 },
    ])
  })

  it('counts a job with no sizeGb toward jobs but not gb', () => {
    const a = computeActivity([j({ day: '2026-06-01' })])
    expect(a.daily).toEqual([{ day: '2026-06-01', gb: 0, jobs: 1 }])
  })
})

describe('computeActivity — osSplit', () => {
  it('maps windows/linux (case-insensitive substring) and buckets everything else as Other', () => {
    const a = computeActivity([
      j({ host: 'w1', os: 'Windows Server 2019' }),
      j({ host: 'w2', os: 'windows 10' }),
      j({ host: 'l1', os: 'Red Hat Enterprise Linux' }),
      j({ host: 'o1', os: 'AIX' }),
    ])
    expect(a.osSplit?.counts).toEqual({ Windows: 2, Linux: 1, Other: 1 })
  })

  it('counts distinct hosts, not rows', () => {
    const a = computeActivity([j({ host: 'w1', os: 'Windows' }), j({ host: 'w1', os: 'Windows' })])
    expect(a.osSplit?.counts.Windows).toBe(1)
  })

  it('skips rows with a blank os value', () => {
    const a = computeActivity([j({ host: 'a', os: '' }), j({ host: 'b', os: 'Linux' })])
    expect(a.osSplit?.counts).toEqual({ Windows: 0, Linux: 1, Other: 0 })
  })

  it('is undefined when there is no os data at all', () => {
    const a = computeActivity([j({ os: '' }), j({ os: '' })])
    expect(a.osSplit).toBeUndefined()
  })
})

describe('emptyActivity', () => {
  it('is inert', () => {
    const e = emptyActivity()
    expect(e.byType).toEqual([])
    expect(e.largest).toEqual({ items: [], total: 0, shown: 0 })
    expect(e.slowest).toEqual({ items: [], total: 0, shown: 0 })
    expect(e.daily).toEqual([])
    expect(e.osSplit).toBeUndefined()
  })
})

describe('mergeActivity', () => {
  it('returns emptyActivity for an empty list', () => {
    expect(mergeActivity([])).toEqual(emptyActivity())
  })

  it('is identity on a single element', () => {
    const one = computeActivity([j({ sizeGb: 10 })])
    expect(mergeActivity([one])).toBe(one)
  })

  it('re-aggregates byType by summing capacity/files/clients and folding changeRate', () => {
    const s1 = computeActivity([
      j({ host: 'a', type: 'VM', sizeGb: 10, files: 5, sentBytes: 100, processedBytes: 1000 }),
    ])
    const s2 = computeActivity([
      j({ host: 'b', type: 'VM', sizeGb: 20, files: 3, sentBytes: 50, processedBytes: 500 }),
    ])
    const m = mergeActivity([s1, s2])
    expect(m.byType).toHaveLength(1)
    expect(m.byType[0]).toMatchObject({
      type: 'VM',
      capacityGb: 30,
      files: 8,
      changeRate: { num: 150, den: 1500 },
    })
  })

  it('sums clients across servers without deduplication (overlap not recoverable post-hoc)', () => {
    // Both servers report the same host 'a' under VM — merge cannot know it's the same client.
    const s1 = computeActivity([j({ host: 'a', type: 'VM', sizeGb: 1 })])
    const s2 = computeActivity([j({ host: 'a', type: 'VM', sizeGb: 1 })])
    const m = mergeActivity([s1, s2])
    expect(m.byType[0]?.clients).toBe(2)
  })

  it('concatenates largest/slowest and recaps with true totals across servers', () => {
    const s1 = computeActivity(
      Array.from({ length: LARGEST_N }, (_, i) => j({ host: `s1-${i}`, sizeGb: i + 1 })),
    )
    const s2 = computeActivity([j({ host: 's2-0', sizeGb: 999 })])
    const m = mergeActivity([s1, s2])
    expect(m.largest.total).toBe(LARGEST_N + 1)
    expect(m.largest.items).toHaveLength(LARGEST_N)
    expect(m.largest.items[0]?.host).toBe('s2-0') // the single biggest wins the top slot
  })

  it('sums daily points per day and re-sorts', () => {
    const s1 = computeActivity([j({ day: '2026-06-02', sizeGb: 5 })])
    const s2 = computeActivity([
      j({ day: '2026-06-01', sizeGb: 10 }),
      j({ day: '2026-06-02', sizeGb: 1 }),
    ])
    const m = mergeActivity([s1, s2])
    expect(m.daily).toEqual([
      { day: '2026-06-01', gb: 10, jobs: 1 },
      { day: '2026-06-02', gb: 6, jobs: 2 },
    ])
  })

  it('sums osSplit counts across servers', () => {
    const s1 = computeActivity([j({ host: 'a', os: 'Windows' })])
    const s2 = computeActivity([j({ host: 'b', os: 'Windows' }), j({ host: 'c', os: 'Linux' })])
    const m = mergeActivity([s1, s2])
    expect(m.osSplit?.counts).toEqual({ Windows: 2, Linux: 1, Other: 0 })
  })

  it('osSplit stays undefined only when every server had no os data', () => {
    const s1 = computeActivity([j({ os: '' })])
    const s2 = computeActivity([j({ os: '' })])
    expect(mergeActivity([s1, s2]).osSplit).toBeUndefined()
  })

  it('osSplit is defined when at least one server has os data', () => {
    const s1 = computeActivity([j({ os: '' })])
    const s2 = computeActivity([j({ host: 'a', os: 'Linux' })])
    const m = mergeActivity([s1, s2])
    expect(m.osSplit?.counts).toEqual({ Windows: 0, Linux: 1, Other: 0 })
  })
})
