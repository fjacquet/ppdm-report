import { describe, expect, it } from 'vitest'
import {
  computeReliability,
  emptyReliability,
  mergeReliability,
  type ReliabilityJob,
} from './reliability'

const j = (
  host: string,
  status: ReliabilityJob['status'],
  day: string,
  durationHours?: number,
): ReliabilityJob => ({ host, status, day, durationHours })

describe('computeReliability', () => {
  it('flags a client with failures on 3 distinct days; 2 days is not flagged', () => {
    const r = computeReliability([
      j('a', 'failed', '2026-06-01'),
      j('a', 'failed', '2026-06-02'),
      j('a', 'failed', '2026-06-03'),
      j('a', 'failed', '2026-06-03'), // same day — still 3 distinct days, 4 failed jobs
      j('b', 'failed', '2026-06-01'),
      j('b', 'failed', '2026-06-02'),
      j('b', 'success', '2026-06-03'),
    ])
    expect(r.repeatFailures.total).toBe(1)
    expect(r.repeatFailures.items[0]).toMatchObject({
      host: 'a',
      failureDays: 3,
      failedJobs: 4,
    })
  })

  it('exceptions are neither failures nor successes for streak purposes', () => {
    const r = computeReliability([
      j('a', 'exception', '2026-06-01'),
      j('a', 'exception', '2026-06-02'),
      j('a', 'exception', '2026-06-03'),
    ])
    expect(r.repeatFailures.total).toBe(0)
  })

  it('daysSinceSuccess measures from window end; undefined when no success', () => {
    const r = computeReliability([
      j('a', 'success', '2026-06-05'),
      j('a', 'failed', '2026-06-08'),
      j('a', 'failed', '2026-06-09'),
      j('a', 'failed', '2026-06-10'),
      j('b', 'failed', '2026-06-08'),
      j('b', 'failed', '2026-06-09'),
      j('b', 'failed', '2026-06-10'),
    ])
    const a = r.repeatFailures.items.find((c) => c.host === 'a')
    const b = r.repeatFailures.items.find((c) => c.host === 'b')
    expect(a?.daysSinceSuccess).toBe(5) // 2026-06-10 minus 2026-06-05
    expect(b?.daysSinceSuccess).toBeUndefined()
    expect(r.windowStart).toBe('2026-06-05')
    expect(r.windowEnd).toBe('2026-06-10')
  })

  it('buckets durations into the seven runtime bands', () => {
    const r = computeReliability([
      j('a', 'success', '2026-06-01', 0.1), // ≤15m
      j('a', 'success', '2026-06-01', 0.4), // 15–30m
      j('a', 'success', '2026-06-01', 0.9), // 30–60m
      j('a', 'success', '2026-06-01', 1.5), // 1–2h
      j('a', 'success', '2026-06-01', 3), // 2–4h
      j('a', 'success', '2026-06-01', 6), // 4–8h
      j('a', 'success', '2026-06-01', 12), // >8h
      j('a', 'success', '2026-06-01'), // no duration — not counted
    ])
    expect(r.runtime).toEqual({
      le15m: 1,
      m15to30: 1,
      m30to60: 1,
      h1to2: 1,
      h2to4: 1,
      h4to8: 1,
      gt8h: 1,
    })
    expect(r.runtimeTotal).toBe(7)
  })

  it('uses the fallback runtime histogram only when no detail durations exist', () => {
    const fallback = { le15m: 5, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 2 }
    const noDetail = computeReliability([j('a', 'failed', '2026-06-01')], {
      fallbackRuntime: fallback,
    })
    expect(noDetail.runtime).toEqual(fallback)
    expect(noDetail.runtimeTotal).toBe(7)
    const withDetail = computeReliability([j('a', 'success', '2026-06-01', 1)], {
      fallbackRuntime: fallback,
    })
    expect(withDetail.runtime.h1to2).toBe(1)
    expect(withDetail.runtimeTotal).toBe(1)
  })

  it('computes queue delay share over the 15-minute threshold', () => {
    const r = computeReliability([], {
      queue: [
        { host: 'a', queuedHours: 0 },
        { host: 'b', queuedHours: 0.2 },
        { host: 'c', queuedHours: 0.5 },
        { host: 'd', queuedHours: 2 },
      ],
    })
    expect(r.queue?.delayedCount).toBe(2)
    expect(r.queue?.total).toBe(4)
    expect(r.queue?.delayedPct).toBeCloseTo(0.5, 6)
    expect(r.queue?.top.items[0]).toEqual({ host: 'd', queuedHours: 2 })
  })

  it('queue is undefined when no samples are provided', () => {
    expect(computeReliability([]).queue).toBeUndefined()
  })

  it('jobs with empty host or empty day still count runtime but never streaks', () => {
    const r = computeReliability([
      j('', 'failed', '2026-06-01', 1),
      j('', 'failed', '2026-06-02', 1),
      j('', 'failed', '2026-06-03', 1),
      j('a', 'failed', '', 1),
      j('a', 'failed', '', 1),
      j('a', 'failed', '', 1),
    ])
    expect(r.repeatFailures.total).toBe(0)
    expect(r.runtimeTotal).toBe(6)
  })

  it('attaches vendor success rates to flagged clients when provided', () => {
    const r = computeReliability(
      [
        j('a', 'failed', '2026-06-01'),
        j('a', 'failed', '2026-06-02'),
        j('a', 'failed', '2026-06-03'),
      ],
      { successRateByHost: { a: 62.5 } },
    )
    expect(r.repeatFailures.items[0]?.successRatePct).toBe(62.5)
  })

  it('emptyReliability is inert', () => {
    const e = emptyReliability()
    expect(e.repeatFailures.total).toBe(0)
    expect(e.runtimeTotal).toBe(0)
    expect(e.queue).toBeUndefined()
    expect(e.capped).toBe(false)
  })
})

describe('mergeReliability', () => {
  it('is identity on a single element', () => {
    const one = computeReliability([j('a', 'failed', '2026-06-01', 1)])
    expect(mergeReliability([one])).toBe(one)
  })

  it('folds lists, histograms, queues, and windows across servers', () => {
    const s1 = computeReliability(
      [
        j('a', 'failed', '2026-06-01', 1),
        j('a', 'failed', '2026-06-02'),
        j('a', 'failed', '2026-06-03'),
      ],
      { queue: [{ host: 'a', queuedHours: 1 }], capped: false },
    )
    const s2 = computeReliability(
      [
        j('b', 'failed', '2026-06-04', 10),
        j('b', 'failed', '2026-06-05'),
        j('b', 'failed', '2026-06-06'),
        j('b', 'failed', '2026-06-07'),
      ],
      { capped: true },
    )
    const m = mergeReliability([s1, s2])
    expect(m.repeatFailures.total).toBe(2)
    expect(m.repeatFailures.items[0]?.host).toBe('b') // 4 failure days sorts first
    expect(m.runtime.h1to2).toBe(1)
    expect(m.runtime.gt8h).toBe(1)
    expect(m.runtimeTotal).toBe(2)
    expect(m.queue?.total).toBe(1) // only s1 had queue data
    expect(m.windowStart).toBe('2026-06-01')
    expect(m.windowEnd).toBe('2026-06-07')
    expect(m.capped).toBe(true)
  })

  it('queue stays undefined when no server had queue data', () => {
    const m = mergeReliability([computeReliability([]), computeReliability([])])
    expect(m.queue).toBeUndefined()
  })
})
