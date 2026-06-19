# Multi-Product Support — NetWorker & Avamar via a Product-Adapter Registry

**Status:** Approved (design phase) · **Date:** 2026-06-19 · **Scope:** ingestion + report pipeline; reuses the existing dashboard, exports, merge, provenance, and i18n unchanged

## Problem

The tool ingests **one product**: Dell Live Optics **PPDM** exports (detail and summary
formats). Customers also run **Dell NetWorker** and **Dell Avamar**, whose Live Optics
exports describe the same kind of estate (clients/assets, backup jobs, capacity, policies,
workload types) but with **completely different sheet names and column layouts**.

We want the same dashboard + PPTX/HTML report for NetWorker and Avamar inputs. The current
parser is hard-wired to PPDM sheet names, so it cannot read them.

### What the three sample workbooks actually are

Inspected `2026-06-19`:

| File | Product | Note |
|---|---|---|
| `Sarah Bush.xlsx` | **PPDM** (summary format) | Already supported by the v0.5.0 summary path — used here only as a refactor-regression check. |
| `NetWorker_170626.xlsx` | **NetWorker** | `System Info → NetWorker Version`, `Clients`, `Backups`, `Jobs`, `Data Domains`, `Policies`, `Storage Nodes`, `Dedup Jobs`. |
| `CRAMIF.xlsx` | **Avamar** | `Avamar DPN Summary`, `Backup Completion Summary`, `Backup Plugins`, `Clients No Backups`, `Node Utilization`, `Group Summary`. |

So this effort adds **two products**. The conceptual report *sections* map across all three;
only the *extraction* differs per product.

## Goals

- Add **Avamar** support first, then **NetWorker**, behind a shared product-adapter seam.
- **Reuse everything downstream of `ReportView`**: `mergeViews`, the provenance model, all
  dashboard sections, PPTX/HTML export, and the i18n structure are unchanged.
- Keep new code **pure** (`engines/`-grade, no React/DOM/store) and under the existing
  **≥75% coverage** gate.
- Preserve all invariants: privacy `fetchGuard`, SheetJS CDN pin, supply-chain gate,
  i18n key parity across en/fr/de/it.
- **MVP fidelity per product**: ship the high-value sections each export clearly supports;
  mark everything else **"not available"** via the existing provenance model — never fake a
  number, never hide a real one.

## Non-goals (out of scope)

- **Cross-product merge.** A drop containing multiple products produces **per-product
  sections, no combined totals** (a "binder", not a true merge). Within-product multi-server
  merge stays as today.
- **Full PPDM parity** for new products. Metrics absent from an export (e.g. immutability /
  replication / RPO for Avamar) stay N/A; we do not synthesize them.
- Avamar per-job drill-down (`Avamar DPN Summary` / `Job List Detailed`), `Image Proxy` and
  `VCenter` inventory, runtime histograms — deferred (YAGNI).
- NetWorker implementation detail — its own spec/plan cycle later; this spec only ensures the
  abstraction accommodates it.

## Decisions (locked during brainstorming)

1. **Multi-product = per-product sections, no cross-product totals.**
2. **MVP slice per product**, with honest provenance N/A for the rest.
3. **Avamar first**, NetWorker second.
4. **Approach A — product-adapter registry** (rejected: B declarative column-map config —
   products differ structurally, config becomes code-in-data; C separate pipeline per product —
   triplicates merge/dashboard/export/i18n for no benefit, since `ReportView` fits all three).

## Architecture — the product seam

One new pure function + one new branch. Everything downstream of `ReportView` is untouched.

```
File → worker → RawWorkbook { meta, sheets, warnings }     ← product-neutral
        ↓ detectProduct(raw)                                ← NEW, pure
   'ppdm' | 'avamar' | 'networker' | 'unknown'
        ↓ buildView[product](raw) → ReportView              ← per-product adapter
   mergeViews · provenance · dashboard · export · i18n       ← SHARED, unchanged
```

**Reuse line (DRY):**
- *Shared upstream:* parser primitives — `readWorkbook`, `captureMeta`, `serialToIso`, `topN`.
- *Shared downstream:* the entire `ReportView` contract, `mergeViews`, provenance, dashboard
  components, PPTX/HTML export, i18n structure.
