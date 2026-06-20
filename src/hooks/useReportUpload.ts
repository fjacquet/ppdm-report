import { useRef, useState } from 'react'
import { deriveLabel } from '../engines/parser/deriveLabel'
import { detectProduct } from '../engines/parser/detectProduct'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { isSupportedProduct } from '../engines/products'
import { useReportStore } from '../store/reportStore'
import type { ServerWorkbook } from '../types/ppdm'

export function useReportUpload() {
  const addServers = useReportStore((s) => s.addServers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  async function upload(files: File[]): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    const ready: ServerWorkbook[] = []
    const failed: string[] = []
    const unsupported: string[] = []
    try {
      for (const file of files) {
        try {
          const workbook = await parseInWorker(file)
          const product = detectProduct(workbook)
          if (!isSupportedProduct(product)) {
            unsupported.push(file.name)
            continue
          }
          ready.push({ label: deriveLabel(workbook, file.name), product, workbook })
        } catch {
          failed.push(file.name)
        }
      }
      if (ready.length > 0) addServers(ready)
      const problems: string[] = []
      if (failed.length > 0) problems.push(`Could not parse: ${failed.join(', ')}`)
      if (unsupported.length > 0) {
        problems.push(
          `Unrecognized or unsupported export (expected PPDM): ${unsupported.join(', ')}`,
        )
      }
      if (problems.length > 0) setError(problems.join(' · '))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
