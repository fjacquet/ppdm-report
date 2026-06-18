#!/usr/bin/env node
// Supply-chain gate for the ppdm-report privacy invariant.
//
// Three checks, one script (KISS):
//   1. Telemetry denylist — no error-reporting / analytics SDK may appear in
//      package.json dependencies OR devDependencies. A telemetry SDK is a
//      latent exfiltration path for workbook contents.
//   2. SheetJS pin — `dependencies.xlsx`, if present, MUST be the exact
//      official CDN tarball (the npm `xlsx` is frozen at 0.18.5 and carries
//      CVE-2023-30533 + CVE-2024-22363). Lenient on absence, strict on presence.
//   3. Service-worker envelope — any service-worker-named dependency that is
//      NOT the sanctioned toolchain (vite-plugin-pwa + workbox-*) is denied.
//
// Pure core (`evaluateSupplyChain`) + a thin CLI so the gate is unit-testable.
// Runs on a bare Node runtime (only reads files — no deps). Wired as the
// `check:supply-chain` + `prebuild` npm scripts.
//
// Exit 0 = clean. Exit 1 = violation (with a clear message).
import { readFileSync } from 'node:fs'

export const REQUIRED_XLSX_PIN = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'

const FORBIDDEN_PATTERNS = [
  /^@sentry\//,
  /^posthog-/,
  /^@posthog\//,
  /^posthog$/,
  /^@amplitude\//,
  /^amplitude-/,
  /^mixpanel/,
  /^@datadog\//,
  /^logrocket/,
  /^@bugsnag\//,
  /^heap-analytics/,
  /^segment-analytics/,
  /^@segment\//,
  /^fullstory/,
  /^@fullstory\//,
  /^@hotjar\//,
  /^hotjar/,
]

// The ONLY sanctioned service-worker toolchain.
const SW_TOOLCHAIN_ALLOW = [/^vite-plugin-pwa$/, /^workbox(-[a-z0-9-]+)?$/]
// A dependency NAME that looks like a service-worker library.
const SW_NAME_PATTERN = /service-?worker/i

/**
 * Pure supply-chain evaluation.
 * @param {{ pkg: object }} input
 *   pkg — parsed package.json
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function evaluateSupplyChain({ pkg }) {
  const errors = []
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
  const names = Object.keys(allDeps)

  const telemetry = names.filter((name) => FORBIDDEN_PATTERNS.some((re) => re.test(name)))
  if (telemetry.length > 0) {
    errors.push(`forbidden telemetry packages in package.json: ${telemetry.join(', ')}`)
  }

  if (allDeps.xlsx !== undefined && allDeps.xlsx !== REQUIRED_XLSX_PIN) {
    errors.push(
      `xlsx must pin to the SheetJS tarball — expected ${REQUIRED_XLSX_PIN}, found ${allDeps.xlsx}`,
    )
  }

  // Any service-worker-named dependency that is NOT the sanctioned toolchain.
  const rogue = names.filter(
    (name) => SW_NAME_PATTERN.test(name) && !SW_TOOLCHAIN_ALLOW.some((re) => re.test(name)),
  )
  if (rogue.length > 0) {
    errors.push(
      `service-worker library outside the sanctioned exception (only vite-plugin-pwa + workbox-* allowed): ${rogue.join(', ')}`,
    )
  }

  return { ok: errors.length === 0, errors }
}

// ── CLI ───────────────────────────────────────────────────────────────────
// Only runs when executed directly, not when imported by the test.
const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`

if (invokedDirectly) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  const { ok, errors } = evaluateSupplyChain({ pkg })
  if (!ok) {
    console.error('SUPPLY-CHAIN VIOLATION:')
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('check-supply-chain: OK')
  process.exit(0)
}
