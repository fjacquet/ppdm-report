# ADR 0002 — Input Is the Live Optics PPDM .xlsx Export

**Status:** Accepted

## Context

Dell PPDM exposes a REST API (v1/v2/v3, documented in `docs/swagger/*.json`) that could theoretically be polled directly. However, a live API connection requires network access to the customer's PPDM appliance, introduces authentication complexity, and conflicts with the 100% client-side privacy invariant (ADR 0001). Live Optics already provides a structured, point-in-time snapshot of the entire PPDM estate as a single `.xlsx` file, which is the standard artifact exchanged in pre-sales and health-check engagements.

## Decision

The sole supported input format is the Live Optics PPDM `.xlsx` export. The application never calls the PPDM REST API at runtime; the Swagger files are present only to inform field semantics during development.

The Live Optics export contains **31 sheets** covering:

- `Details` — capture metadata (customer, collector build, date, base-10 flag)
- `System Information` — PPDM appliance details
- Approximately 25 asset-type sheets (one per application agent/plugin)
- `Copies` — backup copy records (capped; see ADR 0004)
- `Unprotected Assets` — gap list
- `Policies` — protection policy inventory
- `Protection Job Activities` — job run records (capped; see ADR 0004)
- `Storage Targets`, `Data Domain Mtrees` — capacity data

Parsing is performed by `src/engines/parser/readWorkbook.ts` via SheetJS inside a dedicated Web Worker. Each sheet becomes a `SheetData` object (name, headers, keyed rows, `capped` flag). The 31-sheet model is the canonical input contract; all downstream engines assume this structure.

## Consequences

- No multi-extract merge or trend analysis in v1 (single extract per session).
- The tool is resilient to PPDM API changes; only Live Optics export format changes can break ingestion.
- Fixture-based testing is straightforward: the sample `ref/PPDM.xlsx` plus synthetic workbooks covering edge cases serve as the complete test corpus.