- *Per-product (the only genuinely new code):* `detectProduct` signature + one `buildXView`.

### The one refactor (abstraction phase, zero PPDM behavior change)

Today `normalizeWorkbook` (in the worker) bakes PPDM-specific `inUse`/`idleAgents` into
`ParsedWorkbook`. Generalize the parse output to a product-neutral
**`RawWorkbook = { meta, sheets, warnings }`** (SheetJS rows + capture metadata + the 10k-row
cap warnings) and **move `classifyAgents` into `buildPpdmView`**, where the PPDM agent concept
belongs. The worker stops assuming the product; PPDM output is byte-identical.

### Module layout

```
src/engines/
├── parser/
│   ├── detectProduct.ts          # NEW — sheet-signature → ProductId (pure)
│   └── normalizeWorkbook.ts      # → RawWorkbook (drop PPDM classification)
├── products/                     # NEW — one folder per product adapter
│   ├── index.ts                  # ProductId type + buildView registry
│   ├── ppdm/buildPpdmView.ts     # = today's buildReportView + classifyAgents (moved)
│   └── avamar/buildAvamarView.ts # NEW (+ small avamar-local aggregation helpers)
└── aggregation/                  # unchanged PPDM helpers (may relocate under products/ppdm later)
```

`detectProduct` and every `buildXView` are pure and held to the ≥75% coverage gate.

## Multi-product document model

The estate becomes a *document of per-product estates*; today's single-estate path is the
one-product case.

**Store** (`reportStore.ts`) — tag each file with its product at upload time:

```ts
type ServerWorkbook = { label: string; product: ProductId; workbook: RawWorkbook }
```

`detectProduct` runs in `useReportUpload` immediately after the worker returns, so the product
is known before storage. Unique-label logic is unchanged.

**Derivation** (`useReportView.ts`) — group by product, merge *within* each group:

```
servers → groupBy(product) → per group:
            buildView[product] per server → mergeViews(group) → EstateView
        → EstateDocument { products: [{ product, estate }, …], multiProduct: boolean }
```

Within-product multi-server merge is exactly today's `mergeViews` — unchanged. No
cross-product totals are ever computed.

