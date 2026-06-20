# Multi-Product Abstraction (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a product-detection + adapter-registry seam so the report pipeline can ingest more than one backup product, and re-home today's PPDM logic behind it with zero behavior change — laying the foundation for the Avamar adapter (phase 2).

**Architecture:** A new pure `detectProduct` classifies each workbook by sheet signature. Parse output becomes the product-neutral `RawWorkbook` (just `meta` + `sheets` + `warnings`); PPDM's agent classification moves into a `buildPpdmView` adapter registered in `engines/products/`. The derivation layer groups loaded servers by product and emits an `EstateDocument` (one per-product `EstateView` section), which the UI and exports render section-by-section. No cross-product totals are ever computed.

**Tech Stack:** React 19, TypeScript 5 (strict), Vite 6, Zustand 5, Vitest 3, Biome 2, i18next, ECharts, pptxgenjs.

## Global Constraints

- **Pure engines.** Everything under `src/engines/**` (including the new `detectProduct`, `buildPpdmView`, registry, and `buildEstateDocument`) must have no React/DOM/store imports and no `Date.now()`/`Math.random()` nondeterminism.
- **Privacy invariant.** Do not add any network call; the worker imports `../../privacy/fetchGuard` first. Nothing leaves the browser.
- **SheetJS pin.** Never `npm install xlsx`; the CDN-tarball pin in `package.json` stays exactly `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Do not add dependencies (the supply-chain gate in `scripts/check-supply-chain.mjs` fails the build otherwise).
- **Test fixtures.** Use only synthetic in-memory workbooks via `makeWorkbook` in `src/test-helpers/workbooks.ts`. **Never read the gitignored `ref/` fixtures** (they ENOENT in CI).
- **i18n parity.** Any user-facing string added to `src/i18n/locales/en/*.json` must be added to `fr`, `de`, and `it` too, or `src/i18n/keyParity.test.ts` fails CI.
- **Coverage gate.** New code under `src/engines/**` and `src/utils/**` is held to ≥75% lines/functions/branches/statements (`npm run test:coverage`).
- **Biome style.** Single quotes, no semicolons, 2-space indent, 100-col width. No unused imports/vars (errors). `console` only `warn`/`error`. Run `npm run lint` before each commit.
- **Zero behavior change for PPDM.** The full existing test suite (`npm run test:run`) must stay green after every task. Tasks 2–4 must not alter any PPDM-facing output (dashboard, PPTX, HTML) for a single PPDM workbook beyond an added product header.
- **Commit trailers.** Every commit message ends with the two repo-policy trailer lines:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01UNXq9BXAtjWU8K2DVjJmNv`. (Step commit commands below show the subject line only; append the trailers.)
- **Branch.** Work on `feat/multi-product-support` (already created off `main`).

---

## File structure

**Created:**
- `src/engines/parser/detectProduct.ts` — pure `detectProduct(wb) → ProductId` (sheet-signature based).
- `src/engines/parser/detectProduct.test.ts`
- `src/engines/products/index.ts` — `ViewBuilder` type + builder registry (`getViewBuilder`, `isSupportedProduct`).
- `src/engines/products/ppdm/buildPpdmView.ts` — PPDM `RawWorkbook → ReportView` (today's `buildReportView` + agent classification).
- `src/engines/products/ppdm/buildPpdmView.test.ts`
- `src/engines/products/estateDocument.ts` — pure `buildEstateDocument(servers) → EstateDocument`.
- `src/engines/products/estateDocument.test.ts`
- `src/components/dashboard/ProductSection.tsx` — product header + `<Dashboard>` for one product estate.

**Modified:**
- `src/types/ppdm.ts` — add `ProductId`; rename `ParsedWorkbook → RawWorkbook` (drop `inUse`/`idleAgents`); add `product` to `ServerWorkbook`.
- `src/types/reportView.ts` — add `ProductEstate` + `EstateDocument`.
- `src/engines/parser/normalizeWorkbook.ts` — return `RawWorkbook` (stop classifying agents).
- `src/engines/parser/mergeWorkbooks.ts` — fold into `RawWorkbook` (stop classifying agents).
- `src/engines/parser/parser.worker.ts`, `parseInWorker.ts` — `RawWorkbook` types.
- `src/engines/aggregation/*.ts` (coverage, gaps, jobs, compliance, capacity, policies, summaryView, detectFormat) — param type `ParsedWorkbook → RawWorkbook` (mechanical).
- `src/hooks/useReportUpload.ts` — detect + tag product, reject unsupported.
- `src/hooks/useReportView.ts` — return `EstateDocument` via `buildEstateDocument`.
- `src/App.tsx` — render one `<ProductSection>` per document entry; pass document to `ExportButtons`.
- `src/components/ExportButtons.tsx`, `src/hooks/useExport.ts` — accept `EstateDocument | null`.
- `src/store/reportStore.ts` — carry `product` through `addServers`.
- `src/i18n/locales/{en,fr,de,it}/dashboard.json` — add `product.badge` key.
- Test files updated to the new shapes (enumerated per task).

**Deleted:**
- `src/engines/aggregation/reportView.ts` (logic moves to `buildPpdmView`); importers repointed.

---

## Task 1: `detectProduct` + `ProductId` (pure, additive)

**Files:**
- Modify: `src/types/ppdm.ts` (add `ProductId`)
- Create: `src/engines/parser/detectProduct.ts`
- Test: `src/engines/parser/detectProduct.test.ts`

**Interfaces:**
- Produces: `export type ProductId = 'ppdm' | 'avamar' | 'networker' | 'unknown'` (in `types/ppdm.ts`); `export function detectProduct(wb: { sheets: Record<string, SheetData> }): ProductId`.

- [ ] **Step 1: Add `ProductId` to `src/types/ppdm.ts`**

Add after the `Cell` type (top of file):

```ts
/** The backup product a workbook came from. */
export type ProductId = 'ppdm' | 'avamar' | 'networker' | 'unknown'
```

- [ ] **Step 2: Write the failing test**

Create `src/engines/parser/detectProduct.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SheetData } from '../../types/ppdm'
import { detectProduct } from './detectProduct'

