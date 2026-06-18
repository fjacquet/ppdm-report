import type { ChangeEvent } from 'react'
import { useReportUpload } from '../hooks/useReportUpload'

export function UploadZone() {
  const { upload, busy, error } = useReportUpload()

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
  }

  return (
    <div
      style={{
        border: '2px dashed #94a3b8',
        borderRadius: 12,
        padding: 24,
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      <label>
        <strong>Drop / choose a Live Optics PPDM .xlsx</strong>
        <br />
        <input type="file" accept=".xlsx" onChange={onChange} disabled={busy} />
      </label>
      {busy && <p>Parsing…</p>}
      {error && <p style={{ color: '#dc2626' }}>Error: {error}</p>}
    </div>
  )
}
