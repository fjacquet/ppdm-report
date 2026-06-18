# ADR 0007 — Dual-Theme PPTX + HTML Export on the Main Thread; pptxgenjs Dynamically Imported

**Status:** Accepted

## Context

The initial architecture considered offloading PPTX generation to a Web Worker to keep the main thread responsive. However, `pptxgenjs` (the PPTX generation library) relies on browser APIs that are not available in Web Worker scope, making it incompatible with worker execution. A ~10-slide deck for a typical PPDM estate generates in well under a second, so the concurrency benefit of a worker would be negligible.

Additionally, `pptxgenjs` and its `jszip` dependency are large. Bundling them into the main application chunk would increase initial load time even for users who never export.

The PPTX export must follow the live web theme (light or dark) at the moment of export, and the HTML export must do the same. This diverges from the vatlas baseline, which supported light-only PPTX.

## Decision

PPTX and HTML export run on the **main thread** inside `src/hooks/useExport.ts`. The hook resolves the live `ReportView`, flavor, resolved theme, and active locale before calling `buildExportModel`, then triggers a browser download.

`pptxgenjs` (and its `jszip` dependency) is **dynamically imported** at call time:

```ts
const { buildPptx } = await import('../engines/export/pptx/builder')
```

This keeps both libraries entirely out of the initial bundle. The dynamic import occurs only when the user clicks the PPTX export button.

**Dual-theme PPTX** is implemented in `src/engines/export/pptx/builder.ts` and `src/theme/palette.ts`. The builder receives the resolved theme (`'light' | 'dark'`) and selects the matching `LIGHT` or `DARK` palette from `palette.ts`. HTML export in `src/engines/export/html/assembleHtml.ts` applies the same palette logic. All text in both export formats uses Arial, consistent with the slide layout grammar.

## Consequences

- The initial JS bundle does not include pptxgenjs or jszip; load time is unaffected.
- PPTX generation blocks the main thread for less than a second; no spinner complexity is needed beyond the existing `busy` state flag.
- Any future worker-based export would need a pptxgenjs fork or replacement that supports Worker environments.
- Both light and dark PPTX variants are always available; the user's active theme at export time determines which palette is used.
