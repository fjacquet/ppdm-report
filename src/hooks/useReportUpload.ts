import { useRef, useState } from 'react'
import { deriveLabel } from '../engines/parser/deriveLabel'
import { parseInWorker } from '../engines/parser/parseInWorker'
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
    try {
      for (const file of files) {
        try {
          const workbook = await parseInWorker(file)
          ready.push({ label: deriveLabel(workbook, file.name), workbook })
        } catch {
          failed.push(file.name)
        }
      }
      if (ready.length > 0) addServers(ready)
      if (failed.length > 0) setError(`Could not parse: ${failed.join(', ')}`)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
