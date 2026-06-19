import type { CaptureMeta, ParsedWorkbook, ServerWorkbook, SheetData } from '../../types/ppdm'
import { classifyAgents } from './detectInUse'

/** Fold N parsed PPDM workbooks into one estate workbook. Pure.
 * Single source returns that workbook unchanged (identity). */
export function mergeWorkbooks(servers: ServerWorkbook[]): ParsedWorkbook {
  const [first, ...rest] = servers
  if (!first) return { meta: { projectId: '', customer: '', collectorBuild: '', capturedAt: '', baseTen: true }, sheets: {}, inUse: [], idleAgents: [], warnings: [] }
  if (rest.length === 0) return first.workbook

  const workbooks = servers.map((s) => s.workbook)

  const sheetNames: string[] = []
  for (const w of workbooks) {
    for (const name of Object.keys(w.sheets)) {
      if (!sheetNames.includes(name)) sheetNames.push(name)
    }
  }

  const sheets: Record<string, SheetData> = {}
  for (const name of sheetNames) {
    const present = workbooks
      .map((w) => w.sheets[name])
      .filter((s): s is SheetData => s !== undefined)
    const headers: string[] = []
    for (const s of present) {
      for (const h of s.headers) if (!headers.includes(h)) headers.push(h)
    }
    sheets[name] = {
      name,
      headers,
      rows: present.flatMap((s) => s.rows),
      capped: present.some((s) => s.capped),
    }
  }

  const { inUse, idleAgents } = classifyAgents(Object.values(sheets))

  const metas = workbooks.map((w) => w.meta)
  const dates = metas
    .map((m) => m.capturedAt)
    .filter(Boolean)
    .sort()
  const firstMeta = first.workbook.meta
  const meta: CaptureMeta = {
    projectId: firstMeta.projectId,
    customer: firstMeta.customer,
    collectorBuild: firstMeta.collectorBuild,
    capturedAt: dates.at(-1) ?? '',
    baseTen: metas.every((m) => m.baseTen)
      ? true
      : metas.every((m) => !m.baseTen)
        ? false
        : firstMeta.baseTen,
  }

  return { meta, sheets, inUse, idleAgents, warnings: [] }
}
