/** Observed utilization trend per target. Measurement only — no projection anywhere. */

export interface UtilizationSample {
  day: string
  target: string
  pct: number
}

export interface TrendTarget {
  target: string
  currentPct: number
  minPct: number
  maxPct: number
  windowStart: string
  windowEnd: string
  sampleCount: number
  /** Least-squares slope in percentage points per 30 days; undefined below MIN_SAMPLES_FOR_SLOPE. */
  slopePer30d?: number
  /** Downsampled [day, pct] pairs for the line chart (last point always kept). */
  series: [string, number][]
}

export interface CapacityTrend {
  targets: TrendTarget[]
}

export const MIN_SAMPLES_FOR_SLOPE = 30
export const MAX_SERIES_POINTS = 120
const MS_PER_DAY = 86_400_000

export function emptyCapacityTrend(): CapacityTrend {
  return { targets: [] }
}

/** Least-squares slope of pct over days-since-start, scaled to 30 days. */
function slopeOf(points: [string, number][]): number {
  const x0 = Date.parse(points[0]?.[0] ?? '')
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  const n = points.length
  for (const [day, pct] of points) {
    const x = (Date.parse(day) - x0) / MS_PER_DAY
    sx += x
    sy += pct
    sxx += x * x
    sxy += x * pct
  }
  const denom = n * sxx - sx * sx
  return denom === 0 ? 0 : ((n * sxy - sx * sy) / denom) * 30
}

function downsample(points: [string, number][]): [string, number][] {
  const n = points.length
  if (n <= MAX_SERIES_POINTS) return [...points]
  // Evenly spaced indices from 0 to n-1 inclusive — exactly MAX_SERIES_POINTS picks,
  // always including the first and last point, never exceeding the cap.
  const out: [string, number][] = []
  for (let i = 0; i < MAX_SERIES_POINTS; i++) {
    const idx = Math.round((i * (n - 1)) / (MAX_SERIES_POINTS - 1))
    const p = points[idx]
    if (p && out[out.length - 1] !== p) out.push(p)
  }
  return out
}

/** Group samples per target, sort by day, derive window stats + observed slope. Pure. */
export function computeCapacityTrend(samples: UtilizationSample[]): CapacityTrend {
  const byTarget = new Map<string, [string, number][]>()
  for (const s of samples) {
    if (!s.target || !s.day) continue
    const list = byTarget.get(s.target) ?? []
    list.push([s.day, s.pct])
    byTarget.set(s.target, list)
  }
  const targets: TrendTarget[] = [...byTarget.entries()]
    .map(([target, points]) => {
      points.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      const pcts = points.map((p) => p[1])
      const first = points[0] as [string, number]
      const last = points[points.length - 1] as [string, number]
      return {
        target,
        currentPct: last[1],
        minPct: Math.min(...pcts),
        maxPct: Math.max(...pcts),
        windowStart: first[0],
        windowEnd: last[0],
        sampleCount: points.length,
        slopePer30d: points.length >= MIN_SAMPLES_FOR_SLOPE ? slopeOf(points) : undefined,
        series: downsample(points),
      }
    })
    .sort((a, b) => a.target.localeCompare(b.target))
  return { targets }
}
