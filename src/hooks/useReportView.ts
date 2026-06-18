import { useMemo } from 'react'
import { buildReportView } from '../engines/aggregation/reportView'
import { useReportStore } from '../store/reportStore'
import type { ReportView } from '../types/reportView'

/** The single derivation point: stored workbook → ReportView (null when none loaded). */
export function useReportView(): ReportView | null {
  const workbook = useReportStore((s) => s.workbook)
  return useMemo(() => (workbook ? buildReportView(workbook) : null), [workbook])
}
