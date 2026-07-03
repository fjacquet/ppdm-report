import { describe, expect, it } from 'vitest'
import { computeCapacityTrend, emptyCapacityTrend, type UtilizationSample } from './capacityTrend'

/** n daily samples from 2026-01-01, pct via fn(i). */
const daily = (target: string, n: number, pct: (i: number) => number): UtilizationSample[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse('2026-01-01') + i * 86_400_000)
    return { target, day: d.toISOString().slice(0, 10), pct: pct(i) }
  })

describe('computeCapacityTrend', () => {
  it('flat series → slope ~0; current/min/max/window correct', () => {
    const t = computeCapacityTrend(daily('g/0', 60, () => 40)).targets[0]
    expect(t?.currentPct).toBe(40)
    expect(t?.minPct).toBe(40)
    expect(t?.maxPct).toBe(40)
    expect(t?.sampleCount).toBe(60)
    expect(t?.windowStart).toBe('2026-01-01')
    expect(t?.slopePer30d).toBeCloseTo(0, 6)
  })

  it('rising series: +0.1 pt/day → slope ≈ 3 pts per 30 days', () => {
    const t = computeCapacityTrend(daily('g/0', 90, (i) => 10 + i * 0.1)).targets[0]
    expect(t?.slopePer30d).toBeCloseTo(3, 3)
    expect(t?.currentPct).toBeCloseTo(18.9, 3)
  })

  it('noisy series still recovers the underlying slope direction', () => {
    const t = computeCapacityTrend(
      daily('g/0', 90, (i) => 20 + i * 0.05 + (i % 2 === 0 ? 0.4 : -0.4)),
    ).targets[0]
    expect(t?.slopePer30d).toBeGreaterThan(1)
    expect(t?.slopePer30d).toBeLessThan(2)
  })

  it('short series (< 30 samples) reports values but no slope', () => {
    const t = computeCapacityTrend(daily('g/0', 10, (i) => i)).targets[0]
    expect(t?.currentPct).toBe(9)
    expect(t?.slopePer30d).toBeUndefined()
  })

  it('multiple targets stay separate and sorted by name; series downsampled to ≤ 120 keeping the last point', () => {
    const r = computeCapacityTrend([
      ...daily('b/1', 366, (i) => i / 10),
      ...daily('a/0', 40, () => 50),
    ])
    expect(r.targets.map((t) => t.target)).toEqual(['a/0', 'b/1'])
    const b = r.targets[1]
    expect(b?.series.length).toBeLessThanOrEqual(120)
    expect(b?.series[b.series.length - 1]?.[0]).toBe(b?.windowEnd)
  })

  it.each([
    240, 600,
  ])('downsample bound: n=%i series stays ≤ 120, spans full window, no duplicate final entry', (n) => {
    const t = computeCapacityTrend(daily('g/0', n, (i) => i / 100)).targets[0]
    expect(t?.series.length).toBeLessThanOrEqual(120)
    expect(t?.series[0]?.[0]).toBe(t?.windowStart)
    expect(t?.series[t.series.length - 1]?.[0]).toBe(t?.windowEnd)
    expect(t?.series[t.series.length - 1]?.[0]).not.toBe(t?.series[t.series.length - 2]?.[0])
  })

  it('unsorted input is sorted by day; empty input → empty targets', () => {
    const t = computeCapacityTrend([
      { target: 'g/0', day: '2026-01-03', pct: 3 },
      { target: 'g/0', day: '2026-01-01', pct: 1 },
      { target: 'g/0', day: '2026-01-02', pct: 2 },
    ]).targets[0]
    expect(t?.windowStart).toBe('2026-01-01')
    expect(t?.currentPct).toBe(3)
    expect(emptyCapacityTrend().targets).toEqual([])
    expect(computeCapacityTrend([]).targets).toEqual([])
  })
})
