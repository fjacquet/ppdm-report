import type { DailyPoint } from '../aggregation/activity'

/**
 * Monday-start ISO-week key (`YYYY-MM-DD`) for a `YYYY-MM-DD` day string. Pure
 * `Date.UTC` arithmetic — no locale/timezone dependency, no `Date.now()`/argless
 * `new Date()`. Malformed input passes through unchanged (defensive; upstream
 * `ActivityJob.day` is already validated to `''` or a real date).
 */
export function isoWeekStart(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return day
  const year = Number(m[1])
  const month = Number(m[2]) - 1
  const date = Number(m[3])
  const utcMs = Date.UTC(year, month, date)
  const dow = new Date(utcMs).getUTCDay() // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7
  const startMs = utcMs - daysSinceMonday * 86_400_000
  return new Date(startMs).toISOString().slice(0, 10)
}

/**
 * Bucket daily activity points into Monday-start weekly totals, keeping only the
 * last `weeks` buckets in chronological order. Pure and deterministic — used by
 * the export layer to render a bounded deck-bar series (never one bar per day).
 */
export function bucketWeekly(daily: DailyPoint[], weeks: number): DailyPoint[] {
  const acc = new Map<string, { gb: number; jobs: number }>()
  for (const p of daily) {
    if (!p.day) continue
    const key = isoWeekStart(p.day)
    const cur = acc.get(key) ?? { gb: 0, jobs: 0 }
    cur.gb += p.gb
    cur.jobs += p.jobs
    acc.set(key, cur)
  }
  const sorted = [...acc.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  return sorted.slice(-weeks)
}
