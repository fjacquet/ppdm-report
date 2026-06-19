import { create } from 'zustand'
import { withUniqueLabel } from '../engines/parser/deriveLabel'
import type { ServerWorkbook } from '../types/ppdm'

export type Flavor = 'assessment' | 'ops'

interface ReportState {
  servers: ServerWorkbook[]
  flavor: Flavor
  addServers: (incoming: ServerWorkbook[]) => void
  removeServer: (label: string) => void
  setFlavor: (flavor: Flavor) => void
  clear: () => void
}

export const useReportStore = create<ReportState>((set) => ({
  servers: [],
  flavor: 'assessment',
  addServers: (incoming) =>
    set((state) => {
      const labels = state.servers.map((s) => s.label)
      const added: ServerWorkbook[] = []
      for (const s of incoming) {
        const label = withUniqueLabel([...labels, ...added.map((a) => a.label)], s.label)
        added.push({ label, product: s.product, workbook: s.workbook })
      }
      return { servers: [...state.servers, ...added] }
    }),
  removeServer: (label) =>
    set((state) => ({ servers: state.servers.filter((s) => s.label !== label) })),
  setFlavor: (flavor) => set({ flavor }),
  clear: () => set({ servers: [] }),
}))
