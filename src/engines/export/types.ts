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

export interface ExportSection {
  id: string
  title: string
  kpis?: ExportKpi[]
  chart?: ExportChart
  table?: ExportTable
  /** Caveats / subtitles (e.g. capped-window note). */
  notes?: string[]
}

export interface ExportModel {
  title: string
  customer: string
  subtitle: string
  kpis: ExportKpi[]
  sections: ExportSection[]
  /** Footer note: base-10 units, collector build, capture date. */
  footer: string
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
