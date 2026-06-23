import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildExportModel } from '../engines/export/buildExportModel'
import { assembleHtml } from '../engines/export/html/assembleHtml'
import type { ExportKind } from '../engines/export/types'
import { useReportStore } from '../store/reportStore'
import type { ProductId } from '../types/ppdm'
import type { EstateDocument } from '../types/reportView'
import { useTheme } from './useTheme'

const SLUG: Record<ProductId, string> = {
  ppdm: 'ppdm',
  avamar: 'avamar',
  networker: 'networker',
  unknown: 'report',
}

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
 * Drives report export on the main thread: resolves the live EstateDocument, flavor,
 * resolved theme and active locale into a render-ready model, generates the PPTX or
 * HTML, and triggers a download. (pptxgenjs is not Web-Worker-safe, and a ~10-slide
 * deck generates in well under a second, so a worker would add risk for no benefit.)
 *
 * Takes the already-derived EstateDocument as an argument so it is computed once at the
 * app root (App's memo) rather than re-derived per consumer.
 *
 * Phase-1 invariant: upload rejects non-PPDM files, so a document always holds exactly
 * one product. We operate on products[0] throughout. Multi-product export composition
 * is deferred to a later phase — no silent truncation occurs here.
 */
export function useExport(doc: EstateDocument | null) {
  const flavor = useReportStore((s) => s.flavor)
  const { resolved } = useTheme()
  const { i18n } = useTranslation()
  const [busy, setBusy] = useState<ExportKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: ExportKind): Promise<void> {
    const product: ProductId = doc?.products[0]?.product ?? 'unknown'
    const estate = doc?.products[0]?.estate
    if (!estate) return
    setBusy(kind)
    setError(null)
    try {
      const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string
      const model = buildExportModel(
        estate.combined,
        flavor,
        resolved,
        t,
        i18n.language,
        estate.perServer,
        product,
      )
      const stamp = new Date().toISOString().slice(0, 10)
      const base = `${SLUG[product]}-report_${sanitize(estate.combined.meta.customer)}_${stamp}`
      if (kind === 'pptx') {
        // Dynamically imported so pptxgenjs + jszip stay out of the main bundle.
        const { buildPptx } = await import('../engines/export/pptx/builder')
        download(await buildPptx(model, resolved), `${base}.pptx`, PPTX_MIME)
      } else {
        download(assembleHtml(model, resolved), `${base}.html`, 'text/html;charset=utf-8')
      }
    } catch (err) {
      // Surface failures (e.g. a stale dynamically-imported chunk 404 after a
      // redeploy) instead of failing silently — the button must never look dead.
      console.error('Export failed:', err)
      setError(i18n.t('common:export.error') as string)
    } finally {
      setBusy(null)
    }
  }

  return { run, busy, error }
}
