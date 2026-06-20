import { describe, expect, it } from 'vitest'
import type { SheetData } from '../../types/ppdm'
import { detectProduct } from './detectProduct'

const wbOf = (names: string[]): { sheets: Record<string, SheetData> } => ({
  sheets: Object.fromEntries(
    names.map((n) => [n, { name: n, headers: [], rows: [], capped: false }]),
  ),
})

describe('detectProduct', () => {
  it('detects Avamar from the unique "Avamar DPN Summary" sheet', () => {
    expect(detectProduct(wbOf(['Details', 'Avamar DPN Summary', 'Group Summary']))).toBe('avamar')
  })

  it('detects Avamar from the completion-summary + plugins pair', () => {
    expect(detectProduct(wbOf(['Backup Completion Summary', 'Backup Plugins']))).toBe('avamar')
  })

  it('detects NetWorker from "Storage Nodes" + "Dedup Jobs"', () => {
    expect(detectProduct(wbOf(['Clients', 'Storage Nodes', 'Dedup Jobs']))).toBe('networker')
  })

  it('detects PPDM summary from "System Configuration"', () => {
    expect(detectProduct(wbOf(['System Configuration', 'VMs Count And Cap']))).toBe('ppdm')
  })

  it('detects PPDM detail from "Storage Targets" + "Data Domain Mtrees"', () => {
    expect(detectProduct(wbOf(['Virtual Machines', 'Storage Targets', 'Data Domain Mtrees']))).toBe(
      'ppdm',
    )
  })

  it('returns "unknown" for a foreign workbook', () => {
    expect(detectProduct(wbOf(['Sheet1', 'RandomData']))).toBe('unknown')
  })
})
