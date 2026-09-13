# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.3] - 2026-09-13

### Security

- **Vitest bumped from 3.2.7 to 4.1.11 (a MAJOR version).** Vitest 3.x never received a patched
  release for **GHSA-82fw-gwwq-j7x9** (3.2.7 is the last 3.x release), so reaching the fix
  required the 4.x major; Vite was already on `^6.0.0`, which Vitest 4 requires.
  **Contributors running `npm ci` locally will pick up Vitest 4** — the full suite (79 files,
  518 tests) and the build were verified unchanged under it, but local test tooling
  output/behavior may differ from 3.x.
- Bumped `sharp` to 0.35.4, resolving **GHSA-rgj7-g3m4-5g8c**.
- Refreshed the lockfile for `fast-uri` transitive advisories published after the last
  osv-scan wave: **GHSA-5jgf-p345-68v8**, **GHSA-f65p-4m7j-42xc**, **GHSA-fph4-wmhf-6fwf**,
  **GHSA-jqff-g426-hqxp** (all resolved by `fast-uri >= 3.1.6`, no `package.json` range changes).
- Renewed the `xlsx` osv-scanner waivers for another 90 days (new expiry 2026-11-13). SheetJS's
  CDN still ships 0.20.3, which is already past both advisories' fix ranges — the findings remain
  an OSV structured-range artifact of xlsx being CDN-only, so there is nothing to bump to.

### Changed

- Resynced `biome.json`'s `$schema` with the installed Biome CLI version (config only; no source
  reformat).
