# PPDM Report — Plan 1: Foundation & Parser

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the fresh vatlas-stack repo and build the PPDM Live Optics `.xlsx` parser so dropping `ref/PPDM.xlsx` yields typed per-sheet data, in-use/idle-agent classification, capture metadata, and capped-sheet warnings — visible in a debug inventory view, fully tested.

**Architecture:** Pure functional parser engines (no React/DOM/store deps) run inside a Web Worker (the only xlsx import site); they return plain typed data to an inputs-only Zustand store via a main-thread hook. Mirrors vatlas's three-tier spine (`engines/ → store → hook → UI`).

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind v4, Zustand 5, Zod 4, SheetJS (`xlsx` 0.20.3 CDN tarball — NOT the npm package), Biome, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-06-18-ppdm-report-design.md`
**Reuse source:** the vatlas repo at `/Users/fjacquet/Projects/vatlas` (copy files where noted).

## Global Constraints

- **Pure FP in `engines/`** — no classes, no in-place mutation, no side effects, no React/DOM/store imports. (KISS/DRY/FP.)
- **Quality first** — no failing or skipped tests left in the tree; no half-built features; no silent fallbacks. Fail loudly.
- **No silent caps** — when a sheet hits the Live Optics 10,000-row export cap, record a warning string; never drop the fact.
- **xlsx pin** — `xlsx` MUST be the CDN tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. Never `npm install xlsx`.
- **xlsx confinement** — `import 'xlsx'` may appear ONLY in `src/engines/parser/readWorkbook.ts`, `captureMeta.ts`, and `parser.worker.ts` (and parser tests). Nowhere else.
- **Typeface** — Arial everywhere when UI styling is added (`font-family: Arial, Helvetica, sans-serif`).
- **localStorage** — only UI-preference keys allowed, prefixed `ppdm-report-` (e.g. `ppdm-report-theme`). Never persist dataset rows.
- **Determinism** — engines never call `Date.now()`/`new Date()` internally; any "today" is passed in as a parameter.

---

## File Structure

```
package.json, vite.config.ts, vitest.config.ts, biome.json, tsconfig*.json, index.html   # scaffold
scripts/check-supply-chain.mjs                 # CI gate (copied from vatlas)
src/
├── main.tsx                                   # fetchGuard import FIRST, then render App
├── App.tsx                                    # shell: UploadZone + DebugInventory
├── index.css                                  # Tailwind v4 entry + Arial base
├── privacy/fetchGuard.ts (+ .test.ts)         # COPIED from vatlas, prefixes adapted
├── utils/format.ts (+ .test.ts)               # COPIED from vatlas (base-10 number/date)
├── types/ppdm.ts                              # domain types + AGENT_SHEETS + LIVE_OPTICS_ROW_CAP
├── engines/parser/
│   ├── serialToIso.ts (+ .test.ts)            # Excel serial date → ISO
│   ├── readWorkbook.ts (+ .test.ts)           # SheetJS → SheetData[] (xlsx site)
│   ├── detectInUse.ts (+ .test.ts)            # N/A-placeholder rule → classifyAgents
│   ├── captureMeta.ts (+ .test.ts)            # Details sheet → CaptureMeta (xlsx site, Zod)
│   ├── normalizeWorkbook.ts (+ .test.ts)      # compose → ParsedWorkbook
│   ├── parser.worker.ts                       # worker entry (xlsx site)
│   └── parseInWorker.ts                       # main-thread worker surface
├── store/reportStore.ts (+ .test.ts)          # inputs-only Zustand
├── hooks/useReportUpload.ts                   # File → worker → store
└── components/
    ├── UploadZone.tsx                         # drag/drop + file picker
    └── DebugInventory.tsx                     # sheet table: rows, in-use/idle, capped
src/test/setup.ts                              # COPIED from vatlas (jest-dom)
```

---

## Phase 0 — Scaffold

### Task 1: Initialize the project

**Files:**

- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `biome.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.test.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`, `src/vite-env.d.ts`
- Copy from vatlas: `scripts/check-supply-chain.mjs`

**Interfaces:**

- Produces: a runnable Vite app and a green `npm run test:run`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "ppdm-report",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "prebuild": "node scripts/check-supply-chain.mjs",
    "check:supply-chain": "node scripts/check-supply-chain.mjs",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "zod": "^4.4.3",
    "zustand": "^5.0.13",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Copy the reusable config files from vatlas, adapting names**

Copy each file from `/Users/fjacquet/Projects/vatlas/` to the same relative path here, then adapt:

- `biome.json` — copy verbatim.
- `vitest.config.ts` — copy; keep `environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`, `globals: true`; in `coverage.include` set `['src/engines/**', 'src/utils/**', 'src/privacy/**']` and thresholds `{ lines: 75, functions: 75, branches: 75, statements: 75 }`.
- `vite.config.ts` — copy, but **remove** any PWA / EOS / bundle-size plugins and the `base` path; keep the React + Tailwind plugins. Minimal target:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
})
```

- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.test.json` — copy verbatim (strict mode stays on).
- `src/test/setup.ts` — copy verbatim.
- `scripts/check-supply-chain.mjs` — copy verbatim (it verifies the xlsx CDN pin and denylists telemetry packages).

- [ ] **Step 3: Create `index.html`, `src/index.css`, `src/vite-env.d.ts`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PPDM Report</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import 'tailwindcss';

:root { font-family: Arial, Helvetica, sans-serif; }
body { margin: 0; }
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Create `src/main.tsx` and `src/App.tsx`**

`src/main.tsx` (fetchGuard added in Task 2; for now just render):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:

```tsx
export default function App() {
  return <main style={{ padding: 24 }}><h1>PPDM Report</h1></main>
}
```

- [ ] **Step 5: Create a smoke test so `test:run` is green**

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the app heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'PPDM Report' })).toBeInTheDocument()
})
```

- [ ] **Step 6: Install and verify**

Run: `npm install`
Then: `npm run test:run`
Expected: 1 passing test.
Then: `npm run typecheck`
Expected: no errors.
Then: `npm run check:supply-chain`
Expected: passes (xlsx pin present, no telemetry deps).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold ppdm-report (vatlas stack) with CI supply-chain gate"
```

---

## Phase 1 — Reused foundation infra

### Task 2: Privacy fetch guard

**Files:**

- Create: `src/privacy/fetchGuard.ts`, `src/privacy/fetchGuard.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**

- Produces: side-effect module installing a synchronous-throwing guard on non-same-origin `fetch`/`XHR`/`WebSocket`/`sendBeacon`. No exports needed by callers.

- [ ] **Step 1: Copy the guard and its test from vatlas**

Copy `/Users/fjacquet/Projects/vatlas/src/privacy/fetchGuard.ts` → `src/privacy/fetchGuard.ts` and `/Users/fjacquet/Projects/vatlas/src/privacy/fetchGuard.test.ts` → `src/privacy/fetchGuard.test.ts`, verbatim. If any user-facing string mentions "vatlas", change it to "ppdm-report".

- [ ] **Step 2: Run the copied test to verify it passes here**

Run: `npx vitest run src/privacy/fetchGuard.test.ts`
Expected: PASS (all guard tests).

- [ ] **Step 3: Import the guard FIRST in `src/main.tsx`**

Add as the very first import (before React), so it installs before any code can make a request:

```tsx
import './privacy/fetchGuard'
import { StrictMode } from 'react'
// …rest unchanged
```

- [ ] **Step 4: Verify build still works**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/privacy src/main.tsx
git commit -m "feat: add same-origin privacy fetch guard (reused from vatlas)"
```

### Task 3: Locale-aware formatting helpers

**Files:**

- Create: `src/utils/format.ts`, `src/utils/format.test.ts`

**Interfaces:**

- Produces: `formatNumber(n: number, locale: string): string`, `formatBytes`/`formatDate` as present in the vatlas source. Used later by `captureMeta` display and engines.

- [ ] **Step 1: Copy `format.ts` and its test from vatlas**

Copy `/Users/fjacquet/Projects/vatlas/src/utils/format.ts` → `src/utils/format.ts` and its colocated `format.test.ts` if present → `src/utils/format.test.ts`. Keep base-10 semantics (the PPDM export declares base-10 units). Remove any RVTools-specific helpers (e.g. MiB-specific functions) if they reference vatlas-only types; keep `formatNumber` and `formatDate`.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/utils/format.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/utils
git commit -m "feat: add locale-aware base-10 format helpers (reused from vatlas)"
```

---

## Phase 2 — Parser & in-use detection

### Task 4: Domain types and constants

**Files:**

- Create: `src/types/ppdm.ts`

**Interfaces:**

- Produces: `Cell`, `ProtectionStatus`, `SheetData`, `CaptureMeta`, `ParsedWorkbook`, `AGENT_SHEETS`, `LIVE_OPTICS_ROW_CAP`. Consumed by every parser file and the store.

- [ ] **Step 1: Write `src/types/ppdm.ts`**

