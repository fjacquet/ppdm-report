import { useState } from 'react'
import { deriveLabel } from '../engines/parser/deriveLabel'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'

export function useReportUpload() {
  const addServers = useReportStore((s) => s.addServers)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const workbook = await parseInWorker(file)
      addServers([{ label: deriveLabel(workbook, file.name), workbook }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
