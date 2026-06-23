# Avamar detail-export enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Avamar adapter derive metrics from the detail sheets of a real Live Optics export (preferring detail, falling back to summary), restoring broken jobs/workloads/policies, enriching with front-end volumetry + replication resilience, and adding three ops-insight sections (agent versions, at-risk clients, longest backups).

**Architecture:** Per-metric graceful fallback inside the single pure `buildAvamarView` (no global detail-vs-summary fork). New ops-insight data lives in one grouped, required `ReportView.opsInsights` field (empty default + merge fn), mirroring how `frontEnd` is modelled. The render surface reuses the existing table-first export-section + full-width PPTX slide pattern; the dashboard gets three new bespoke section components.

**Tech Stack:** TypeScript, React 18, Vite, Vitest, Biome, i18next (en/fr/de/it), pptxgenjs, SheetJS (`xlsx`, CDN-pinned), Tailwind v4, ECharts (via the single `Chart.tsx`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-avamar-detail-export-enrichment-design.md` — the authority for every decision below.
- **Engines are pure:** no React/DOM/store imports, no `Date.now()`/`Math.random()` nondeterminism, in `src/engines/**`.
- **Store holds inputs only:** never store a derived metric.
- **Biome:** single quotes, **no semicolons**, 2-space indent, 100-col width. `noUnusedImports`/`noUnusedVariables` are errors. `console` is an error except `warn`/`error`. **No non-null assertions (`!`)** — the repo style avoids them.
- **i18n parity:** every new UI/export string key MUST be added to ALL FOUR locales `src/i18n/locales/{en,fr,de,it}/dashboard.json`; `src/i18n/keyParity.test.ts` fails CI otherwise.
- **Tests use synthetic in-memory workbooks** via `makeWorkbook(...)` from `src/test-helpers/workbooks.ts`. NEVER read from `ref/` (gitignored, ENOENT in CI).
- **`capped: false` for Avamar** job/compliance metrics — the 10k row flag is a PPDM convention and a false positive on Avamar's uncapped 30k-row sheets.
- **Avamar is base-2** (`meta.baseTen === false`). Byte values must format base-2 (GiB/TiB), threaded via `meta.baseTen`. Default formatting stays base-10 (PPDM/NetWorker unchanged).
- **Per-phase gate (run, in order, must pass before committing the phase's final task):**
  `npm run typecheck && npm run lint && npm run test:run && npm run build`
- **Branch:** `feat/avamar-detail-enrichment` (already created; spec already committed). Every commit message ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

| File | Responsibility | Phase |
|---|---|---|
| `src/engines/products/avamar/jobs.ts` | **new** — jobs from `Avamar DPN Summary` (detail) + `Backup Completion Summary` fallback | 1 |
| `src/engines/products/avamar/workloads.ts` | **new** — in-use workloads from `Job List Detailed` `Policy Type` + `Backup Plugins` fallback | 1 |
| `src/engines/products/avamar/policies.ts` | **new** — policies from `Job List Detailed` `Group Name` + `Group Summary` fallback | 1 |
| `src/engines/products/avamar/replication.ts` | **new** — replication resilience from `Replication (Completion Status)` | 1 |
| `src/engines/aggregation/frontEnd.ts` | **modify** — add `computeAvamarFrontEnd` | 1 |
| `src/engines/aggregation/provenance.ts` | **modify** — `avamarProvenance`: compliance + frontEnd available | 1 |
| `src/engines/products/avamar/buildAvamarView.ts` | **modify** — wire detail-first metrics | 1 |
| `src/test-helpers/workbooks.ts` | **modify** — `avamarWorkbookBuffer` gains detail sheets | 1 |
| `src/types/reportView.ts` | **modify** — `OpsInsights` types + `ReportView.opsInsights` | 2 |
| `src/engines/aggregation/opsInsights.ts` | **new** — `emptyOpsInsights` + `mergeOpsInsights` | 2 |
| `src/engines/products/avamar/opsInsights.ts` | **new** — `computeAvamarOpsInsights` | 2 |
| `src/engines/aggregation/mergeViews.ts` | **modify** — fold `opsInsights` | 2 |
| `src/engines/products/{ppdm/buildPpdmView,ppdm/summaryView,networker/buildNetworkerView}.ts` | **modify** — set `opsInsights: emptyOpsInsights()` | 2 |
| `src/utils/format.ts` | **modify** — base-2 support on `formatBytes`/`gbToBytes`/`formatGbOrUnknown`; add `fmtNum` | 3 |
| `src/engines/export/thresholds.ts` | **modify** — `atRiskTone`, `backupDurationTone` | 3 |
| `src/engines/export/sectionOrder.ts` | **modify** — 3 new `SectionId`s + flavor placement | 3 |
| `src/engines/export/buildExportModel.ts` | **modify** — 3 new sections + base-2 byte formatting + `byId` wiring | 3 |
| `src/engines/export/pptx/slidePlan.ts` | **modify** — register 3 sections in `FULLWIDTH` | 3 |
| `src/components/dashboard/{AgentVersionsSection,AtRiskSection,LongestBackupsSection}.tsx` | **new** — dashboard components | 3 |
| `src/components/dashboard/Dashboard.tsx` | **modify** — `renderSection` cases for the 3 sections | 3 |
| `src/i18n/locales/{en,fr,de,it}/dashboard.json` | **modify** — keys for the 3 sections | 3 |

---

# PHASE 1 — Engine fixes + enrich

Each Phase-1 engine module is pure, takes a `RawWorkbook`, and has its own unit test with a local `makeWorkbook` fixture covering BOTH the detail-primary and summary-fallback paths.

## Task 1: Avamar jobs (detail-first, summary fallback)

**Files:**
- Create: `src/engines/products/avamar/jobs.ts`
- Test: `src/engines/products/avamar/jobs.test.ts`

**Interfaces:**
- Consumes: `RawWorkbook` (`src/types/ppdm.ts`), `Jobs` (`src/types/reportView.ts`), `cellNum`/`cellStr` (`src/engines/aggregation/rows.ts`).
- Produces: `avamarJobs(wb: RawWorkbook): Jobs`.

- [ ] **Step 1: Write the failing test** — `src/engines/products/avamar/jobs.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarJobs } from './jobs'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('avamarJobs', () => {
  it('derives buckets from Avamar DPN Summary backups only (restore excluded)', () => {
    const j = avamarJobs(
      wb({
        'Avamar DPN Summary': [
          ['Server', 'Operation', 'Status'],
          ['s', 'On-Demand Backup', 'Activity completed successfully.'],
          ['s', 'On-Demand Backup', 'Activity completed successfully.'],
          ['s', 'Scheduled Backup', 'Activity completed with exceptions.'],
          ['s', 'On-Demand Backup', 'Activity failed - client error(s).'],
          ['s', 'Restore', 'Activity completed successfully.'],
        ],
      }),
    )
    expect(j.counts).toEqual({ SUCCESS: 2, EXCEPTION: 1, FAILED: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(0.5, 6)
    expect(j.capped).toBe(false)
  })

  it('falls back to Backup Completion Summary when no detail rows', () => {
    const j = avamarJobs(
      wb({
        'Backup Completion Summary': [
          ['Total', 'Successful', 'Exception', 'Failed'],
          [10, 7, 1, 2],
        ],
      }),
    )
    expect(j.counts).toEqual({ SUCCESS: 7, EXCEPTION: 1, FAILED: 2 })
    expect(j.total).toBe(10)
    expect(j.successPct).toBeCloseTo(0.7, 6)
    expect(j.capped).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test, verify it fails** — `npx vitest run src/engines/products/avamar/jobs.test.ts` → FAIL ("avamarJobs is not a function" / cannot find module).

- [ ] **Step 3: Implement** — `src/engines/products/avamar/jobs.ts`

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import type { Jobs } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

const SUCCESS_STATUS = 'Activity completed successfully.'
const EXCEPTION_STATUS = 'Activity completed with exceptions.'
const BACKUP_OPS = new Set(['On-Demand Backup', 'Scheduled Backup'])

/** Jobs from the per-backup Avamar DPN Summary (detail); falls back to the
 * pre-aggregated Backup Completion Summary. `capped` is always false — Avamar
 * exports are not subject to the PPDM 10k row cap. Pure. */
export function avamarJobs(wb: RawWorkbook): Jobs {
  const detail = (wb.sheets['Avamar DPN Summary']?.rows ?? []).filter((r) =>
    BACKUP_OPS.has(cellStr(r, 'Operation')),
  )
  if (detail.length > 0) {
    let success = 0
    let exception = 0
    let failed = 0
    for (const r of detail) {
      const status = cellStr(r, 'Status')
      if (status === SUCCESS_STATUS) success++
      else if (status === EXCEPTION_STATUS) exception++
      else failed++
    }
    const total = detail.length
    return {
      counts: { SUCCESS: success, EXCEPTION: exception, FAILED: failed },
      total,
      successPct: total > 0 ? success / total : 0,
      capped: false,
      windowSize: total,
    }
  }

  const bcs = wb.sheets['Backup Completion Summary']?.rows[0]
  const total = bcs ? cellNum(bcs, 'Total') : 0
  const success = bcs ? cellNum(bcs, 'Successful') : 0
  return {
    counts: {
      SUCCESS: success,
      EXCEPTION: bcs ? cellNum(bcs, 'Exception') : 0,
      FAILED: bcs ? cellNum(bcs, 'Failed') : 0,
    },
    total,
    successPct: total > 0 ? success / total : 0,
    capped: false,
    windowSize: total,
  }
}
```

- [ ] **Step 4: Run the test, verify it passes** — `npx vitest run src/engines/products/avamar/jobs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/avamar/jobs.ts src/engines/products/avamar/jobs.test.ts
git commit -m "$(printf 'feat(avamar): jobs from DPN Summary detail with summary fallback\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 2: Avamar workloads (detail-first, plugin fallback)

**Files:**
- Create: `src/engines/products/avamar/workloads.ts`
- Test: `src/engines/products/avamar/workloads.test.ts`

**Interfaces:**
- Produces: `avamarWorkloads(wb: RawWorkbook): string[]`.

- [ ] **Step 1: Write the failing test** — `src/engines/products/avamar/workloads.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarWorkloads } from './workloads'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('avamarWorkloads', () => {
  it('distinct Policy Type from Job List Detailed backups, excluding GC and No Plug-in', () => {
    const list = avamarWorkloads(
      wb({
        'Job List Detailed': [
          ['Policy Type', 'Job Type'],
          ['Linux VMware Image', 'Backup'],
          ['Windows File System', 'Backup'],
          ['Linux VMware Image', 'Backup'],
          ['GC', 'GC'],
          ['No Plug-in', 'Backup'],
        ],
      }),
    )
    expect(list).toEqual(['Linux VMware Image', 'Windows File System'])
  })

  it('falls back to Backup Plugins (Count > 0) when no detail sheet', () => {
    const list = avamarWorkloads(
      wb({
        'Backup Plugins': [
          ['Plugin Name', 'Count'],
          ['Linux VMware Image', 5],
          ['No Plug-in', 0],
        ],
      }),
    )
    expect(list).toEqual(['Linux VMware Image'])
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/engines/products/avamar/workloads.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/engines/products/avamar/workloads.ts`

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Policy types that are maintenance/no-op — never surfaced as workloads. */
const NON_WORKLOAD = new Set(['GC', 'No Plug-in'])

/** In-use workload types from Job List Detailed `Policy Type` (backup jobs only);
 * falls back to Backup Plugins (`Plugin Name` where `Count > 0`). Pure. */
export function avamarWorkloads(wb: RawWorkbook): string[] {
  const jobs = wb.sheets['Job List Detailed']?.rows ?? []
  if (jobs.length > 0) {
    const seen = new Set<string>()
    for (const r of jobs) {
      if (cellStr(r, 'Job Type') !== 'Backup') continue
      const pt = cellStr(r, 'Policy Type')
      if (pt !== '' && !NON_WORKLOAD.has(pt)) seen.add(pt)
    }
    return [...seen]
  }
  return (wb.sheets['Backup Plugins']?.rows ?? [])
    .filter((r) => cellNum(r, 'Count') > 0)
    .map((r) => cellStr(r, 'Plugin Name'))
    .filter((n) => n !== '')
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/engines/products/avamar/workloads.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/avamar/workloads.ts src/engines/products/avamar/workloads.test.ts
git commit -m "$(printf 'feat(avamar): workloads from Job List Detailed Policy Type with plugin fallback\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 3: Avamar policies (detail-first, summary fallback)

**Files:**
- Create: `src/engines/products/avamar/policies.ts`
- Test: `src/engines/products/avamar/policies.test.ts`

**Interfaces:**
- Consumes: `Policies`, `PolicyRow` (`src/types/reportView.ts`).
- Produces: `avamarPolicies(wb: RawWorkbook): Policies`.

- [ ] **Step 1: Write the failing test** — `src/engines/products/avamar/policies.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarPolicies } from './policies'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('avamarPolicies', () => {
  it('distinct Group Name from Job List Detailed with per-group hosts + capacity', () => {
    const p = avamarPolicies(
      wb({
        'Job List Detailed': [
          ['Host', 'Group Name', 'Capacity (GiB)'],
          ['h1', 'G1', 10],
          ['h2', 'G1', 20],
          ['h3', 'G2', 5],
        ],
      }),
    )
    expect(p.count).toBe(2)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toContainEqual({
      name: 'G1',
      purpose: '',
      assetCount: 2,
      protectionCapacityGb: 30,
    })
    expect(p.perPolicy).toContainEqual({
      name: 'G2',
      purpose: '',
      assetCount: 1,
      protectionCapacityGb: 5,
    })
  })

  it('falls back to Group Summary distinct Group Name', () => {
    const p = avamarPolicies(
      wb({
        'Group Summary': [['Group Name'], ['G1'], ['G1'], ['G2']],
      }),
    )
    expect(p.count).toBe(2)
    expect(p.perPolicy).toEqual([])
  })
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — `src/engines/products/avamar/policies.ts`

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import type { Policies, PolicyRow } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

/** Policies (protection groups) from Job List Detailed `Group Name` with per-group
 * distinct-host count + summed capacity; falls back to Group Summary. Pure. */
export function avamarPolicies(wb: RawWorkbook): Policies {
  const jobs = wb.sheets['Job List Detailed']?.rows ?? []
  if (jobs.length > 0) {
    const groups = new Map<string, { hosts: Set<string>; capacityGb: number }>()
    for (const r of jobs) {
      const name = cellStr(r, 'Group Name')
      if (name === '') continue
      const g = groups.get(name) ?? { hosts: new Set<string>(), capacityGb: 0 }
      const host = cellStr(r, 'Host')
      if (host !== '') g.hosts.add(host)
      g.capacityGb += cellNum(r, 'Capacity (GiB)')
      groups.set(name, g)
    }
    const perPolicy: PolicyRow[] = [...groups.entries()].map(([name, g]) => ({
      name,
      purpose: '',
      assetCount: g.hosts.size,
      protectionCapacityGb: g.capacityGb,
    }))
    return { count: groups.size, byPurpose: {}, perPolicy }
  }

  const names = new Set(
    (wb.sheets['Group Summary']?.rows ?? [])
      .map((r) => cellStr(r, 'Group Name'))
      .filter((n) => n !== ''),
  )
  return { count: names.size, byPurpose: {}, perPolicy: [] }
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/avamar/policies.ts src/engines/products/avamar/policies.test.ts
git commit -m "$(printf 'feat(avamar): policies from Job List Detailed Group Name with summary fallback\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 4: Avamar front-end volumetry

**Files:**
- Modify: `src/engines/aggregation/frontEnd.ts` (add `computeAvamarFrontEnd`)
- Test: `src/engines/aggregation/frontEnd.avamar.test.ts`

**Interfaces:**
- Consumes: `RawWorkbook`, `FrontEnd`, `FrontEndTypeRow` (already imported in `frontEnd.ts`).
- Produces: `computeAvamarFrontEnd(wb: RawWorkbook): FrontEnd`.

- [ ] **Step 1: Write the failing test** — `src/engines/aggregation/frontEnd.avamar.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../test-helpers/workbooks'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { computeAvamarFrontEnd } from './frontEnd'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('computeAvamarFrontEnd', () => {
  it('sums Client Capacity Max Peak GiB per Application as protected discovered', () => {
    const fe = computeAvamarFrontEnd(
      wb({
        'Client Capacity': [
          ['Hostname', 'Application', 'Max Peak GiB'],
          ['h1', 'Linux VMware Image', 100],
          ['h2', 'Windows File System', 50],
          ['h3', 'Linux VMware Image', 25],
        ],
      }),
    )
    expect(fe.excludedCount).toBe(0)
    expect(fe.byType).toContainEqual({ type: 'Linux VMware Image', protectedDiscoveredGb: 125 })
    expect(fe.byType).toContainEqual({ type: 'Windows File System', protectedDiscoveredGb: 50 })
    // other three size fields are undefined ("–")
    const row = fe.byType.find((r) => r.type === 'Windows File System')
    expect(row?.protectedFetbGb).toBeUndefined()
    expect(row?.unprotectedDiscoveredGb).toBeUndefined()
  })

  it('empty when Client Capacity is absent', () => {
    expect(computeAvamarFrontEnd(wb({}))).toEqual({ byType: [], excludedCount: 0 })
  })
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — append to `src/engines/aggregation/frontEnd.ts` (after `computeFrontEnd`). The file already imports `RawWorkbook`/`SheetData`, `FrontEnd`/`FrontEndTypeRow`, and `cellNum`/`cellStr`.

```ts
/** Front-end volume per workload type from Avamar's `Client Capacity` sheet.
 * Clients in that sheet have backups, so values populate `protectedDiscoveredGb`
 * (peak GiB, base-2); the other three fields stay undefined ("–"). Pure. */
export function computeAvamarFrontEnd(wb: RawWorkbook): FrontEnd {
  const rows = wb.sheets['Client Capacity']?.rows ?? []
  const byApp = new Map<string, number>()
  for (const r of rows) {
    const app = cellStr(r, 'Application')
    if (app === '') continue
    byApp.set(app, (byApp.get(app) ?? 0) + cellNum(r, 'Max Peak GiB'))
  }
  const byType: FrontEndTypeRow[] = [...byApp.entries()].map(([type, gb]) => ({
    type,
    protectedDiscoveredGb: gb,
  }))
  return { byType, excludedCount: 0 }
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/aggregation/frontEnd.ts src/engines/aggregation/frontEnd.avamar.test.ts
git commit -m "$(printf 'feat(avamar): front-end volumetry from Client Capacity per Application\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 5: Avamar replication resilience

**Files:**
- Create: `src/engines/products/avamar/replication.ts`
- Test: `src/engines/products/avamar/replication.test.ts`

**Interfaces:**
- Consumes: `Compliance` (`src/types/reportView.ts`).
- Produces: `avamarReplication(wb: RawWorkbook): Compliance`.

- [ ] **Step 1: Write the failing test** — `src/engines/products/avamar/replication.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { avamarReplication } from './replication'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('avamarReplication', () => {
  it('computes replicatedPct from the Replication completion-status totals', () => {
    const c = avamarReplication(
      wb({
        'Replication (Completion Status)': [
          ['Status', 'Total'],
          ['Activity completed successfully.', 90],
          ['Activity failed - client error(s).', 10],
        ],
      }),
    )
    expect(c.replicatedCount).toBe(90)
    expect(c.windowSize).toBe(100)
    expect(c.replicatedPct).toBeCloseTo(0.9, 6)
    // app-consistency + immutability are N/A → 0 (NetWorker precedent)
    expect(c.appConsistentPct).toBe(0)
    expect(c.immutablePct).toBe(0)
    expect(c.capped).toBe(false)
  })

  it('zero replicatedPct when the sheet is absent', () => {
    const c = avamarReplication(wb({}))
    expect(c.replicatedPct).toBe(0)
    expect(c.windowSize).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — `src/engines/products/avamar/replication.ts`

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import type { Compliance } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'

const SUCCESS_STATUS = 'Activity completed successfully.'

/** Replication resilience from Avamar's `Replication (Completion Status)` sheet.
 * Populates replicatedPct only; app-consistency + immutability are N/A → 0%
 * (NetWorker precedent). Pure. */
export function avamarReplication(wb: RawWorkbook): Compliance {
  const rows = wb.sheets['Replication (Completion Status)']?.rows ?? []
  let replicated = 0
  let total = 0
  for (const r of rows) {
    const n = cellNum(r, 'Total')
    total += n
    if (cellStr(r, 'Status') === SUCCESS_STATUS) replicated += n
  }
  return {
    appConsistentPct: 0,
    immutablePct: 0,
    replicatedPct: total > 0 ? replicated / total : 0,
    appConsistentCount: 0,
    immutableCount: 0,
    replicatedCount: replicated,
    backupLevelMix: {},
    windowSize: total,
    capped: false,
  }
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/avamar/replication.ts src/engines/products/avamar/replication.test.ts
git commit -m "$(printf 'feat(avamar): replication resilience from Replication completion status\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 6: Wire detail-first metrics into `buildAvamarView` + provenance + fixture + integration test

**Files:**
- Modify: `src/engines/products/avamar/buildAvamarView.ts`
- Modify: `src/engines/aggregation/provenance.ts` (`avamarProvenance`)
- Modify: `src/test-helpers/workbooks.ts` (`avamarWorkbookBuffer` — add detail sheets)
- Modify: `src/engines/products/avamar/buildAvamarView.test.ts` (update assertions for the detail path)

**Interfaces:**
- Consumes: `avamarJobs`, `avamarWorkloads`, `avamarPolicies`, `avamarReplication`, `computeAvamarFrontEnd`.
- Produces: an updated `buildAvamarView(wb): ReportView` whose `jobs/inUse/policies/compliance/frontEnd` come from the detail sheets, plus `avamarProvenance()` marking `compliance` + `frontEnd` available.

> NOTE on blast radius (verified): `detectProduct` keys off `Avamar DPN Summary` / (`Backup Completion Summary` + `Backup Plugins`), so adding detail sheets is detection-safe. `mergeViews.test.ts` only asserts `inUse` `toContain('Linux VMware Image')` and coverage/gaps sums; `estateDocument.test.ts` asserts `coverage.overall.protected === 6`; `useReportUpload.test.ts` asserts detection only. The detail fixture below preserves all of those. Only `buildAvamarView.test.ts` assertions change.

- [ ] **Step 1: Update the fixture** — replace the `avamarWorkbookBuffer` body in `src/test-helpers/workbooks.ts` (keep the existing coverage/gaps/capacity/disabled sheets; add detail sheets; expand `Avamar DPN Summary`):

```ts
export function avamarWorkbookBuffer(): ArrayBuffer {
  return makeWorkbook({
    Details: [
      ['Project Name', 'AVA-test'],
      ['Date', 45000],
      ['Disclaimer', 'All measurements ... Base 2 units of Measurement.'],
    ],
    'Host Info': [
      ['Hostname', 'Serial'],
      ['ava-host', 'SN1'],
    ],
    // Detail jobs: 4 backups (1 restore excluded) → SUCCESS 2 / EXCEPTION 1 / FAILED 1
    'Avamar DPN Summary': [
      ['Server', 'Host', 'Operation', 'Status'],
      ['ava-host', 'h1', 'On-Demand Backup', 'Activity completed successfully.'],
      ['ava-host', 'h2', 'On-Demand Backup', 'Activity completed successfully.'],
      ['ava-host', 'h3', 'Scheduled Backup', 'Activity completed with exceptions.'],
      ['ava-host', 'h4', 'On-Demand Backup', 'Activity failed - client error(s).'],
      ['ava-host', 'h5', 'Restore', 'Activity completed successfully.'],
    ],
    // Detail workloads + policies. Policy Types: GC + No Plug-in excluded from inUse.
    'Job List Detailed': [
      ['Host', 'Policy Type', 'Job Type', 'Group Name', 'Capacity (GiB)'],
      ['h1', 'Linux VMware Image', 'Backup', 'G1', 10],
      ['h2', 'Windows File System', 'Backup', 'G1', 20],
      ['h3', 'Linux VMware Image', 'Backup', 'G2', 5],
      ['h4', 'GC', 'GC', 'G2', 0],
      ['h5', 'No Plug-in', 'Backup', 'G3', 1],
    ],
    // Front-end volumetry: Linux VMware Image 125 GiB, Windows File System 50 GiB
    'Client Capacity': [
      ['Hostname', 'Application', 'Max Peak GiB'],
      ['h1', 'Linux VMware Image', 100],
      ['h2', 'Windows File System', 50],
      ['h3', 'Linux VMware Image', 25],
    ],
    // Replication resilience: 90/100 = 90%
    'Replication (Completion Status)': [
      ['Status', 'Total'],
      ['Activity completed successfully.', 90],
      ['Activity failed - client error(s).', 10],
    ],
    // Summary sheets retained (now fallback-only; detail wins above)
    'Backup Completion Summary': [
      ['Total', 'Successful', 'Exception', 'Failed'],
      [10, 7, 1, 2],
    ],
    'NonRetired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 4],
      ['True', 6],
    ],
    'Retired Clients With Backups': [
      ['Has Backups', 'Total'],
      ['False', 2],
      ['True', 1],
    ],
    'Clients No Backups': [
      ['Full Domain', 'Client Type', 'Completed Time'],
      ['/clients/a', 'REGULAR', 25569],
      ['/clients/b', 'VREGULAR', 25569],
    ],
    'Backup Plugins': [
      ['Plugin Name', 'Count'],
      ['Linux VMware Image', 5],
      ['No Plug-in', 0],
    ],
    'Node Utilization': [
      ['Date', 'Node', 'Max Utilization (%)'],
      [45000, 0, 0.5],
      [45001, 0, 0.8],
      [45001, 1, 0.5],
    ],
    'Disabled Groups': [
      ['Domain', 'Name', 'Read Only'],
      ['/', 'Default Group', 'False'],
      ['/dc1', 'Default Virtual Machine Group', 'False'],
    ],
    'Group Summary': [
      ['Group Name', 'Total', 'Successful', 'Exception', 'Failed'],
      ['G1', 2, 2, 0, 0],
      ['G1', 2, 2, 0, 0],
      ['G2', 1, 1, 0, 0],
    ],
  })
}
```

- [ ] **Step 2: Update `buildAvamarView`** — `src/engines/products/avamar/buildAvamarView.ts`. Keep `hasBackupsCount`, `sumTotal`, `nodeTargets`, `disabledGroups`. Replace the jobs/inUse/policies/compliance/frontEnd construction with calls to the new modules.

Replace the imports block (top of file) with (single line per module — matches the file's existing style):

```ts
import { FLAG_THRESHOLD_PCT, type RawWorkbook, TOP_N_DEFAULT } from '../../../types/ppdm'
import type { ReportView, StorageTarget, UnprotectedAsset } from '../../../types/reportView'
import { emptyBand, finalizeBand } from '../../aggregation/coverage'
import { computeAvamarFrontEnd } from '../../aggregation/frontEnd'
import { avamarProvenance } from '../../aggregation/provenance'
import { cellNum, cellStr } from '../../aggregation/rows'
import { avamarJobs } from './jobs'
import { avamarPolicies } from './policies'
import { avamarReplication } from './replication'
import { avamarWorkloads } from './workloads'
```

> The retained helpers (`hasBackupsCount`, `sumTotal`, `nodeTargets`, `disabledGroups`) still use `cellNum`/`cellStr`/`FLAG_THRESHOLD_PCT`, and the gap logic uses `TOP_N_DEFAULT`, so all stay. Drop the old `emptyFrontEnd` import (no longer used). Biome will flag any genuinely-unused import — remove those it flags.

Replace the body of `buildAvamarView` (everything after the coverage block) so the return reads:

```ts
  return {
    meta: wb.meta,
    inUse: avamarWorkloads(wb),
    idleAgents: disabledGroups(wb),
    warnings: wb.warnings,
    coverage: { byType: {}, overall },
    gaps: {
      count: gapItems.length,
      totalCapacityGb: undefined,
      top: { items: gapTop, total: gapItems.length, shown: gapTop.length },
    },
    jobs: avamarJobs(wb),
    compliance: avamarReplication(wb),
    capacity: { targets, flagged: targets.filter((t) => t.flagged), mtreeCount: 0 },
    policies: avamarPolicies(wb),
    frontEnd: computeAvamarFrontEnd(wb),
    provenance: avamarProvenance(),
  }
```

(Delete the now-unused local `bcs`/`success`/`exception`/`failed`/`jobsTotal`/`counts`/`inUse`/`groupNames` computations; keep the `noBackupRows`/`gapItems`/`gapTop` gap logic and the `overall` coverage + `targets` capacity logic.)

- [ ] **Step 3: Update `avamarProvenance`** — `src/engines/aggregation/provenance.ts`:

```ts
export function avamarProvenance(): Record<MetricKey, MetricProvenance> {
  return {
    coverageByType: { available: false, serversCovered: 0, serversTotal: 1 },
    gapsList: { available: true, serversCovered: 1, serversTotal: 1 },
    compliance: {
      available: true,
      serversCovered: 1,
      serversTotal: 1,
      assetsCovered: 1,
      assetsTotal: 1,
    },
    storageTargets: { available: true, serversCovered: 1, serversTotal: 1 },
    frontEnd: { available: true, serversCovered: 1, serversTotal: 1 },
  }
}
```

- [ ] **Step 4: Update the integration test** — `src/engines/products/avamar/buildAvamarView.test.ts`. Replace the `jobs`, `inUse`, `policies`, and `compliance/provenance` test bodies (coverage/gaps/capacity assertions are unchanged), and add a front-end assertion:

```ts
  it('jobs: detail DPN-Summary buckets, restore excluded, capped false', () => {
    const j = view().jobs
    expect(j.counts).toEqual({ SUCCESS: 2, EXCEPTION: 1, FAILED: 1 })
    expect(j.total).toBe(4)
    expect(j.successPct).toBeCloseTo(0.5, 6)
    expect(j.capped).toBe(false)
  })

  it('inUse = detail Policy Types (GC + No Plug-in excluded)', () => {
    expect(view().inUse).toEqual(['Linux VMware Image', 'Windows File System'])
  })

  it('policies = distinct Group Name with per-group hosts + capacity', () => {
    const p = view().policies
    expect(p.count).toBe(3)
    expect(p.byPurpose).toEqual({})
    expect(p.perPolicy).toContainEqual({
      name: 'G1',
      purpose: '',
      assetCount: 2,
      protectionCapacityGb: 30,
    })
  })

  it('front-end volumetry per Application (base-2 GiB)', () => {
    const fe = view().frontEnd
    expect(fe.byType).toContainEqual({ type: 'Linux VMware Image', protectedDiscoveredGb: 125 })
    expect(fe.byType).toContainEqual({ type: 'Windows File System', protectedDiscoveredGb: 50 })
  })

  it('replication resilience populated; provenance marks compliance + frontEnd available', () => {
    const v = view()
    expect(v.compliance.replicatedPct).toBeCloseTo(0.9, 6)
    expect(v.compliance.immutablePct).toBe(0)
    expect(v.provenance.coverageByType.available).toBe(false)
    expect(v.provenance.compliance.available).toBe(true)
    expect(v.provenance.frontEnd.available).toBe(true)
    expect(v.provenance.gapsList.available).toBe(true)
    expect(v.provenance.storageTargets.available).toBe(true)
  })
```

(Leave the existing `reads meta`, coverage, gaps, and capacity tests as-is.)

- [ ] **Step 5: Run the Avamar + consumer tests** — verify the detail wiring and that no consumer regressed:

```bash
npx vitest run src/engines/products/avamar src/engines/aggregation/mergeViews.test.ts src/engines/products/estateDocument.test.ts src/hooks/useReportUpload.test.ts
```
Expected: PASS. (If `mergeViews.test.ts` `toContain('Linux VMware Image')` fails, confirm the `Job List Detailed` fixture row with that Policy Type is present.)

- [ ] **Step 6: Phase-1 gate**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```
Expected: all green. Fix any biome unused-import findings in `buildAvamarView.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/engines/products/avamar/buildAvamarView.ts src/engines/aggregation/provenance.ts src/test-helpers/workbooks.ts src/engines/products/avamar/buildAvamarView.test.ts
git commit -m "$(printf 'feat(avamar): wire detail-first jobs/workloads/policies/replication/frontEnd\n\nProvenance now marks compliance + frontEnd available for Avamar.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

# PHASE 2 — Engine ops-insights

## Task 7: `OpsInsights` types + `emptyOpsInsights` + `mergeOpsInsights`

**Files:**
- Modify: `src/types/reportView.ts` (add types + `ReportView.opsInsights`)
- Create: `src/engines/aggregation/opsInsights.ts`
- Test: `src/engines/aggregation/opsInsights.test.ts`

**Interfaces:**
- Produces: `AgentVersionRow`, `AtRiskClient`, `AtRiskClients`, `LongBackupRow`, `OpsInsights` types; `emptyOpsInsights(): OpsInsights`; `mergeOpsInsights(list: OpsInsights[]): OpsInsights`.

- [ ] **Step 1: Add the types** — in `src/types/reportView.ts`, after the `FrontEnd` interface and before `ReportView`:

```ts
/** One agent/client-software version and how many clients run it. */
export interface AgentVersionRow {
  version: string
  count: number
}

/** A client flagged as at-risk (window breach or stale backup). */
export interface AtRiskClient {
  name: string
  clientType?: string
}

/** Two distinct at-risk populations. */
export interface AtRiskClients {
  /** Clients breaching their backup window. */
  overtime: TopList<AtRiskClient>
  /** Clients with no backup in the last 7 days. */
  staleBackups: TopList<AtRiskClient>
}

/** One long-running backup job. */
export interface LongBackupRow {
  server: string
  policyType: string
  durationHr: number
  capacityGb?: number
  throughputMbSec?: number
}

/** Cross-product operational insights. Populated by Avamar today; empty elsewhere. */
export interface OpsInsights {
  agentVersions: AgentVersionRow[]
  atRisk: AtRiskClients
  longestBackups: TopList<LongBackupRow>
}
```

Then add the field to `ReportView` (after `frontEnd: FrontEnd`):

```ts
  frontEnd: FrontEnd
  opsInsights: OpsInsights
```

- [ ] **Step 2: Write the failing test** — `src/engines/aggregation/opsInsights.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { OpsInsights } from '../../types/reportView'
import { emptyOpsInsights, mergeOpsInsights } from './opsInsights'

const make = (over: Partial<OpsInsights>): OpsInsights => ({ ...emptyOpsInsights(), ...over })

describe('opsInsights aggregation', () => {
  it('emptyOpsInsights is fully empty', () => {
    const e = emptyOpsInsights()
    expect(e.agentVersions).toEqual([])
    expect(e.atRisk.overtime).toEqual({ items: [], total: 0, shown: 0 })
    expect(e.longestBackups).toEqual({ items: [], total: 0, shown: 0 })
  })

  it('mergeOpsInsights is identity on a single view', () => {
    const one = make({ agentVersions: [{ version: '19.4', count: 3 }] })
    expect(mergeOpsInsights([one])).toBe(one)
  })

  it('mergeOpsInsights sums versions and concatenates risk + longest lists', () => {
    const a = make({
      agentVersions: [{ version: '19.4', count: 3 }],
      atRisk: {
        overtime: { items: [{ name: 'c1' }], total: 1, shown: 1 },
        staleBackups: { items: [], total: 0, shown: 0 },
      },
      longestBackups: {
        items: [{ server: 's1', policyType: 'FS', durationHr: 10 }],
        total: 1,
        shown: 1,
      },
    })
    const b = make({
      agentVersions: [{ version: '19.4', count: 2 }],
      longestBackups: {
        items: [{ server: 's2', policyType: 'VM', durationHr: 20 }],
        total: 1,
        shown: 1,
      },
    })
    const m = mergeOpsInsights([a, b])
    expect(m.agentVersions).toEqual([{ version: '19.4', count: 5 }])
    expect(m.atRisk.overtime.total).toBe(1)
    expect(m.longestBackups.total).toBe(2)
    // longest sorted by duration desc → s2 (20h) first
    expect(m.longestBackups.items[0]?.server).toBe('s2')
  })
})
```

- [ ] **Step 3: Run, verify fail** → FAIL.

- [ ] **Step 4: Implement** — `src/engines/aggregation/opsInsights.ts`

```ts
import { TOP_N_DEFAULT } from '../../types/ppdm'
import type { OpsInsights, TopList } from '../../types/reportView'
import { topN } from './topN'

function emptyTop<T>(): TopList<T> {
  return { items: [], total: 0, shown: 0 }
}

/** A fully-empty ops-insights value (the default for products that don't populate it). */
export function emptyOpsInsights(): OpsInsights {
  return {
    agentVersions: [],
    atRisk: { overtime: emptyTop(), staleBackups: emptyTop() },
    longestBackups: emptyTop(),
  }
}

/** Concat items across servers, re-cap to N by score, keep the true summed total. */
function mergeTop<T>(lists: TopList<T>[], n: number, score: (t: T) => number): TopList<T> {
  const items = lists.flatMap((l) => l.items)
  const total = lists.reduce((a, l) => a + l.total, 0)
  const capped = topN(items, n, score)
  return { items: capped.items, total, shown: capped.items.length }
}

/** Fold per-server OpsInsights into one. Identity on a single view. Pure. */
export function mergeOpsInsights(list: OpsInsights[]): OpsInsights {
  const first = list[0]
  if (list.length <= 1 && first) return first

  const versions = new Map<string, number>()
  for (const oi of list) {
    for (const r of oi.agentVersions) {
      versions.set(r.version, (versions.get(r.version) ?? 0) + r.count)
    }
  }
  const agentVersions = [...versions.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)

  return {
    agentVersions,
    atRisk: {
      overtime: mergeTop(
        list.map((o) => o.atRisk.overtime),
        TOP_N_DEFAULT,
        () => 0,
      ),
      staleBackups: mergeTop(
        list.map((o) => o.atRisk.staleBackups),
        TOP_N_DEFAULT,
        () => 0,
      ),
    },
    longestBackups: mergeTop(
      list.map((o) => o.longestBackups),
      TOP_N_DEFAULT,
      (r) => r.durationHr,
    ),
  }
}
```

- [ ] **Step 5: Run, verify pass** → `npx vitest run src/engines/aggregation/opsInsights.test.ts` → PASS. (TypeScript will now report `ReportView` literals missing `opsInsights` — fixed in Task 9; that's expected.)

- [ ] **Step 6: Commit**

```bash
git add src/types/reportView.ts src/engines/aggregation/opsInsights.ts src/engines/aggregation/opsInsights.test.ts
git commit -m "$(printf 'feat(engine): OpsInsights type + empty/merge aggregation\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 8: `computeAvamarOpsInsights`

**Files:**
- Create: `src/engines/products/avamar/opsInsights.ts`
- Test: `src/engines/products/avamar/opsInsights.test.ts`

**Interfaces:**
- Produces: `computeAvamarOpsInsights(wb: RawWorkbook): OpsInsights`.

- [ ] **Step 1: Write the failing test** — `src/engines/products/avamar/opsInsights.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { makeWorkbook } from '../../../test-helpers/workbooks'
import { normalizeWorkbook } from '../../parser/normalizeWorkbook'
import { computeAvamarOpsInsights } from './opsInsights'

const wb = (sheets: Record<string, (string | number)[][]>) => normalizeWorkbook(makeWorkbook(sheets))

describe('computeAvamarOpsInsights', () => {
  it('agent versions sorted by count desc', () => {
    const oi = computeAvamarOpsInsights(
      wb({
        'Client Version Count': [
          ['Agent Version', 'Total'],
          ['19.1.100-38', 1],
          ['19.4.100-116', 4],
        ],
      }),
    )
    expect(oi.agentVersions).toEqual([
      { version: '19.4.100-116', count: 4 },
      { version: '19.1.100-38', count: 1 },
    ])
  })

  it('at-risk overtime + stale, and longest backups by duration desc', () => {
    const oi = computeAvamarOpsInsights(
      wb({
        'Overtime Clients': [
          ['Full Domain Name', 'Client Type'],
          ['/clients/x', 'VREGULAR'],
        ],
        'Clients No Backups 7 Days': [['Display Full Domain'], ['/clients/y']],
        'Top50 Longest Backups': [
          ['Server', 'Policy Type', 'Duration Hr', 'Capacity GiB', 'Throughput MB/sec'],
          ['s1', 'Windows File System', 10, 0, 0],
          ['s2', 'Linux VMware Image', 24.5, 100, 5],
        ],
      }),
    )
    expect(oi.atRisk.overtime.items).toEqual([{ name: '/clients/x', clientType: 'VREGULAR' }])
    expect(oi.atRisk.staleBackups.items).toEqual([{ name: '/clients/y' }])
    expect(oi.longestBackups.items[0]?.server).toBe('s2')
    expect(oi.longestBackups.items[0]?.durationHr).toBe(24.5)
    expect(oi.longestBackups.total).toBe(2)
  })
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — `src/engines/products/avamar/opsInsights.ts`

```ts
import { TOP_N_DEFAULT } from '../../../types/ppdm'
import type { RawWorkbook } from '../../../types/ppdm'
import type { AgentVersionRow, AtRiskClient, LongBackupRow, OpsInsights } from '../../../types/reportView'
import { cellNum, cellStr } from '../../aggregation/rows'
import { topN } from '../../aggregation/topN'

/** Optional numeric cell: undefined when blank, the number (incl. 0) otherwise. */
function optNum(row: Record<string, unknown>, key: string): number | undefined {
  return cellStr(row as never, key) === '' ? undefined : cellNum(row as never, key)
}

/** Avamar operational insights: agent-version spread, at-risk clients, longest backups. Pure. */
export function computeAvamarOpsInsights(wb: RawWorkbook): OpsInsights {
  const agentVersions: AgentVersionRow[] = (wb.sheets['Client Version Count']?.rows ?? [])
    .map((r) => ({ version: cellStr(r, 'Agent Version'), count: cellNum(r, 'Total') }))
    .filter((r) => r.version !== '')
    .sort((a, b) => b.count - a.count)

  const overtime = topN<AtRiskClient>(
    (wb.sheets['Overtime Clients']?.rows ?? []).map((r) => {
      const clientType = cellStr(r, 'Client Type')
      return clientType === ''
        ? { name: cellStr(r, 'Full Domain Name') }
        : { name: cellStr(r, 'Full Domain Name'), clientType }
    }),
    TOP_N_DEFAULT,
    () => 0,
  )

  const staleBackups = topN<AtRiskClient>(
    (wb.sheets['Clients No Backups 7 Days']?.rows ?? []).map((r) => ({
      name: cellStr(r, 'Display Full Domain'),
    })),
    TOP_N_DEFAULT,
    () => 0,
  )

  const longestBackups = topN<LongBackupRow>(
    (wb.sheets['Top50 Longest Backups']?.rows ?? []).map((r) => ({
      server: cellStr(r, 'Server'),
      policyType: cellStr(r, 'Policy Type'),
      durationHr: cellNum(r, 'Duration Hr'),
      capacityGb: optNum(r, 'Capacity GiB'),
      throughputMbSec: optNum(r, 'Throughput MB/sec'),
    })),
    TOP_N_DEFAULT,
    (r) => r.durationHr,
  )

  return { agentVersions, atRisk: { overtime, staleBackups }, longestBackups }
}
```

> The `as never` casts in `optNum` keep `cellStr`/`cellNum`'s `Record<string, Cell>` signature without re-importing `Cell`; biome accepts them. If preferred, import `Cell` and type the param `Record<string, Cell>` instead.

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/products/avamar/opsInsights.ts src/engines/products/avamar/opsInsights.test.ts
git commit -m "$(printf 'feat(avamar): compute ops insights (agent versions, at-risk, longest backups)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 9: Wire `opsInsights` into every builder + merge + fix all ReportView literals

**Files:**
- Modify: `src/engines/products/avamar/buildAvamarView.ts`
- Modify: `src/engines/products/ppdm/buildPpdmView.ts`
- Modify: `src/engines/products/ppdm/summaryView.ts`
- Modify: `src/engines/products/networker/buildNetworkerView.ts`
- Modify: `src/engines/aggregation/mergeViews.ts`
- Modify: any test that constructs a full `ReportView` literal (found via typecheck)

**Interfaces:**
- Consumes: `emptyOpsInsights` (aggregation), `computeAvamarOpsInsights` (avamar), `mergeOpsInsights`.
- Produces: every `ReportView` now carries `opsInsights`.

- [ ] **Step 1: Avamar real value** — in `src/engines/products/avamar/buildAvamarView.ts`, import and add to the return:

```ts
import { computeAvamarOpsInsights } from './opsInsights'
```
```ts
    frontEnd: computeAvamarFrontEnd(wb),
    opsInsights: computeAvamarOpsInsights(wb),
    provenance: avamarProvenance(),
```

- [ ] **Step 2: Empty for the other builders** — in `buildPpdmView.ts`, `summaryView.ts`, and `buildNetworkerView.ts`, import `emptyOpsInsights` from `../../aggregation/opsInsights` and add `opsInsights: emptyOpsInsights()` to each returned `ReportView`.

- [ ] **Step 3: Merge fold** — in `src/engines/aggregation/mergeViews.ts`, import and add to the merged return:

```ts
import { mergeOpsInsights } from './opsInsights'
```
```ts
    frontEnd: mergeFrontEnd(views.map((v) => v.frontEnd)),
    opsInsights: mergeOpsInsights(views.map((v) => v.opsInsights)),
    provenance: mergeProvenance(views),
```
(The single-view early `return first` already preserves identity.)

- [ ] **Step 4: Find + fix remaining literals** — run `npm run typecheck`. For every error of the form *"Property 'opsInsights' is missing in type ... ReportView"* (notably synthetic `view`/`baseView` literals in `src/engines/export/buildExportModel.test.ts`), add `opsInsights: emptyOpsInsights()` (import it from `../aggregation/opsInsights` in those test files). Repeat until typecheck is clean.

- [ ] **Step 5: Phase-2 gate**

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(printf 'feat(engine): thread opsInsights through all builders + mergeViews\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

# PHASE 3 — Surface (export + dashboard + i18n)

## Task 10: Base-2 byte formatting + `fmtNum`

**Files:**
- Modify: `src/utils/format.ts`
- Test: `src/utils/format.test.ts` (extend if present; create if absent)

**Interfaces:**
- Produces: `formatBytes(bytes, locale?, baseTen?)`, `gbToBytes(gb, baseTen?)`, `formatGbOrUnknown(gb, locale, unknown, baseTen?)` (all back-compatible — `baseTen` defaults to `true`); `fmtNum(n, locale?, digits?)`.

> Documented invariant refinement: `format.ts` stays base-10 by default (PPDM/NetWorker unchanged); Avamar passes `meta.baseTen === false` to render GiB/TiB. Update the file header comment and note this in CLAUDE.md's "Base-10 byte formatting" bullet.

- [ ] **Step 1: Write the failing test** — add to `src/utils/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fmtNum, formatBytes, gbToBytes } from './format'

describe('base-2 byte formatting', () => {
  it('formatBytes base-2 uses GiB/TiB tiers', () => {
    expect(formatBytes(2 ** 30, 'en-US', false)).toBe('1.0 GiB')
    expect(formatBytes(2 ** 40, 'en-US', false)).toBe('1.0 TiB')
  })

  it('gbToBytes base-2 multiplies by 2^30', () => {
    expect(gbToBytes(1, false)).toBe(2 ** 30)
    // round-trip: 125 GiB → "125.0 GiB"
    expect(formatBytes(gbToBytes(125, false), 'en-US', false)).toBe('125.0 GiB')
  })

  it('default stays base-10', () => {
    expect(formatBytes(1e9, 'en-US')).toBe('1.0 GB')
    expect(gbToBytes(1)).toBe(1e9)
  })

  it('fmtNum formats a locale decimal', () => {
    expect(fmtNum(24.49, 'en-US', 1)).toBe('24.5')
  })
})
```

- [ ] **Step 2: Run, verify fail** → `npx vitest run src/utils/format.test.ts` → FAIL.

- [ ] **Step 3: Implement** — in `src/utils/format.ts`:

Replace `formatBytes`:

```ts
export const formatBytes = (bytes: number, locale = 'fr-FR', baseTen = true): string => {
  if (!Number.isFinite(bytes)) return '—'
  const opts = { maximumFractionDigits: 1, minimumFractionDigits: 1 } as const
  const abs = Math.abs(bytes)
  if (baseTen) {
    if (abs >= 1e12) return `${(bytes / 1e12).toLocaleString(locale, opts)} TB`
    if (abs >= 1e9) return `${(bytes / 1e9).toLocaleString(locale, opts)} GB`
    if (abs >= 1e6) return `${(bytes / 1e6).toLocaleString(locale, opts)} MB`
    if (abs >= 1e3) return `${(bytes / 1e3).toLocaleString(locale, opts)} KB`
    return `${Math.round(bytes).toLocaleString(locale, { maximumFractionDigits: 0 })} B`
  }
  const T = 2 ** 40
  const G = 2 ** 30
  const M = 2 ** 20
  const K = 2 ** 10
  if (abs >= T) return `${(bytes / T).toLocaleString(locale, opts)} TiB`
  if (abs >= G) return `${(bytes / G).toLocaleString(locale, opts)} GiB`
  if (abs >= M) return `${(bytes / M).toLocaleString(locale, opts)} MiB`
  if (abs >= K) return `${(bytes / K).toLocaleString(locale, opts)} KiB`
  return `${Math.round(bytes).toLocaleString(locale, { maximumFractionDigits: 0 })} B`
}
```

Replace `gbToBytes` + `formatGbOrUnknown`:

```ts
/** Convert gigabytes to bytes; base-10 (×1e9) by default, base-2 GiB (×2^30) when baseTen=false. */
export const gbToBytes = (gb: number, baseTen = true): number => gb * (baseTen ? 1e9 : 2 ** 30)

/** Bytes for a GB value, or the supplied "unknown" label when the size is absent. */
export function formatGbOrUnknown(
  gb: number | undefined,
  locale: string,
  unknown: string,
  baseTen = true,
): string {
  return gb === undefined ? unknown : formatBytes(gbToBytes(gb, baseTen), locale, baseTen)
}
```

Add `fmtNum` (after `fmtInt`):

```ts
/** Locale-aware decimal number (default 1 fraction digit). Em-dash for non-finite. */
export const fmtNum = (n: number, locale = 'fr-FR', digits = 1): string =>
  Number.isFinite(n) ? n.toLocaleString(locale, { maximumFractionDigits: digits }) : '—'
```

- [ ] **Step 4: Run, verify pass** → `npx vitest run src/utils/format.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts src/utils/format.test.ts
git commit -m "$(printf 'feat(format): base-2 byte formatting (opt-in) + fmtNum decimal helper\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 11: Threshold tones for at-risk + duration

**Files:**
- Modify: `src/engines/export/thresholds.ts`
- Test: `src/engines/export/thresholds.test.ts` (extend if present)

- [ ] **Step 1: Write the failing test** — add to `src/engines/export/thresholds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { atRiskTone, backupDurationTone } from './thresholds'

describe('ops-insight tones', () => {
  it('atRiskTone: zero ok, any breach warn', () => {
    expect(atRiskTone(0)).toBe('ok')
    expect(atRiskTone(5)).toBe('warn')
  })
  it('backupDurationTone: bands at 4h and 12h', () => {
    expect(backupDurationTone(2)).toBe('ok')
    expect(backupDurationTone(6)).toBe('warn')
    expect(backupDurationTone(20)).toBe('bad')
  })
})
```

- [ ] **Step 2: Run, verify fail** → FAIL.

- [ ] **Step 3: Implement** — append to `src/engines/export/thresholds.ts`:

```ts
/** At-risk client count — any breach is a warning. */
export function atRiskTone(count: number): ExportTone {
  return count === 0 ? 'ok' : 'warn'
}

/** Backup duration (hours) — long jobs threaten the window. */
export function backupDurationTone(hours: number): ExportTone {
  if (hours >= 12) return 'bad'
  if (hours >= 4) return 'warn'
  return 'ok'
}
```

- [ ] **Step 4: Run, verify pass** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/export/thresholds.ts src/engines/export/thresholds.test.ts
git commit -m "$(printf 'feat(thresholds): at-risk + backup-duration tones\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 12: i18n keys for the three sections (all four locales)

**Files:**
- Modify: `src/i18n/locales/en/dashboard.json`
- Modify: `src/i18n/locales/fr/dashboard.json`
- Modify: `src/i18n/locales/de/dashboard.json`
- Modify: `src/i18n/locales/it/dashboard.json`

- [ ] **Step 1: Add to `en/dashboard.json`** (as new top-level keys alongside `volumetry`):

```json
  "agentVersions": {
    "title": "Agent version spread",
    "col": { "version": "Agent version", "count": "Clients" },
    "takeaway": "{{count}} distinct agent versions in use",
    "caption": "Client agent versions across the estate."
  },
  "atRisk": {
    "title": "At-risk clients",
    "col": { "client": "Client", "type": "Type", "risk": "Risk" },
    "risk": { "overtime": "Backup window breach", "stale": "No backup in 7 days" },
    "overtimeChip": "Over window",
    "staleChip": "Missed 7 days",
    "takeaway": "{{overtime}} over window · {{stale}} missed in 7 days",
    "caption": "Top {{shown}} of {{total}}."
  },
  "longestBackups": {
    "title": "Longest-running backups",
    "col": {
      "server": "Server",
      "type": "Workload",
      "duration": "Duration (h)",
      "capacity": "Capacity",
      "throughput": "Throughput (MB/s)"
    },
    "takeaway": "Longest backup ran {{hours}} h",
    "caption": "Top {{shown}} of {{total}} by duration."
  }
```

- [ ] **Step 2: Add to `fr/dashboard.json`:**

```json
  "agentVersions": {
    "title": "Répartition des versions d'agent",
    "col": { "version": "Version d'agent", "count": "Clients" },
    "takeaway": "{{count}} versions d'agent distinctes utilisées",
    "caption": "Versions des agents clients dans le parc."
  },
  "atRisk": {
    "title": "Clients à risque",
    "col": { "client": "Client", "type": "Type", "risk": "Risque" },
    "risk": { "overtime": "Dépassement de fenêtre", "stale": "Aucune sauvegarde depuis 7 jours" },
    "overtimeChip": "Hors fenêtre",
    "staleChip": "Manquées 7 jours",
    "takeaway": "{{overtime}} hors fenêtre · {{stale}} manquées en 7 jours",
    "caption": "Top {{shown}} sur {{total}}."
  },
  "longestBackups": {
    "title": "Sauvegardes les plus longues",
    "col": {
      "server": "Serveur",
      "type": "Charge de travail",
      "duration": "Durée (h)",
      "capacity": "Capacité",
      "throughput": "Débit (Mo/s)"
    },
    "takeaway": "La plus longue sauvegarde a duré {{hours}} h",
    "caption": "Top {{shown}} sur {{total}} par durée."
  }
```

- [ ] **Step 3: Add to `de/dashboard.json`:**

```json
  "agentVersions": {
    "title": "Agent-Versionsverteilung",
    "col": { "version": "Agent-Version", "count": "Clients" },
    "takeaway": "{{count}} verschiedene Agent-Versionen im Einsatz",
    "caption": "Client-Agent-Versionen im Bestand."
  },
  "atRisk": {
    "title": "Gefährdete Clients",
    "col": { "client": "Client", "type": "Typ", "risk": "Risiko" },
    "risk": { "overtime": "Backup-Fenster überschritten", "stale": "Kein Backup seit 7 Tagen" },
    "overtimeChip": "Über Fenster",
    "staleChip": "7 Tage verpasst",
    "takeaway": "{{overtime}} über Fenster · {{stale}} in 7 Tagen verpasst",
    "caption": "Top {{shown}} von {{total}}."
  },
  "longestBackups": {
    "title": "Längste Backups",
    "col": {
      "server": "Server",
      "type": "Workload",
      "duration": "Dauer (h)",
      "capacity": "Kapazität",
      "throughput": "Durchsatz (MB/s)"
    },
    "takeaway": "Längstes Backup dauerte {{hours}} h",
    "caption": "Top {{shown}} von {{total}} nach Dauer."
  }
```

- [ ] **Step 4: Add to `it/dashboard.json`:**

```json
  "agentVersions": {
    "title": "Distribuzione versioni agent",
    "col": { "version": "Versione agent", "count": "Client" },
    "takeaway": "{{count}} versioni agent distinte in uso",
    "caption": "Versioni agent dei client nel parco."
  },
  "atRisk": {
    "title": "Client a rischio",
    "col": { "client": "Client", "type": "Tipo", "risk": "Rischio" },
    "risk": { "overtime": "Finestra di backup superata", "stale": "Nessun backup da 7 giorni" },
    "overtimeChip": "Oltre finestra",
    "staleChip": "Mancati 7 giorni",
    "takeaway": "{{overtime}} oltre finestra · {{stale}} mancati in 7 giorni",
    "caption": "Primi {{shown}} di {{total}}."
  },
  "longestBackups": {
    "title": "Backup più lunghi",
    "col": {
      "server": "Server",
      "type": "Workload",
      "duration": "Durata (h)",
      "capacity": "Capacità",
      "throughput": "Throughput (MB/s)"
    },
    "takeaway": "Il backup più lungo è durato {{hours}} h",
    "caption": "Primi {{shown}} di {{total}} per durata."
  }
```

- [ ] **Step 5: Verify parity + valid JSON** — `npx vitest run src/i18n/keyParity.test.ts` → PASS. (If it fails, a key is missing/extra in one locale — reconcile.)

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales
git commit -m "$(printf 'feat(i18n): ops-insight section keys in en/fr/de/it\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 13: Export sections + section order + PPTX full-width registration

**Files:**
- Modify: `src/engines/export/sectionOrder.ts`
- Modify: `src/engines/export/buildExportModel.ts`
- Modify: `src/engines/export/pptx/slidePlan.ts`
- Test: `src/engines/export/buildExportModel.test.ts` (add cases)

**Interfaces:**
- Consumes: `view.opsInsights`, `fmtInt`/`fmtNum`/`formatBytes`/`gbToBytes` (format), `atRiskTone` (thresholds), `toBars` (local).
- Produces: three `ExportSection`s registered in `byId` and `SECTION_ORDER`; PPTX renders each as a full-width table slide.

- [ ] **Step 1: Extend `SectionId` + order** — `src/engines/export/sectionOrder.ts`:

```ts
export type SectionId =
  | 'perServer'
  | 'coverage'
  | 'exposure'
  | 'volumetry'
  | 'idle'
  | 'jobs'
  | 'resilience'
  | 'capacity'
  | 'policies'
  | 'atRisk'
  | 'agentVersions'
  | 'longestBackups'
export const SECTION_ORDER: Record<ExportFlavor, SectionId[]> = {
  assessment: [
    'perServer',
    'coverage',
    'exposure',
    'volumetry',
    'atRisk',
    'idle',
    'jobs',
    'resilience',
    'capacity',
    'policies',
    'agentVersions',
    'longestBackups',
  ],
  ops: [
    'perServer',
    'jobs',
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
}
```

- [ ] **Step 2: Write the failing test** — add to `src/engines/export/buildExportModel.test.ts` (uses the existing `baseView`/`view` helper that now includes `opsInsights`):

```ts
  it('renders the three ops-insight sections when opsInsights is populated', () => {
    const v = baseView({
      opsInsights: {
        agentVersions: [{ version: '19.4', count: 4 }],
        atRisk: {
          overtime: { items: [{ name: 'c1', clientType: 'VM' }], total: 1, shown: 1 },
          staleBackups: { items: [{ name: 'c2' }], total: 1, shown: 1 },
        },
        longestBackups: {
          items: [{ server: 's1', policyType: 'FS', durationHr: 10, capacityGb: 5, throughputMbSec: 2 }],
          total: 1,
          shown: 1,
        },
      },
    })
    const model = buildExportModel(v, 'ops', 'light', t, 'en-US')
    const ids = model.sections.map((s) => s.id)
    expect(ids).toContain('agentVersions')
    expect(ids).toContain('atRisk')
    expect(ids).toContain('longestBackups')
    const atRisk = model.sections.find((s) => s.id === 'atRisk')
    expect(atRisk?.table?.rows.length).toBe(2) // overtime + stale flattened
  })

  it('suppresses ops-insight sections when opsInsights is empty', () => {
    const model = buildExportModel(baseView({}), 'ops', 'light', t, 'en-US')
    const ids = model.sections.map((s) => s.id)
    expect(ids).not.toContain('agentVersions')
    expect(ids).not.toContain('atRisk')
    expect(ids).not.toContain('longestBackups')
  })
```

(If `baseView` does not default `opsInsights`, import `emptyOpsInsights` and have `baseView` spread it — see Task 9 Step 4.)

- [ ] **Step 3: Run, verify fail** → FAIL (sections not built yet; also a TS error because `byId` is non-exhaustive over the new `SectionId`s — expected until Step 4).

- [ ] **Step 4: Implement the sections** — in `src/engines/export/buildExportModel.ts`:

Add imports: `fmtNum` from `../../utils/format`; `atRiskTone` from `./thresholds`. Destructure `opsInsights` and `meta` (already destructured) from `view`. Add a base-2-aware byte helper near the other `fe*` helpers:

```ts
  const b10 = meta.baseTen
  const bytesOf = (gb: number) => formatBytes(gbToBytes(gb, b10), locale, b10)
```

Then build the three sections (place before the `byId` map):

```ts
  const { agentVersions, atRisk, longestBackups } = view.opsInsights

  const agentVersionsSection: ExportSection = {
    id: 'agentVersions',
    title: t('dashboard:agentVersions.title'),
    table: {
      columns: [t('dashboard:agentVersions.col.version'), t('dashboard:agentVersions.col.count')],
      rows: agentVersions.map((r) => [r.version, fmtInt(r.count, locale)]),
      caption: t('dashboard:agentVersions.caption'),
    },
    deck:
      agentVersions.length > 0
        ? {
            subtitle: t('dashboard:agentVersions.takeaway', {
              count: fmtInt(agentVersions.length, locale),
            }),
            kpiChips: [
              {
                label: t('dashboard:agentVersions.title'),
                value: fmtInt(agentVersions.length, locale),
                tone: 'accent',
              },
            ],
            bars: toBars(
              agentVersions.slice(0, 8).map((r) => ({
                label: r.version,
                magnitude: r.count,
                value: fmtInt(r.count, locale),
                tone: (r.version === 'Unknown' ? 'warn' : 'accent') as ExportTone,
              })),
              pal,
            ),
          }
        : undefined,
  }

  const atRiskRows: string[][] = [
    ...atRisk.overtime.items.map((c) => [
      c.name,
      c.clientType ?? '',
      t('dashboard:atRisk.risk.overtime'),
    ]),
    ...atRisk.staleBackups.items.map((c) => [
      c.name,
      c.clientType ?? '',
      t('dashboard:atRisk.risk.stale'),
    ]),
  ]
  const atRiskSection: ExportSection = {
    id: 'atRisk',
    title: t('dashboard:atRisk.title'),
    table: {
      columns: [
        t('dashboard:atRisk.col.client'),
        t('dashboard:atRisk.col.type'),
        t('dashboard:atRisk.col.risk'),
      ],
      rows: atRiskRows,
      caption: t('dashboard:atRisk.caption', {
        shown: atRiskRows.length,
        total: atRisk.overtime.total + atRisk.staleBackups.total,
      }),
    },
    deck:
      atRiskRows.length > 0
        ? {
            subtitle: t('dashboard:atRisk.takeaway', {
              overtime: fmtInt(atRisk.overtime.total, locale),
              stale: fmtInt(atRisk.staleBackups.total, locale),
            }),
            kpiChips: [
              {
                label: t('dashboard:atRisk.overtimeChip'),
                value: fmtInt(atRisk.overtime.total, locale),
                tone: atRiskTone(atRisk.overtime.total),
              },
              {
                label: t('dashboard:atRisk.staleChip'),
                value: fmtInt(atRisk.staleBackups.total, locale),
                tone: atRiskTone(atRisk.staleBackups.total),
              },
            ],
          }
        : undefined,
  }

  const longestBackupsSection: ExportSection = {
    id: 'longestBackups',
    title: t('dashboard:longestBackups.title'),
    table: {
      columns: [
        t('dashboard:longestBackups.col.server'),
        t('dashboard:longestBackups.col.type'),
        t('dashboard:longestBackups.col.duration'),
        t('dashboard:longestBackups.col.capacity'),
        t('dashboard:longestBackups.col.throughput'),
      ],
      rows: longestBackups.items.map((r) => [
        r.server,
        r.policyType,
        fmtNum(r.durationHr, locale, 1),
        r.capacityGb === undefined ? t('common:sizeUnknown') : bytesOf(r.capacityGb),
        r.throughputMbSec === undefined ? t('common:sizeUnknown') : fmtNum(r.throughputMbSec, locale, 1),
      ]),
      caption: t('dashboard:longestBackups.caption', {
        shown: longestBackups.shown,
        total: longestBackups.total,
      }),
    },
    deck:
      longestBackups.items.length > 0
        ? {
            subtitle: t('dashboard:longestBackups.takeaway', {
              hours: fmtNum(longestBackups.items[0]?.durationHr ?? 0, locale, 1),
            }),
          }
        : undefined,
  }
```

Add the three to the `byId` map (the `Record<SectionId, ...>` is now exhaustive again):

```ts
    policies: policiesSection,
    atRisk: atRiskSection,
    agentVersions: agentVersionsSection,
    longestBackups: longestBackupsSection,
  }
```

> Note: a section with an empty table AND no deck (empty `opsInsights`) is dropped by the existing `isRenderable` predicate and folded into the data-caveats warnings — exactly the volumetry-suppression behavior.

- [ ] **Step 5: Register PPTX full-width** — `src/engines/export/pptx/slidePlan.ts`:

```ts
const FULLWIDTH: Record<string, 'single' | 'table'> = {
  idle: 'single',
  volumetry: 'table',
  atRisk: 'table',
  agentVersions: 'table',
  longestBackups: 'table',
}
```

- [ ] **Step 6: Run, verify pass** — `npx vitest run src/engines/export/buildExportModel.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/engines/export/sectionOrder.ts src/engines/export/buildExportModel.ts src/engines/export/pptx/slidePlan.ts src/engines/export/buildExportModel.test.ts
git commit -m "$(printf 'feat(export): agent-version / at-risk / longest-backup sections (base-2 aware)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 14: Dashboard components for the three sections

**Files:**
- Create: `src/components/dashboard/AgentVersionsSection.tsx`
- Create: `src/components/dashboard/AtRiskSection.tsx`
- Create: `src/components/dashboard/LongestBackupsSection.tsx`
- Modify: `src/components/dashboard/Dashboard.tsx`

**Interfaces:**
- Consumes: `ReportView` (`view.opsInsights`, `view.meta.baseTen`), `useTranslation`, `fmtInt`/`fmtNum`/`formatBytes`/`gbToBytes`.
- Produces: three React section components + `renderSection` cases.

- [ ] **Step 1: AgentVersionsSection** — `src/components/dashboard/AgentVersionsSection.tsx`

```tsx
import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function AgentVersionsSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const { agentVersions } = view.opsInsights
  if (agentVersions.length === 0) return null

  return (
    <section aria-label={t('agentVersions.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('agentVersions.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('agentVersions.takeaway', { count: fmtInt(agentVersions.length, locale) })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('agentVersions.col.version')}</th>
              <th className="pb-2 font-medium text-right">{t('agentVersions.col.count')}</th>
            </tr>
          </thead>
          <tbody>
            {agentVersions.map((r) => (
              <tr
                key={r.version}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{r.version}</td>
                <td className="py-1.5 text-right">{fmtInt(r.count, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: AtRiskSection** — `src/components/dashboard/AtRiskSection.tsx`

```tsx
import { useTranslation } from 'react-i18next'
import type { AtRiskClient, ReportView } from '../../types/reportView'
import { fmtInt } from '../../utils/format'

export function AtRiskSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const { overtime, staleBackups } = view.opsInsights.atRisk
  const rows: { client: AtRiskClient; risk: string }[] = [
    ...overtime.items.map((client) => ({ client, risk: t('atRisk.risk.overtime') })),
    ...staleBackups.items.map((client) => ({ client, risk: t('atRisk.risk.stale') })),
  ]
  if (rows.length === 0) return null

  return (
    <section aria-label={t('atRisk.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('atRisk.title')}
      </h2>
      <p className="mb-4 text-3xl font-bold text-gray-900 dark:text-gray-100">
        {t('atRisk.takeaway', {
          overtime: fmtInt(overtime.total, locale),
          stale: fmtInt(staleBackups.total, locale),
        })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('atRisk.col.client')}</th>
              <th className="pb-2 pr-4 font-medium">{t('atRisk.col.type')}</th>
              <th className="pb-2 font-medium">{t('atRisk.col.risk')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.client.name}-${i}`}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{r.client.name}</td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                  {r.client.clientType ?? ''}
                </td>
                <td className="py-1.5">{r.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: LongestBackupsSection** — `src/components/dashboard/LongestBackupsSection.tsx`

```tsx
import { useTranslation } from 'react-i18next'
import type { ReportView } from '../../types/reportView'
import { fmtNum, formatBytes, gbToBytes } from '../../utils/format'

export function LongestBackupsSection({ view }: { view: ReportView }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const locale = i18n.language
  const b10 = view.meta.baseTen
  const { longestBackups } = view.opsInsights
  if (longestBackups.items.length === 0) return null

  return (
    <section aria-label={t('longestBackups.title')}>
      <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {t('longestBackups.title')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-2 pr-4 font-medium">{t('longestBackups.col.server')}</th>
              <th className="pb-2 pr-4 font-medium">{t('longestBackups.col.type')}</th>
              <th className="pb-2 pr-4 font-medium text-right">{t('longestBackups.col.duration')}</th>
              <th className="pb-2 pr-4 font-medium text-right">{t('longestBackups.col.capacity')}</th>
              <th className="pb-2 font-medium text-right">{t('longestBackups.col.throughput')}</th>
            </tr>
          </thead>
          <tbody>
            {longestBackups.items.map((r, i) => (
              <tr
                key={`${r.server}-${i}`}
                className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200"
              >
                <td className="py-1.5 pr-4 font-medium">{r.server}</td>
                <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">{r.policyType}</td>
                <td className="py-1.5 pr-4 text-right">{fmtNum(r.durationHr, locale, 1)}</td>
                <td className="py-1.5 pr-4 text-right">
                  {r.capacityGb === undefined ? '–' : formatBytes(gbToBytes(r.capacityGb, b10), locale, b10)}
                </td>
                <td className="py-1.5 text-right">
                  {r.throughputMbSec === undefined ? '–' : fmtNum(r.throughputMbSec, locale, 1)}
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

- [ ] **Step 4: Wire `renderSection`** — `src/components/dashboard/Dashboard.tsx`: add the three imports and three `case`s:

```tsx
import { AgentVersionsSection } from './AgentVersionsSection'
import { AtRiskSection } from './AtRiskSection'
import { LongestBackupsSection } from './LongestBackupsSection'
```
```tsx
      case 'policies':
        return <PoliciesSection key={id} view={view} dark={dark} />
      case 'atRisk':
        return <AtRiskSection key={id} view={view} />
      case 'agentVersions':
        return <AgentVersionsSection key={id} view={view} />
      case 'longestBackups':
        return <LongestBackupsSection key={id} view={view} />
```

> The `renderSection` switch returns `undefined` for unhandled ids (existing behavior for `volumetry`/`resilience`); the three new cases make the ops sections appear on the dashboard. Empty `opsInsights` → each component returns `null`, so non-Avamar products render nothing extra.

- [ ] **Step 5: Typecheck + lint** — `npm run typecheck && npm run lint` → green. (No new unit test for the presentational components; they're verified by typecheck + the export-model tests covering the same data. This matches the repo convention of not unit-testing pure presentational glue.)

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard
git commit -m "$(printf 'feat(dashboard): agent-version / at-risk / longest-backup sections\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

## Task 15: Phase-3 gate + docs touch-up

**Files:**
- Modify: `CLAUDE.md` (refine the base-10 byte-formatting bullet; note Avamar detail enrichment)
- Modify: `src/engines/products/avamar/buildAvamarView.ts` header comment (drop the stale "MVP fidelity" note)

- [ ] **Step 1: Update CLAUDE.md** — adjust the "Base-10 byte formatting" invariant to: *base-10 by default; Avamar passes `meta.baseTen === false` for base-2 GiB/TiB*. Update the Avamar MVP-shape paragraph to reflect detail-first jobs/workloads/policies, front-end volumetry, replication resilience, and ops insights.

- [ ] **Step 2: Full CI sequence** (must match `.github/workflows/ci.yml`):

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```
Expected: all green (build triggers the supply-chain gate via `prebuild`).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md src/engines/products/avamar/buildAvamarView.ts
git commit -m "$(printf 'docs(avamar): document detail enrichment + base-2 formatting refinement\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

- [ ] **Step 4: Optional manual smoke** — if a real Avamar `.xlsx` is available locally (NOT committed), run the headless CLI to eyeball the deck:
  `npm run pptx -- "<path to TEST avamar.xlsx>"` and confirm jobs ≈ 98%, replication ≈ 99.7%, volumetry/agent-version/at-risk/longest-backup slides render. (Pre-existing caveat: the CLI may crash under Node 26 due to a tsx/ESM issue unrelated to this work.)

---

## Self-Review (completed by plan author)

**Spec coverage:** jobs (T1), workloads (T2), policies (T3), front-end volumetry (T4), replication (T5), provenance + wiring + fixture (T6), OpsInsights type/merge (T7), compute ops insights (T8), thread through builders (T9), base-2 formatting (T10), tones (T11), i18n×4 (T12), export sections + order + PPTX (T13), dashboard components (T14), docs + gate (T15). Coverage-by-type intentionally left unavailable (spec D-COV) — no task, by design. Optional client-type composition note (spec §1.7) deferred as a non-blocking nice-to-have; omitted from tasks to respect YAGNI.

**Type consistency:** `OpsInsights`/`AgentVersionRow`/`AtRiskClient`/`AtRiskClients`/`LongBackupRow` defined in T7 and consumed identically in T8/T9/T13/T14. `avamarJobs`/`avamarWorkloads`/`avamarPolicies`/`avamarReplication`/`computeAvamarFrontEnd`/`computeAvamarOpsInsights` signatures match their call sites in `buildAvamarView`. `formatBytes`/`gbToBytes`/`formatGbOrUnknown` gain a trailing optional `baseTen` (back-compatible). `SectionId` additions are mirrored in `SECTION_ORDER`, `byId`, `FULLWIDTH`, and `Dashboard.renderSection`.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every test step shows the assertions and the exact `vitest` command.