const wbOf = (names: string[]): { sheets: Record<string, SheetData> } => ({
  sheets: Object.fromEntries(
    names.map((n) => [n, { name: n, headers: [], rows: [], capped: false }]),
  ),
})

describe('detectProduct', () => {
  it('detects Avamar from the unique "Avamar DPN Summary" sheet', () => {
    expect(detectProduct(wbOf(['Details', 'Avamar DPN Summary', 'Group Summary']))).toBe('avamar')
  })

  it('detects Avamar from the completion-summary + plugins pair', () => {
    expect(detectProduct(wbOf(['Backup Completion Summary', 'Backup Plugins']))).toBe('avamar')
  })

  it('detects NetWorker from "Storage Nodes" + "Dedup Jobs"', () => {
    expect(detectProduct(wbOf(['Clients', 'Storage Nodes', 'Dedup Jobs']))).toBe('networker')
  })

  it('detects PPDM summary from "System Configuration"', () => {
    expect(detectProduct(wbOf(['System Configuration', 'VMs Count And Cap']))).toBe('ppdm')
  })

  it('detects PPDM detail from "Storage Targets" + "Data Domain Mtrees"', () => {
    expect(detectProduct(wbOf(['Virtual Machines', 'Storage Targets', 'Data Domain Mtrees']))).toBe(
      'ppdm',
    )
  })

  it('returns "unknown" for a foreign workbook', () => {
    expect(detectProduct(wbOf(['Sheet1', 'RandomData']))).toBe('unknown')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engines/parser/detectProduct.test.ts`
Expected: FAIL — `detectProduct` is not defined / module not found.

- [ ] **Step 4: Write the implementation**

Create `src/engines/parser/detectProduct.ts`:

```ts
import type { ProductId, SheetData } from '../../types/ppdm'

/**
 * Classify a workbook by sheet-name signature. Pure and name-based — each
 * product carries an unambiguous marker; order is just a safety net.
 * PPDM internal detail-vs-summary is decided later by `detectFormat`.
 */
export function detectProduct(wb: { sheets: Record<string, SheetData> }): ProductId {
  const has = (name: string) => name in wb.sheets

  if (has('Avamar DPN Summary') || (has('Backup Completion Summary') && has('Backup Plugins'))) {
    return 'avamar'
  }
  if (has('Storage Nodes') && has('Dedup Jobs')) return 'networker'
  if (has('System Configuration') || has('Data Domain Mtrees') || has('Storage Targets')) {
    return 'ppdm'
  }
  return 'unknown'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engines/parser/detectProduct.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/ppdm.ts src/engines/parser/detectProduct.ts src/engines/parser/detectProduct.test.ts
git commit -m "feat(parser): add pure detectProduct product-signature classifier"
```

---

## Task 2: Product-neutral `RawWorkbook` + `buildPpdmView` behind a registry, with upload tagging/gating (zero behavior change)

This is one cohesive refactor: the parse output stops being PPDM-shaped, PPDM logic moves behind the registry, and upload tags each file with its product (rejecting unsupported ones). The gate is **typecheck clean + full existing suite green + no PPDM output change**.

**Files:**
- Create: `src/engines/products/ppdm/buildPpdmView.ts`, `src/engines/products/ppdm/buildPpdmView.test.ts`, `src/engines/products/index.ts`
- Modify: `src/types/ppdm.ts`, `src/engines/parser/normalizeWorkbook.ts`, `src/engines/parser/mergeWorkbooks.ts`, `src/engines/parser/parser.worker.ts`, `src/engines/parser/parseInWorker.ts`, all `src/engines/aggregation/*.ts` that import `ParsedWorkbook`, `src/hooks/useReportUpload.ts`, `src/hooks/useReportView.ts`, `src/store/reportStore.ts`, and the test files listed below.
- Delete: `src/engines/aggregation/reportView.ts`

**Interfaces:**
- Consumes: `ProductId` (Task 1), `detectProduct` (Task 1), the existing aggregation `compute*`/`findGaps`/`summarizePolicies`/`summaryView`/`allAvailable`, `classifyAgents`, `detectFormat`.
- Produces:
  - `export interface RawWorkbook { meta: CaptureMeta; sheets: Record<string, SheetData>; warnings: string[] }` (replaces `ParsedWorkbook`).
  - `ServerWorkbook` gains `product: ProductId`.
  - `export function buildPpdmView(wb: RawWorkbook): ReportView`.
  - `export type ViewBuilder = (wb: RawWorkbook) => ReportView`; `export function getViewBuilder(p: ProductId): ViewBuilder | undefined`; `export function isSupportedProduct(p: ProductId): boolean`.

- [ ] **Step 1: Create `buildPpdmView` (logic copied from `aggregation/reportView.ts`, agent classification inlined)**

Create `src/engines/products/ppdm/buildPpdmView.ts`:

```ts
import type { RawWorkbook } from '../../../types/ppdm'
import type { ReportView } from '../../../types/reportView'
import { computeCapacity } from '../../aggregation/capacity'
import { computeCompliance } from '../../aggregation/compliance'
import { computeCoverage } from '../../aggregation/coverage'
import { findGaps } from '../../aggregation/gaps'
import { computeJobs } from '../../aggregation/jobs'
import { summarizePolicies } from '../../aggregation/policies'
import { allAvailable } from '../../aggregation/provenance'
import { summaryView } from '../../aggregation/summaryView'
import { classifyAgents } from '../../parser/detectInUse'
import { detectFormat } from '../../parser/detectFormat'

/** PPDM composition root: RawWorkbook → fully derived ReportView. Pure. */
export function buildPpdmView(wb: RawWorkbook): ReportView {
  if (detectFormat(wb) === 'summary') return summaryView(wb)
  const { inUse, idleAgents } = classifyAgents(Object.values(wb.sheets))
  const coverage = computeCoverage(wb)
  const totalAssets =
    coverage.overall.protected + coverage.overall.unprotected + coverage.overall.excluded
  return {
    meta: wb.meta,
    inUse,
    idleAgents,
    warnings: wb.warnings,
    coverage,
    gaps: findGaps(wb),
    jobs: computeJobs(wb),
    compliance: computeCompliance(wb),
    capacity: computeCapacity(wb),
    policies: summarizePolicies(wb),
    provenance: allAvailable(totalAssets),
  }
}
```

- [ ] **Step 2: Create the registry**

Create `src/engines/products/index.ts`:

```ts
import type { ProductId, RawWorkbook } from '../../types/ppdm'
import type { ReportView } from '../../types/reportView'
import { buildPpdmView } from './ppdm/buildPpdmView'

export type ViewBuilder = (wb: RawWorkbook) => ReportView

const BUILDERS: Partial<Record<ProductId, ViewBuilder>> = {
  ppdm: buildPpdmView,
}

/** The view-builder for a product, or undefined when unsupported. */
export function getViewBuilder(product: ProductId): ViewBuilder | undefined {
  return BUILDERS[product]
}

/** True when a product has a registered adapter (phase 1: PPDM only). */
export function isSupportedProduct(product: ProductId): boolean {
  return getViewBuilder(product) !== undefined
}
```

- [ ] **Step 3: Update `src/types/ppdm.ts` — rename type, drop fields, tag servers**

Replace the `ParsedWorkbook` interface and `ServerWorkbook` interface with:

```ts
/** Product-neutral parsed workbook: raw sheets + capture metadata + data caveats. */
export interface RawWorkbook {
  meta: CaptureMeta
  sheets: Record<string, SheetData>
  /** Human-readable data caveats (e.g. capped sheets). Never empty silently. */
  warnings: string[]
}

/** A parsed workbook tagged with its product and a human-readable source label. */
export interface ServerWorkbook {
  label: string
  product: ProductId
  workbook: RawWorkbook
}
```

(`ProductId` is already defined in this file from Task 1. `inUse`/`idleAgents` are intentionally removed — agent classification now lives in `buildPpdmView`.)

- [ ] **Step 4: Update `normalizeWorkbook` to return `RawWorkbook`**

Replace `src/engines/parser/normalizeWorkbook.ts` body so it no longer classifies agents:

```ts
import type { RawWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { captureMeta } from './captureMeta'
import { readWorkbook, toSheetData } from './readWorkbook'

/** Parse a Live Optics .xlsx into a product-neutral normalized workbook. */
export function normalizeWorkbook(buf: ArrayBuffer): RawWorkbook {
  const wb = readWorkbook(buf)
  const sheetList = toSheetData(wb)
  const sheets: Record<string, SheetData> = {}
  for (const s of sheetList) sheets[s.name] = s

  const warnings: string[] = []
  for (const s of sheetList) {
    if (s.capped) {
      warnings.push(
        `Sheet "${s.name}" reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row export cap; figures derived from it are a window, not the full set.`,
      )
    }
  }

  return { meta: captureMeta(wb), sheets, warnings }
}
```

- [ ] **Step 5: Update `mergeWorkbooks` to fold into `RawWorkbook` (stop classifying)**

Open `src/engines/parser/mergeWorkbooks.ts`. Change its return type to `RawWorkbook`, remove the `classifyAgents` import and the `inUse`/`idleAgents` fields from the returned object, keeping the sheet-fold + `foldMeta` + warnings exactly as before. The folded result is `{ meta, sheets, warnings }`. (This file is only consumed by `mergeViews.parity.test.ts` as the legacy reference; its sheet-folding logic is unchanged.)

- [ ] **Step 6: Delete the old composition root and repoint imports**

```bash
git rm src/engines/aggregation/reportView.ts
```

Then update the three production/test importers of `buildReportView` to import `buildPpdmView` from `../products/ppdm/buildPpdmView` (or the correct relative path) and call it identically:
- `src/hooks/useReportView.ts` (import path `../engines/products/ppdm/buildPpdmView`)
- `src/engines/aggregation/mergeViews.parity.test.ts` (import path `../products/ppdm/buildPpdmView`)
- `src/engines/parser/mergeWorkbooks.test.ts` (if it imports `buildReportView`, same repoint)

In `mergeViews.parity.test.ts`, the call `buildReportView(mergeWorkbooks(servers))` becomes `buildPpdmView(mergeWorkbooks(servers))` and `buildReportView(s.workbook)` becomes `buildPpdmView(s.workbook)`.

- [ ] **Step 7: Rename `aggregation/reportView.test.ts` to target `buildPpdmView`**

The existing `src/engines/aggregation/reportView.test.ts` tests the old `buildReportView`. Move/retarget it as the new module's test:

```bash
git mv src/engines/aggregation/reportView.test.ts src/engines/products/ppdm/buildPpdmView.test.ts
```

Edit its imports: `import { buildPpdmView } from './buildPpdmView'` and replace every `buildReportView(` call with `buildPpdmView(`. Replace any workbook literal that includes `inUse`/`idleAgents` with one built via `normalizeWorkbook(detailWorkbookBuffer())` / `normalizeWorkbook(summaryWorkbookBuffer())` (import from `../../../test-helpers/workbooks` and `../../parser/normalizeWorkbook`) so no test constructs the removed fields.

- [ ] **Step 8: Mechanically rename `ParsedWorkbook → RawWorkbook` everywhere it remains**

List the remaining files:

Run: `grep -rl 'ParsedWorkbook' src`

In each listed file, replace the identifier `ParsedWorkbook` with `RawWorkbook` (it appears only in `import type { … }` lines and type annotations — a pure identifier swap). These are the aggregation engines (`coverage.ts`, `gaps.ts`, `jobs.ts`, `compliance.ts`, `capacity.ts`, `policies.ts`, `summaryView.ts`, `detectFormat.ts`), parser glue (`parser.worker.ts`, `parseInWorker.ts`, `deriveLabel.ts`, `estateWarnings.ts`), and their `*.test.ts` files. None of these read `.inUse`/`.idleAgents` off the workbook (those reads were only in the deleted `reportView.ts`), so the swap is type-only.

- [ ] **Step 9: Tag product at upload + carry it through the store**

In `src/hooks/useReportUpload.ts`, import `detectProduct` and set the product when building the `ServerWorkbook`, and reject unsupported products. Replace the loop body and result handling:

```ts
import { detectProduct } from '../engines/parser/detectProduct'
import { isSupportedProduct } from '../engines/products'
// …
const ready: ServerWorkbook[] = []
const failed: string[] = []
const unsupported: string[] = []
try {
  for (const file of files) {
    try {
      const workbook = await parseInWorker(file)
      const product = detectProduct(workbook)
      if (!isSupportedProduct(product)) {
        unsupported.push(file.name)
        continue
      }
      ready.push({ label: deriveLabel(workbook, file.name), product, workbook })
    } catch {
      failed.push(file.name)
    }
  }
  if (ready.length > 0) addServers(ready)
  const problems: string[] = []
  if (failed.length > 0) problems.push(`Could not parse: ${failed.join(', ')}`)
  if (unsupported.length > 0) {
    problems.push(`Unrecognized or unsupported export (expected PPDM): ${unsupported.join(', ')}`)
  }
  if (problems.length > 0) setError(problems.join(' · '))
} finally {
  // … unchanged
}
```

In `src/store/reportStore.ts`, carry `product` through `addServers`:

```ts
added.push({ label, product: s.product, workbook: s.workbook })
```

- [ ] **Step 10: Repoint `useReportView` to `buildPpdmView` (still returns `EstateView` in this task)**

In `src/hooks/useReportView.ts`, change the import from the deleted `reportView` to `buildPpdmView` and replace `buildReportView(s.workbook)` with `buildPpdmView(s.workbook)`. Leave the `EstateView` return shape unchanged for now (Task 3 converts it to a document). All admitted servers are PPDM, so behavior is identical.

- [ ] **Step 11: Fix remaining type errors in test constructors via typecheck**

Run: `npm run typecheck`

For each error, apply the documented pattern:
- A `RawWorkbook`/old-`ParsedWorkbook` object literal that still lists `inUse`/`idleAgents` → remove those two properties.
- A `ServerWorkbook` literal missing `product` → add `product: 'ppdm'`.

Known sites to fix (confirm against typecheck output):
- `src/hooks/useReportView.test.ts` — the `wb()` helper returns a literal with `inUse: [], idleAgents: []`; remove both lines. Its `srv()` helper builds `{ label, workbook }`; change to `{ label, product: 'ppdm', workbook }`.
- `src/store/reportStore.test.ts` — any `ServerWorkbook` literal gains `product: 'ppdm'`.
- `src/components/ServerList.test.tsx`, `src/engines/parser/estateWarnings.test.ts`, `src/engines/parser/mergeWorkbooks.test.ts` — add `product: 'ppdm'` to `ServerWorkbook` literals; remove `inUse`/`idleAgents` from any workbook literals (those built via `normalizeWorkbook(...)` need no change).

Re-run `npm run typecheck` until clean.

- [ ] **Step 12: Run the full suite — prove zero behavior change**

Run: `npm run test:run`
Expected: all tests pass (same count as before, minus none; the relocated `buildPpdmView.test.ts` replaces `reportView.test.ts`). If any PPDM metric assertion changed, the refactor diverged — revert and reconcile, do not edit the assertion.

- [ ] **Step 13: Lint**

Run: `npm run lint`
Expected: no errors (organize-imports may reorder; accept it).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor(engines): product-neutral RawWorkbook + PPDM adapter registry"
```

---

## Task 3: `EstateDocument` model + per-product UI + export threading

Switch the derivation layer from a single `EstateView` to an `EstateDocument` (one per-product section), render one `<ProductSection>` per entry, and thread the document through exports. PPDM single-product output is unchanged except for an added product header.

**Files:**
- Modify: `src/types/reportView.ts`
- Create: `src/engines/products/estateDocument.ts`, `src/engines/products/estateDocument.test.ts`, `src/components/dashboard/ProductSection.tsx`
- Modify: `src/hooks/useReportView.ts`, `src/hooks/useReportView.test.ts`, `src/App.tsx`, `src/components/ExportButtons.tsx`, `src/hooks/useExport.ts`, `src/i18n/locales/{en,fr,de,it}/dashboard.json`

**Interfaces:**
- Consumes: `getViewBuilder` (Task 2), `mergeViews`, `estateWarnings`, `appVersion`, `EstateView`, `ServerWorkbook`, `ProductId`.
- Produces:
  - `export interface ProductEstate { product: ProductId; estate: EstateView }`
  - `export interface EstateDocument { products: ProductEstate[]; multiProduct: boolean }`
  - `export function buildEstateDocument(servers: ServerWorkbook[]): EstateDocument`
  - `useReportView(): EstateDocument | null`

- [ ] **Step 1: Add document types to `src/types/reportView.ts`**

Append (and add `import type { ProductId } from './ppdm'` at the top):

```ts
/** One product's estate within a multi-product document. */
export interface ProductEstate {
  product: ProductId
  estate: EstateView
}

/** The whole loaded set: one estate section per product. No cross-product totals. */
export interface EstateDocument {
  products: ProductEstate[]
  multiProduct: boolean
}
```

- [ ] **Step 2: Write the failing test for `buildEstateDocument`**

Create `src/engines/products/estateDocument.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWorkbook } from '../parser/normalizeWorkbook'
import { detailWorkbookBuffer } from '../../test-helpers/workbooks'
import type { ServerWorkbook } from '../../types/ppdm'
import { buildEstateDocument } from './estateDocument'

const ppdmServer = (label: string): ServerWorkbook => ({
  label,
  product: 'ppdm',
  workbook: normalizeWorkbook(detailWorkbookBuffer()),
})

describe('buildEstateDocument', () => {
  it('groups a single PPDM server into one product section', () => {
    const doc = buildEstateDocument([ppdmServer('a')])
    expect(doc.multiProduct).toBe(false)
    expect(doc.products).toHaveLength(1)
    expect(doc.products[0]?.product).toBe('ppdm')
    expect(doc.products[0]?.estate.multiSource).toBe(false)
    expect(doc.products[0]?.estate.perServer).toHaveLength(1)
  })

  it('merges multiple servers of the same product into one section', () => {
    const doc = buildEstateDocument([ppdmServer('a'), ppdmServer('b')])
    expect(doc.multiProduct).toBe(false)
    expect(doc.products).toHaveLength(1)
    expect(doc.products[0]?.estate.multiSource).toBe(true)
    expect(doc.products[0]?.estate.perServer.map((p) => p.label)).toEqual(['a', 'b'])
  })

  it('keeps distinct products in separate sections in first-seen order', () => {
    // Simulate a second product by hand-tagging (no avamar builder yet → skipped),
    // so a recognized-but-unbuilt product does not crash the document.
    const doc = buildEstateDocument([
      ppdmServer('a'),
      { label: 'x', product: 'avamar', workbook: normalizeWorkbook(detailWorkbookBuffer()) },
    ])
    expect(doc.products.map((p) => p.product)).toEqual(['ppdm'])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/engines/products/estateDocument.test.ts`
Expected: FAIL — `buildEstateDocument` not defined.

- [ ] **Step 4: Implement `buildEstateDocument`**

Create `src/engines/products/estateDocument.ts`:

```ts
import type { ProductId, ServerWorkbook } from '../../types/ppdm'
import type { EstateDocument, EstateView, ProductEstate } from '../../types/reportView'
import { mergeViews } from '../aggregation/mergeViews'
import { appVersion } from '../parser/deriveLabel'
import { estateWarnings } from '../parser/estateWarnings'
import { getViewBuilder } from './index'

/** Group loaded servers by product and build one EstateView section per product. Pure. */
export function buildEstateDocument(servers: ServerWorkbook[]): EstateDocument {
  const order: ProductId[] = []
  const groups = new Map<ProductId, ServerWorkbook[]>()
  for (const s of servers) {
    const existing = groups.get(s.product)
    if (existing) {
      existing.push(s)
    } else {
      groups.set(s.product, [s])
      order.push(s.product)
    }
  }

  const products: ProductEstate[] = []
  for (const product of order) {
    const group = groups.get(product) ?? []
    const build = getViewBuilder(product)
    if (!build) continue // unsupported products never reach the store; defensively skipped
    const perServer = group.map((s) => ({
      label: s.label,
      version: appVersion(s.workbook),
      view: build(s.workbook),
    }))
    const estate: EstateView = {
      combined: { ...mergeViews(perServer.map((p) => p.view)), warnings: estateWarnings(group) },
      perServer,
      multiSource: group.length > 1,
    }
    products.push({ product, estate })
  }

  return { products, multiProduct: products.length > 1 }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/engines/products/estateDocument.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Convert `useReportView` to return `EstateDocument`**

Replace `src/hooks/useReportView.ts` entirely:

```ts
import { useMemo } from 'react'
import { buildEstateDocument } from '../engines/products/estateDocument'
import { useReportStore } from '../store/reportStore'
import type { EstateDocument } from '../types/reportView'

/** The single derivation point: stored servers → EstateDocument (null when none loaded). */
export function useReportView(): EstateDocument | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => (servers.length === 0 ? null : buildEstateDocument(servers)), [servers])
}
```

- [ ] **Step 7: Rewrite `useReportView.test.ts` for the document shape**

Replace the three behavioral assertions to read through `products[0].estate`. Replace the body of the existing tests:

```ts
it('single server: one product section, multiSource false, perServer length 1', () => {
  useReportStore.getState().addServers([srv('a', wb('ACME', { 'PowerProtect Version': '19.22' }))])
  const { result } = renderHook(() => useReportView())
  expect(result.current?.multiProduct).toBe(false)
  expect(result.current?.products).toHaveLength(1)
  const estate = result.current?.products[0]?.estate
  expect(estate?.multiSource).toBe(false)
  expect(estate?.perServer).toHaveLength(1)
  expect(estate?.perServer[0]?.version).toBe('19.22')
  expect(estate?.combined.meta.customer).toBe('ACME')
})

it('two servers: one product section, multiSource true, perServer length 2', () => {
  useReportStore.getState().addServers([srv('a', wb('ACME')), srv('b', wb('ACME'))])
  const { result } = renderHook(() => useReportView())
  const estate = result.current?.products[0]?.estate
  expect(estate?.multiSource).toBe(true)
  expect(estate?.perServer.map((p) => p.label)).toEqual(['a', 'b'])
})

it('merges a summary server into the estate with a coverage note and umbrella warning', () => {
  const detailWb = normalizeWorkbook(detailWorkbookBuffer())
  const summaryWb = normalizeWorkbook(summaryWorkbookBuffer())
  useReportStore
    .getState()
    .addServers([srv('detail-server', detailWb), srv('summary-server', summaryWb)])
  const { result } = renderHook(() => useReportView())
  const estate = result.current?.products[0]?.estate
  expect(estate?.multiSource).toBe(true)
  expect(estate?.combined.provenance.compliance).toMatchObject({
    available: true,
    serversTotal: 2,
    serversCovered: 1,
  })
  expect(
    estate?.combined.warnings.some((w) => /mixes detail-format and summary-format/i.test(w)),
  ).toBe(true)
})
```

Also update the `wb()` helper (remove `inUse`/`idleAgents` if Task 2 step 11 hasn't already) and `srv()` to `({ label, product: 'ppdm', workbook })`, and update the import line to `RawWorkbook` instead of `ParsedWorkbook`.

- [ ] **Step 8: Run the updated hook test**

Run: `npx vitest run src/hooks/useReportView.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the `product.badge` i18n key to all four locales**

In `src/i18n/locales/en/dashboard.json` add a top-level key:

```json
"product": { "badge": "Source product" },
```

Add the translated equivalent to the other three (same JSON path `product.badge`):
- `fr/dashboard.json`: `"product": { "badge": "Produit source" },`
- `de/dashboard.json`: `"product": { "badge": "Quellprodukt" },`
- `it/dashboard.json`: `"product": { "badge": "Prodotto di origine" },`

- [ ] **Step 10: Verify i18n parity**

Run: `npx vitest run src/i18n/keyParity.test.ts`
Expected: PASS (all namespaces, fr/de/it match en).

- [ ] **Step 11: Create `ProductSection`**

Create `src/components/dashboard/ProductSection.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import type { ProductId } from '../../types/ppdm'
import type { EstateView } from '../../types/reportView'
import { Dashboard } from './Dashboard'

const PRODUCT_LABEL: Record<ProductId, string> = {
  ppdm: 'PowerProtect Data Manager',
  avamar: 'Avamar',
  networker: 'NetWorker',
  unknown: 'Unknown',
}

/** One product's estate, headed by a product badge, then the full dashboard. */
export function ProductSection({ product, estate }: { product: ProductId; estate: EstateView }) {
  const { t } = useTranslation('dashboard')
  return (
    <section style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {t('product.badge')}: {PRODUCT_LABEL[product]}
      </h2>
      <Dashboard view={estate.combined} perServer={estate.perServer} />
    </section>
  )
}
```

- [ ] **Step 12: Render one section per product in `App.tsx`**

In `src/App.tsx`: import `ProductSection`, rename the `view` const to `document` for clarity, change the `ExportButtons` prop, and replace the dashboard render:

```tsx
import { ProductSection } from './components/dashboard/ProductSection'
// …
const report = useReportView()
// …
<ExportButtons document={report} />
// …
{report?.products.map((pe) => (
  <ProductSection key={pe.product} product={pe.product} estate={pe.estate} />
))}
```

- [ ] **Step 13: Thread the document through `ExportButtons` + `useExport`**

In `src/components/ExportButtons.tsx`: change the prop type to `{ document }: { document: EstateDocument | null }` (import `EstateDocument` from `../types/reportView`), pass `document` to `useExport`, and guard `if (!document) return null`.

In `src/hooks/useExport.ts`: change the signature to `useExport(document: EstateDocument | null)`. Phase 1 documents always hold exactly one product (upload rejects others), so operate on the first section:

```ts
async function run(kind: ExportKind): Promise<void> {
  const estate = document?.products[0]?.estate
  if (!estate) return
  // … then use `estate.combined` and `estate.perServer` exactly as before
}
```

Keep the filename stem `ppdm-report_${sanitize(estate.combined.meta.customer)}_${stamp}` (phase-1 product is always PPDM). Add a one-line comment noting multi-product export composition is deferred to a later phase (no silent truncation: phase-1 upload guarantees a single product, so `products[0]` is the whole document).

- [ ] **Step 14: Typecheck + full suite + lint**

Run: `npm run typecheck && npm run test:run && npm run lint`
Expected: all green. The existing `App.test.tsx` (title + docs link) still passes; `Dashboard.test.tsx` is unaffected (renders `<Dashboard>` directly).

- [ ] **Step 15: Build (runs the supply-chain gate)**

Run: `npm run build`
Expected: success; `check-supply-chain: OK` printed by the `prebuild` hook.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat(report): per-product EstateDocument model + ProductSection UI"
```

---

## Task 4: Documentation — reflect the new architecture

**Files:**
- Modify: `CLAUDE.md`, `docs/ARCHITECTURE.md` (if it describes the parse/derive flow)

- [ ] **Step 1: Update `CLAUDE.md` architecture section**

In `CLAUDE.md`, update the data-flow description to: `File → worker → RawWorkbook → detectProduct → buildView[product] → ReportView → mergeViews per product → EstateDocument → UI/exports`. Note that the store now tags each server with `product`, that `engines/products/` holds the per-product adapters + registry, and that parse output is the product-neutral `RawWorkbook` (PPDM agent classification lives in `buildPpdmView`).

- [ ] **Step 2: Update `docs/ARCHITECTURE.md` if present**

Run: `grep -n 'ParsedWorkbook\|buildReportView' docs/ARCHITECTURE.md`
For each hit, update `ParsedWorkbook → RawWorkbook` and `buildReportView → buildPpdmView`, and add a sentence on the product-adapter registry + `EstateDocument`. If the file does not exist or has no hits, skip.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/ARCHITECTURE.md
git commit -m "docs: reflect RawWorkbook + product-adapter registry + EstateDocument"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-19-multi-product-support-design.md`, phase 1 scope):
- `RawWorkbook` generalization + `classifyAgents` moved into `buildPpdmView` → Task 2. ✅
- Pure `detectProduct` with the documented signatures → Task 1. ✅
- `engines/products/` registry with PPDM behind it, zero behavior change → Task 2. ✅
- `EstateDocument` document model (store tags product, `useReportView` groups, `ProductSection` per product) → Task 3. ✅
- Per-file unknown/unsupported rejection → Task 2 step 9. ✅
- i18n parity for new strings → Task 3 steps 9–10. ✅
- Avamar adapter (`buildAvamarView`) → intentionally NOT here; it is phase 2 (its own plan).
- Export multi-product composition → explicitly deferred (Task 3 step 13 note); phase-1 invariant is single product per document.

**2. Placeholder scan:** No "TBD/TODO"; the one deferral (multi-product export) is stated as a documented invariant, not a code placeholder.

**3. Type consistency:** `RawWorkbook` (Task 2) is consumed by `buildPpdmView`/`ViewBuilder` (Task 2) and `buildEstateDocument` (Task 3); `ProductId` (Task 1) is used by `ServerWorkbook` (Task 2), the registry (Task 2), `ProductEstate` (Task 3), and `ProductSection` (Task 3). `EstateDocument`/`ProductEstate` (Task 3) are consumed by `useReportView`, `App`, `ExportButtons`, `useExport`. `getViewBuilder`/`isSupportedProduct` names are used consistently across Tasks 2–3. No signature drift found.
