# Installable, Offline PWA — Design

**Status:** Proposed · **Date:** 2026-06-18 · **Scope:** app shell (no change to report/export logic)

## Problem

`ppdm-report` is a 100% client-side tool, yet it's a plain SPA: not installable, no
offline support, and no managed update story (which surfaced as the "export ne marche
plus" stale-chunk scare). Making it a PWA fits the product perfectly — an SE can drop a
workbook at a customer site with no internet and still get a deck, the privacy story
("your workbook never leaves the browser") gets stronger, and a service worker's
versioned caches **eliminate the stale-chunk class of bug**.

## Goals

- **Installable** (web manifest + icons; browser offers "Install").
- **Fully offline** — the app already makes **zero runtime network calls** (verified: no `fetch`/CDN in `src`; the `fetchGuard` privacy module throws on any non-same-origin request), so precaching the built shell yields complete offline capability.
- **Managed updates with a reload prompt** — never reload mid-session (a loaded workbook is in-memory and would be lost).
- Works on both the local (`/`) and GitHub Pages (`/ppdm-report/`) base paths without special-casing.
- Stays within the **sanctioned supply chain** (`vite-plugin-pwa` + `workbox-*`).

## Non-goals

- No change to parsing, metrics, dashboard, or export engines.
- No runtime caching strategy (there is no network to cache).
- No push notifications, background sync, or an in-app "Install" button (rely on the browser's native install affordance) — possible later.
- No SW in `npm run dev` (avoids dev-time caching pain; PWA verified via `build` + `preview`).

## Design

### Tooling

- **`vite-plugin-pwa`** (devDependency) configured in `vite.config.ts` — `generateSW` strategy (workbox), `registerType: 'prompt'`.
- **`@vite-pwa/assets-generator`** (devDependency) — turns one source SVG into all icon sizes via a `pwa-assets.config.ts` (preset `minimal-2023`); the plugin injects the icon `<link>`s + `theme-color` into `index.html`.
- Both pass `scripts/check-supply-chain.mjs`: `vite-plugin-pwa` and `workbox-*` are explicitly allowed; `@vite-pwa/assets-generator` is not service-worker-named, not telemetry, so it's not flagged. The gate reads top-level `package.json` only, so workbox transitive deps are irrelevant to it.

### Service worker / offline

- Precache all built assets: `workbox.globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']`, `cleanupOutdatedCaches: true`. No `runtimeCaching`.
- The bundled `xlsx` (SheetJS tarball) is a **build** dependency baked into the JS chunks — precached, not fetched at runtime — so offline parsing works.
- The SW runs in its own worker context; the page's `fetchGuard` does not apply to it, and its only requests are same-origin precache fetches — consistent with the privacy invariant (ADR 0001).

### Update flow (prompt)

- `registerType: 'prompt'` so a waiting SW does not auto-activate.
- A new `src/components/PwaUpdater.tsx` uses the plugin's React hook:
  ```ts
  import { useRegisterSW } from 'virtual:pwa-register/react'
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  ```
  When `needRefresh` is true it renders a small toast — localized *"New version available — Reload"* — whose button calls `updateServiceWorker(true)` (activates the SW and reloads). Mounted once in `App`.
- Because the reload is user-initiated, an in-progress report is never lost. This makes the existing `useExport` error-surfacing a backstop rather than the primary stale-chunk mitigation.

### Manifest

`name: "PPDM Report"`, `short_name: "PPDM Report"`, `description` (reuse the README one-liner, English), `display: "standalone"`, `theme_color: "#1d4ed8"`, `background_color: "#ffffff"`, icons from the assets generator. `start_url`/`scope` inherit Vite's resolved `base` automatically (`/` local, `/ppdm-report/` on the Pages deploy via `VITE_BASE`), so both environments are correct without branching.

### Icon

- Source: `public/icon.svg` — the approved **shield + check** mark: a rounded-square `#1d4ed8` field with a white shield and a `#1d4ed8` checkmark (crisp at 30 px).
- `pwa-assets.config.ts` generates `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` (subject within the maskable safe zone), `apple-touch-icon-180x180.png`, and `favicon.ico`/`favicon.svg` (resolves today's `favicon.ico` 404).

### Files

- Modify: `vite.config.ts` (add `VitePWA({...})`), `index.html` (plugin injects manifest/icon links — may add `theme-color` if the plugin doesn't), `src/App.tsx` (mount `<PwaUpdater/>`), `package.json` (+2 devDeps), the four `*/common.json` (new keys).
- Create: `pwa-assets.config.ts`, `public/icon.svg`, `src/components/PwaUpdater.tsx`, `src/components/PwaUpdater.test.tsx`.
- New i18n keys: `common:update.available`, `common:update.reload` (en/fr/de/it).

### Testing

- **Unit:** `PwaUpdater` renders the toast + reload button when `needRefresh` is true, and calls `updateServiceWorker` on click — mock `virtual:pwa-register/react`. i18n parity (`keyParity.test`).
- **Build artifact:** `npm run build` emits `dist/manifest.webmanifest` and `dist/sw.js`; the build still runs the supply-chain prebuild gate.
- **Manual:** `npm run preview` → Lighthouse "Installable" pass; DevTools "Offline" → the app still loads and produces a deck; install on desktop + mobile; confirm the update toast appears after a redeploy.

### Edge cases

- **Dev:** `devOptions.enabled: false` — no SW in `npm run dev`.
- **TypeScript:** add the plugin's client types (`vite-plugin-pwa/client`) to `tsconfig` types or a `vite-env.d.ts` reference so `virtual:pwa-register/react` typechecks.
- **CSP:** `index.html` has no CSP today; nothing to relax. (The HTML *export*'s CSP is unrelated.)
- **Base path:** verified the manifest/SW scope follow Vite `base`; the deploy already sets `VITE_BASE=/ppdm-report/`.

## Rollout

Single PR. Verified via `build` + `preview` (PWA can't be exercised by the unit suite alone).

## Open questions (low-risk defaults chosen)

- `theme_color` `#1d4ed8` (icon field) vs `#2563eb` (app accent) — chose `#1d4ed8` to match the icon. ✓
- No in-app install button (native affordance is enough). ✓
