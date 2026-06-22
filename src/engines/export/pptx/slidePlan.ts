// src/engines/export/pptx/slidePlan.ts
import type { ExportSection } from '../types'

export type SlidePlanItem =
  | { kind: 'single'; section: ExportSection }
  | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }
  | { kind: 'table'; section: ExportSection }

/**
 * Pair sections into band-slides. `idle` is pulled out as a full-width single
 * placed right after the pair holding the section that precedes it (or first
 * if idle leads). Every other section pairs consecutively in order.
 */
export function planSlides(sections: ExportSection[]): SlidePlanItem[] {
  const idleIdx = sections.findIndex((s) => s.id === 'idle')
  const idle = idleIdx >= 0 ? sections[idleIdx] : undefined
  const predecessor = idleIdx > 0 ? sections[idleIdx - 1] : undefined
  const predecessorId = predecessor?.id ?? null

  const rest = sections.filter((s) => s.id !== 'idle')
  const pairs: SlidePlanItem[] = []
  for (let i = 0; i < rest.length; i += 2) {
    const top = rest[i]
    if (top === undefined) continue
    pairs.push({ kind: 'pair', top, bottom: rest[i + 1] })
  }

  const appendix: SlidePlanItem[] = sections
    .filter((s) => s.id !== 'idle' && (s.table?.rows.length ?? 0) > 0)
    .map((s) => ({ kind: 'table', section: s }))

  if (!idle) return [...pairs, ...appendix]

  const idleSingle: SlidePlanItem = { kind: 'single', section: idle }
  if (predecessorId === null) return [idleSingle, ...pairs, ...appendix]

  const afterIdx = pairs.findIndex(
    (p) => p.kind === 'pair' && (p.top.id === predecessorId || p.bottom?.id === predecessorId),
  )
  const out = [...pairs]
  out.splice(afterIdx + 1, 0, idleSingle)
  return [...out, ...appendix]
}
