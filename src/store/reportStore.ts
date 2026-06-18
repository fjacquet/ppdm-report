import { create } from 'zustand'
import type { ParsedWorkbook } from '../types/ppdm'

export type Flavor = 'assessment' | 'ops'

interface ReportState {
  workbook: ParsedWorkbook | null
  flavor: Flavor
  setWorkbook: (wb: ParsedWorkbook) => void
  setFlavor: (flavor: Flavor) => void
  clear: () => void
}

export const useReportStore = create<ReportState>((set) => ({
  workbook: null,
  flavor: 'assessment',
  setWorkbook: (wb) => set({ workbook: wb }),
  setFlavor: (flavor) => set({ flavor }),
  clear: () => set({ workbook: null }),
}))
