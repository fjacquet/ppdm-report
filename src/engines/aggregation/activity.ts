import type { TopList } from '../../types/reportView'
import type { WeightedRatio } from './efficiency'
import { topN } from './topN'

/** One normalized backup job for activity/sizing analysis. `day` is 'YYYY-MM-DD' ('' when unknown). */
export interface ActivityJob {
  host: string
  type: string
  os: string
  day: string
  sizeGb?: number
  files?: number
  throughputMbSec?: number
  sentBytes?: number
  processedBytes?: number
}

export interface TypeStats {
  type: string
  capacityGb: number
  clients: number
  files: number
  /** Sent/processed bytes weighted ratio, folded only from rows with both fields defined. */
  changeRate?: WeightedRatio
}

export interface BigBackup {
  host: string
  type: string
  sizeGb: number
  files?: number
}

export interface SlowBackup {
  host: string
  type: string
  throughputMbSec: number
  sizeGb: number
}

export interface DailyPoint {
  day: string
  gb: number
  jobs: number
}

/** Distinct-client counts per OS family. Keys: Windows, Linux, Other. */
export interface OsSplit {
  counts: Record<string, number>
}

export interface Activity {
  byType: TypeStats[]
  largest: TopList<BigBackup>
  slowest: TopList<SlowBackup>
  daily: DailyPoint[]
  osSplit?: OsSplit
}

/** How many of the biggest backups to surface. */
export const LARGEST_N = 10
/** How many of the slowest backups to surface. */
export const SLOWEST_N = 5
/** Ignore jobs smaller than this when ranking slowest — throughput is noise below this size. */
export const SLOWEST_MIN_GB = 1

export function emptyActivity(): Activity {
  return {
    byType: [],
    largest: { items: [], total: 0, shown: 0 },
    slowest: { items: [], total: 0, shown: 0 },
    daily: [],
  }
}

/** Map a free-text OS string to its family bucket. Exported for adapters (e.g. NetWorker)
 * that derive OS split from a different sheet than the one that feeds job rows. */
export function osFamily(os: string): 'Windows' | 'Linux' | 'Other' {
  const lower = os.toLowerCase()
  if (lower.includes('windows')) return 'Windows'
  if (lower.includes('linux')) return 'Linux'
  return 'Other'
}

function addRatio(
  a: WeightedRatio | undefined,
  b: WeightedRatio | undefined,
): WeightedRatio | undefined {
  if (!a) return b
  if (!b) return a
  return { num: a.num + b.num, den: a.den + b.den }
}

