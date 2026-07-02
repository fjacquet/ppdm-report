# Reliability Insights (PR 1 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reliability insight family — repeat-failure clients, runtime distribution, queue delay — computed by a shared pure engine and wired for Avamar + NetWorker, rendered in dashboard, HTML, and PPTX.

**Architecture:** One new pure aggregation module (`src/engines/aggregation/reliability.ts`) defines normalized inputs (`ReliabilityJob`, `QueueSample`) and computes a provenance-carrying `Reliability` result. Product adapters map their sheets into normalized rows (Avamar: `Avamar DPN Summary` + `Job List Detailed`; NetWorker: `Jobs`). `mergeViews` folds per-server results. One new `ExportSection` + one new dashboard component render it; flavor differences come from `SECTION_ORDER` placement only.

**Tech Stack:** TypeScript, Vitest, React 19, i18next (4 locales), Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-insight-families-design.md` (family 1).

## Global Constraints

- `engines/` are pure: no React, no DOM, no store imports, no `Date.now()` (`Date.parse` of a data-derived string is fine — deterministic).
- Never read vendor-precomputed *rates*; raw sums only (the `Backup Runtime Summary` fallback is raw counts — allowed).
- Repeat-failure threshold: **≥3 distinct days with ≥1 failed job**. Queue-delay threshold: **queued > 0.25 h (15 min)**.
- All new UI/export strings exist in **all four locales** (en/fr/de/it); `keyParity` test enforces.
- Formatter/linter is Biome: single quotes, no semicolons, 2-space indent, 100-col width.
- Tests use synthetic in-memory workbooks via `makeWorkbook`; never read `ref/`.
- Verification gates per task: `npm run typecheck`, `./node_modules/.bin/biome check .` (authoritative — `npm run lint` false-fails under RTK), `npx vitest run <file>`; full `npm run test:run` + `npm run build` at the end.
- Commit after every green task.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch from current main**

```bash
git checkout main && git pull && git checkout -b feat/reliability-insights
```

---

### Task 1: Reliability engine — types + `computeReliability`

**Files:**
- Create: `src/engines/aggregation/reliability.ts`
- Test: `src/engines/aggregation/reliability.test.ts`

**Interfaces:**
- Consumes: `TopList` from `src/types/reportView.ts`, `topN` from `./topN`, `TOP_N_DEFAULT` from `src/types/ppdm.ts`.
- Produces (later tasks rely on these exact names):
  - `type ReliabilityStatus = 'success' | 'exception' | 'failed'`
  - `interface ReliabilityJob { host: string; status: ReliabilityStatus; day: string; durationHours?: number }` (`day` is `'YYYY-MM-DD'` or `''`)
  - `interface QueueSample { host: string; queuedHours: number }`
  - `interface RepeatFailureClient { host: string; failureDays: number; failedJobs: number; daysSinceSuccess?: number; successRatePct?: number }`
  - `interface QueueDelay { delayedCount: number; total: number; delayedPct: number; top: TopList<QueueSample> }`
  - `RUNTIME_BUCKET_IDS`, `type RuntimeBucketId`
  - `interface Reliability { repeatFailures: TopList<RepeatFailureClient>; runtime: Record<RuntimeBucketId, number>; runtimeTotal: number; queue?: QueueDelay; windowStart?: string; windowEnd?: string; capped: boolean }`
  - `emptyRuntime()`, `emptyReliability()`, `computeReliability(jobs, opts?)`

- [ ] **Step 1: Write the failing test**

Create `src/engines/aggregation/reliability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  computeReliability,
  emptyReliability,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/reliability.test.ts`
Expected: FAIL — cannot resolve `./reliability`.

- [ ] **Step 3: Write the implementation**

Create `src/engines/aggregation/reliability.ts`:

```ts
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
  if (hours <= 1) return 'm30to60'
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
  const byHost = new Map<string, { failDays: Set<string>; failedJobs: number; lastSuccess?: string }>()
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/aggregation/reliability.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add src/engines/aggregation/reliability.ts src/engines/aggregation/reliability.test.ts
git commit -m "feat(reliability): pure reliability engine — repeat failures, runtime buckets, queue delay"
```

---

### Task 2: `mergeReliability`

**Files:**
- Modify: `src/engines/aggregation/reliability.ts` (append)
- Test: `src/engines/aggregation/reliability.test.ts` (append)

**Interfaces:**
- Produces: `mergeReliability(list: Reliability[]): Reliability` — identity on a single element; used by `mergeViews` in Task 3.

- [ ] **Step 1: Write the failing tests** (append to the existing describe file)

```ts
import { mergeReliability } from './reliability'

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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run src/engines/aggregation/reliability.test.ts`
Expected: FAIL — `mergeReliability` is not exported.

- [ ] **Step 3: Implement** (append to `reliability.ts`)

```ts
/** Fold per-server Reliability into one. Identity on a single element. Pure. */
export function mergeReliability(list: Reliability[]): Reliability {
  const first = list[0]
  if (!first) return emptyReliability()
  if (list.length === 1) return first

  const items = list.flatMap((r) => r.repeatFailures.items)
  const flaggedTotal = list.reduce((a, r) => a + r.repeatFailures.total, 0)
  const cappedTop = topN(items, TOP_N_DEFAULT, (c) => c.failureDays)

  const runtime = emptyRuntime()
  for (const r of list) for (const id of RUNTIME_BUCKET_IDS) runtime[id] += r.runtime[id]

  const queues = list.map((r) => r.queue).filter((q): q is QueueDelay => q !== undefined)
  let queue: QueueDelay | undefined
  if (queues.length > 0) {
    const delayedCount = queues.reduce((a, q) => a + q.delayedCount, 0)
    const total = queues.reduce((a, q) => a + q.total, 0)
    const topItems = topN(
      queues.flatMap((q) => q.top.items),
      TOP_N_DEFAULT,
      (q) => q.queuedHours,
    )
    queue = {
      delayedCount,
      total,
      delayedPct: total > 0 ? delayedCount / total : 0,
      top: { ...topItems, total: delayedCount },
    }
  }

  const starts = list.map((r) => r.windowStart).filter((d): d is string => Boolean(d))
  const ends = list.map((r) => r.windowEnd).filter((d): d is string => Boolean(d))

  return {
    repeatFailures: { items: cappedTop.items, total: flaggedTotal, shown: cappedTop.items.length },
    runtime,
    runtimeTotal: list.reduce((a, r) => a + r.runtimeTotal, 0),
    queue,
    windowStart: starts.length > 0 ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
    windowEnd: ends.length > 0 ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
    capped: list.some((r) => r.capped),
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/engines/aggregation/reliability.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -u && git commit -m "feat(reliability): mergeReliability estate fold"
```

---

### Task 3: Wire `Reliability` into `ReportView`, provenance, and `mergeViews`

**Files:**
- Modify: `src/types/reportView.ts` (MetricKey + ReportView)
- Modify: `src/engines/aggregation/provenance.ts` (all four factory functions)
- Modify: `src/engines/aggregation/mergeViews.ts` (fold + provenance key list)
- Modify: `src/engines/products/ppdm/buildPpdmView.ts`, `src/engines/aggregation/summaryView.ts` (empty default)
- Modify: `src/components/dashboard/sections.test.tsx` (fixture gains the field)
- Tests: existing suites (`mergeViews.test.ts`, `mergeViews.parity.test.ts`, `provenance.test.ts`) must stay green; typecheck drives the edit list.

**Interfaces:**
- Consumes: `Reliability`, `emptyReliability`, `mergeReliability` from Task 1–2.
- Produces: `ReportView.reliability: Reliability` (non-optional, like `opsInsights`); `MetricKey` gains `'reliability'`.

- [ ] **Step 1: Extend the types**

In `src/types/reportView.ts`:

```ts
import type { Reliability } from '../engines/aggregation/reliability'
```

Change `MetricKey`:

```ts
export type MetricKey =
  | 'coverageByType'
  | 'gapsList'
  | 'compliance'
  | 'storageTargets'
  | 'frontEnd'
  | 'reliability'
```

Add to `ReportView` (after `opsInsights`):

```ts
  reliability: Reliability
```

Note: `types/` importing a type from `engines/aggregation` matches the existing direction of shared types; if the import creates a cycle complaint, move the `Reliability` family of interfaces into `types/reportView.ts` instead and have `reliability.ts` import them — either placement is acceptable, pick whichever typechecks cleanly.

- [ ] **Step 2: Extend provenance factories**

In `src/engines/aggregation/provenance.ts`, add a `reliability` entry to each returned record:

- `allAvailable`: `reliability: { available: false, serversCovered: 0, serversTotal: 1 },` — PPDM wiring is a follow-up (spec: out of scope); add the comment `// PPDM reliability wiring is a follow-up — unavailable for now.`
- `allUnavailable`: `reliability: { available: false, serversCovered: 0, serversTotal: 1 },`
- `avamarProvenance`: `reliability: { available: true, serversCovered: 1, serversTotal: 1 },`
- `networkerProvenance`: `reliability: { available: true, serversCovered: 1, serversTotal: 1 },`

- [ ] **Step 3: Extend mergeViews**

In `src/engines/aggregation/mergeViews.ts`:

```ts
import { mergeReliability } from './reliability'
```

Add `'reliability'` to the `keys` array in `mergeProvenance`, and to the returned object of `mergeViews`:

```ts
    reliability: mergeReliability(views.map((v) => v.reliability)),
```

- [ ] **Step 4: Fill the empty default everywhere typecheck complains**

Run: `npm run typecheck`
Expected failures: `buildPpdmView.ts`, `summaryView.ts`, the `fixture` in `src/components/dashboard/sections.test.tsx`, and possibly other test fixtures constructing full `ReportView` objects. In each, add next to the existing `opsInsights` entry:

```ts
    reliability: emptyReliability(),
```

with `import { emptyReliability } from '../../engines/aggregation/reliability'` (path adjusted per file). For provenance-record literals in tests, add `reliability: { available: false, serversCovered: 0, serversTotal: 1 }` as needed.

- [ ] **Step 5: Run the affected suites**

Run: `npm run typecheck && npx vitest run src/engines/aggregation src/components/dashboard`
Expected: PASS — merge identity/parity tests exercise the new field automatically.

- [ ] **Step 6: Commit**

```bash
./node_modules/.bin/biome check .
git add -u && git commit -m "feat(reliability): ReportView.reliability + provenance key + estate merge"
```

---

### Task 4: Avamar adapter

**Files:**
- Modify: `src/engines/products/avamar/jobs.ts` (export the status constants)
- Create: `src/engines/products/avamar/reliability.ts`
- Modify: `src/engines/products/avamar/buildAvamarView.ts`
- Test: `src/engines/products/avamar/reliability.test.ts`

**Interfaces:**
- Consumes: `computeReliability`, `emptyRuntime`, types from Task 1; `cellNum`/`cellStr` from `../../aggregation/rows`; `serialToIso` from `../../parser/serialToIso`; `SUCCESS_STATUS`, `EXCEPTION_STATUS`, `BACKUP_OPS` from `./jobs`.
- Produces: `avamarReliability(wb: RawWorkbook): Reliability`.

- [ ] **Step 1: Export the constants from `jobs.ts`**

Change the three module-level `const` declarations in `src/engines/products/avamar/jobs.ts` to `export const` (`SUCCESS_STATUS`, `EXCEPTION_STATUS`, `BACKUP_OPS`). No behavior change.

- [ ] **Step 2: Write the failing test**

Create `src/engines/products/avamar/reliability.test.ts`. Excel serial 46203 = 2026-06-25 UTC; 46204/46205 follow. `Seconds` feeds the histogram; `Time Started − Time Queued` (serial fraction) feeds queue delay.

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarReliability } from './reliability'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const FAIL = 'Activity failed - client error(s).'
const OK = 'Activity completed successfully.'

describe('avamarReliability', () => {
  it('maps DPN Summary to streaks and runtime; Job List Detailed to queue delay', () => {
    const r = avamarReliability(
      wb({
        'Avamar DPN Summary': [
          ['Host', 'Operation', 'Status', 'Start Date', 'Seconds'],
          ['h1', 'Scheduled Backup', FAIL, 46203.5, 60],
          ['h1', 'Scheduled Backup', FAIL, 46204.5, 60],
          ['h1', 'Scheduled Backup', FAIL, 46205.5, 60],
          ['h2', 'Scheduled Backup', OK, 46205.5, 7200],
          ['h2', 'Restore', FAIL, 46205.6, 60], // non-backup op — excluded
        ],
        'Job List Detailed': [
          ['Host', 'Time Queued (GMT)', 'Time Started (GMT)'],
          ['h1', 46203.5, 46203.52], // 0.48 h queued — delayed
          ['h2', 46203.5, 46203.5], // 0 h — not delayed
        ],
      }),
    )
    expect(r.repeatFailures.total).toBe(1)
    expect(r.repeatFailures.items[0]?.host).toBe('h1')
    expect(r.runtime.le15m).toBe(3) // 60 s each
    expect(r.runtime.h1to2).toBe(1) // 7200 s
    expect(r.queue?.delayedCount).toBe(1)
    expect(r.queue?.total).toBe(2)
  })

  it('falls back to Backup Runtime Summary when there is no DPN detail', () => {
    const r = avamarReliability(
      wb({
        'Backup Runtime Summary': [
          ['<=15 min', '>15-30 mins', '>30-60 mins', '>1-2 hours', '>2-4 hours', '>4-8 hours', '>8 hours'],
          [10, 2, 3, 4, 5, 1, 9],
        ],
      }),
    )
    expect(r.runtime.le15m).toBe(10)
    expect(r.runtime.gt8h).toBe(9)
    expect(r.runtimeTotal).toBe(34)
    expect(r.repeatFailures.total).toBe(0)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/engines/products/avamar/reliability.test.ts`
Expected: FAIL — cannot resolve `./reliability`.

- [ ] **Step 4: Implement**

Create `src/engines/products/avamar/reliability.ts`:

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeReliability,
  emptyRuntime,
  type QueueSample,
  type Reliability,
  type ReliabilityJob,
  type RuntimeBucketId,
} from '../../aggregation/reliability'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'
import { BACKUP_OPS, EXCEPTION_STATUS, SUCCESS_STATUS } from './jobs'

const dayOf = (serial: number) => (serial > 0 ? serialToIso(serial).slice(0, 10) : '')

const RUNTIME_COLUMNS: [string, RuntimeBucketId][] = [
  ['<=15 min', 'le15m'],
  ['>15-30 mins', 'm15to30'],
  ['>30-60 mins', 'm30to60'],
  ['>1-2 hours', 'h1to2'],
  ['>2-4 hours', 'h2to4'],
  ['>4-8 hours', 'h4to8'],
  ['>8 hours', 'gt8h'],
]

/** Reliability inputs from Avamar DPN Summary (status/day/duration) and
 * Job List Detailed (queue delay), with the pre-aggregated Backup Runtime
 * Summary as histogram fallback. Pure. */
export function avamarReliability(wb: RawWorkbook): Reliability {
  const dpn = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  const jobs: ReliabilityJob[] = dpn.map((r) => {
    const status = cellStr(r, 'Status')
    return {
      host: cellStr(r, 'Host'),
      status:
        status === SUCCESS_STATUS ? 'success' : status === EXCEPTION_STATUS ? 'exception' : 'failed',
      day: dayOf(cellNum(r, 'Start Date')),
      durationHours: cellNum(r, 'Seconds') / 3600,
    }
  })

  const queue: QueueSample[] = (wb.sheets['Job List Detailed']?.rows ?? [])
    .filter((r) => cellNum(r, 'Time Queued (GMT)') > 0 && cellNum(r, 'Time Started (GMT)') > 0)
    .map((r) => ({
      host: cellStr(r, 'Host'),
      queuedHours: (cellNum(r, 'Time Started (GMT)') - cellNum(r, 'Time Queued (GMT)')) * 24,
    }))

  let fallbackRuntime: Record<RuntimeBucketId, number> | undefined
  const brs = wb.sheets['Backup Runtime Summary']?.rows[0]
  if (jobs.length === 0 && brs) {
    fallbackRuntime = emptyRuntime()
    for (const [col, id] of RUNTIME_COLUMNS) fallbackRuntime[id] = cellNum(brs, col)
  }

  return computeReliability(jobs, {
    queue: queue.length > 0 ? queue : undefined,
    fallbackRuntime,
    capped:
      (wb.sheets['Avamar DPN Summary']?.capped ?? false) ||
      (wb.sheets['Job List Detailed']?.capped ?? false),
  })
}
```

- [ ] **Step 5: Wire into the composition root**

In `src/engines/products/avamar/buildAvamarView.ts` add `import { avamarReliability } from './reliability'` and, in the returned object after `opsInsights`:

```ts
    reliability: avamarReliability(wb),
```

- [ ] **Step 6: Run tests + gate + commit**

Run: `npx vitest run src/engines/products/avamar`
Expected: PASS (existing + 2 new).

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -A src/engines/products/avamar && git commit -m "feat(avamar): reliability from DPN Summary + Job List Detailed"
```

---

### Task 5: NetWorker adapter

**Files:**
- Create: `src/engines/products/networker/reliability.ts`
- Modify: `src/engines/products/networker/buildNetworkerView.ts`
- Test: `src/engines/products/networker/reliability.test.ts`

**Interfaces:**
- Produces: `networkerReliability(wb: RawWorkbook): Reliability`.

- [ ] **Step 1: Write the failing test**

Create `src/engines/products/networker/reliability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerReliability } from './reliability'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('networkerReliability', () => {
  it('keeps only backup-carrying job types and maps statuses/durations', () => {
    const r = networkerReliability(
      wb({
        Jobs: [
          ['Job Type', 'Client Name', 'Completion Status', 'Start Time', 'End Time'],
          ['save job', 'c1', 'Failed', 46201.5, 46201.51],
          ['save job', 'c1', 'Failed', 46202.5, 46202.51],
          ['vproxysave job', 'c1', 'Failed', 46203.5, 46203.51],
          ['backup action job', 'c2', 'Succeeded', 46203.5, 46203.75], // 6 h
          ['utility job', 'c3', 'Failed', 46201.5, 46201.51], // excluded
          ['workflow job', 'c3', 'Failed', 46202.5, 46202.51], // excluded
          ['save job', 'c4', 'N/A', 46203.5, 46203.51], // exception bucket
        ],
        'Client Statistics': [
          ['Hostname', 'Success Rate'],
          ['c1', 25],
        ],
      }),
    )
    expect(r.repeatFailures.total).toBe(1)
    expect(r.repeatFailures.items[0]).toMatchObject({
      host: 'c1',
      failureDays: 3,
      successRatePct: 25,
    })
    expect(r.runtime.h4to8).toBe(1) // the 6-hour job
    expect(r.runtimeTotal).toBe(5) // 5 backup jobs with durations
    expect(r.queue).toBeUndefined() // NetWorker exposes no queued timestamp
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/engines/products/networker/reliability.test.ts`
Expected: FAIL — cannot resolve `./reliability`.

- [ ] **Step 3: Implement**

Create `src/engines/products/networker/reliability.ts`:

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeReliability,
  type Reliability,
  type ReliabilityJob,
} from '../../aggregation/reliability'
import { cellNum, cellStr } from '../../aggregation/rows'
import { serialToIso } from '../../parser/serialToIso'

/** Backup-carrying job types (save/vproxysave/backup action); utility, task,
 * and workflow jobs are orchestration noise, not client backups. */
const isBackupJob = (jobType: string) => /save|backup/i.test(jobType)

/** Reliability inputs from the NetWorker Jobs sheet. No queued timestamp exists,
 * so queue delay stays unavailable. Pure. */
export function networkerReliability(wb: RawWorkbook): Reliability {
  const rows = (wb.sheets.Jobs?.rows ?? []).filter((r) => isBackupJob(cellStr(r, 'Job Type')))
  const jobs: ReliabilityJob[] = rows.map((r) => {
    const status = cellStr(r, 'Completion Status')
    const start = cellNum(r, 'Start Time')
    const end = cellNum(r, 'End Time')
    return {
      host: cellStr(r, 'Client Name'),
      status: status === 'Succeeded' ? 'success' : status === 'Failed' ? 'failed' : 'exception',
      day: start > 0 ? serialToIso(start).slice(0, 10) : '',
      durationHours: start > 0 && end >= start ? (end - start) * 24 : undefined,
    }
  })

  // Vendor-reported per-client success rate — corroboration only, never a computed input.
  const successRateByHost: Record<string, number> = {}
  for (const r of wb.sheets['Client Statistics']?.rows ?? []) {
    const host = cellStr(r, 'Hostname')
    if (host) successRateByHost[host] = cellNum(r, 'Success Rate')
  }

  return computeReliability(jobs, {
    successRateByHost,
    capped: wb.sheets.Jobs?.capped ?? false,
  })
}
```

- [ ] **Step 4: Wire into the composition root**

In `src/engines/products/networker/buildNetworkerView.ts`: remove nothing; add `import { networkerReliability } from './reliability'` and in the returned object after `opsInsights`:

```ts
    reliability: networkerReliability(wb),
```

- [ ] **Step 5: Run tests + gate + commit**

Run: `npx vitest run src/engines/products/networker`
Expected: PASS.

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -A src/engines/products/networker && git commit -m "feat(networker): reliability from Jobs sheet (backup job types only)"
```

---

### Task 6: Tone thresholds

**Files:**
- Modify: `src/engines/export/thresholds.ts`
- Test: `src/engines/export/thresholds.test.ts` (append)

**Interfaces:**
- Produces: `repeatFailureTone(count: number): ExportTone`, `queueDelayTone(pct: number): ExportTone` (pct is a 0..1 ratio, consistent with the file's convention).

- [ ] **Step 1: Write the failing tests** (append to `thresholds.test.ts`)

```ts
import { queueDelayTone, repeatFailureTone } from './thresholds'

describe('reliability tones', () => {
  it('repeat-failure count: 0 ok, 1–4 warn, ≥5 bad', () => {
    expect(repeatFailureTone(0)).toBe('ok')
    expect(repeatFailureTone(1)).toBe('warn')
    expect(repeatFailureTone(4)).toBe('warn')
    expect(repeatFailureTone(5)).toBe('bad')
  })
  it('queue-delay share: ≤10% ok, >10% warn', () => {
    expect(queueDelayTone(0.1)).toBe('ok')
    expect(queueDelayTone(0.11)).toBe('warn')
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement** (append to `thresholds.ts`)

```ts
/** Repeat-failure clients (≥3 distinct failure-days). */
export function repeatFailureTone(count: number): ExportTone {
  if (count >= 5) return 'bad'
  if (count >= 1) return 'warn'
  return 'ok'
}

/** Share of jobs queued > 15 min, expressed 0..1. */
export function queueDelayTone(pct: number): ExportTone {
  return pct > 0.1 ? 'warn' : 'ok'
}
```

- [ ] **Step 3: Run tests + commit**

Run: `npx vitest run src/engines/export/thresholds.test.ts` — Expected: PASS.

```bash
git add -u && git commit -m "feat(reliability): tone thresholds for repeat failures and queue delay"
```

---

### Task 7: i18n keys (all four locales)

**Files:**
- Modify: `src/i18n/locales/en/dashboard.json`, `src/i18n/locales/fr/dashboard.json`, `src/i18n/locales/de/dashboard.json`, `src/i18n/locales/it/dashboard.json`
- Test: `src/i18n/keyParity.test.ts` (existing — enforces parity automatically)

- [ ] **Step 1: Add the `reliability` block to each locale's `dashboard.json`**

`en`:

```json
"reliability": {
  "title": "Backup reliability",
  "takeaway": "{{count}} clients failed on 3 or more days",
  "flaggedChip": "Repeat-failure clients",
  "queueChip": "Jobs queued > 15 min",
  "col": {
    "client": "Client",
    "failureDays": "Days with failures",
    "failedJobs": "Failed jobs",
    "lastSuccess": "Days since last success",
    "successRate": "Success rate"
  },
  "noSuccess": "no success in window",
  "caption": "Top {{shown}} of {{total}} · window {{start}} – {{end}}",
  "bucket": {
    "le15m": "≤ 15 min",
    "m15to30": "15–30 min",
    "m30to60": "30–60 min",
    "h1to2": "1–2 h",
    "h2to4": "2–4 h",
    "h4to8": "4–8 h",
    "gt8h": "> 8 h"
  }
}
```

`fr`:

```json
"reliability": {
  "title": "Fiabilité des sauvegardes",
  "takeaway": "{{count}} clients en échec sur 3 jours ou plus",
  "flaggedChip": "Clients en échec répété",
  "queueChip": "Jobs en attente > 15 min",
  "col": {
    "client": "Client",
    "failureDays": "Jours avec échecs",
    "failedJobs": "Jobs en échec",
    "lastSuccess": "Jours depuis le dernier succès",
    "successRate": "Taux de succès"
  },
  "noSuccess": "aucun succès sur la période",
  "caption": "Top {{shown}} sur {{total}} · période {{start}} – {{end}}",
  "bucket": {
    "le15m": "≤ 15 min",
    "m15to30": "15–30 min",
    "m30to60": "30–60 min",
    "h1to2": "1–2 h",
    "h2to4": "2–4 h",
    "h4to8": "4–8 h",
    "gt8h": "> 8 h"
  }
}
```

`de`:

```json
"reliability": {
  "title": "Backup-Zuverlässigkeit",
  "takeaway": "{{count}} Clients an 3 oder mehr Tagen fehlgeschlagen",
  "flaggedChip": "Clients mit wiederholten Fehlern",
  "queueChip": "Jobs > 15 Min. in Warteschlange",
  "col": {
    "client": "Client",
    "failureDays": "Tage mit Fehlern",
    "failedJobs": "Fehlgeschlagene Jobs",
    "lastSuccess": "Tage seit letztem Erfolg",
    "successRate": "Erfolgsquote"
  },
  "noSuccess": "kein Erfolg im Zeitfenster",
  "caption": "Top {{shown}} von {{total}} · Zeitfenster {{start}} – {{end}}",
  "bucket": {
    "le15m": "≤ 15 Min.",
    "m15to30": "15–30 Min.",
    "m30to60": "30–60 Min.",
    "h1to2": "1–2 Std.",
    "h2to4": "2–4 Std.",
    "h4to8": "4–8 Std.",
    "gt8h": "> 8 Std."
  }
}
```

`it`:

```json
"reliability": {
  "title": "Affidabilità dei backup",
  "takeaway": "{{count}} client con errori in 3 o più giorni",
  "flaggedChip": "Client con errori ripetuti",
  "queueChip": "Job in coda > 15 min",
  "col": {
    "client": "Client",
    "failureDays": "Giorni con errori",
    "failedJobs": "Job falliti",
    "lastSuccess": "Giorni dall'ultimo successo",
    "successRate": "Tasso di successo"
  },
  "noSuccess": "nessun successo nel periodo",
  "caption": "Primi {{shown}} di {{total}} · periodo {{start}} – {{end}}",
  "bucket": {
    "le15m": "≤ 15 min",
    "m15to30": "15–30 min",
    "m30to60": "30–60 min",
    "h1to2": "1–2 h",
    "h2to4": "2–4 h",
    "h4to8": "4–8 h",
    "gt8h": "> 8 h"
  }
}
```

- [ ] **Step 2: Run the parity test**

Run: `npx vitest run src/i18n/keyParity.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/i18n && git commit -m "feat(reliability): i18n strings en/fr/de/it"
```

---

### Task 8: Export section (`buildExportModel` + `sectionOrder`)

**Files:**
- Modify: `src/engines/export/sectionOrder.ts`
- Modify: `src/engines/export/buildExportModel.ts`
- Test: `src/engines/export/buildExportModel.test.ts` (append)

**Interfaces:**
- Consumes: `view.reliability`, `repeatFailureTone`, `queueDelayTone`, `RUNTIME_BUCKET_IDS`, i18n keys from Task 7, and the file's existing helpers (`toBars`, `withCaveat`, `fmtInt`, `fmtNum`, `pal`, `t`, `locale` — all already in scope inside `buildExportModel`).
- Produces: `SectionId` gains `'reliability'`; a `reliability` entry in the `byId` record.

- [ ] **Step 1: Extend `sectionOrder.ts`**

Add `'reliability'` to the `SectionId` union, and insert into both flavor orders **immediately after `'jobs'`**:

```ts
  assessment: [
    'perServer',
    'coverage',
    'exposure',
    'volumetry',
    'atRisk',
    'idle',
    'jobs',
    'reliability',
    'resilience',
    'capacity',
    'policies',
    'agentVersions',
    'longestBackups',
  ],
  ops: [
    'perServer',
    'jobs',
    'reliability',
    'atRisk',
    'longestBackups',
    'resilience',
    'capacity',
    'agentVersions',
    'coverage',
    'exposure',
    'idle',
    'volumetry',
    'policies',
  ],
```

- [ ] **Step 2: Write the failing test** (append to `buildExportModel.test.ts`, following the file's existing pattern of building a view and asserting on sections; use the file's existing view fixture/helpers)

```ts
describe('reliability section', () => {
  it('renders repeat-failure table, runtime bars, and queue chip', () => {
    const view = makeView({
      reliability: {
        repeatFailures: {
          items: [{ host: 'bad-client', failureDays: 4, failedJobs: 9, daysSinceSuccess: 2 }],
          total: 1,
          shown: 1,
        },
        runtime: { le15m: 10, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 1 },
        runtimeTotal: 11,
        queue: {
          delayedCount: 2,
          total: 10,
          delayedPct: 0.2,
          top: { items: [{ host: 'slow', queuedHours: 2 }], total: 2, shown: 1 },
        },
        windowStart: '2026-06-01',
        windowEnd: '2026-06-30',
        capped: false,
      },
    })
    const model = buildExportModel(view, base)
    const section = model.sections.find((s) => s.id === 'reliability')
    expect(section).toBeDefined()
    expect(section?.table?.rows[0]?.[0]).toBe('bad-client')
    expect(section?.deck?.kpiChips?.some((k) => k.value === '1')).toBe(true)
    expect(section?.deck?.bars?.length).toBe(7)
  })

  it('is suppressed when reliability is empty (e.g. PPDM)', () => {
    const view = makeView({ reliability: emptyReliability() })
    const model = buildExportModel(view, base)
    expect(model.sections.find((s) => s.id === 'reliability')).toBeUndefined()
  })
})
```

Adapt `makeView`/`base` to the helper names actually used in that test file (it already builds full views for every other section; reuse its fixture builder). If the file has no `makeView`, extend its existing fixture object with a `reliability` override per test.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/engines/export/buildExportModel.test.ts`
Expected: FAIL — no `reliability` section id.

- [ ] **Step 4: Implement the section in `buildExportModel.ts`**

Add imports: `queueDelayTone`, `repeatFailureTone` from `./thresholds`; `RUNTIME_BUCKET_IDS` from `../aggregation/reliability`.

Destructure `reliability` from the view alongside the existing `opsInsights` destructure, then build the section next to `atRiskSection` (same region of the file):

```ts
  const rel = reliability
  const relFlagged = rel.repeatFailures.total
  const relHasData = relFlagged > 0 || rel.runtimeTotal > 0 || rel.queue !== undefined
  const relWindow =
    rel.windowStart && rel.windowEnd ? { start: rel.windowStart, end: rel.windowEnd } : undefined
  const relChips: ExportKpi[] = [
    {
      label: t('dashboard:reliability.flaggedChip'),
      value: fmtInt(relFlagged, locale),
      tone: repeatFailureTone(relFlagged),
    },
    ...(rel.queue
      ? [
          {
            label: t('dashboard:reliability.queueChip'),
            value: fmtPct(rel.queue.delayedPct, locale),
            tone: queueDelayTone(rel.queue.delayedPct),
          },
        ]
      : []),
  ]
  const reliabilitySection: ExportSection = {
    id: 'reliability',
    title: t('dashboard:reliability.title'),
    table: {
      columns: [
        t('dashboard:reliability.col.client'),
        t('dashboard:reliability.col.failureDays'),
        t('dashboard:reliability.col.failedJobs'),
        t('dashboard:reliability.col.lastSuccess'),
        t('dashboard:reliability.col.successRate'),
      ],
      rows: rel.repeatFailures.items.map((c) => [
        c.host,
        fmtInt(c.failureDays, locale),
        fmtInt(c.failedJobs, locale),
        c.daysSinceSuccess === undefined
          ? t('dashboard:reliability.noSuccess')
          : fmtInt(c.daysSinceSuccess, locale),
        c.successRatePct === undefined ? '–' : fmtPct(c.successRatePct / 100, locale),
      ]),
      caption: relWindow
        ? t('dashboard:reliability.caption', {
            shown: rel.repeatFailures.shown,
            total: relFlagged,
            start: relWindow.start,
            end: relWindow.end,
          })
        : undefined,
    },
    deck: relHasData
      ? {
          subtitle: t('dashboard:reliability.takeaway', { count: fmtInt(relFlagged, locale) }),
          kpiChips: relChips,
          bars:
            rel.runtimeTotal > 0
              ? toBars(
                  RUNTIME_BUCKET_IDS.map((id) => ({
                    label: t(`dashboard:reliability.bucket.${id}`),
                    magnitude: rel.runtime[id],
                    value: fmtInt(rel.runtime[id], locale),
                    tone:
                      id === 'gt8h' && rel.runtime[id] > 0
                        ? ('bad' as const)
                        : id === 'h4to8' && rel.runtime[id] > 0
                          ? ('warn' as const)
                          : ('muted' as const),
                  })),
                  pal,
                )
              : [],
        }
      : undefined,
  }
```

Notes for the implementer: `fmtPct` — use the file's existing percentage formatter (grep for how `successPct` is formatted in the jobs section and reuse that exact helper). If there is none, format as `fmtNum(rel.queue.delayedPct * 100, locale, 1) + ' %'` matching the jobs section's convention.

Register it in the `byId` record:

```ts
    reliability: withCaveat(reliabilitySection, 'reliability', view, t),
```

The existing `isRenderable` filter suppresses the section automatically when the table is empty and `deck` is undefined (PPDM / empty grids).

- [ ] **Step 5: Run tests + gate + commit**

Run: `npx vitest run src/engines/export`
Expected: PASS.

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -u && git commit -m "feat(reliability): export section — repeat failures, runtime bars, queue chip"
```

---

### Task 9: Dashboard section

**Files:**
- Create: `src/components/dashboard/ReliabilitySection.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`
- Test: `src/components/dashboard/sections.test.tsx` (append)

**Interfaces:**
- Consumes: `view.reliability`, i18n `dashboard:reliability.*` keys, `fmtInt` from `../../utils/format`.

- [ ] **Step 1: Write the failing test** (append to `sections.test.tsx`, using its existing `makeView` helper and render harness)

```ts
import { ReliabilitySection } from './ReliabilitySection'

describe('ReliabilitySection', () => {
  it('renders the repeat-failure table', () => {
    const view = makeView({
      reliability: {
        repeatFailures: {
          items: [{ host: 'bad-client', failureDays: 4, failedJobs: 9, daysSinceSuccess: 2 }],
          total: 1,
          shown: 1,
        },
        runtime: { le15m: 0, m15to30: 0, m30to60: 0, h1to2: 0, h2to4: 0, h4to8: 0, gt8h: 0 },
        runtimeTotal: 0,
        windowStart: '2026-06-01',
        windowEnd: '2026-06-30',
        capped: false,
      },
    })
    render(<ReliabilitySection view={view} />)
    expect(screen.getByText('bad-client')).toBeTruthy()
  })

  it('renders nothing when there are no repeat failures', () => {
    const view = makeView({ reliability: emptyReliability() })
    const { container } = render(<ReliabilitySection view={view} />)
    expect(container.innerHTML).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/dashboard/sections.test.tsx`
Expected: FAIL — cannot resolve `./ReliabilitySection`.

- [ ] **Step 3: Implement the component** (mirrors `AtRiskSection.tsx` structure and classes)

Create `src/components/dashboard/ReliabilitySection.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function ReliabilitySection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const rel = view.reliability
  if (rel.repeatFailures.total === 0) return null

  return (
    <section aria-label={t('reliability.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('reliability.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('reliability.takeaway', { count: fmtInt(rel.repeatFailures.total, locale) })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.client')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.failureDays')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.failedJobs')}</th>
              <th className="pb-2 pr-4 font-medium">{t('reliability.col.lastSuccess')}</th>
              <th className="pb-2 font-medium">{t('reliability.col.successRate')}</th>
            </tr>
          </thead>
          <tbody>
            {rel.repeatFailures.items.map((c) => (
              <tr
                key={c.host}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{c.host}</td>
                <td className="py-1.5 pr-4">{fmtInt(c.failureDays, locale)}</td>
                <td className="py-1.5 pr-4">{fmtInt(c.failedJobs, locale)}</td>
                <td className="py-1.5 pr-4">
                  {c.daysSinceSuccess === undefined
                    ? t('reliability.noSuccess')
                    : fmtInt(c.daysSinceSuccess, locale)}
                </td>
                <td className="py-1.5">
                  {c.successRatePct === undefined ? '–' : `${fmtInt(c.successRatePct, locale)} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Wire into `Dashboard.tsx`**

Add `import { ReliabilitySection } from './ReliabilitySection'` and a switch case:

```tsx
      case 'reliability':
        return <ReliabilitySection key={id} view={view} />
```

- [ ] **Step 5: Run tests + gate + commit**

Run: `npx vitest run src/components/dashboard`
Expected: PASS.

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -A src/components/dashboard && git commit -m "feat(reliability): dashboard section"
```

---

### Task 10: Full gates, smoke test on real data, PR

- [ ] **Step 1: Full CI sequence locally**

```bash
npm run typecheck && ./node_modules/.bin/biome check . && npm run test:run && npm run build
```

Expected: all green (build runs the supply-chain gate via `prebuild`).

- [ ] **Step 2: Smoke test against the real JTI workbooks** (files live outside the repo; manual verification, not a committed test)

```bash
npm run pptx -- "/Users/fjacquet/Library/CloudStorage/OneDrive-Home/JTI/GERTRI01-AVN106.xlsx" --quiet
npm run pptx -- "/Users/fjacquet/Library/CloudStorage/OneDrive-Home/JTI/NetworkerNwt00-lab.xlsx" --quiet
```

Expected: both decks generate without error; the Avamar deck contains the Backup reliability section (GERTRI01 has real failures: 3 client-error + 2 timeout + 6 VM-init + 2 proxy failures in `Backup By Completion Status`). Known caveat: the pptx CLI crashes under Node 26 (pre-existing tsx/ESM issue) — if it does, run with an LTS Node (`nvm use 22` or similar) rather than debugging the CLI.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/reliability-insights
gh pr create --title "feat: reliability insights — repeat failures, runtime distribution, queue delay" --body "$(cat <<'EOF'
Implements family 1 of docs/superpowers/specs/2026-07-02-insight-families-design.md.

- New pure engine `engines/aggregation/reliability.ts`: repeat-failure clients (≥3 distinct failure-days), runtime histogram (7 Live Optics buckets, Avamar summary-sheet fallback), queue-delay share (>15 min).
- Avamar adapter (DPN Summary + Job List Detailed), NetWorker adapter (Jobs, backup job types only). PPDM: provenance-unavailable (follow-up).
- Estate merge, provenance key, tone thresholds, dashboard section, export section (HTML + PPTX), i18n ×4.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NQ81Tu7TrEmqyvSNcDNeBK
EOF
)"
```

---

## Follow-ups (explicitly NOT in this PR)

- PR 2: efficiency & retention profile (`efficiency.ts`).
- PR 3: capacity trend (`capacityTrend.ts` + line chart).
- PR 4: config hygiene (`hygiene.ts` + licenses).
- PPDM `ReliabilityJob` mapping from its activities data.
