import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildExportModel } from '../engines/export/buildExportModel'
import { assembleHtml } from '../engines/export/html/assembleHtml'
import { buildPptx } from '../engines/export/pptx/builder'
import type { ExportKind } from '../engines/export/types'
import { useReportStore } from '../store/reportStore'
import { useReportView } from './useReportView'
import { useTheme } from './useTheme'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

function sanitize(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'report'
}

function download(data: ArrayBuffer | string, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Drives report export on the main thread: resolves the live ReportView, flavor,
 * resolved theme and active locale into a render-ready model, generates the PPTX or
 * HTML, and triggers a download. (pptxgenjs is not Web-Worker-safe, and a ~10-slide
 * deck generates in well under a second, so a worker would add risk for no benefit.)
 */
export function useExport() {
  const view = useReportView()
  const flavor = useReportStore((s) => s.flavor)
  const { resolved } = useTheme()
  const { i18n } = useTranslation()
  const [busy, setBusy] = useState<ExportKind | null>(null)

  async function run(kind: ExportKind): Promise<void> {
    if (!view) return
    setBusy(kind)
    try {
      const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string
      const model = buildExportModel(view, flavor, resolved, t, i18n.language)
      const stamp = new Date().toISOString().slice(0, 10)
      const base = `ppdm-report_${sanitize(view.meta.customer)}_${stamp}`
      if (kind === 'pptx') {
        download(await buildPptx(model, resolved), `${base}.pptx`, PPTX_MIME)
      } else {
        download(assembleHtml(model, resolved), `${base}.html`, 'text/html;charset=utf-8')
      }
    } finally {
      setBusy(null)
    }
  }

  return { run, busy }
}
