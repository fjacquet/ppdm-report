# PPDM Report — User Guide

> See also: [README](../README.md) for quick-start commands and the stack reference.

---

## Table of contents

1. [What you need](#1-what-you-need)
2. [Getting started](#2-getting-started)
3. [Multi-server estates](#3-multi-server-estates)
4. [Reading the dashboard](#4-reading-the-dashboard)
5. [Switching flavor](#5-switching-flavor)
6. [Language and theme](#6-language-and-theme)
7. [Exporting](#7-exporting)
8. [Reading the numbers honestly](#8-reading-the-numbers-honestly)
9. [Privacy](#9-privacy)

---

## 1. What you need

**One file:** a Dell Live Optics PPDM export in `.xlsx` format. This is the workbook that Live Optics produces when you run a collection against a Dell PowerProtect Data Manager appliance. The file contains around 31 sheets covering assets, jobs, backup copies, policies, storage targets, and metadata. The sample workbook `ref/PPDM.xlsx` in this repository is a real example you can use to explore the tool.

**Nothing else.** PPDM Report is 100% client-side. The workbook is read directly in your browser; no data is uploaded to any server. You do not need a Dell account, a PPDM connection, or internet access once the app is loaded.

---

## 2. Getting started

### Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Use a deployed build

Open the URL where the built app is hosted. No installation required.

### Load your workbook

When the app opens you will see the upload zone — a dashed rectangle with the label **"Drop your PPDM export file here"** and a blue **"Choose file"** button.

- **Drag and drop** your `.xlsx` file directly onto the zone, or
- Click **"Choose file"** and select the file from your system.

Only `.xlsx` files are accepted. While the file is being parsed a brief **"Parsing…"** message appears. Once parsing completes the dashboard appears below the upload zone. If the file cannot be read an error message is shown in the upload zone.

Parsing happens entirely in a background browser worker — the main thread stays responsive throughout.

---

## 3. Multi-server estates

If your customer runs more than one PPDM appliance, you can load each server's Live Optics export separately and let the tool merge them into a single combined estate report. Drop the first `.xlsx` file as usual, then drop additional files onto the same upload zone — or use **"Choose file"** again — and each one is added to the loaded-servers list without replacing the previous one. You can also load files in one batch by selecting multiple files at once in the file picker. The combined dashboard updates immediately after each addition.

Loaded servers appear as a chip strip below the upload zone, labelled by the appliance Host Name from the `System Information` sheet (falling back to the project name, then the filename). Each chip carries a remove button (×) so you can drop a specific server without clearing the rest; a **"Clear all"** control removes every loaded file and returns the tool to its initial state.

When two or more servers are loaded, a **Per-server breakdown** section appears in the dashboard, showing each server's coverage percentage and a summary table so you can compare contributions at a glance. The same breakdown is included in both the PPTX and HTML exports.

If the app detects a potential issue — sources with mismatched base-10 / base-2 unit conventions, what looks like the same file loaded twice (matching appliance host or project and snapshot), or sheets that are capped across multiple sources — it raises a warning in the dashboard and in both exports. These warnings are informational: they never block the report from loading or exporting. Review them to decide whether the combination of sources is meaningful for your analysis.

### Mixing older summary-format exports with current exports

Older PPDM releases produce a different export format: instead of per-asset rows the workbook carries pre-aggregated sheets named with patterns like `VMs Count And Cap` or `FileSystem Assets Count & Cap`. These **summary-format** exports are accepted and can be loaded alongside current **detail-format** exports in the same estate session.

Summary exports recover overall coverage counts (protected, unprotected, excluded), unprotected capacity, job result distribution, policy list, in-use agent types, and Data Domain mtree count. Four metrics are not present in older exports and are shown as **"not available"** with a note indicating how many servers in the estate contributed that data:

- **Per-type coverage breakdown** — protected / unprotected / excluded counts for each asset type
- **Unprotected-asset list** — the ranked list of unprotected assets by size
- **Copy compliance** — app-consistency, immutability, and replication percentages
- **Storage-target utilization** — Data Domain and protection storage target utilization percentages

When an estate mixes detail and summary exports the dashboard raises an informational warning so you know which metrics are partial.

---

## 4. Reading the dashboard

The dashboard is one scrollable page. Every section derives its numbers from the same underlying data; nothing is cached between sessions and nothing is stored beyond the current browser tab.

### Executive KPIs

Four summary cards appear at the very top of the dashboard, regardless of which flavor is active:

| Card | What it shows |
|---|---|
| **Coverage** | Overall protection rate: `PROTECTED / (PROTECTED + UNPROTECTED)` as a percentage. |
| **Unprotected** | Total capacity of unprotected assets, expressed in base-10 bytes (KB / MB / GB / TB). |
| **Job success rate** | Percentage of job runs that completed with SUCCESS in the available window. |
| **Immutable** | Percentage of backup copies that carry an immutability lock. Shown in red when 0%. |

### Asset Coverage

- A **donut chart** shows the estate split across Protected (green), Unprotected (red), and Excluded (grey) asset counts.
- A **stacked horizontal bar chart** breaks the same split down per asset type.
- Two coverage figures appear above the charts: the **headline** (`PROTECTED / (PROTECTED + UNPROTECTED)`) in large type, and the **secondary** figure `(including excluded assets)` — `PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED)` — in smaller type alongside it. The Excluded count is shown separately so nothing is hidden.

### Protection Gaps

- The total unprotected capacity and the total count of unprotected assets are displayed as large numbers.
- A table lists the largest unprotected assets by size, with columns: Name, Type, Size. The table is capped at 25 rows. A footnote beneath the table reads **"Top N of M"** when the full list is longer — see [Reading the numbers honestly](#7-reading-the-numbers-honestly).

### Idle Agents

Asset type agents that are present in the PPDM environment but have no actual assets in use (their rows in the export contain only the `N/A` placeholder) are listed here as pills. This section is hidden when every known agent type is actively protecting assets.

In the exported deck these types appear on a single dedicated slide rather than getting individual per-type slides.

### Job Activity and Compliance

These two sub-sections share one dashboard card:

**Job Activity**

- Success rate (percentage) and total job count.
- A breakdown table of job counts by result status (SUCCESS, RETRIED, SKIPPED, CANCELED, and any others present in the data).
- When the source `Protection Job Activities` sheet is capped at 10,000 rows by Live Optics, an amber note appears: **"Based on most recent N — a window, not the full set."** The numbers reflect only the rows available.

**Compliance**

- Three KPI cards: App-consistent backups (%), Immutable copies (%), Replicated copies (%).
- When the source `Copies` sheet is capped at 10,000 rows the same amber capped-window note appears.

### Capacity

- Total mtree count is shown as a summary line.
- A table lists all storage targets with columns: Name, Type, Storage utilization (%). Rows that exceed the risk threshold are highlighted in amber.

### Policies

- Total policy count shown prominently.
- A summary table: purpose and count of policies per purpose.
- A detail table: policy name, purpose, asset count, protection capacity. The list is capped at 25 rows with a **"Top N of M"** footnote when longer.

---

## 5. Switching flavor

The **flavor toggle** in the header bar lets you choose between two views of the same data:

| Flavor | Emphasis | Dashboard section order |
|---|---|---|
| **Assessment** | Pre-sales value story — leads with coverage and gaps. | Executive KPIs → Coverage → Gaps → Idle Agents → Job Activity & Compliance → Capacity → Policies |
| **Operations** | Health and posture — leads with job health and capacity risk. | Executive KPIs → Job Activity & Compliance → Capacity → Coverage → Gaps → Idle Agents → Policies |

The underlying numbers are identical in both flavors. Only the order of sections (and the lead KPIs in the exported deck) changes. Choose the flavor that matches your audience before exporting.

---

## 6. Language and theme

### Language

The **Language** dropdown in the header lists four options: English, Français, Deutsch, Italiano. Changing the language immediately updates all labels, section headings, and KPI captions in the dashboard. The exported PPTX and HTML files are rendered in whichever language is selected at the moment you click Export.

Your language choice is remembered in `localStorage` under the key `ppdm-report-lang`.

### Theme

The **Theme** button in the header cycles through three options:

- **Auto** — follows your operating system's `prefers-color-scheme` setting (light or dark).
- **Light** — forces the light palette.
- **Dark** — forces the dark palette.

The current label reads, for example, **"Theme: Auto"**. Click to cycle to the next option.

Your theme choice is persisted in `localStorage` under the key `ppdm-report-theme`. Exported files (PPTX and HTML) reflect the resolved theme at export time — if Auto resolves to dark at that moment, the export is dark.

---

## 7. Exporting

The export buttons appear in the header bar once a workbook has been loaded. Both buttons are disabled while an export is in progress.

### Export PPTX

Click **"Export PPTX"** to download a native PowerPoint slide deck.

- The deck is generated on the main thread; the export code (pptxgenjs) is dynamically imported when you click, so it stays out of the initial page load. A deck builds in well under a second.
- Slides are ordered according to the active flavor.
- In-use asset types appear in the coverage breakdown; asset types that are present but not protecting anything (idle agents) appear on a single consolidated slide. No slide is generated for an unused asset type.
- All lists in the deck are capped at the top 25 entries; a **"Top 25 of N"** caption is printed on each affected slide.
- Capped-window caveats (jobs, compliance) are printed in place on the relevant slides.
- The deck matches the language and theme currently shown on screen.
- Filename pattern: `ppdm-report_<customer>_<ISO date>.pptx`, where `<customer>` is taken from the `Details` sheet of the workbook and `<date>` is the export date (today).

### Export HTML

Click **"Export HTML"** to download a self-contained `.html` file.

- All CSS is inlined; there is no JavaScript in the output. The file opens offline in any browser.
- Charts are rendered as proportional CSS bars (plain HTML and inline CSS — no SVG, no JavaScript).
- The file matches the language and theme at the moment of export.
- Filename pattern: `ppdm-report_<customer>_<ISO date>.html`.

---

## 8. Reading the numbers honestly

### Base-10 units

All sizes (GB, TB, etc.) use **base-10** (SI) units: 1 TB = 1,000,000,000,000 bytes. This matches the convention used by Dell Live Optics and storage vendors. The units label **"base-10 units"** appears in the dashboard and is printed in the appendix slide of the PPTX.

### "Top 25 of N"

Wherever a table says **"Top 25 of N"**, the list has been capped at the 25 largest entries. The value of N reflects the true total. No data is silently dropped — the caption tells you exactly how many items were not shown.

### Capped job and compliance windows

The `Protection Job Activities` and `Copies` sheets in the Live Optics export are truncated by the collector at exactly **10,000 rows** (the most recent rows are kept). Metrics that must be derived from these sheets — job result distribution, success rate, app-consistency, immutability, and replication percentages — are computed over this window. When the sheet was capped the app displays:

> Based on most recent N — a window, not the full set.

Totals that do not depend on these sheets (overall asset counts, unprotected capacity, policy counts, storage utilization) are sourced from the aggregate sheets in the export and are not affected by the cap.

### Coverage formula

The headline coverage figure is `PROTECTED / (PROTECTED + UNPROTECTED)`. Assets marked EXCLUDED by PPDM are not counted in either the numerator or the denominator of this figure. The secondary figure `(including excluded assets)` uses `PROTECTED / (PROTECTED + UNPROTECTED + EXCLUDED)` and is shown alongside the headline so you can see the impact of exclusions.

---

## 9. Privacy

Your workbook never leaves your browser. Specifically:

- A synchronous guard (`src/privacy/fetchGuard.ts`) **throws immediately** on any attempt to make a network request to a non-same-origin URL. There is no code path that can silently send data to a remote server.
- A Content Security Policy `<meta>` tag in `index.html` blocks third-party network connections at the browser level as a second layer of defense.
- No rows from the workbook are written to `localStorage`, `IndexedDB`, or any other persistent storage. The only keys written to `localStorage` are `ppdm-report-theme` and `ppdm-report-lang` (UI preferences only).
- Refreshing or closing the browser tab clears all loaded data immediately.