/** Activity/sizing patterns from normalized jobs. Pure and deterministic. */
export function computeActivity(jobs: ActivityJob[]): Activity {
  const byTypeAcc = new Map<
    string,
    {
      clients: Set<string>
      capacityGb: number
      files: number
      sentBytes: number
      processedBytes: number
      hasPair: boolean
    }
  >()
  for (const j of jobs) {
    if (!j.type) continue
    const cur = byTypeAcc.get(j.type) ?? {
      clients: new Set<string>(),
      capacityGb: 0,
      files: 0,
      sentBytes: 0,
      processedBytes: 0,
      hasPair: false,
    }
    if (j.sizeGb !== undefined) cur.capacityGb += j.sizeGb
    if (j.host) cur.clients.add(j.host)
    if (j.files !== undefined) cur.files += j.files
    if (j.sentBytes !== undefined && j.processedBytes !== undefined) {
      cur.sentBytes += j.sentBytes
      cur.processedBytes += j.processedBytes
      cur.hasPair = true
    }
    byTypeAcc.set(j.type, cur)
  }
  const byType: TypeStats[] = [...byTypeAcc.entries()]
    .map(([type, v]) => ({
      type,
      capacityGb: v.capacityGb,
      clients: v.clients.size,
      files: v.files,
      changeRate: v.hasPair ? { num: v.sentBytes, den: v.processedBytes } : undefined,
    }))
    .sort((a, b) => b.capacityGb - a.capacityGb)

  const largestCandidates: BigBackup[] = jobs
    .filter((j): j is ActivityJob & { sizeGb: number } => j.sizeGb !== undefined)
    .map((j) => ({ host: j.host, type: j.type, sizeGb: j.sizeGb, files: j.files }))
  const largest = topN(largestCandidates, LARGEST_N, (b) => b.sizeGb)

  const slowestCandidates: SlowBackup[] = jobs
    .filter(
      (j): j is ActivityJob & { throughputMbSec: number; sizeGb: number } =>
        j.throughputMbSec !== undefined && j.sizeGb !== undefined && j.sizeGb >= SLOWEST_MIN_GB,
    )
    .map((j) => ({
      host: j.host,
      type: j.type,
      throughputMbSec: j.throughputMbSec,
      sizeGb: j.sizeGb,
    }))
  const slowest = topN(slowestCandidates, SLOWEST_N, (b) => -b.throughputMbSec)

  const dailyAcc = new Map<string, { gb: number; jobs: number }>()
  for (const j of jobs) {
    if (!j.day) continue
    const cur = dailyAcc.get(j.day) ?? { gb: 0, jobs: 0 }
    if (j.sizeGb !== undefined) cur.gb += j.sizeGb
    cur.jobs += 1
    dailyAcc.set(j.day, cur)
  }
  const daily: DailyPoint[] = [...dailyAcc.entries()]
    .map(([day, v]) => ({ day, gb: v.gb, jobs: v.jobs }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const osByFamily = {
    Windows: new Set<string>(),
    Linux: new Set<string>(),
    Other: new Set<string>(),
  }
  let hasOsData = false
  for (const j of jobs) {
    if (!j.os) continue
    hasOsData = true
    if (!j.host) continue
    osByFamily[osFamily(j.os)].add(j.host)
  }
  const osSplit: OsSplit | undefined = hasOsData
    ? {
        counts: {
          Windows: osByFamily.Windows.size,
          Linux: osByFamily.Linux.size,
          Other: osByFamily.Other.size,
        },
      }
    : undefined

  return { byType, largest, slowest, daily, osSplit }
}

/** Fold per-server Activity into one. Identity on a single element. Pure. */
export function mergeActivity(list: Activity[]): Activity {
  const first = list[0]
  if (!first) return emptyActivity()
  if (list.length === 1) return first

  const byTypeAcc = new Map<
    string,
    { capacityGb: number; clients: number; files: number; changeRate?: WeightedRatio }
  >()
  for (const a of list) {
    for (const t of a.byType) {
      const cur = byTypeAcc.get(t.type) ?? { capacityGb: 0, clients: 0, files: 0 }
      cur.capacityGb += t.capacityGb
      // Cross-server client overlap cannot be deduplicated post-hoc — sum as an upper bound, not a distinct count.
      cur.clients += t.clients
      cur.files += t.files
      cur.changeRate = addRatio(cur.changeRate, t.changeRate)
      byTypeAcc.set(t.type, cur)
    }
  }
  const byType: TypeStats[] = [...byTypeAcc.entries()]
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.capacityGb - a.capacityGb)

  const largestItems = list.flatMap((a) => a.largest.items)
  const largestTotal = list.reduce((a, x) => a + x.largest.total, 0)
  const largestCapped = topN(largestItems, LARGEST_N, (b) => b.sizeGb)
  const largest: TopList<BigBackup> = {
    items: largestCapped.items,
    total: largestTotal,
    shown: largestCapped.items.length,
  }

  const slowestItems = list.flatMap((a) => a.slowest.items)
  const slowestTotal = list.reduce((a, x) => a + x.slowest.total, 0)
  const slowestCapped = topN(slowestItems, SLOWEST_N, (b) => -b.throughputMbSec)
  const slowest: TopList<SlowBackup> = {
    items: slowestCapped.items,
    total: slowestTotal,
    shown: slowestCapped.items.length,
  }

  const dailyAcc = new Map<string, DailyPoint>()
  for (const a of list) {
    for (const d of a.daily) {
      const cur = dailyAcc.get(d.day) ?? { day: d.day, gb: 0, jobs: 0 }
      cur.gb += d.gb
      cur.jobs += d.jobs
      dailyAcc.set(d.day, cur)
    }
  }
  const daily = [...dailyAcc.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const osSplits = list.map((a) => a.osSplit).filter((o): o is OsSplit => o !== undefined)
  const osSplit: OsSplit | undefined =
    osSplits.length > 0
      ? {
          counts: {
            Windows: osSplits.reduce((a, o) => a + (o.counts.Windows ?? 0), 0),
            Linux: osSplits.reduce((a, o) => a + (o.counts.Linux ?? 0), 0),
            Other: osSplits.reduce((a, o) => a + (o.counts.Other ?? 0), 0),
          },
        }
      : undefined

  return { byType, largest, slowest, daily, osSplit }
}
