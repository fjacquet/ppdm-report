import { useState } from 'react'
import { parseInWorker } from '../engines/parser/parseInWorker'
import { useReportStore } from '../store/reportStore'

export function useReportUpload() {
  const setWorkbook = useReportStore((s) => s.setWorkbook)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const wb = await parseInWorker(file)
      setWorkbook(wb)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return { upload, busy, error }
}
