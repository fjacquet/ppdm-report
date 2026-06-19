/** Render-ready, serializable export model. Built on the main thread (with i18n +
 * formatting resolved) and handed to the export worker, which only lays it out —
 * no metric logic, no i18n, no ReportView in the worker. */

export type ExportTone = 'accent' | 'ok' | 'warn' | 'bad' | 'muted'
export type ExportTheme = 'light' | 'dark'
export type ExportKind = 'pptx' | 'html'

export interface ExportKpi {
  label: string
  value: string
  detail?: string
  tone: ExportTone
}

export interface ExportTable {
  columns: string[]
  rows: string[][]
  /** e.g. "Top 25 of 281" — already localized. */
  caption?: string
}

export interface ExportChartSlice {
  name: string
  value: number
  /** sRGB hex chosen for the active theme. */
  color: string
}

export interface ExportChart {
  kind: 'pie' | 'bar'
  slices: ExportChartSlice[]
}

/** One horizontal bar (shape-drawn): localized label + value, 0..1 fill ratio, tone hex. */
export interface DeckBar {
  label: string
  /** 0..1 fill fraction of the track. */
  ratio: number
  /** Already-localized end value, e.g. "78.9 %", "11.0 TB", "9,297". */
  value: string
  /** sRGB hex (with '#') for the active theme. */
  color: string
}

/** A small doughnut for a band's label zone (coverage). */
export interface DeckDonut {
  slices: { value: number; color: string }[]
  /** Localized center label, e.g. "71%" (en) / "71 %" (fr). */
  center: string
}

/** A single 100%-stacked bar (exec protection posture). */
export interface DeckStack {
  segments: { ratio: number; color: string; label: string; value: string }[]
}

/** PPTX-only layout for a section. The HTML export ignores this field. */
export interface DeckSection {
  subtitle?: string
  kpiChips?: ExportKpi[]
  donut?: DeckDonut
  bars?: DeckBar[]
  tiles?: string[]
  /** PPTX-only band-bottom caveat (window cap, incl-excluded, Excel fallback). Replaces rendering the shared `notes` in the deck. */
  caveat?: string
}

export interface ExportSection {
  id: string
  title: string
  kpis?: ExportKpi[]
  chart?: ExportChart
  table?: ExportTable
  /** Caveats / subtitles (e.g. capped-window note). */
  notes?: string[]
  /** PPTX-only band layout (additive; HTML export ignores it). */
  deck?: DeckSection
}

export interface ExportModel {
  title: string
  customer: string
  subtitle: string
  /** Localized "Executive summary" heading. */
  execTitle: string
  /** Active UI language (BCP-47), used e.g. for the HTML `lang` attribute. */
  locale: string
  kpis: ExportKpi[]
  sections: ExportSection[]
  /** Footer note: base-10 units, collector build, capture date. */
  footer: string
  /** Data caveats (capped windows, merge notes); rendered in both exports. */
  warnings?: string[]
  /** PPTX-only exec protection-posture stacked bar. */
  posture?: DeckStack
}

export interface ExportRequest {
  kind: ExportKind
  theme: ExportTheme
  model: ExportModel
  filename: string
}

export type ExportResponse =
  | { ok: true; kind: ExportKind; data: ArrayBuffer | string; filename: string }
  | { ok: false; error: string }