```ts
/** A single spreadsheet cell value after SheetJS parsing. */
export type Cell = string | number | boolean | null

export type ProtectionStatus = 'PROTECTED' | 'UNPROTECTED' | 'EXCLUDED'

/** One worksheet, rows keyed by header. */
export interface SheetData {
  name: string
  headers: string[]
  rows: Array<Record<string, Cell>>
  /** True when the sheet hit the Live Optics 10,000-row export cap. */
  capped: boolean
}

/** Report-level metadata read from the Details sheet. */
export interface CaptureMeta {
  projectId: string
  customer: string
  collectorBuild: string
  /** ISO-8601 string, or '' when absent/unparseable. */
  capturedAt: string
  /** True when the export declares base-10 units. */
  baseTen: boolean
}

export interface ParsedWorkbook {
  meta: CaptureMeta
  sheets: Record<string, SheetData>
  /** Agent/asset-type sheets with at least one real (non-placeholder) row. */
  inUse: string[]
  /** Agent/asset-type sheets present in the export but holding only N/A placeholders. */
  idleAgents: string[]
  /** Human-readable data caveats (e.g. capped sheets). Never empty silently. */
  warnings: string[]
}

/** Asset-type sheets — each corresponds to a PPDM application agent / plugin. */
export const AGENT_SHEETS = [
  'File Systems',
  'Kubernetes',
  'Microsoft Exchange Databases',
  'Oracle Databases',
  'SAP HANA Databases',
  'NAS',
  'HyperV VMs',
  'vCloud Director VAPPs',
  'Cloud Native Edge',
  'Dell Native Edge VMs',
  'SQL Databases',
  'Generic Application Assets',
  'Virtual Machines',
  'PowerMax Block',
  'Nutanix VMs',
  'PowerStore Block',
  'Avamar Assets',
  'Other Assets',
] as const

/** Live Optics truncates large sheet exports at exactly this many data rows. */
export const LIVE_OPTICS_ROW_CAP = 10_000
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/ppdm.ts
git commit -m "feat: add PPDM domain types and agent-sheet constants"
```

### Task 5: Excel serial date → ISO

**Files:**

- Create: `src/engines/parser/serialToIso.ts`, `src/engines/parser/serialToIso.test.ts`

**Interfaces:**

- Produces: `serialToIso(serial: number): string` (ISO-8601 UTC). Consumed by `captureMeta`.

- [ ] **Step 1: Write the failing test**

`src/engines/parser/serialToIso.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serialToIso } from './serialToIso'

describe('serialToIso', () => {
  it('converts the Unix epoch serial (25569) to 1970-01-01', () => {
    expect(serialToIso(25569).slice(0, 10)).toBe('1970-01-01')
  })

  it('converts the WHO sample capture serial to mid-June 2026', () => {
    // 46188.59040939815 from the Details sheet
    expect(serialToIso(46188.59040939815).slice(0, 7)).toBe('2026-06')
  })

  it('returns a valid ISO-8601 string', () => {
    expect(serialToIso(46188).endsWith('Z')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engines/parser/serialToIso.test.ts`
Expected: FAIL ("serialToIso is not a function" / module not found).

- [ ] **Step 3: Write the implementation**

`src/engines/parser/serialToIso.ts`:

```ts
/** Days between the Excel epoch (1899-12-30) and the Unix epoch (1970-01-01). */
const EXCEL_UNIX_OFFSET_DAYS = 25569
const MS_PER_DAY = 86_400_000

/** Convert an Excel serial date (base 1899-12-30) to an ISO-8601 UTC string. */
export function serialToIso(serial: number): string {
  const ms = Math.round((serial - EXCEL_UNIX_OFFSET_DAYS) * MS_PER_DAY)
  return new Date(ms).toISOString()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engines/parser/serialToIso.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/serialToIso.ts src/engines/parser/serialToIso.test.ts
git commit -m "feat: add Excel serial date to ISO converter"
```

### Task 6: Read workbook → SheetData

**Files:**

- Create: `src/engines/parser/readWorkbook.ts`, `src/engines/parser/readWorkbook.test.ts`

**Interfaces:**

- Consumes: `SheetData`, `LIVE_OPTICS_ROW_CAP`, `Cell` from `types/ppdm`.
- Produces: `readWorkbook(buf: ArrayBuffer): XLSX.WorkBook`, `toSheetData(wb: XLSX.WorkBook): SheetData[]`, `parseXlsx(buf: ArrayBuffer): SheetData[]`. Consumed by `captureMeta` and `normalizeWorkbook`. **This is an xlsx import site.**

- [ ] **Step 1: Write the failing test**

`src/engines/parser/readWorkbook.test.ts`:

```ts
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../../types/ppdm'
import { parseXlsx } from './readWorkbook'

function makeWorkbook(sheets: Record<string, Cell[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseXlsx', () => {
  it('parses headers and keyed rows', () => {
    const buf = makeWorkbook({
      SQL: [
        ['Asset Name', 'Protection Status'],
        ['db1', 'PROTECTED'],
        ['db2', 'UNPROTECTED'],
      ],
    })
    const sheets = parseXlsx(buf)
    const sql = sheets.find((s) => s.name === 'SQL')
    expect(sql).toBeDefined()
    expect(sql?.headers).toEqual(['Asset Name', 'Protection Status'])
    expect(sql?.rows).toEqual([
      { 'Asset Name': 'db1', 'Protection Status': 'PROTECTED' },
      { 'Asset Name': 'db2', 'Protection Status': 'UNPROTECTED' },
    ])
    expect(sql?.capped).toBe(false)
  })

  it('flags a sheet at the row cap as capped', () => {
    const rows: Cell[][] = [['Id']]
    for (let i = 0; i < 10_000; i++) rows.push([i])
    const sheets = parseXlsx(makeWorkbook({ Copies: rows }))
    expect(sheets.find((s) => s.name === 'Copies')?.capped).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engines/parser/readWorkbook.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/engines/parser/readWorkbook.ts`:

```ts
import * as XLSX from 'xlsx'
import type { Cell, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'

/** Read an .xlsx ArrayBuffer into a SheetJS workbook. */
export function readWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buf, { type: 'array' })
}

/** Convert every worksheet into a SheetData (header row + keyed data rows). */
export function toSheetData(wb: XLSX.WorkBook): SheetData[] {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    const headers = (aoa[0] ?? []).map((h) => String(h ?? '').trim())
    const dataRows = aoa.slice(1)
    const rows = dataRows.map((r) => {
      const obj: Record<string, Cell> = {}
      headers.forEach((h, i) => {
        if (h) obj[h] = r[i] ?? null
      })
      return obj
    })
    return { name, headers, rows, capped: dataRows.length >= LIVE_OPTICS_ROW_CAP }
  })
}

/** Convenience: read + convert in one call (used by tests and standalone parsing). */
export function parseXlsx(buf: ArrayBuffer): SheetData[] {
  return toSheetData(readWorkbook(buf))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engines/parser/readWorkbook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/readWorkbook.ts src/engines/parser/readWorkbook.test.ts
git commit -m "feat: parse xlsx workbook into typed sheet data with cap flag"
```

### Task 7: In-use detection (N/A-placeholder rule)

**Files:**

- Create: `src/engines/parser/detectInUse.ts`, `src/engines/parser/detectInUse.test.ts`

**Interfaces:**

- Consumes: `SheetData`, `AGENT_SHEETS` from `types/ppdm`.
- Produces: `sheetIsInUse(sheet: SheetData): boolean`, `classifyAgents(sheets: SheetData[]): { inUse: string[]; idleAgents: string[] }`. Consumed by `normalizeWorkbook`. **Pure — no xlsx import.**

- [ ] **Step 1: Write the failing test**

`src/engines/parser/detectInUse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SheetData } from '../../types/ppdm'
import { classifyAgents, sheetIsInUse } from './detectInUse'

function sheet(name: string, rows: SheetData['rows']): SheetData {
  return { name, headers: Object.keys(rows[0] ?? {}), rows, capped: false }
}

describe('sheetIsInUse', () => {
  it('is false when every row is an N/A placeholder', () => {
    expect(sheetIsInUse(sheet('Oracle Databases', [{ 'Asset Name': 'N/A', Status: 'N/A' }]))).toBe(false)
  })

  it('is false when there are no data rows', () => {
    expect(sheetIsInUse(sheet('NAS', []))).toBe(false)
  })

  it('is true when at least one row has a real value', () => {
    expect(sheetIsInUse(sheet('SQL Databases', [{ 'Asset Name': 'db1', Status: 'OK' }]))).toBe(true)
  })

  it('treats empty strings and nulls as placeholders', () => {
    expect(sheetIsInUse(sheet('NAS', [{ a: '', b: null }]))).toBe(false)
  })
})

describe('classifyAgents', () => {
  it('splits agent sheets into in-use and idle, ignoring non-agent sheets', () => {
    const sheets = [
      sheet('SQL Databases', [{ 'Asset Name': 'db1' }]),
      sheet('Oracle Databases', [{ 'Asset Name': 'N/A' }]),
      sheet('Copies', [{ 'Copy ID': 'c1' }]), // not an agent sheet
    ]
    expect(classifyAgents(sheets)).toEqual({
      inUse: ['SQL Databases'],
      idleAgents: ['Oracle Databases'],
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engines/parser/detectInUse.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/engines/parser/detectInUse.ts`:

