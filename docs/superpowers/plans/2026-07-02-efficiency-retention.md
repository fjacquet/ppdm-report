# Efficiency & Retention Profile (PR 2 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the efficiency insight family — dedupe efficiency, daily change rate, retention profile, encryption coverage, and Avamar replication health — as a shared pure engine wired for Avamar + NetWorker, rendered in dashboard, HTML, and PPTX.

**Architecture:** One new pure aggregation module (`src/engines/aggregation/efficiency.ts`) with five independently-optional sub-metrics, each carried as raw sums / numerator-denominator pairs so merges fold exactly. Product adapters map sheets into the result; PPDM stays provenance-unavailable. One new `ExportSection` ('efficiency') plus an extension of the existing resilience section (replication health); one new dashboard component plus a JobsComplianceSection extension.

**Tech Stack:** TypeScript, Vitest, React 19, i18next (4 locales), Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-insight-families-design.md` (family 2, incl. metric 5 replication health added 2026-07-02).

## Global Constraints

- `engines/` are pure: no React, no DOM, no store imports, no nondeterminism.
- **Never coerce a missing cell to 0 in a numerator or denominator** (family-1 final-review lesson): guard every derived value with `cellStr(...) !== ''` or a `> 0` weight check before it enters a sum.
- Never ingest vendor-computed *rates*; raw sums only. The NetWorker `KPIs` retention-bucket capacities are raw sums (allowed); its "Clone Success Percentage" / growth percentages are rates (forbidden).
- Low-dedupe client threshold: weighted `% Common` < **50** with ≥ **1 GiB** processed. Change-rate amber threshold: > **10%**/day. Replication-issue tone: any failed+partial → warn, failed+partial share ≥ **5%** → bad.
- Units: Avamar values are GiB base-2 (`meta.baseTen === false` drives formatting); NetWorker KPI retention values are TB base-10 → store ×1000 as GB. Per-product sections never mix bases.
- All new UI/export strings in **all four locales**; `keyParity` enforces.
- Biome: single quotes, no semicolons, 2-space indent, 100-col width. Authoritative lint: `./node_modules/.bin/biome check .` (NOT `npm run lint` — RTK hook false-fails).
- Tests use `makeWorkbook` synthetic fixtures; `makeWorkbook({})` THROWS (needs ≥1 sheet) — use a minimal `Details`-only workbook for absent-sheet cases. Never read `ref/`.
- Gates per task: `npm run typecheck`, `./node_modules/.bin/biome check .`, targeted `npx vitest run`; full `npm run test:run` + `npm run build` where the task says so. Commit after every green task.
- Real-data facts the code must survive: Avamar `Encrypted`/`Compressed` columns exist as headers but are **blank in every JTI row** (→ encryption must come back `undefined`, not 0%); the NetWorker lab's `Dedup Jobs` contains garbage rows (ratio 0.195, capacity 4e-7 GB) that the `> 0` guards must tolerate; numeric xlsx headers (30, 60, …) arrive as string keys (`'30'`) via `readWorkbook`'s `String(h).trim()`.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch from current main**

```bash
git checkout main && git pull && git checkout -b feat/efficiency-retention
```

---

### Task 1: Efficiency engine — types + compute helpers

**Files:**
- Create: `src/engines/aggregation/efficiency.ts`
- Test: `src/engines/aggregation/efficiency.test.ts`

**Interfaces (later tasks rely on these exact names):**
- `interface WeightedRatio { num: number; den: number }`
- `interface DedupeSample { host: string; commonPct: number; weightBytes: number }`
- `interface LowDedupeClient { host: string; commonPct: number; processedGb: number }`
- `interface Dedupe { common?: WeightedRatio; lowDedupe: TopList<LowDedupeClient>; global?: { logicalGb: number; usedGb: number }; jobRatio?: WeightedRatio }`
- `interface ChangeRate { sentBytes: number; processedBytes: number }`
- `RETENTION_BUCKET_IDS = ['r30','r60','r180','r1y','r7y','r7yPlus'] as const`, `type RetentionBucketId`
- `interface RetentionPolicyRow { type: string; gbByBucket: Record<RetentionBucketId, number> }`
- `interface RetentionProfile { totalGbByBucket: Record<RetentionBucketId, number>; perPolicyType: RetentionPolicyRow[] }`
- `interface EncryptionCoverage { encryptedJobs: number; totalJobs: number; encryptedGb: number; totalGb: number }`
- `REPLICATION_OUTCOME_IDS = ['success','exceptions','partial','cancelled','failed'] as const`, `type ReplicationOutcomeId`
- `interface ReplicationHealth { counts: Record<ReplicationOutcomeId, number>; total: number }`
- `interface Efficiency { dedupe?: Dedupe; changeRate?: ChangeRate; retention?: RetentionProfile; encryption?: EncryptionCoverage; replicationHealth?: ReplicationHealth }`
- `emptyEfficiency(): Efficiency` (returns `{}`), `emptyRetentionBuckets(): Record<RetentionBucketId, number>`
- `computeDedupeCommon(samples: DedupeSample[]): { common?: WeightedRatio; lowDedupe: TopList<LowDedupeClient> }`
- `classifyReplicationStatus(status: string): ReplicationOutcomeId`
- `computeReplicationHealth(rows: { status: string; count: number }[]): ReplicationHealth | undefined`

- [ ] **Step 1: Write the failing test**

Create `src/engines/aggregation/efficiency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  classifyReplicationStatus,
  computeDedupeCommon,
  computeReplicationHealth,
  emptyEfficiency,
} from './efficiency'

const GIB = 2 ** 30

describe('computeDedupeCommon', () => {
  it('weights % Common by bytes processed and flags low-dedupe clients', () => {
    const r = computeDedupeCommon([
      { host: 'good', commonPct: 100, weightBytes: 9 * GIB },
      { host: 'poor', commonPct: 20, weightBytes: 1 * GIB },
    ])
    // (100×9 + 20×1) / 10 = 92
    expect(r.common && r.common.num / r.common.den).toBeCloseTo(92, 6)
    expect(r.lowDedupe.items).toEqual([{ host: 'poor', commonPct: 20, processedGb: 1 }])
  })

  it('a client below 1 GiB processed is never flagged (noise floor)', () => {
    const r = computeDedupeCommon([{ host: 'tiny', commonPct: 0, weightBytes: GIB / 2 }])
    expect(r.lowDedupe.total).toBe(0)
  })

  it('zero/absent weights never enter the sums; empty input yields no ratio', () => {
    const r = computeDedupeCommon([{ host: 'x', commonPct: 50, weightBytes: 0 }])
    expect(r.common).toBeUndefined()
    expect(computeDedupeCommon([]).common).toBeUndefined()
  })

  it('a client aggregates across its own samples before the low-dedupe check', () => {
    const r = computeDedupeCommon([
      { host: 'mixed', commonPct: 0, weightBytes: 1 * GIB },
      { host: 'mixed', commonPct: 100, weightBytes: 3 * GIB },
    ])
    // weighted 75% ≥ 50 → not flagged
    expect(r.lowDedupe.total).toBe(0)
  })
})

