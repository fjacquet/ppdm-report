# ADR 0004 — No Silent Caps: Live Optics Row Truncation Is Always Disclosed

**Status:** Accepted

## Context

Live Optics truncates two sheets — `Copies` and `Protection Job Activities` — at exactly 10,000 data rows (`LIVE_OPTICS_ROW_CAP = 10_000` in `src/types/ppdm.ts`). A naive implementation might count rows from these sheets to derive estate-wide totals, silently under-counting for large environments. Alternatively, the cap might be hidden from the reader, making metrics appear authoritative when they are actually window-based.

The design principle is: no silent caps or fallbacks. Where data is truncated, say so in the artifact.

## Decision

**Totals come from uncapped aggregate sheets.** Asset counts, unprotected capacity, and policy coverage are sourced from `Policies`, `Unprotected Assets`, and the per-type asset-type sheets, which are not row-capped. `Copies` and `Protection Job Activities` are never used as a source of ground-truth totals.

**Window-based metrics carry an in-place caveat.** Metrics that can only be derived from capped sheets (job result distribution, success rate, compliance distributions) are computed over the available window and labelled explicitly: *"based on most recent 10,000 records"*.

**The `capped` flag propagates to slides.** `src/engines/aggregation/jobs.ts` returns `{ capped: boolean, windowSize: number }` and `src/engines/aggregation/compliance.ts` does the same. Slides read these flags and print the caveat when `capped` is true. Suppressing the caveat requires actively removing the flag check; omitting it is not an option.

**Lists render "top 25 of N".** Every list-bearing metric uses the `topN` helper (`src/engines/aggregation/topN.ts`), which returns `{ items, total, shown }` so slides always display the true total alongside the truncated list.

## Consequences

- Estate-wide totals are always accurate, regardless of how many job or copy records exist.
- Window-based figures are transparent; readers know exactly what they represent.
- The appendix slide repeats the capped-sheet caveats alongside the base-10 disclaimer.
- Future sheets that Live Optics might cap must be identified and treated the same way.