```ts
import type { Cell, SheetData } from '../../types/ppdm'
import { AGENT_SHEETS } from '../../types/ppdm'

/** A cell counts as a placeholder when it is empty or the literal "N/A". */
function isPlaceholder(value: Cell): boolean {
  if (value === null || value === undefined) return true
  const s = String(value).trim()
  return s === '' || s === 'N/A'
}

/** A sheet is "in use" when at least one data row holds a real (non-placeholder) value. */
export function sheetIsInUse(sheet: SheetData): boolean {
  return sheet.rows.some((row) => Object.values(row).some((v) => !isPlaceholder(v)))
}

/** Split the known agent/asset-type sheets into in-use vs present-but-idle. */
export function classifyAgents(sheets: SheetData[]): { inUse: string[]; idleAgents: string[] } {
  const byName = new Map(sheets.map((s) => [s.name, s]))
  const inUse: string[] = []
  const idleAgents: string[] = []
  for (const name of AGENT_SHEETS) {
    const sheet = byName.get(name)
    if (!sheet) continue
    if (sheetIsInUse(sheet)) inUse.push(name)
    else idleAgents.push(name)
  }
  return { inUse, idleAgents }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engines/parser/detectInUse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/detectInUse.ts src/engines/parser/detectInUse.test.ts
git commit -m "feat: detect in-use vs idle agent sheets via N/A-placeholder rule"
```

### Task 8: Capture metadata from the Details sheet

**Files:**

- Create: `src/engines/parser/captureMeta.ts`, `src/engines/parser/captureMeta.test.ts`

**Interfaces:**

- Consumes: `CaptureMeta` from `types/ppdm`, `readWorkbook` from `./readWorkbook`, `serialToIso` from `./serialToIso`, `zod`.
- Produces: `captureMeta(wb: XLSX.WorkBook): CaptureMeta`. Consumed by `normalizeWorkbook`. **xlsx import site.**

- [ ] **Step 1: Write the failing test**

`src/engines/parser/captureMeta.test.ts`:

```ts
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../../types/ppdm'
import { captureMeta } from './captureMeta'

function wbWithDetails(rows: Cell[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Details')
  return wb
}

describe('captureMeta', () => {
  it('reads project, customer, collector build, date and base-10 flag', () => {
    const meta = captureMeta(
      wbWithDetails([
        ['Project ID', '3359956'],
        ['Project Name', 'WHO'],
        ['Date', 46188.59040939815],
        ['Collector Build Version', '27.2.5.278'],
        ['Disclaimer', 'All measurements ... using Base 10 units of Measurement.'],
      ]),
    )
    expect(meta.projectId).toBe('3359956')
    expect(meta.customer).toBe('WHO')
    expect(meta.collectorBuild).toBe('27.2.5.278')
    expect(meta.capturedAt.slice(0, 7)).toBe('2026-06')
    expect(meta.baseTen).toBe(true)
  })

  it('returns safe defaults when Details is missing', () => {
    const meta = captureMeta(XLSX.utils.book_new())
    expect(meta).toEqual({ projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: false })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engines/parser/captureMeta.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/engines/parser/captureMeta.ts`:

```ts
import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { Cell, CaptureMeta } from '../../types/ppdm'
import { serialToIso } from './serialToIso'

const CaptureMetaSchema = z.object({
  projectId: z.string(),
  customer: z.string(),
  collectorBuild: z.string(),
  capturedAt: z.string(),
  baseTen: z.boolean(),
})

/** Read the key/value Details sheet into validated CaptureMeta. */
export function captureMeta(wb: XLSX.WorkBook): CaptureMeta {
  const ws = wb.Sheets.Details
  const kv = new Map<string, Cell>()
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    }) as Cell[][]
    for (const row of aoa) {
      const key = String(row[0] ?? '').trim()
      if (key) kv.set(key, row[1] ?? null)
    }
  }
  const date = kv.get('Date')
  const disclaimer = String(kv.get('Disclaimer') ?? '')
  return CaptureMetaSchema.parse({
    projectId: String(kv.get('Project ID') ?? ''),
    customer: String(kv.get('Project Name') ?? ''),
    collectorBuild: String(kv.get('Collector Build Version') ?? ''),
    capturedAt: typeof date === 'number' ? serialToIso(date) : String(date ?? ''),
    baseTen: /base\s*10/i.test(disclaimer),
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engines/parser/captureMeta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/captureMeta.ts src/engines/parser/captureMeta.test.ts
git commit -m "feat: extract capture metadata from the Details sheet (Zod-validated)"
```

