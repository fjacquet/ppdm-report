import { useMemo } from 'react'
import { mergeViews } from '../engines/aggregation/mergeViews'
import { buildReportView } from '../engines/aggregation/reportView'
import { appVersion } from '../engines/parser/deriveLabel'
import { estateWarnings } from '../engines/parser/estateWarnings'
import { useReportStore } from '../store/reportStore'
import type { EstateView } from '../types/reportView'

/** The single derivation point: stored servers → EstateView (null when none loaded). */
export function useReportView(): EstateView | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => {
    if (servers.length === 0) return null
    const perServer = servers.map((s) => ({
      label: s.label,
      version: appVersion(s.workbook),
      view: buildReportView(s.workbook),
    }))
    return {
      combined: { ...mergeViews(perServer.map((p) => p.view)), warnings: estateWarnings(servers) },
      perServer,
      multiSource: servers.length > 1,
    }
  }, [servers])
}
