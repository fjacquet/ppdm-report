import { type ChangeEvent, type DragEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportUpload } from '../hooks/useReportUpload'

/** Drag-and-drop (or click-to-choose) zone for a Live Optics PPDM .xlsx export. */
export function UploadZone() {
  const { t } = useTranslation('common')
  const { upload, busy, error } = useReportUpload()
  const [dragActive, setDragActive] = useState(false)

  function handleFile(file: File | undefined) {
    if (file?.name.toLowerCase().endsWith('.xlsx')) void upload(file)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0])
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer-only enhancement; the labelled <input type="file"> is the keyboard/click-accessible control
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      data-drag-active={dragActive || undefined}
      className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30'
          : 'border-slate-300 dark:border-slate-700'
      }`}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      <p className="mb-3 font-semibold text-slate-700 dark:text-slate-200">{t('upload.drop')}</p>
      <label className="inline-block cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400">
        {t('upload.choose')}
        <input type="file" accept=".xlsx" onChange={onChange} disabled={busy} className="hidden" />
      </label>
      {busy && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t('upload.parsing')}</p>
      )}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