### Task 9: Compose the normalized workbook

**Files:**

- Create: `src/engines/parser/normalizeWorkbook.ts`, `src/engines/parser/normalizeWorkbook.test.ts`

**Interfaces:**

- Consumes: `readWorkbook`/`toSheetData`, `classifyAgents`, `captureMeta`, types + `LIVE_OPTICS_ROW_CAP`.
- Produces: `normalizeWorkbook(buf: ArrayBuffer): ParsedWorkbook`. Consumed by the worker and store. **xlsx import site (via readWorkbook).**

- [ ] **Step 1: Write the failing test**

`src/engines/parser/normalizeWorkbook.test.ts`:

```ts
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import type { Cell } from '../../types/ppdm'
import { normalizeWorkbook } from './normalizeWorkbook'

function makeWorkbook(sheets: Record<string, Cell[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('normalizeWorkbook', () => {
  it('produces meta, sheets, in-use/idle classification, and cap warnings', () => {
    const cappedRows: Cell[][] = [['Copy ID']]
    for (let i = 0; i < 10_000; i++) cappedRows.push([`c${i}`])

    const result = normalizeWorkbook(
      makeWorkbook({
        Details: [
          ['Project Name', 'WHO'],
          ['Collector Build Version', '27.2.5.278'],
        ],
        'SQL Databases': [['Asset Name', 'Protection Status'], ['db1', 'PROTECTED']],
        'Oracle Databases': [['Asset Name', 'Protection Status'], ['N/A', 'N/A']],
        Copies: cappedRows,
      }),
    )

    expect(result.meta.customer).toBe('WHO')
    expect(result.inUse).toContain('SQL Databases')
    expect(result.idleAgents).toContain('Oracle Databases')
    expect(result.sheets['SQL Databases'].rows).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('Copies'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/engines/parser/normalizeWorkbook.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/engines/parser/normalizeWorkbook.ts`:

```ts
import type { ParsedWorkbook, SheetData } from '../../types/ppdm'
import { LIVE_OPTICS_ROW_CAP } from '../../types/ppdm'
import { captureMeta } from './captureMeta'
import { classifyAgents } from './detectInUse'
import { readWorkbook, toSheetData } from './readWorkbook'

/** Parse a Live Optics PPDM .xlsx into a fully normalized, classified workbook. */
export function normalizeWorkbook(buf: ArrayBuffer): ParsedWorkbook {
  const wb = readWorkbook(buf)
  const sheetList = toSheetData(wb)
  const sheets: Record<string, SheetData> = {}
  for (const s of sheetList) sheets[s.name] = s

  const { inUse, idleAgents } = classifyAgents(sheetList)

  const warnings: string[] = []
  for (const s of sheetList) {
    if (s.capped) {
      warnings.push(
        `Sheet "${s.name}" reached the ${LIVE_OPTICS_ROW_CAP.toLocaleString()}-row export cap; figures derived from it are a window, not the full set.`,
      )
    }
  }

  return { meta: captureMeta(wb), sheets, inUse, idleAgents, warnings }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/engines/parser/normalizeWorkbook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/parser/normalizeWorkbook.ts src/engines/parser/normalizeWorkbook.test.ts
git commit -m "feat: compose normalized PPDM workbook with classification and cap warnings"
```

### Task 10: Worker and main-thread surface

**Files:**

- Create: `src/engines/parser/parser.worker.ts`, `src/engines/parser/parseInWorker.ts`

**Interfaces:**

- Consumes: `normalizeWorkbook`, `ParsedWorkbook`.
- Produces: `parseInWorker(file: File): Promise<ParsedWorkbook>`. Consumed by `useReportUpload`. The worker is the only place besides parser modules where xlsx executes; it posts the plain `ParsedWorkbook` back and never the raw workbook.

- [ ] **Step 1: Write the worker**

`src/engines/parser/parser.worker.ts`:

```ts
import '../../privacy/fetchGuard'
import type { ParsedWorkbook } from '../../types/ppdm'
import { normalizeWorkbook } from './normalizeWorkbook'

export type ParseRequest = { id: number; buffer: ArrayBuffer }
export type ParseResponse =
  | { id: number; ok: true; result: ParsedWorkbook }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const { id, buffer } = e.data
  try {
    const result = normalizeWorkbook(buffer)
    const res: ParseResponse = { id, ok: true, result }
    ;(self as unknown as Worker).postMessage(res)
  } catch (err) {
    const res: ParseResponse = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
    ;(self as unknown as Worker).postMessage(res)
  }
}
```

- [ ] **Step 2: Write the main-thread surface**

