import { useMemo } from 'react'
import { buildEstateDocument } from '../engines/products/estateDocument'
import { useReportStore } from '../store/reportStore'
import type { EstateDocument } from '../types/reportView'

/** The single derivation point: stored servers → EstateDocument (null when none loaded). */
export function useReportView(): EstateDocument | null {
  const servers = useReportStore((s) => s.servers)
  return useMemo(() => (servers.length === 0 ? null : buildEstateDocument(servers)), [servers])
}
