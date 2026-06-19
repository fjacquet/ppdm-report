import { useMemo } from 'react'
import { mergeViews } from '../engines/aggregation/mergeViews'
import { appVersion } from '../engines/parser/deriveLabel'
import { estateWarnings } from '../engines/parser/estateWarnings'
import { buildPpdmView } from '../engines/products/ppdm/buildPpdmView'
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
      view: buildPpdmView(s.workbook),
    }))
    return {
      combined: { ...mergeViews(perServer.map((p) => p.view)), warnings: estateWarnings(servers) },
      perServer,
      multiSource: servers.length > 1,
    }
  }, [servers])
}