`src/engines/parser/parseInWorker.ts` (no xlsx import here — keeps the main bundle clean):

```ts
import type { ParsedWorkbook } from '../../types/ppdm'
import type { ParseRequest, ParseResponse } from './parser.worker'

let worker: Worker | null = null
let nextId = 1

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

/** Parse a dropped File in the worker; resolves with the normalized workbook. */
export async function parseInWorker(file: File): Promise<ParsedWorkbook> {
  const buffer = await file.arrayBuffer()
  const w = getWorker()
  const id = nextId++
  return new Promise<ParsedWorkbook>((resolve, reject) => {
    const onMessage = (e: MessageEvent<ParseResponse>) => {
      if (e.data.id !== id) return
      w.removeEventListener('message', onMessage)
      if (e.data.ok) resolve(e.data.result)
      else reject(new Error(e.data.error))
    }
    w.addEventListener('message', onMessage)
    const req: ParseRequest = { id, buffer }
    w.postMessage(req, [buffer])
  })
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.
(No unit test for the worker glue — it is exercised by the manual verification in Task 13. The pure logic it wraps is already fully tested.)

- [ ] **Step 4: Commit**

```bash
git add src/engines/parser/parser.worker.ts src/engines/parser/parseInWorker.ts
git commit -m "feat: run PPDM parsing in a web worker with a promise surface"
```

---

## Phase 3 — Store, upload, debug view

### Task 11: Inputs-only report store

**Files:**

- Create: `src/store/reportStore.ts`, `src/store/reportStore.test.ts`

**Interfaces:**

- Consumes: `ParsedWorkbook`, `zustand`.
- Produces: `useReportStore` with state `{ workbook: ParsedWorkbook | null; setWorkbook(wb): void; clear(): void }`. Consumed by `useReportUpload` and the UI. **Inputs only — no derived metrics.**

- [ ] **Step 1: Write the failing test**

`src/store/reportStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedWorkbook } from '../types/ppdm'
import { useReportStore } from './reportStore'

const wb: ParsedWorkbook = {
  meta: { projectId: '', customer: 'WHO', collectorBuild: '', capturedAt: '', baseTen: true },
  sheets: {},
  inUse: ['SQL Databases'],
  idleAgents: ['Oracle Databases'],
  warnings: [],
}