describe('replication health', () => {
  it('classifies the observed Avamar status strings', () => {
    expect(classifyReplicationStatus('Activity completed successfully.')).toBe('success')
    expect(classifyReplicationStatus('Activity completed with exceptions.')).toBe('exceptions')
    expect(classifyReplicationStatus('Partially completed replication activity.')).toBe('partial')
    expect(classifyReplicationStatus('Activity cancelled.')).toBe('cancelled')
    expect(classifyReplicationStatus('Activity failed - client error(s).')).toBe('failed')
    expect(classifyReplicationStatus('Activity failed - timed out before starting.')).toBe('failed')
  })

  it('sums counts per outcome; undefined on empty input', () => {
    const h = computeReplicationHealth([
      { status: 'Activity completed successfully.', count: 24738 },
      { status: 'Activity completed with exceptions.', count: 1438 },
      { status: 'Partially completed replication activity.', count: 164 },
      { status: 'Activity cancelled.', count: 35 },
      { status: 'Activity failed - client error(s).', count: 15 },
    ])
    expect(h?.counts).toEqual({
      success: 24738,
      exceptions: 1438,
      partial: 164,
      cancelled: 35,
      failed: 15,
    })
    expect(h?.total).toBe(26390)
    expect(computeReplicationHealth([])).toBeUndefined()
  })
})