**UI** (`Dashboard.tsx`) — wrap the existing dashboard body in a `<ProductSection>` and render
one per document entry, each with a product header/badge. Single-product (today's common case)
renders identically, just with a product label. All existing sections
(`CoverageSection`, `JobsComplianceSection`, …) are reused verbatim — they already render from
a `ReportView` and already respect provenance "not available".

**Exports** — PPTX/HTML iterate the document: one product section/divider per entry, reusing
the existing per-estate slide/section builders. Filename gains the product when single-product
(`avamar-report_<customer>_<ISO date>.pptx`); multi-product uses a neutral stem
(`backup-report_<customer>_<ISO date>.pptx`).

**Flavor** (assessment / ops) stays global and applies to every product section.

## Avamar adapter (`buildAvamarView`) — first product

MVP mapping from `CRAMIF.xlsx` sheets to the shared `ReportView`:

| `ReportView` field | Avamar source sheet(s) | v1 treatment |
|---|---|---|
| `meta` | `Details`, `Host Info` | ✅ full |
| `coverage` (headline) | `NonRetired Clients With Backups` (True/False counts), `Clients Types All`, `Retired Clients With Backups` (excluded band) | ✅ **count-based** protected/unprotected; **no capacity split, no by-type** |
| `gaps` | `Clients No Backups`, `Clients No Backups 7 Days` | ✅ list of unprotected clients; **sizes N/A** — "top-N by size" becomes "N unprotected clients" |
| `jobs` | `Backup Completion Summary` (Total/Successful/Exception/Failed), `Backup By Completion Status` | ✅ success rate + distribution using **Avamar-native buckets** (Successful / Exception / Failed) |
| `capacity` | `Node Utilization` (Max Utilization %) | ⚠️ **node fullness %** with risk flag; **Data Domain capacity N/A** (not in this export) |
| `policies` | `Group Summary`, `Disabled Groups` | ⚠️ by-group outcome counts; **no per-policy capacity** |
| workload types (`inUse`) | `Backup Plugins` | ✅ in-use plugin/workload types |
| idle config (`idleAgents`) | `Dataset / Schedule / Retention Not In Use`, `Disabled Groups` | ✅ "present but not in use" |
| `compliance` (app-consistent / immutable / replication / RPO) | — | ❌ **N/A** (`Replication` sheet empty in CRAMIF) |

**Provenance for an Avamar estate:** `coverageByType` = unavailable, `gapsList` = available
(size-less), `compliance` = unavailable, `storageTargets` = unavailable. Headline coverage,
jobs, node capacity, plugins, and groups all render.

### Two `ReportView` contract touch-ups (abstraction phase; PPDM unaffected)

1. **`jobs` buckets become product-native** — a labeled-bucket list rather than fixed keys.
   PPDM keeps SUCCESS/RETRIED/SKIPPED/CANCELED; Avamar uses Successful/Exception/Failed.
2. **`gaps` entries allow an absent size** — render "size unknown" rather than `0`, so a
   missing size never reads as a real zero.

## Detection, errors, edge cases

`detectProduct(raw): ProductId` — pure, sheet-signature based, first match wins (each product
has an unambiguous marker; order is a safety net):

| Product | Signature (presence of) |
|---|---|
| `avamar` | `Avamar DPN Summary` (unique) — or `Backup Completion Summary` + `Backup Plugins` |
| `networker` | `Storage Nodes` + `Dedup Jobs`, or `System Info` whose first value starts with `NetWorker` |
| `ppdm` | `System Configuration` (summary) or PPDM detail markers (`Data Domain Mtrees` / `Storage Targets` + asset sheets); then existing `detectFormat` picks detail vs summary internally |
| `unknown` | none matched |

Verified against the samples — no collisions: CRAMIF → `avamar`, Sarah Bush → `ppdm`,
NetWorker_170626 → `networker`.

- **Unknown file:** rejected **per-file** with a clear message
  ("Unrecognized export — expected a PPDM, NetWorker, or Avamar Live Optics workbook").
  Recognized files in the same drop still load. No crash, no silent fallback, privacy intact.
- **Mixed drops:** each file detected independently and routed to its product group — the
  per-product-sections model working as designed.

## Testing

Existing conventions — synthetic in-memory workbooks via `makeWorkbook` in
`src/test-helpers/workbooks.ts`. **Never read the gitignored `ref/` fixtures** (CI ENOENTs).

- **`detectProduct`** — each signature → correct id; empty/foreign → `unknown`.
- **`buildAvamarView`** — coverage counts, size-less gaps, native job buckets + success rate,
  node-capacity %, plugins, idle config, and the exact provenance flags above.
- **Refactor regression** — a PPDM-summary-shaped synthetic workbook (Sarah-Bush-like) still
  detects `ppdm` and builds identically after `RawWorkbook` + the `classifyAgents` move; the
  full existing suite stays green.
- **Within-Avamar merge** — multi-server parity test mirroring `mergeViews.parity.test.ts`.
- **Document model** — `useReportView` grouping: mixed products → one section per product, no
  cross totals.
- **i18n parity** — new Avamar/product keys added to en/fr/de/it (`keyParity` test enforces).
- **Coverage gate** — new engine code held to the ≥75% threshold.

## Phasing (each its own spec → plan → build cycle)

1. **Abstraction phase** — `RawWorkbook`, `detectProduct`, `engines/products/` registry, the
   `EstateDocument` model, PPDM moved behind the registry with **zero behavior change**.
2. **Avamar adapter** — `buildAvamarView` + UI/export/i18n wiring.
3. **NetWorker adapter** — later, same pattern.

This spec covers the **abstraction phase + the Avamar adapter** (phases 1–2). NetWorker (phase
3) gets its own spec.

## Open questions / to finalize at plan time

- Whether a new provenance `MetricKey` (e.g. `nodeCapacity`) is warranted, or node utilization
  rides under the existing `capacity`/`storageTargets` keys with a note.
- Exact treatment of Avamar `Exception` jobs (own bucket vs folded into success rate) — default:
  its own bucket, excluded from the success numerator.
- Whether `mergeWorkbooks` (workbook-level fold) is still used anywhere, or fully superseded by
  view-level `mergeViews` per product group — confirm and remove if dead.