describe('reportStore', () => {
  beforeEach(() => useReportStore.getState().clear())

  it('starts empty', () => {
    expect(useReportStore.getState().workbook).toBeNull()
  })

  it('stores and clears a parsed workbook', () => {
    useReportStore.getState().setWorkbook(wb)
    expect(useReportStore.getState().workbook?.meta.customer).toBe('WHO')
    useReportStore.getState().clear()
    expect(useReportStore.getState().workbook).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/store/reportStore.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/store/reportStore.ts`:

```ts
import { create } from 'zustand'
import type { ParsedWorkbook } from '../types/ppdm'

interface ReportState {
  workbook: ParsedWorkbook | null
  setWorkbook: (wb: ParsedWorkbook) => void
  clear: () => void
}

export const useReportStore = create<ReportState>((set) => ({
  workbook: null,
  setWorkbook: (wb) => set({ workbook: wb }),
  clear: () => set({ workbook: null }),
}))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/store/reportStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: add inputs-only report store"
```

### Task 12: Upload hook

**Files:**

- Create: `src/hooks/useReportUpload.ts`

**Interfaces:**

- Consumes: `parseInWorker`, `useReportStore`.
- Produces: `useReportUpload(): { upload(file: File): Promise<void>; busy: boolean; error: string | null }`. Consumed by `UploadZone`.

- [ ] **Step 1: Write the hook**

`src/hooks/useReportUpload.ts`:

```ts
import { useState } from 'react'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'

export function useReportUpload() {
  const setWorkbook = useReportStore((s) => s.setWorkbook)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const wb = await parseInWorker(file)
      setWorkbook(wb)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks
git commit -m "feat: add report upload hook (file -> worker -> store)"
```

### Task 13: Upload zone, debug inventory, and wiring

**Files:**

- Create: `src/components/UploadZone.tsx`, `src/components/DebugInventory.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `useReportUpload`, `useReportStore`, `AGENT_SHEETS`.
- Produces: a working UI. End-to-end manual verification target.

- [ ] **Step 1: Write `UploadZone`**

`src/components/UploadZone.tsx`:

```tsx
import type { ChangeEvent } from 'react'
import { useReportUpload } from '../hooks/useReportUpload'

export function UploadZone() {
  const { upload, busy, error } = useReportUpload()

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
  }

  return (
    <div style={{ border: '2px dashed #94a3b8', borderRadius: 12, padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <label>
        <strong>Drop / choose a Live Optics PPDM .xlsx</strong>
        <br />
        <input type="file" accept=".xlsx" onChange={onChange} disabled={busy} />
      </label>
      {busy && <p>Parsing…</p>}
      {error && <p style={{ color: '#dc2626' }}>Error: {error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write `DebugInventory`**

`src/components/DebugInventory.tsx`:

```tsx
import { useReportStore } from '../store/reportStore'

export function DebugInventory() {
  const workbook = useReportStore((s) => s.workbook)
  if (!workbook) return null

  const { meta, sheets, inUse, idleAgents, warnings } = workbook
  return (
    <section style={{ fontFamily: 'Arial, Helvetica, sans-serif', marginTop: 24 }}>
      <h2>{meta.customer || '(unknown customer)'} — collector {meta.collectorBuild || 'n/a'}</h2>
      <p>
        Agents in use: <strong>{inUse.length}</strong> · idle (present, not in use):{' '}
        <strong>{idleAgents.length}</strong>
        {meta.capturedAt && <> · captured {meta.capturedAt.slice(0, 10)}</>}
      </p>
      {warnings.length > 0 && (
        <ul style={{ color: '#b45309' }}>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 12px' }}>Sheet</th>
            <th style={{ textAlign: 'right', padding: '4px 12px' }}>Rows</th>
            <th style={{ textAlign: 'left', padding: '4px 12px' }}>Capped</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(sheets).map((s) => (
            <tr key={s.name}>
              <td style={{ padding: '4px 12px' }}>
                {s.name} {inUse.includes(s.name) ? '✅' : idleAgents.includes(s.name) ? '💤' : ''}
              </td>
              <td style={{ textAlign: 'right', padding: '4px 12px' }}>{s.rows.length}</td>
              <td style={{ padding: '4px 12px' }}>{s.capped ? '⚠️ yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

- [ ] **Step 3: Wire into `App.tsx`**

`src/App.tsx`:

```tsx
import { DebugInventory } from './components/DebugInventory'
import { UploadZone } from './components/UploadZone'

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <h1>PPDM Report</h1>
      <UploadZone />
      <DebugInventory />
    </main>
  )
}
```

- [ ] **Step 4: Update the App smoke test for the new heading context**

The existing `src/App.test.tsx` still asserts the "PPDM Report" heading — confirm it still passes:
Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Manual end-to-end verification with the real sample**

Run: `npm run dev`
Open the served URL, choose `ref/PPDM.xlsx`, and confirm:

- Header shows `WHO — collector 27.2.5.278`, captured `2026-06-15`.
- "Agents in use: **5** · idle: **13**".
- The `Copies` and `Protection Job Activities` rows show **⚠️ yes** under Capped, and two cap warnings appear.
- Asset sheets with data show ✅, idle ones show 💤.

- [ ] **Step 6: Full gate run**

Run: `npm run test:run && npm run typecheck && npm run lint && npm run check:supply-chain`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components src/App.tsx
git commit -m "feat: add upload zone and debug inventory; wire end-to-end parsing"
```

---

## Self-Review (completed by author)

- **Spec coverage (Plan 1 scope):** scaffold ✓ (T1), privacy guard ✓ (T2), format helpers ✓ (T3), parser + Zod boundary ✓ (T4–T9), `N/A` in-use detection ✓ (T7), capped-sheet honesty ✓ (T6/T9), worker confinement of xlsx ✓ (T10), inputs-only store ✓ (T11), upload ✓ (T12), end-to-end view ✓ (T13). Engines/dashboard/exports/i18n are deliberately deferred to Plans 2–3.
- **Placeholder scan:** none — every code step contains complete code; no "TODO"/"handle errors"/"similar to".
- **Type consistency:** `ParsedWorkbook`/`SheetData`/`CaptureMeta` defined in T4 and used identically in T6–T13; `parseInWorker(file): Promise<ParsedWorkbook>`, `classifyAgents → { inUse, idleAgents }`, store `{ workbook, setWorkbook, clear }` consistent across consumers.

## Next plans

- **Plan 2 — Metric engines:** `topN` helper, `coverage`, `gaps`, `jobs`, `compliance`, `capacity`, `policies`, `agents`, `reportView` composition root, `useReportView` bridge hook, branded `units`. (Reads the `ParsedWorkbook` from this plan.)
- **Plan 3 — Dashboard + exports + i18n:** lean scrollable dashboard, flavor/theme/language toggles, dual-theme PPTX (pptxgenjs) following the live web theme, HTML export, and fr/de/it/en locale files with a key-parity test.

```
