/** A single spreadsheet cell value after SheetJS parsing. */
export type Cell = string | number | boolean | null

/** The backup product a workbook came from. */
export type ProductId = 'ppdm' | 'avamar' | 'networker' | 'unknown'

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

/** Product-neutral parsed workbook: raw sheets + capture metadata + data caveats. */
export interface RawWorkbook {
  meta: CaptureMeta
  sheets: Record<string, SheetData>
  /** Human-readable data caveats (e.g. capped sheets). Never empty silently. */
  warnings: string[]
}

/** A parsed workbook tagged with its product and a human-readable source label. */
export interface ServerWorkbook {
  label: string
  product: ProductId
  workbook: RawWorkbook
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

/** Storage-target utilization (%) at or above which a target is flagged at-risk. */
export const FLAG_THRESHOLD_PCT = 80

/** Default size of the largest-N list surfaced for capped windows (e.g. gaps). */
export const TOP_N_DEFAULT = 25
