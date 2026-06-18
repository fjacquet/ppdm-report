# ADR 0001 — 100% Client-Side Privacy Invariant

**Status:** Accepted

## Context

ppdm-report processes Dell Live Optics PPDM exports that may contain customer-sensitive infrastructure data. Any server-side processing or network transmission of that data would create a privacy and security risk, particularly in pre-sales and consulting contexts where the customer has not consented to cloud processing.

The Swagger API reference files (`docs/swagger/*.json`) cover PPDM REST API v1/v2/v3 and are present in the repository solely as build-time semantic references; no live API connection is ever required.

## Decision

The application is 100% client-side with no backend. All parsing and metric computation runs in the browser. The privacy invariant is enforced structurally, not by policy:

- `src/privacy/fetchGuard.ts` is imported as the first side-effect in `src/main.tsx` and in `src/engines/parser/parser.worker.ts`. It wraps `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, and `WebSocket` to throw a synchronous `PrivacyViolation` on any non-same-origin request, and an `InsecureTransportViolation` on any cleartext WebSocket (`ws:`).
- SheetJS parsing runs inside a dedicated Web Worker (`parser.worker.ts`); the worker posts typed row objects back to the main thread, never the raw workbook.
- No dataset rows are persisted between sessions. A page refresh discards all loaded data.
- The only two keys written to `localStorage` are `ppdm-report-theme` and `ppdm-report-lang` (UI preferences only).
- A CSP meta tag blocks third-party connections at the browser level.

## Consequences

- No analytics, error-reporting, or telemetry SDK may be added (enforced by the supply-chain CI gate in ADR 0008).
- The application cannot call the PPDM REST API at runtime; Swagger files are read-only build-time references.
- Privacy compliance is auditable by reading a single file (`fetchGuard.ts`) rather than trusting runtime configuration.
- Any future integration that needs an external call must first be cleared against this ADR.
