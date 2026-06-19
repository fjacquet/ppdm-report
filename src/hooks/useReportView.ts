import { useMemo } from 'react'
import { buildReportView } from '../engines/aggregation/reportView'
import { appVersion } from '../engines/parser/deriveLabel'
import { mergeWorkbooks } from '../engines/parser/mergeWorkbooks'
import { useReportStore } from '../store/reportStore'
import type { EstateView } from '../types/reportView'

/** The single derivation point: stored servers → EstateView (null when none loaded). */
export function useReportView(): EstateView | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => {
    if (servers.length === 0) return null
    return {
      combined: buildReportView(mergeWorkbooks(servers)),
      perServer: servers.map((s) => ({
        label: s.label,
        version: appVersion(s.workbook),
        view: buildReportView(s.workbook),
      })),
      multiSource: servers.length > 1,
    }
  }, [servers])
}
