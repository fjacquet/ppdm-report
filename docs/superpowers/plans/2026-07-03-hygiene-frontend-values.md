# Config Hygiene + Front-End Values (PR 4 of 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the config-hygiene insight family (unused datasets/retentions/schedules, inactive clients, overtime count, license expiry) AND enrich front-end volumetry so real values replace "–" wherever the export carries figures (Fred: "no more unknown").

**Architecture:** One pure engine (`src/engines/aggregation/hygiene.ts`) with kind-tagged items + license-status classification measured against `meta.capturedAt` (deterministic — never Date.now()); Avamar + NetWorker adapters; export/dashboard sections following the family 1–3 template. Front-end enrichment touches only the two product frontEnd mappers: Avamar `Client Capacity` peaks also fill `protectedFetbGb` (Avamar's FETB definition IS the client peak), NetWorker `Client Protected Vol. and FETB` fills per-workload `protectedDiscoveredGb`. Gap-list sizes stay honestly unknown (neither export sizes unprotected clients — state this in the PR).

**Spec:** `docs/superpowers/specs/2026-07-02-insight-families-design.md` (family 4) + memory directive `front-end-values-not-unknown`.

## Global Constraints

- Engines pure; NO `Date.now()` — license expiry is classified against `meta.capturedAt` (ISO string; when empty, status falls back to `ok` with the raw text preserved).
- License status: `ok` (no expiry / text like "Authorized - No expiration date" / expiry > 90 days after capturedAt), `expiring` (≤ 90 days after capturedAt), `expired` (before capturedAt). Expiration cell may be an Excel serial OR a parseable date string OR arbitrary text — parse defensively, never invent a date.
- Presence-gate every cell read. Never fabricate sizes: only fill volumetry cells from real per-row figures; "–" remains wherever the export truly lacks data (unprotected discovered/FETB for both products; gap sizes).
- Tones: any `expired` license → bad; any `expiring` → warn; cleanup-item total > 0 → warn (else ok).
- i18n ×4 (`keyParity`); Biome authoritative check; `makeWorkbook({})` throws; commit per green task; ALL subagents sonnet.

---

### Task 0: Branch

- [ ] `git checkout main && git pull && git checkout -b feat/hygiene-frontend-values`

---

### Task 1: Hygiene engine

**Files:** Create `src/engines/aggregation/hygiene.ts`; Test `src/engines/aggregation/hygiene.test.ts`

**Interfaces (exact names for later tasks):**
- `HYGIENE_KINDS = ['datasetUnused','retentionUnused','scheduleUnused','clientInactive','clientOvertime','license'] as const`, `type HygieneKind`
- `type LicenseStatus = 'ok' | 'expiring' | 'expired'`
- `interface HygieneItem { kind: HygieneKind; name: string; detail?: string; licenseStatus?: LicenseStatus }`
- `interface Hygiene { items: HygieneItem[]; countByKind: Record<HygieneKind, number>; cleanupTotal: number; expiredLicenses: number; expiringLicenses: number }` — `cleanupTotal` counts the four unused/inactive kinds (NOT overtime, NOT licenses: overtime is a risk note, licenses are a compliance note).
- `emptyHygiene()`, `computeHygiene(items: HygieneItem[]): Hygiene`, `mergeHygiene(list: Hygiene[]): Hygiene` (identity single / empty on empty / concat + recount), `classifyLicenseExpiry(raw: string, capturedAt: string): { status: LicenseStatus; expiresOn?: string }` — raw may be Excel-serial-as-string, date string, or text; serial > 0 → serialToIso; `Date.parse`-able string → ISO; else status 'ok' no date. 90-day boundary: expiring when `0 <= expiry - capturedAt <= 90 days`; expired when `expiry < capturedAt`.

- [ ] TDD: tests for computeHygiene counts (per kind + cleanupTotal excludes overtime/license), classifyLicenseExpiry (text→ok; serial 30 days after capturedAt→expiring; serial 91 days→ok; serial before→expired; empty capturedAt→ok), mergeHygiene (identity by ref, concat+recount, empty). Implement. Gates. Commit `feat(hygiene): pure hygiene engine — kind counts + deterministic license expiry`.

---

### Task 2: Wiring

Mechanical, template = family 3 commit `git show c9a77eb`: `MetricKey` + `ReportView.hygiene: Hygiene` (after `capacityTrend`), provenance factories gain `hygieneAvailable` (PPDM unavailable + comment; builders pass `false` with next-task markers — NetWorker's is NOT permanent this time, Licenses exist), `mergeViews` fold + key, compiler sweep (`hygiene: emptyHygiene(),`). Full gates. Commit `feat(hygiene): ReportView.hygiene + provenance key + estate merge`.

---

### Task 3: Avamar adapter

**Create `src/engines/products/avamar/hygiene.ts`** — `avamarHygiene(wb): Hygiene` via `computeHygiene(items)`:
- `Dataset Not In Use` / `Retention Not In Use` / `Schedule Not In Use` → kinds datasetUnused/retentionUnused/scheduleUnused, `name` = Name, `detail` = Domain when ≠ '/' (skip rows with blank Name — the "query did not return any data" single-cell sheets yield no items).
- `Inactive Clients` → clientInactive, name = Full Domain, detail = Client Type (only rows with a real `Full Domain`).
- `Overtime Clients` → clientOvertime, name = Full Domain Name, detail = Client Type.
- Wire into `buildAvamarView` (compute once; provenance flag = `hygiene.items.length > 0`; note: an estate with genuinely zero hygiene findings reads as unavailable — acceptable, matches "nothing to show → suppressed"; document in code comment).
- Tests: populated sheets → counts per kind; no-data single-cell sheets → zero items; buildAvamarView regression untouched. Commit `feat(avamar): hygiene from not-in-use/inactive/overtime sheets`.

---

### Task 4: NetWorker adapter

**Create `src/engines/products/networker/hygiene.ts`** — `networkerHygiene(wb): Hygiene`: `Licenses` rows → kind license, name = License Name, detail = Enabler Code, licenseStatus via `classifyLicenseExpiry(cellStr(r,'Expiration Date'), wb.meta.capturedAt)`. Wire into `buildNetworkerView` (flag = items.length > 0). Tests: "Authorized - No expiration date" → ok; a serial-dated fixture before/within-90/after capturedAt → expired/expiring/ok. Commit `feat(networker): hygiene from license expiry`.

---

### Task 5: Tone + i18n ×4

- `thresholds.ts` append: `hygieneTone(cleanupTotal)` (0→ok else warn), `licenseTone(expired, expiring)` (expired>0→bad, expiring>0→warn, else ok). Boundary tests.
- `dashboard.json` ×4, block `hygiene` after `capacityTrend`: title "Configuration hygiene" (fr "Hygiène de configuration", de "Konfigurationshygiene", it "Igiene della configurazione"), takeaway "{{count}} cleanup opportunities" (fr "{{count}} opportunités de nettoyage", de "{{count}} Aufräum-Möglichkeiten", it "{{count}} opportunità di pulizia"), takeawayClean "No unused configuration found" (fr "Aucune configuration inutilisée détectée", de "Keine ungenutzte Konfiguration gefunden", it "Nessuna configurazione inutilizzata trovata"), chips cleanupChip "Cleanup opportunities"/"Opportunités de nettoyage"/"Aufräum-Möglichkeiten"/"Opportunità di pulizia" + licenseChip "License issues"/"Problèmes de licence"/"Lizenzprobleme"/"Problemi di licenza", col.{kind:"Type",name:"Name"/"Nom"/"Name"/"Nome",detail:"Detail"/"Détail"/"Detail"/"Dettaglio",status:"Status"/"Statut"/"Status"/"Stato"}, kind.{datasetUnused:"Unused dataset"/"Dataset inutilisé"/"Ungenutztes Dataset"/"Dataset inutilizzato", retentionUnused:"Unused retention"/"Rétention inutilisée"/"Ungenutzte Aufbewahrung"/"Retention inutilizzata", scheduleUnused:"Unused schedule"/"Planification inutilisée"/"Ungenutzter Zeitplan"/"Pianificazione inutilizzata", clientInactive:"Inactive client"/"Client inactif"/"Inaktiver Client"/"Client inattivo", clientOvertime:"Overtime client"/"Client en dépassement"/"Client mit Überschreitung"/"Client in sforamento", license:"License"/"Licence"/"Lizenz"/"Licenza"}, licenseStatus.{ok:"OK",expiring:"Expiring ≤ 90 d"/"Expire ≤ 90 j"/"Läuft ≤ 90 T ab"/"Scade ≤ 90 g",expired:"Expired"/"Expirée"/"Abgelaufen"/"Scaduta"}, caption "Top {{shown}} of {{total}}" per existing locale caption conventions.
- Gates incl. keyParity. Commit `feat(hygiene): tones + i18n en/fr/de/it`.

---

### Task 6: Export section

`sectionOrder.ts`: `'hygiene'` after `'efficiency'` (before `'policies'`) both flavors. `buildExportModel.ts` section `id:'hygiene'` via `withCaveat(..., 'hygiene', ...)`: table (kind-label / name / detail / license status-or-'') capped at TOP_N_DEFAULT rows with caption Top-shown-of-total; chips: cleanupChip = cleanupTotal toned `hygieneTone`, licenseChip (only when any license items) = expired+expiring toned `licenseTone`; deck subtitle takeaway/takeawayClean; bars = countByKind (>0 kinds only, kind-labels, muted except clientInactive warn when >0). Suppressed on empty. Dashboard placeholder `case 'hygiene': return null` (Task 7). Tests: populated fixture (counts, chip tones incl. expired→bad) + empty→absent. Commit `feat(hygiene): export section`.

---

### Task 7: Dashboard section

`HygieneSection.tsx` (ReliabilitySection template): null when items empty; takeaway; table kind/name/detail/status with per-row status coloring for expired/expiring (existing warn/bad text classes). Dashboard case wired. sections.test.tsx: renders item + expired status text; empty → nothing. Commit `feat(hygiene): dashboard section`.

---

### Task 8: Front-end values enrichment

**Files:** `src/engines/aggregation/frontEnd.ts` (Avamar mapper), `src/engines/products/networker/buildNetworkerView.ts` (or its frontEnd construction), tests in both.

- **Avamar** (`computeAvamarFrontEnd`): each per-Application row currently fills only `protectedDiscoveredGb` from `Client Capacity` peak sums. ALSO set `protectedFetbGb` to the same peak sum — Avamar's front-end TB definition IS the client peak capacity (state this in a code comment). Unprotected columns stay undefined (export carries nothing).
- **NetWorker**: current byType rows fill only `protectedFetbGb` from `Front End Capacity by Workload`. ALSO fill `protectedDiscoveredGb` per workload = sum of `Volume Protected Last 60 Days (GB)` from `Client Protected Vol. and FETB` grouped by `Workload Type` (presence-gated; only for types present in the existing byType list; a type absent from the Vol sheet keeps undefined). Comment: "protected volume observed in the 60-day window — the closest NetWorker analogue of discovered size".
- Tests: Avamar row now has both protected cells equal; NetWorker fixture with Vol sheet → discovered filled per matching type, missing type stays undefined; volumetry totals in buildExportModel tests updated if they assert "–" for these cells (check and adjust).
- Full `test:run` (volumetry rendering paths). Commit `feat(volumetry): fill FETB/discovered from richest sheets — fewer unknowns`.

---

### Task 9: Gates, smoke, final review, PR

- Full CI sequence + engine smoke: hygiene counts on POLGST01 (expect 18 datasets + 5 retentions + 26 schedules unused, 1 inactive, 24 overtime → cleanupTotal 50) and AVU203 (61+6+21 unused, 169 inactive, 131 overtime); NetWorker licenses 3×ok; volumetry smoke shows Avamar FETB + NetWorker discovered now populated.
- Final whole-branch review (SONNET) with seam checklist: capturedAt determinism (no Date.now anywhere), license boundary math, cleanupTotal exclusions, volumetry honesty (no invented cells; totals math with the new fills), presence-gating, i18n ×4, suppression, chip/tone scales.
- Push + PR (`feat/hygiene-frontend-values`): family 4 + "no more unknown" enrichment; state the honest limits (gap sizes remain unknown — unprotected clients are sized by neither export).

## Out of scope

- PPDM hygiene/front-end changes; gap-list sizes (data absent); pool/media hygiene beyond licenses.
