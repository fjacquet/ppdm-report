# ADR 0008 — xlsx Pinned to the SheetJS CDN Tarball; Supply-Chain CI Gate

**Status:** Accepted

## Context

The npm-published `xlsx` package (`sheetjs`) has been frozen at version 0.18.5 and carries known vulnerabilities: CVE-2023-30533 (prototype pollution) and CVE-2024-22363 (ReDoS). The maintainers publish updated releases exclusively through their own CDN at `cdn.sheetjs.com`, not through the npm registry. Installing from npm silently installs the vulnerable frozen version.

Because ppdm-report processes customer workbooks client-side, a vulnerable SheetJS version represents a direct attack surface against the user's browser session. A telemetry or analytics SDK dependency would also create a latent data-exfiltration path for parsed workbook contents, violating the privacy invariant (ADR 0001).

## Decision

**xlsx is pinned to the official SheetJS CDN tarball** at exactly version 0.20.3:

```
"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
```

This is the only permitted value for the `xlsx` dependency in `package.json`. Any deviation — including an npm-registry version string — fails the supply-chain gate.

**A supply-chain CI gate** (`scripts/check-supply-chain.mjs`) runs as the `prebuild` script and as the `check:supply-chain` npm script. It enforces three rules:

1. **xlsx pin check:** if `dependencies.xlsx` is present, it must equal the exact CDN tarball URL above.
2. **Telemetry denylist:** a list of known analytics/error-reporting SDKs (Sentry, PostHog, Amplitude, Mixpanel, Datadog, LogRocket, Bugsnag, Heap, Segment, Fullstory, Hotjar) may not appear in `dependencies` or `devDependencies`.
3. **Service-worker allowlist:** any dependency whose name matches `service-worker` must be one of the sanctioned toolchain packages (`vite-plugin-pwa`, `workbox-*`).

The gate is a pure function (`evaluateSupplyChain`) with a thin CLI wrapper, making it independently unit-testable.

## Consequences

- CVE-2023-30533 and CVE-2024-22363 are not present in the deployed application.
- CI blocks any PR that introduces a telemetry SDK or downgrades the SheetJS pin.
- Upgrading SheetJS requires a deliberate change to both the CDN URL and the pinned version string, then passing CI.
- If the SheetJS CDN becomes unavailable, `npm install` will fail; a cached tarball or mirror would need to be arranged.
