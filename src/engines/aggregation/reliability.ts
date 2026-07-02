import { TOP_N_DEFAULT } from '../../types/ppdm'
import type { TopList } from '../../types/reportView'
import { topN } from './topN'

export type ReliabilityStatus = 'success' | 'exception' | 'failed'

/** One normalized backup job for reliability analysis. `day` is 'YYYY-MM-DD' ('' when unknown). */
export interface ReliabilityJob {
  host: string
  status: ReliabilityStatus
  day: string
  durationHours?: number
}

export interface QueueSample {
  host: string
  queuedHours: number
}

export interface RepeatFailureClient {
  host: string
  /** Distinct days with ≥1 failed job. */
  failureDays: number
  failedJobs: number
  /** Days between the last success and the window end; undefined = no success in window. */
  daysSinceSuccess?: number
  /** Vendor-reported per-client success rate 0..100 (NetWorker Client Statistics); corroboration only. */
  successRatePct?: number
}

export interface QueueDelay {
  delayedCount: number
  total: number
  delayedPct: number
  top: TopList<QueueSample>
}

export const RUNTIME_BUCKET_IDS = [
  'le15m',
  'm15to30',
  'm30to60',
  'h1to2',
  'h2to4',
  'h4to8',
  'gt8h',
] as const
export type RuntimeBucketId = (typeof RUNTIME_BUCKET_IDS)[number]

export interface Reliability {
  repeatFailures: TopList<RepeatFailureClient>
  runtime: Record<RuntimeBucketId, number>
  runtimeTotal: number
  queue?: QueueDelay
  windowStart?: string
  windowEnd?: string
  capped: boolean
}

/** Flag a client when it has failed jobs on at least this many distinct days. */
const FAILURE_DAY_THRESHOLD = 3
/** A job is "delayed" when it sat queued longer than 15 minutes. */
const QUEUE_DELAY_HOURS = 0.25
const MS_PER_DAY = 86_400_000

export function emptyRuntime(): Record<RuntimeBucketId, number> {
  return { le15m: 0, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 0 }
}

export function emptyReliability(): Reliability {
  return {
    repeatFailures: { items: [], total: 0, shown: 0 },
    runtime: emptyRuntime(),
    runtimeTotal: 0,
    capped: false,
  }
}

function bucketOf(hours: number): RuntimeBucketId {
  if (hours <= 0.25) return 'le15m'
  if (hours <= 0.5) return 'm15to30'
  if (hours < 1) return 'm30to60'
  if (hours <= 2) return 'h1to2'
  if (hours <= 4) return 'h2to4'
  if (hours <= 8) return 'h4to8'
  return 'gt8h'
}

export interface ReliabilityOptions {
  queue?: QueueSample[]
  /** Pre-aggregated histogram (raw counts) used only when no detail durations exist. */
  fallbackRuntime?: Record<RuntimeBucketId, number>
  /** Vendor-reported per-client success rate 0..100, attached to flagged clients as corroboration. */
  successRateByHost?: Record<string, number>
  capped?: boolean
}

/** Reliability patterns from normalized jobs. Pure and deterministic. */
export function computeReliability(
  jobs: ReliabilityJob[],
  opts: ReliabilityOptions = {},
): Reliability {
  const days = jobs
    .map((j) => j.day)
    .filter(Boolean)
    .sort()
  const windowStart = days[0]
  const windowEnd = days[days.length - 1]

  // Repeat failures — only jobs with a host and a day can join a streak.
  const byHost = new Map<
    string,
    { failDays: Set<string>; failedJobs: number; lastSuccess?: string }
  >()
  for (const job of jobs) {
    if (!job.host || !job.day) continue
    const h = byHost.get(job.host) ?? { failDays: new Set<string>(), failedJobs: 0 }
    if (job.status === 'failed') {
      h.failDays.add(job.day)
      h.failedJobs++
    } else if (job.status === 'success') {
      if (!h.lastSuccess || job.day > h.lastSuccess) h.lastSuccess = job.day
    }
    byHost.set(job.host, h)
  }
  const flagged: RepeatFailureClient[] = [...byHost.entries()]
    .filter(([, h]) => h.failDays.size >= FAILURE_DAY_THRESHOLD)
    .map(([host, h]) => ({
      host,
      failureDays: h.failDays.size,
      failedJobs: h.failedJobs,
      daysSinceSuccess:
        h.lastSuccess && windowEnd
          ? Math.round((Date.parse(windowEnd) - Date.parse(h.lastSuccess)) / MS_PER_DAY)
          : undefined,
      successRatePct: opts.successRateByHost?.[host],
    }))

  const detail = emptyRuntime()
  let detailTotal = 0
  for (const job of jobs) {
    if (job.durationHours === undefined) continue
    detail[bucketOf(job.durationHours)]++
    detailTotal++
  }
  const runtime = detailTotal === 0 && opts.fallbackRuntime ? opts.fallbackRuntime : detail
  const runtimeTotal = Object.values(runtime).reduce((a, b) => a + b, 0)

  let queue: QueueDelay | undefined
  if (opts.queue) {
    const delayed = opts.queue.filter((q) => q.queuedHours > QUEUE_DELAY_HOURS)
    queue = {
      delayedCount: delayed.length,
      total: opts.queue.length,
      delayedPct: opts.queue.length > 0 ? delayed.length / opts.queue.length : 0,
      top: topN(delayed, TOP_N_DEFAULT, (q) => q.queuedHours),
    }
  }

  return {
    repeatFailures: topN(flagged, TOP_N_DEFAULT, (c) => c.failureDays),
    runtime,
    runtimeTotal,
    queue,
    windowStart,
    windowEnd,
    capped: opts.capped ?? false,
  }
}