describe('emptyEfficiency', () => {
  it('has no sub-metric', () => {
    expect(emptyEfficiency()).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engines/aggregation/efficiency.test.ts`
Expected: FAIL — cannot resolve `./efficiency`.

- [ ] **Step 3: Write the implementation**

Create `src/engines/aggregation/efficiency.ts`:

```ts
import { TOP_N_DEFAULT } from '../../types/ppdm'
import type { TopList } from '../../types/reportView'
import { topN } from './topN'

/** Numerator/denominator carried explicitly so estate merges fold exactly (never average averages). */
export interface WeightedRatio {
  num: number
  den: number
}

/** One dedupe observation: % Common (0..100) weighted by bytes processed. */
export interface DedupeSample {
  host: string
  commonPct: number
  weightBytes: number
}

export interface LowDedupeClient {
  host: string
  commonPct: number
  /** GiB processed in the window (weight, base-2). */
  processedGb: number
}

export interface Dedupe {
  /** Capacity-weighted % Common: num = Σ(pct×weight), den = Σweight. Avamar. */
  common?: WeightedRatio
  lowDedupe: TopList<LowDedupeClient>
  /** Data Domain logical vs physical used capacity (GB). NetWorker. */
  global?: { logicalGb: number; usedGb: number }
  /** Job-level data-reduction ratio weighted by capacity. NetWorker. */
  jobRatio?: WeightedRatio
}

/** Raw byte sums; the daily-change percentage is derived at render (sent / processed). */
export interface ChangeRate {
  sentBytes: number
  processedBytes: number
}

export const RETENTION_BUCKET_IDS = ['r30', 'r60', 'r180', 'r1y', 'r7y', 'r7yPlus'] as const
export type RetentionBucketId = (typeof RETENTION_BUCKET_IDS)[number]

export interface RetentionPolicyRow {
  type: string
  gbByBucket: Record<RetentionBucketId, number>
}

export interface RetentionProfile {
  totalGbByBucket: Record<RetentionBucketId, number>
  /** Per-policy-type split (Avamar); empty when the product only exposes totals. */
  perPolicyType: RetentionPolicyRow[]
}

export interface EncryptionCoverage {
  encryptedJobs: number
  totalJobs: number
  encryptedGb: number
  totalGb: number
}

export const REPLICATION_OUTCOME_IDS = [
  'success',
  'exceptions',
  'partial',
  'cancelled',
  'failed',
] as const
export type ReplicationOutcomeId = (typeof REPLICATION_OUTCOME_IDS)[number]

export interface ReplicationHealth {
  counts: Record<ReplicationOutcomeId, number>
  total: number
}

/** All sub-metrics optional; absent = not computable for that product/workbook. */
export interface Efficiency {
  dedupe?: Dedupe
  changeRate?: ChangeRate
  retention?: RetentionProfile
  encryption?: EncryptionCoverage
  replicationHealth?: ReplicationHealth
}

export function emptyEfficiency(): Efficiency {
  return {}
}

export function emptyRetentionBuckets(): Record<RetentionBucketId, number> {
  return { r30: 0, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 }
}

/** Flag clients whose weighted % Common falls below this. */
const LOW_DEDUPE_PCT = 50
/** Ignore clients with less than 1 GiB processed — % Common is noise at that size. */
const LOW_DEDUPE_MIN_BYTES = 2 ** 30

/** Capacity-weighted dedupe commonality + low-dedupe client list. Pure. */
export function computeDedupeCommon(samples: DedupeSample[]): {
  common?: WeightedRatio
  lowDedupe: TopList<LowDedupeClient>
} {
  let num = 0
  let den = 0
  const byHost = new Map<string, WeightedRatio>()
  for (const s of samples) {
    if (s.weightBytes <= 0) continue
    num += s.commonPct * s.weightBytes
    den += s.weightBytes
    if (!s.host) continue
    const h = byHost.get(s.host) ?? { num: 0, den: 0 }
    h.num += s.commonPct * s.weightBytes
    h.den += s.weightBytes
    byHost.set(s.host, h)
  }
  const low: LowDedupeClient[] = [...byHost.entries()]
    .filter(([, r]) => r.den >= LOW_DEDUPE_MIN_BYTES && r.num / r.den < LOW_DEDUPE_PCT)
    .map(([host, r]) => ({
      host,
      commonPct: r.num / r.den,
      processedGb: r.den / 2 ** 30,
    }))
  return {
    common: den > 0 ? { num, den } : undefined,
    // lowest commonality first (most interesting offenders)
    lowDedupe: topN(low, TOP_N_DEFAULT, (c) => -c.commonPct),
  }
}

/** Map an Avamar replication activity status onto a stable outcome bucket. */
export function classifyReplicationStatus(status: string): ReplicationOutcomeId {
  const s = status.toLowerCase()
  if (s === 'activity completed successfully.') return 'success'
  if (s.includes('exception')) return 'exceptions'
  if (s.startsWith('partially completed')) return 'partial'
  if (s.includes('cancel')) return 'cancelled'
  return 'failed'
}

/** Sum status counts per outcome. Undefined when there are no rows. Pure. */
export function computeReplicationHealth(
  rows: { status: string; count: number }[],
): ReplicationHealth | undefined {
  if (rows.length === 0) return undefined
  const counts: Record<ReplicationOutcomeId, number> = {
    success: 0,
    exceptions: 0,
    partial: 0,
    cancelled: 0,
    failed: 0,
  }
  let total = 0
  for (const r of rows) {
    if (r.count <= 0) continue
    counts[classifyReplicationStatus(r.status)] += r.count
    total += r.count
  }
  return { counts, total }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engines/aggregation/efficiency.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Gate + commit**

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add src/engines/aggregation/efficiency.ts src/engines/aggregation/efficiency.test.ts
git commit -m "feat(efficiency): pure efficiency engine — dedupe commonality, replication health"
```

---

### Task 2: `mergeEfficiency`

**Files:**
- Modify: `src/engines/aggregation/efficiency.ts` (append)
- Test: `src/engines/aggregation/efficiency.test.ts` (append)

**Interfaces:**
- Produces: `mergeEfficiency(list: Efficiency[]): Efficiency` — identity (same reference) on a single element; per-sub-metric fold where a sub-metric merges only across the servers that HAVE it and stays `undefined` when no server has it.

- [ ] **Step 1: Write the failing tests** (append; extend the existing import from './efficiency' with `mergeEfficiency` and the needed types)

```ts
describe('mergeEfficiency', () => {
  it('is identity on a single element', () => {
    const one = { changeRate: { sentBytes: 1, processedBytes: 10 } }
    expect(mergeEfficiency([one])).toBe(one)
  })

  it('folds each sub-metric across the servers that have it', () => {
    const a: Efficiency = {
      dedupe: {
        common: { num: 900, den: 10 },
        lowDedupe: { items: [{ host: 'x', commonPct: 20, processedGb: 2 }], total: 1, shown: 1 },
      },
      changeRate: { sentBytes: 5, processedBytes: 100 },
      retention: {
        totalGbByBucket: { r30: 10, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
        perPolicyType: [
          { type: 'SQL', gbByBucket: { r30: 10, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 } },
        ],
      },
      replicationHealth: {
        counts: { success: 10, exceptions: 1, partial: 0, cancelled: 0, failed: 1 },
        total: 12,
      },
    }
    const b: Efficiency = {
      dedupe: {
        common: { num: 100, den: 10 },
        lowDedupe: { items: [{ host: 'y', commonPct: 40, processedGb: 5 }], total: 1, shown: 1 },
        global: { logicalGb: 1000, usedGb: 100 },
      },
      retention: {
        totalGbByBucket: { r30: 5, r60: 5, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
        perPolicyType: [],
      },
    }
    const m = mergeEfficiency([a, b])
    expect(m.dedupe?.common).toEqual({ num: 1000, den: 20 })
    expect(m.dedupe?.global).toEqual({ logicalGb: 1000, usedGb: 100 })
    expect(m.dedupe?.lowDedupe.total).toBe(2)
    expect(m.dedupe?.lowDedupe.items[0]?.host).toBe('x') // lowest commonality first
    expect(m.changeRate).toEqual({ sentBytes: 5, processedBytes: 100 }) // only a had it
    expect(m.retention?.totalGbByBucket).toEqual({ r30: 15, r60: 5, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 })
    expect(m.retention?.perPolicyType).toHaveLength(1)
    expect(m.replicationHealth?.total).toBe(12)
    expect(m.encryption).toBeUndefined() // no server had it
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail, then implement** (append to `efficiency.ts`)

```ts
function addRatio(a: WeightedRatio | undefined, b: WeightedRatio | undefined): WeightedRatio | undefined {
  if (!a) return b
  if (!b) return a
  return { num: a.num + b.num, den: a.den + b.den }
}

/** Fold per-server Efficiency into one. Identity on a single element. Pure. */
export function mergeEfficiency(list: Efficiency[]): Efficiency {
  const first = list[0]
  if (!first) return emptyEfficiency()
  if (list.length === 1) return first

  const out: Efficiency = {}

  const dedupes = list.map((e) => e.dedupe).filter((d): d is Dedupe => d !== undefined)
  if (dedupes.length > 0) {
    const lowItems = dedupes.flatMap((d) => d.lowDedupe.items)
    const lowTotal = dedupes.reduce((a, d) => a + d.lowDedupe.total, 0)
    const capped = topN(lowItems, TOP_N_DEFAULT, (c) => -c.commonPct)
    const globals = dedupes.map((d) => d.global).filter((g): g is NonNullable<Dedupe['global']> => g !== undefined)
    out.dedupe = {
      common: dedupes.reduce<WeightedRatio | undefined>((a, d) => addRatio(a, d.common), undefined),
      lowDedupe: { items: capped.items, total: lowTotal, shown: capped.items.length },
      global:
        globals.length > 0
          ? {
              logicalGb: globals.reduce((a, g) => a + g.logicalGb, 0),
              usedGb: globals.reduce((a, g) => a + g.usedGb, 0),
            }
          : undefined,
      jobRatio: dedupes.reduce<WeightedRatio | undefined>((a, d) => addRatio(a, d.jobRatio), undefined),
    }
  }

  const rates = list.map((e) => e.changeRate).filter((c): c is ChangeRate => c !== undefined)
  if (rates.length > 0) {
    out.changeRate = {
      sentBytes: rates.reduce((a, c) => a + c.sentBytes, 0),
      processedBytes: rates.reduce((a, c) => a + c.processedBytes, 0),
    }
  }

  const rets = list.map((e) => e.retention).filter((r): r is RetentionProfile => r !== undefined)
  if (rets.length > 0) {
    const total = emptyRetentionBuckets()
    for (const r of rets) for (const id of RETENTION_BUCKET_IDS) total[id] += r.totalGbByBucket[id]
    out.retention = { totalGbByBucket: total, perPolicyType: rets.flatMap((r) => r.perPolicyType) }
  }

  const encs = list.map((e) => e.encryption).filter((e): e is EncryptionCoverage => e !== undefined)
  if (encs.length > 0) {
    out.encryption = {
      encryptedJobs: encs.reduce((a, e) => a + e.encryptedJobs, 0),
      totalJobs: encs.reduce((a, e) => a + e.totalJobs, 0),
      encryptedGb: encs.reduce((a, e) => a + e.encryptedGb, 0),
      totalGb: encs.reduce((a, e) => a + e.totalGb, 0),
    }
  }

  const reps = list.map((e) => e.replicationHealth).filter((r): r is ReplicationHealth => r !== undefined)
  if (reps.length > 0) {
    const counts: Record<ReplicationOutcomeId, number> = {
      success: 0,
      exceptions: 0,
      partial: 0,
      cancelled: 0,
      failed: 0,
    }
    for (const r of reps) for (const id of REPLICATION_OUTCOME_IDS) counts[id] += r.counts[id]
    out.replicationHealth = { counts, total: reps.reduce((a, r) => a + r.total, 0) }
  }

  return out
}
```

- [ ] **Step 3: Run tests, gate, commit**

Run: `npx vitest run src/engines/aggregation/efficiency.test.ts` — Expected: PASS (9 tests).

```bash
npm run typecheck && ./node_modules/.bin/biome check .
git add -u && git commit -m "feat(efficiency): mergeEfficiency estate fold"
```

---

### Task 3: Wire `Efficiency` into `ReportView`, provenance, `mergeViews`

**Files:**
- Modify: `src/types/reportView.ts`, `src/engines/aggregation/provenance.ts`, `src/engines/aggregation/mergeViews.ts`
- Modify (compiler-driven): `src/engines/products/ppdm/buildPpdmView.ts`, `src/engines/aggregation/summaryView.ts`, every test fixture constructing a full `ReportView`

**Interfaces:**
- `MetricKey` gains `'efficiency'`; `ReportView` gains non-optional `efficiency: Efficiency` (after `reliability`).
- Provenance factories: follow the family-1 precedent EXACTLY — `avamarProvenance(reliabilityAvailable: boolean)` gains a second param `efficiencyAvailable: boolean`; `networkerProvenance(assetsTotal, reliabilityAvailable)` gains a third `efficiencyAvailable: boolean`. `allAvailable`/`allUnavailable` (PPDM) hard-code unavailable with the comment `// PPDM efficiency wiring is a follow-up — unavailable for now.`
- `mergeViews`: `efficiency: mergeEfficiency(views.map((v) => v.efficiency))` in the returned object AND `'efficiency'` in `mergeProvenance`'s `keys` array.

- [ ] **Step 1: Make the type/provenance/merge edits above.** Read `provenance.ts` first — family 1 (PR #22) already parameterized the reliability entries; mirror that shape for efficiency.
- [ ] **Step 2: Run `npm run typecheck` and fix every complaint** by adding `efficiency: emptyEfficiency(),` (view literals) / an unavailable provenance entry (provenance literals) / the new factory argument (factory call sites — Avamar/NetWorker builders pass `false` for now; Tasks 4–5 flip them to computed booleans).
- [ ] **Step 3: Run the affected suites + full suite**

Run: `npm run typecheck && npx vitest run src/engines/aggregation src/components/dashboard && npm run test:run`
Expected: all PASS (merge identity/parity tests exercise the new field automatically).

- [ ] **Step 4: Gate + commit**

```bash
./node_modules/.bin/biome check .
git add -u && git commit -m "feat(efficiency): ReportView.efficiency + provenance key + estate merge"
```

---

### Task 4: Avamar adapter

**Files:**
- Create: `src/engines/products/avamar/efficiency.ts`
- Modify: `src/engines/products/avamar/buildAvamarView.ts`
- Test: `src/engines/products/avamar/efficiency.test.ts`

**Interfaces:**
- Produces: `avamarEfficiency(wb: RawWorkbook): Efficiency`. `buildAvamarView` sets `efficiency: avamarEfficiency(wb)` and passes `efficiencyAvailable` = "the returned object has ≥1 defined sub-metric" (e.g. `Object.values(eff).some((v) => v !== undefined)` computed once).

- [ ] **Step 1: Write the failing test**

Create `src/engines/products/avamar/efficiency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarEfficiency } from './efficiency'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

const GIB = 2 ** 30

describe('avamarEfficiency', () => {
  it('derives dedupe + change rate from DPN Summary backup rows only', () => {
    const e = avamarEfficiency(
      wb({
        'Avamar DPN Summary': [
          ['Host', 'Operation', '% Common', 'Bytes Processed', 'Bytes Mod And Sent'],
          ['h1', 'Scheduled Backup', 100, 9 * GIB, GIB],
          ['h2', 'On-Demand Backup', 20, 1 * GIB, GIB / 2],
          ['h3', 'Restore', 0, 100 * GIB, 100 * GIB], // non-backup — excluded
        ],
      }),
    )
    expect(e.dedupe?.common && e.dedupe.common.num / e.dedupe.common.den).toBeCloseTo(92, 6)
    expect(e.dedupe?.lowDedupe.items[0]?.host).toBe('h2')
    expect(e.changeRate).toEqual({ sentBytes: 1.5 * GIB, processedBytes: 10 * GIB })
  })

  it('maps Policy Capacity-Retention columns (numeric headers arrive as string keys)', () => {
    const e = avamarEfficiency(
      wb({
        'Policy Capacity-Retention': [
          ['Policy Type', 30, 60, 180, 360, '< 7yr', '> 7yr'],
          ['Windows SQL', 1039.53, 21.26, 0, 0, 0, 0],
          ['Hyper-V', 2212.05, 280.24, 0, 0, 0, 0],
        ],
      }),
    )
    expect(e.retention?.totalGbByBucket.r30).toBeCloseTo(3251.58, 2)
    expect(e.retention?.totalGbByBucket.r60).toBeCloseTo(301.5, 2)
    expect(e.retention?.perPolicyType).toHaveLength(2)
    expect(e.retention?.perPolicyType[0]?.type).toBe('Windows SQL')
  })

  it('encryption is undefined when the Encrypted column is blank everywhere (JTI reality)', () => {
    const e = avamarEfficiency(
      wb({
        'Job List Detailed': [
          ['Host', 'Job Type', 'Capacity (GiB)', 'Encrypted'],
          ['h1', 'Backup', 10, ''],
          ['h2', 'Backup', 20, ''],
        ],
      }),
    )
    expect(e.encryption).toBeUndefined()
  })

  it('computes encryption coverage when values are present', () => {
    const e = avamarEfficiency(
      wb({
        'Job List Detailed': [
          ['Host', 'Job Type', 'Capacity (GiB)', 'Encrypted'],
          ['h1', 'Backup', 10, 'true'],
          ['h2', 'Backup', 30, 'false'],
          ['h3', 'GC', 99, 'true'], // non-backup — excluded
        ],
      }),
    )
    expect(e.encryption).toEqual({ encryptedJobs: 1, totalJobs: 2, encryptedGb: 10, totalGb: 40 })
  })

  it('replication health from the completion-status sheet', () => {
    const e = avamarEfficiency(
      wb({
        'Replication (Completion Status)': [
          ['Status', 'Total'],
          ['Activity completed successfully.', 904611],
          ['Activity failed - client error(s).', 1111],
          ['Partially completed replication activity.', 7097],
        ],
      }),
    )
    expect(e.replicationHealth?.counts.failed).toBe(1111)
    expect(e.replicationHealth?.counts.partial).toBe(7097)
    expect(e.replicationHealth?.total).toBe(912819)
  })

  it('a workbook with none of the source sheets yields an empty Efficiency', () => {
    const e = avamarEfficiency(wb({ Details: [['Project Name', 'x']] }))
    expect(Object.values(e).every((v) => v === undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement**

Create `src/engines/products/avamar/efficiency.ts`:

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import {
  computeDedupeCommon,
  computeReplicationHealth,
  type DedupeSample,
  type Efficiency,
  emptyRetentionBuckets,
  type RetentionBucketId,
  type RetentionPolicyRow,
} from '../../aggregation/efficiency'
import { cellNum, cellStr } from '../../aggregation/rows'
import { BACKUP_OPS } from './jobs'

/** Numeric xlsx headers (30, 60, …) arrive as string keys via readWorkbook's String(h).trim(). */
const RETENTION_COLUMNS: [string, RetentionBucketId][] = [
  ['30', 'r30'],
  ['60', 'r60'],
  ['180', 'r180'],
  ['360', 'r1y'],
  ['< 7yr', 'r7y'],
  ['> 7yr', 'r7yPlus'],
]

const ENCRYPTED_TRUE = /^(true|yes|1)$/i

/** Avamar efficiency: dedupe %Common + change rate (DPN Summary), retention profile
 * (Policy Capacity-Retention, GiB base-2), presence-gated encryption coverage
 * (Job List Detailed), replication health (Replication Completion Status). Pure. */
export function avamarEfficiency(wb: RawWorkbook): Efficiency {
  const out: Efficiency = {}

  // dedupe + change rate — backup operations only; blank cells never enter sums.
  const dpn = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  const samples: DedupeSample[] = []
  let sentBytes = 0
  let processedBytes = 0
  let sawProcessed = false
  for (const r of dpn) {
    const processed = cellStr(r, 'Bytes Processed') !== '' ? cellNum(r, 'Bytes Processed') : undefined
    if (processed === undefined) continue
    sawProcessed = true
    processedBytes += processed
    if (cellStr(r, 'Bytes Mod And Sent') !== '') sentBytes += cellNum(r, 'Bytes Mod And Sent')
    if (cellStr(r, '% Common') !== '') {
      samples.push({ host: cellStr(r, 'Host'), commonPct: cellNum(r, '% Common'), weightBytes: processed })
    }
  }
  if (samples.length > 0) {
    const { common, lowDedupe } = computeDedupeCommon(samples)
    out.dedupe = { common, lowDedupe }
  }
  if (sawProcessed && processedBytes > 0) out.changeRate = { sentBytes, processedBytes }

  // retention profile — GiB values straight off the sheet (base-2 formatting downstream).
  const retRows = wb.sheets['Policy Capacity-Retention']?.rows ?? []
  if (retRows.length > 0) {
    const total = emptyRetentionBuckets()
    const perPolicyType: RetentionPolicyRow[] = []
    for (const r of retRows) {
      const type = cellStr(r, 'Policy Type')
      if (!type) continue
      const gbByBucket = emptyRetentionBuckets()
      for (const [col, id] of RETENTION_COLUMNS) {
        if (cellStr(r, col) !== '') gbByBucket[id] = cellNum(r, col)
        total[id] += gbByBucket[id]
      }
      perPolicyType.push({ type, gbByBucket })
    }
    if (perPolicyType.length > 0) out.retention = { totalGbByBucket: total, perPolicyType }
  }

  // encryption — presence-gated: rows with a blank Encrypted cell carry no signal.
  const jl = (wb.sheets['Job List Detailed']?.rows ?? []).filter(
    (r) => cellStr(r, 'Job Type') === 'Backup' && cellStr(r, 'Encrypted') !== '',
  )
  if (jl.length > 0) {
    let encryptedJobs = 0
    let encryptedGb = 0
    let totalGb = 0
    for (const r of jl) {
      const gb = cellNum(r, 'Capacity (GiB)')
      totalGb += gb
      if (ENCRYPTED_TRUE.test(cellStr(r, 'Encrypted'))) {
        encryptedJobs++
        encryptedGb += gb
      }
    }
    out.encryption = { encryptedJobs, totalJobs: jl.length, encryptedGb, totalGb }
  }

  // replication health — aggregate status counts (raw sums, allowed).
  const rep = (wb.sheets['Replication (Completion Status)']?.rows ?? [])
    .map((r) => ({ status: cellStr(r, 'Status'), count: cellNum(r, 'Total') }))
    .filter((r) => r.status !== '')
  out.replicationHealth = computeReplicationHealth(rep)

  return out
}
```

- [ ] **Step 3: Wire into `buildAvamarView.ts`**: compute `const efficiency = avamarEfficiency(wb)` once; set `efficiency,` in the returned object; change the provenance call to pass `efficiencyAvailable: Object.values(efficiency).some((v) => v !== undefined)` as the new factory argument.

- [ ] **Step 4: Run tests + full suite + gate + commit**

Run: `npx vitest run src/engines/products/avamar && npm run test:run && npm run typecheck && ./node_modules/.bin/biome check .`

```bash
git add -A src/engines/products/avamar && git commit -m "feat(avamar): efficiency — dedupe, change rate, retention, encryption, replication health"
```

---

### Task 5: NetWorker adapter

**Files:**
- Create: `src/engines/products/networker/efficiency.ts`
- Modify: `src/engines/products/networker/buildNetworkerView.ts`
- Test: `src/engines/products/networker/efficiency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { networkerEfficiency } from './efficiency'

const wb = (sheets: Record<string, (string | number)[][]>) =>
  normalizeWorkbook(makeWorkbook(sheets))

describe('networkerEfficiency', () => {
  it('global dedupe from Data Domains logical vs used; job ratio weighted and garbage-guarded', () => {
    const e = networkerEfficiency(
      wb({
        'Data Domains': [
          ['Name', 'Used Capacity (GB)', 'Used Logical Capacity (GB)'],
          ['dd1', 555000, 13000000],
          ['dd2', '', ''], // blank — never enters sums
        ],
        'Dedup Jobs': [
          ['Hostname', 'Data Reduction Ratio', 'Capacity (GB)'],
          ['c1', 20, 100],
          ['c2', 10, 50],
          ['lab-garbage', 0.195, 0.000000408], // ratio ok but capacity ~0 → negligible weight
          ['bad', -3, 10], // non-positive ratio — skipped
        ],
      }),
    )
    expect(e.dedupe?.global).toEqual({ logicalGb: 13000000, usedGb: 555000 })
    // (20×100 + 10×50) / 150 ≈ 16.67 — garbage row's weight is ~0
    expect(e.dedupe?.jobRatio && e.dedupe.jobRatio.num / e.dedupe.jobRatio.den).toBeCloseTo(16.67, 1)
  })

  it('retention profile from KPI raw sums (TB → GB, base-10)', () => {
    const e = networkerEfficiency(
      wb({
        KPIs: [
          ['Metric', 'Value'],
          ['Total Capacity with Retention < 30 Days (TB)', 0],
          ['Total Capacity with Retention < 60 Days (TB)', 0.0294],
          ['Total Capacity with Retention < 180 Days (TB)', 0],
          ['Total Capacity with Retention < 365 Days (TB)', 0],
          ['Total Capacity with Retention < 7 Years (TB)', 0.0003],
          ['Total Capacity with Retention >= 7 Years (TB)', 0],
          ['Backup Success Percentage', 100], // a RATE — must be ignored
        ],
      }),
    )
    expect(e.retention?.totalGbByBucket.r60).toBeCloseTo(29.4, 3)
    expect(e.retention?.totalGbByBucket.r7y).toBeCloseTo(0.3, 3)
    expect(e.retention?.perPolicyType).toEqual([])
  })

  it('no sheets → empty Efficiency; encryption/changeRate/replicationHealth never set', () => {
    const e = networkerEfficiency(wb({ Details: [['Project Name', 'x']] }))
    expect(Object.values(e).every((v) => v === undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement**

Create `src/engines/products/networker/efficiency.ts`:

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import {
  type Efficiency,
  emptyRetentionBuckets,
  type RetentionBucketId,
  type WeightedRatio,
} from '../../aggregation/efficiency'
import { cellNum, cellStr } from '../../aggregation/rows'

/** KPI rows are raw capacity sums (allowed); every other KPI row is a vendor rate (ignored). */
const KPI_RETENTION_ROWS: [string, RetentionBucketId][] = [
  ['Total Capacity with Retention < 30 Days (TB)', 'r30'],
  ['Total Capacity with Retention < 60 Days (TB)', 'r60'],
  ['Total Capacity with Retention < 180 Days (TB)', 'r180'],
  ['Total Capacity with Retention < 365 Days (TB)', 'r1y'],
  ['Total Capacity with Retention < 7 Years (TB)', 'r7y'],
  ['Total Capacity with Retention >= 7 Years (TB)', 'r7yPlus'],
]

/** NetWorker efficiency: DD global dedupe + weighted job reduction ratio + KPI retention
 * profile (TB→GB base-10). Change rate / encryption / replication health are not
 * computable from NetWorker exports. Pure. */
export function networkerEfficiency(wb: RawWorkbook): Efficiency {
  const out: Efficiency = {}

  let logicalGb = 0
  let usedGb = 0
  let sawDd = false
  for (const r of wb.sheets['Data Domains']?.rows ?? []) {
    if (cellStr(r, 'Used Logical Capacity (GB)') === '' || cellStr(r, 'Used Capacity (GB)') === '')
      continue
    sawDd = true
    logicalGb += cellNum(r, 'Used Logical Capacity (GB)')
    usedGb += cellNum(r, 'Used Capacity (GB)')
  }

  let jobRatio: WeightedRatio | undefined
  for (const r of wb.sheets['Dedup Jobs']?.rows ?? []) {
    const ratio = cellNum(r, 'Data Reduction Ratio')
    const cap = cellNum(r, 'Capacity (GB)')
    if (ratio <= 0 || cap <= 0) continue
    jobRatio = jobRatio ?? { num: 0, den: 0 }
    jobRatio.num += ratio * cap
    jobRatio.den += cap
  }

  if (sawDd || jobRatio) {
    out.dedupe = {
      lowDedupe: { items: [], total: 0, shown: 0 },
      global: sawDd && usedGb > 0 ? { logicalGb, usedGb } : undefined,
      jobRatio,
    }
  }

  const kpis = wb.sheets.KPIs?.rows ?? []
  if (kpis.length > 0) {
    const byMetric = new Map(kpis.map((r) => [cellStr(r, 'Metric'), r]))
    const total = emptyRetentionBuckets()
    let saw = false
    for (const [metric, id] of KPI_RETENTION_ROWS) {
      const row = byMetric.get(metric)
      if (!row || cellStr(row, 'Value') === '') continue
      saw = true
      total[id] = cellNum(row, 'Value') * 1000 // TB → GB, base-10
    }
    if (saw) out.retention = { totalGbByBucket: total, perPolicyType: [] }
  }

  return out
}
```

- [ ] **Step 3: Wire into `buildNetworkerView.ts`** — same pattern as Task 4 (compute once, set field, pass `efficiencyAvailable` to `networkerProvenance`).

- [ ] **Step 4: Run tests + full suite + gate + commit**

```bash
npx vitest run src/engines/products/networker && npm run test:run && npm run typecheck && ./node_modules/.bin/biome check .
git add -A src/engines/products/networker && git commit -m "feat(networker): efficiency — DD dedupe ratios + KPI retention profile"
```

---

### Task 6: Tone thresholds

**Files:**
- Modify: `src/engines/export/thresholds.ts` + `thresholds.test.ts` (append-only)

- [ ] **Step 1: Failing tests**

```ts
describe('efficiency tones', () => {
  it('dedupe commonality (0..100): <50 warn, else ok', () => {
    expect(dedupeCommonTone(50)).toBe('ok')
    expect(dedupeCommonTone(49.9)).toBe('warn')
  })
  it('daily change rate (0..1): >0.10 warn, else ok', () => {
    expect(changeRateTone(0.1)).toBe('ok')
    expect(changeRateTone(0.11)).toBe('warn')
  })
  it('replication issues share (0..1): 0 ok, >0 warn, ≥0.05 bad', () => {
    expect(replicationIssueTone(0)).toBe('ok')
    expect(replicationIssueTone(0.01)).toBe('warn')
    expect(replicationIssueTone(0.05)).toBe('bad')
  })
})
```

- [ ] **Step 2: Implement** (append)

```ts
/** Capacity-weighted dedupe % Common, expressed 0..100. */
export function dedupeCommonTone(pct: number): ExportTone {
  return pct < 50 ? 'warn' : 'ok'
}

/** Daily change rate (bytes sent / bytes processed), expressed 0..1. */
export function changeRateTone(pct: number): ExportTone {
  return pct > 0.1 ? 'warn' : 'ok'
}

/** Share of replication activities that failed or only partially completed, 0..1. */
export function replicationIssueTone(pct: number): ExportTone {
  if (pct >= 0.05) return 'bad'
  if (pct > 0) return 'warn'
  return 'ok'
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/engines/export/thresholds.test.ts && npm run typecheck && ./node_modules/.bin/biome check .
git add -u && git commit -m "feat(efficiency): tone thresholds — dedupe, change rate, replication issues"
```

---

### Task 7: i18n keys (all four locales)

**Files:** `src/i18n/locales/{en,fr,de,it}/dashboard.json` — insert the `efficiency` block after `reliability`, and ADD the replication-health keys inside the existing `resilience` block, same position in all four files.

- [ ] **Step 1: Add the blocks.**

`en` — new `efficiency` block:

```json
"efficiency": {
  "title": "Storage efficiency",
  "takeaway": "{{dedupe}} average dedupe commonality",
  "takeawayNoDedupe": "Retention and efficiency profile",
  "dedupeChip": "Dedupe commonality",
  "globalChip": "Data reduction",
  "changeChip": "Daily change rate",
  "encryptionChip": "Encrypted capacity",
  "lowDedupe": {
    "caption": "Clients under 50% commonality — top {{shown}} of {{total}}",
    "col": { "client": "Client", "common": "Commonality", "processed": "Processed" }
  },
  "retention": {
    "title": "Capacity by retention",
    "col": { "type": "Policy type", "total": "Total" },
    "bucket": {
      "r30": "< 30 d",
      "r60": "< 60 d",
      "r180": "< 180 d",
      "r1y": "< 1 y",
      "r7y": "< 7 y",
      "r7yPlus": "≥ 7 y"
    }
  }
}
```

`en` — additions inside `resilience`:

```json
"replicationHealth": "Replication health",
"replicationIssues": "Failed or partial replications",
"replicationTakeaway": "{{issues}} of {{total}} replication activities failed or were partial",
"outcome": {
  "success": "Successful",
  "exceptions": "With exceptions",
  "partial": "Partial",
  "cancelled": "Cancelled",
  "failed": "Failed"
}
```

`fr`:

```json
"efficiency": {
  "title": "Efficacité du stockage",
  "takeaway": "{{dedupe}} de communalité de déduplication en moyenne",
  "takeawayNoDedupe": "Profil de rétention et d'efficacité",
  "dedupeChip": "Communalité dédup",
  "globalChip": "Réduction de données",
  "changeChip": "Taux de changement quotidien",
  "encryptionChip": "Capacité chiffrée",
  "lowDedupe": {
    "caption": "Clients sous 50 % de communalité — top {{shown}} sur {{total}}",
    "col": { "client": "Client", "common": "Communalité", "processed": "Traité" }
  },
  "retention": {
    "title": "Capacité par rétention",
    "col": { "type": "Type de politique", "total": "Total" },
    "bucket": { "r30": "< 30 j", "r60": "< 60 j", "r180": "< 180 j", "r1y": "< 1 an", "r7y": "< 7 ans", "r7yPlus": "≥ 7 ans" }
  }
}
```

fr `resilience` additions:

```json
"replicationHealth": "Santé de la réplication",
"replicationIssues": "Réplications échouées ou partielles",
"replicationTakeaway": "{{issues}} des {{total}} activités de réplication ont échoué ou sont partielles",
"outcome": { "success": "Réussies", "exceptions": "Avec exceptions", "partial": "Partielles", "cancelled": "Annulées", "failed": "Échouées" }
```

`de`:

```json
"efficiency": {
  "title": "Speichereffizienz",
  "takeaway": "{{dedupe}} durchschnittliche Dedup-Gemeinsamkeit",
  "takeawayNoDedupe": "Aufbewahrungs- und Effizienzprofil",
  "dedupeChip": "Dedup-Gemeinsamkeit",
  "globalChip": "Datenreduktion",
  "changeChip": "Tägliche Änderungsrate",
  "encryptionChip": "Verschlüsselte Kapazität",
  "lowDedupe": {
    "caption": "Clients unter 50 % Gemeinsamkeit — Top {{shown}} von {{total}}",
    "col": { "client": "Client", "common": "Gemeinsamkeit", "processed": "Verarbeitet" }
  },
  "retention": {
    "title": "Kapazität nach Aufbewahrung",
    "col": { "type": "Richtlinientyp", "total": "Gesamt" },
    "bucket": { "r30": "< 30 T", "r60": "< 60 T", "r180": "< 180 T", "r1y": "< 1 J", "r7y": "< 7 J", "r7yPlus": "≥ 7 J" }
  }
}
```

de `resilience` additions:

```json
"replicationHealth": "Replikationszustand",
"replicationIssues": "Fehlgeschlagene oder partielle Replikationen",
"replicationTakeaway": "{{issues}} von {{total}} Replikationsaktivitäten fehlgeschlagen oder partiell",
"outcome": { "success": "Erfolgreich", "exceptions": "Mit Ausnahmen", "partial": "Partiell", "cancelled": "Abgebrochen", "failed": "Fehlgeschlagen" }
```

`it`:

```json
"efficiency": {
  "title": "Efficienza dello storage",
  "takeaway": "{{dedupe}} di comunanza di deduplica media",
  "takeawayNoDedupe": "Profilo di conservazione ed efficienza",
  "dedupeChip": "Comunanza dedup",
  "globalChip": "Riduzione dei dati",
  "changeChip": "Tasso di variazione giornaliero",
  "encryptionChip": "Capacità cifrata",
  "lowDedupe": {
    "caption": "Client sotto il 50% di comunanza — primi {{shown}} di {{total}}",
    "col": { "client": "Client", "common": "Comunanza", "processed": "Elaborato" }
  },
  "retention": {
    "title": "Capacità per conservazione",
    "col": { "type": "Tipo di policy", "total": "Totale" },
    "bucket": { "r30": "< 30 g", "r60": "< 60 g", "r180": "< 180 g", "r1y": "< 1 anno", "r7y": "< 7 anni", "r7yPlus": "≥ 7 anni" }
  }
}
```

it `resilience` additions:

```json
"replicationHealth": "Salute della replica",
"replicationIssues": "Repliche non riuscite o parziali",
"replicationTakeaway": "{{issues}} su {{total}} attività di replica non riuscite o parziali",
"outcome": { "success": "Riuscite", "exceptions": "Con eccezioni", "partial": "Parziali", "cancelled": "Annullate", "failed": "Non riuscite" }
```

- [ ] **Step 2: Run parity + commit**

```bash
npx vitest run src/i18n/keyParity.test.ts && ./node_modules/.bin/biome check .
git add src/i18n && git commit -m "feat(efficiency): i18n strings en/fr/de/it"
```

---

### Task 8: Export — efficiency section + resilience extension

**Files:**
- Modify: `src/engines/export/sectionOrder.ts` (SectionId + both flavors)
- Modify: `src/engines/export/buildExportModel.ts`
- Test: `src/engines/export/buildExportModel.test.ts` (append)

**Required behavior** (adapt identifiers to the file's real helpers — `toBars`, `withCaveat`, `fmtInt`, `fmtNum`, `fmtPercent`, `pal`, `formatBytes`/`gbToBytes` with the view's `baseTen`):

1. `sectionOrder.ts`: add `'efficiency'` to the union; insert after `'capacity'` in the assessment order and after `'capacity'` in the ops order.
2. New `efficiencySection` (`id: 'efficiency'`), registered as `withCaveat(efficiencySection, 'efficiency', view, t)`:
   - KPI chips (each only when its sub-metric exists): dedupe commonality `fmtPercent(common.num/common.den/100)` toned by `dedupeCommonTone(common.num/common.den)`; NetWorker global reduction `×{fmtNum(logicalGb/usedGb, locale, 1)}` accent; change rate `fmtPercent(sentBytes/processedBytes)` toned by `changeRateTone`; encryption `fmtPercent(encryptedGb/totalGb)` accent.
   - Table: retention profile — one row per `perPolicyType` entry (type + 6 bucket cells via byte formatting with the view's base) + a totals row from `totalGbByBucket`; when `perPolicyType` is empty but totals exist, only the totals row. Table `undefined` when no retention.
   - Deck: subtitle `efficiency.takeaway` (or `takeawayNoDedupe` when no dedupe), chips as above, bars = the 6 retention buckets (`efficiency.retention.bucket.*` labels, magnitude = GB, muted/accent tones).
   - A second table is NOT added for low-dedupe clients in this task — fold the low-dedupe list into the SAME table? No: keep one section = one table (repo convention). Low-dedupe clients render as additional rows appended under the retention table is wrong — instead put the low-dedupe list in the table ONLY when retention is absent but lowDedupe has items. Decision (bind it): the section's table is retention when present; otherwise the low-dedupe client table (columns client/commonality/processed with `efficiency.lowDedupe.col.*`, caption `efficiency.lowDedupe.caption`). When both exist, retention wins the table and low-dedupe stays dashboard/ops detail (family-2 scope accepts this; the estate-level dedupe KPI carries the signal).
   - Section suppressed automatically (no chips, no table, no deck) when `view.efficiency` has no sub-metric (PPDM).
3. Resilience section extension (inside the existing `complianceSection` construction): when `view.efficiency.replicationHealth` is defined with `total > 0`, append to `deck.kpiChips` a chip `resilience.replicationIssues` = `fmtInt(failed+partial)` toned by `replicationIssueTone((failed+partial)/total)`, and add `deck.bars` for the five outcomes (`resilience.outcome.*` labels; failed bar `bad` when >0, partial/exceptions `warn` when >0, success `ok`, cancelled muted) via `toBars`. Add note line `resilience.replicationTakeaway` with `{issues, total}` to the section's `notes` array.

- [ ] **Step 1: Append the two tests** (adapt to the file's fixture pattern, as in family 1):

```ts
describe('efficiency section', () => {
  it('renders dedupe chip, retention table, and bucket bars', () => {
    const view = makeView({
      efficiency: {
        dedupe: {
          common: { num: 9200, den: 100 },
          lowDedupe: { items: [], total: 0, shown: 0 },
        },
        retention: {
          totalGbByBucket: { r30: 100, r60: 50, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
          perPolicyType: [
            { type: 'SQL', gbByBucket: { r30: 100, r60: 50, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 } },
          ],
        },
      },
    })
    const model = buildExportModel(view, base)
    const section = model.sections.find((s) => s.id === 'efficiency')
    expect(section).toBeDefined()
    expect(section?.table?.rows.some((r) => r[0] === 'SQL')).toBe(true)
    expect(section?.deck?.bars?.length).toBe(6)
  })

  it('is suppressed when efficiency is empty (PPDM) and resilience gains replication health when present', () => {
    const empty = buildExportModel(makeView({ efficiency: emptyEfficiency() }), base)
    expect(empty.sections.find((s) => s.id === 'efficiency')).toBeUndefined()

    const withRep = buildExportModel(
      makeView({
        efficiency: {
          replicationHealth: {
            counts: { success: 90, exceptions: 4, partial: 3, cancelled: 1, failed: 2 },
            total: 100,
          },
        },
      }),
      base,
    )
    const resilience = withRep.sections.find((s) => s.id === 'resilience')
    expect(resilience?.deck?.bars?.some((b) => b.label.length > 0)).toBe(true)
    expect(resilience?.deck?.kpiChips?.some((k) => k.value === '5')).toBe(true) // failed+partial
  })
})
```

- [ ] **Step 2: Run to verify failure, implement per the binding behavior above, re-run.**

Run: `npx vitest run src/engines/export && npm run test:run && npm run typecheck && ./node_modules/.bin/biome check .`

- [ ] **Step 3: Commit**

```bash
git add -u && git commit -m "feat(efficiency): export section + resilience replication-health extension"
```

---

### Task 9: Dashboard — EfficiencySection + JobsComplianceSection extension

**Files:**
- Create: `src/components/dashboard/EfficiencySection.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx` (import + `case 'efficiency'`)
- Modify: `src/components/dashboard/JobsComplianceSection.tsx` (replication-health block)
- Test: `src/components/dashboard/sections.test.tsx` (append)

**Required behavior:**
- `EfficiencySection({ view })`: returns `null` when `view.efficiency` has no defined sub-metric. Renders (mirroring the section/h2/takeaway/table classes of `ReliabilitySection.tsx`): title `efficiency.title`; takeaway = dedupe weighted % when present (`fmtPercentValue`-style formatting consistent with the file's peers) else `efficiency.takeawayNoDedupe`; a retention table (policy type + 6 buckets + total row, byte-formatted with `meta.baseTen`) when retention exists; a low-dedupe client table (client / commonality % / processed, `formatGbOrUnknown` base-2) when `lowDedupe.items.length > 0`. Dashboard MAY show both tables (unlike the export's one-table rule).
- `JobsComplianceSection`: when `view.efficiency.replicationHealth?.total` is positive, render an additional labelled row/block "Replication health" (`resilience.replicationHealth`) with the five outcome counts (outcome label + `fmtInt` count, failed/partial visually flagged with the component's existing warn/bad text classes) and the `resilience.replicationTakeaway` line. Read the component first and mirror its existing markup patterns exactly.
- `Dashboard.tsx`: `case 'efficiency': return <EfficiencySection key={id} view={view} />`.

- [ ] **Step 1: Append tests to sections.test.tsx** (adapt to the harness):

```ts
describe('EfficiencySection', () => {
  it('renders retention rows and low-dedupe clients', () => {
    const view = makeView({
      efficiency: {
        dedupe: {
          common: { num: 9200, den: 100 },
          lowDedupe: { items: [{ host: 'poor', commonPct: 20, processedGb: 5 }], total: 1, shown: 1 },
        },
        retention: {
          totalGbByBucket: { r30: 100, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 },
          perPolicyType: [
            { type: 'SQL', gbByBucket: { r30: 100, r60: 0, r180: 0, r1y: 0, r7y: 0, r7yPlus: 0 } },
          ],
        },
      },
    })
    render(<EfficiencySection view={view} />)
    expect(screen.getByText('SQL')).toBeTruthy()
    expect(screen.getByText('poor')).toBeTruthy()
  })

  it('renders nothing when efficiency is empty', () => {
    const { container } = render(<EfficiencySection view={makeView({ efficiency: emptyEfficiency() })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Implement, run, gate, commit**

```bash
npx vitest run src/components/dashboard && npm run test:run && npm run typecheck && ./node_modules/.bin/biome check .
git add -A src/components/dashboard && git commit -m "feat(efficiency): dashboard section + replication health in jobs/compliance"
```

---

### Task 10: Full gates, real-data smoke, PR

- [ ] **Step 1: Full CI sequence**

```bash
npm run typecheck && ./node_modules/.bin/biome check . && npm run test:run && npm run build
```

- [ ] **Step 2: Engine-level smoke on the real JTI workbooks** (pptx CLI is broken under Node 26 — pre-existing). Extend the session smoke script pattern: ingest `GERTRI01-AVN106.xlsx`, `SWIGVA01-AVU203.xlsx`, `NetworkerNwt00-lab.xlsx` via `ingestReport` and print `combined.efficiency` (dedupe weighted %, change rate %, retention bucket totals, replication health counts) + `provenance.efficiency`. Expected: Avamar grids show dedupe/changeRate/retention/replicationHealth with encryption ABSENT; GERTRI replication ≈ 93.8% success (1,438 exceptions surface); NetWorker shows global DD reduction ≈ ×23 and KPI retention buckets.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/efficiency-retention
gh pr create --title "feat: efficiency & retention insights — dedupe, change rate, retention profile, replication health" --body "$(cat <<'EOF'
Implements family 2 of docs/superpowers/specs/2026-07-02-insight-families-design.md (PR 2 of 4).

- New pure engine `engines/aggregation/efficiency.ts`: capacity-weighted dedupe commonality + low-dedupe clients (Avamar), DD logical/physical reduction + weighted job ratios (NetWorker), daily change rate, shared retention-bucket profile, presence-gated encryption coverage, Avamar replication-health breakdown.
- Renders as a new Storage-efficiency section plus a replication-health extension of the resilience section (surfaces the failure mix previously hidden behind one percentage).
- All numerator/denominator pairs carried raw for exact estate merges; every cell read presence-gated (never coerce missing to 0).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NQ81Tu7TrEmqyvSNcDNeBK
EOF
)"
```

---

## Follow-ups (explicitly NOT in this PR)

- PR 3: capacity trend (`capacityTrend.ts` + line chart). PR 4: config hygiene.
- Low-dedupe client table in the export (dashboard-only this PR when retention also present).
- PPDM efficiency wiring.
