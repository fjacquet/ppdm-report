import { create } from 'zustand'
import type { ParsedWorkbook } from '../types/ppdm'

interface ReportState {
  workbook: ParsedWorkbook | null
  setWorkbook: (wb: ParsedWorkbook) => void
  clear: () => void
}

export const useReportStore = create<ReportState>((set) => ({
  workbook: null,
  setWorkbook: (wb) => set({ workbook: wb }),
  clear: () => set({ workbook: null }),
}))
