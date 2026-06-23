// src/engines/export/pptx/slidePlan.ts
import type { ExportSection } from '../types'

export type SlidePlanItem =
  | { kind: 'single'; section: ExportSection }
  | { kind: 'pair'; top: ExportSection; bottom?: ExportSection }
  | { kind: 'table'; section: ExportSection }

/** Section ids that render full-width in place (not band-paired, not in the appendix). */
const FULLWIDTH: Record<string, 'single' | 'table'> = { idle: 'single', volumetry: 'table' }

/**
 * Pair sections into band-slides. Full-width sections (`idle` → tiles single,
 * `volumetry` → table) are spliced in right after the pair holding the nearest
 * preceding non-full-width section (or at the front if none). Remaining sections
 * pair consecutively in order; any paired section with a table also gets a
 * trailing appendix table slide.
 *
 * Full-width sections are spliced in reverse section order, so that when two of
 * them share the same predecessor pair (e.g. `volumetry` then `idle`, both after
 * the band ending in `exposure`) they land in the original `SECTION_ORDER`
 * sequence rather than reversed. Single-full-width inputs (the common `idle`-only
 * case) are unaffected.
 */
export function planSlides(sections: ExportSection[]): SlidePlanItem[] {
  const fullwidth = sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.id in FULLWIDTH)
    .map(({ s, i }) => {
      let predecessorId: string | null = null
      for (let j = i - 1; j >= 0; j--) {
        const candidate = sections[j]
        if (candidate !== undefined && !(candidate.id in FULLWIDTH)) {
          predecessorId = candidate.id
          break
        }
      }
      return { section: s, predecessorId, kind: FULLWIDTH[s.id] }
    })

  const rest = sections.filter((s) => !(s.id in FULLWIDTH))
  const pairs: SlidePlanItem[] = []
  for (let i = 0; i < rest.length; i += 2) {
    const top = rest[i]
    if (top === undefined) continue
    pairs.push({ kind: 'pair', top, bottom: rest[i + 1] })
  }

  const out: SlidePlanItem[] = [...pairs]
  // Reverse: same-predecessor full-widths splice at the same index, so processing
  // last-to-first leaves them in section order (idle-only inputs are unchanged).
  for (const fw of [...fullwidth].reverse()) {
    const item: SlidePlanItem =
      fw.kind === 'single'
        ? { kind: 'single', section: fw.section }
        : { kind: 'table', section: fw.section }
    if (fw.predecessorId === null) {
      out.unshift(item)
      continue
    }
    const at = out.findIndex(
      (p) =>
        p.kind === 'pair' && (p.top.id === fw.predecessorId || p.bottom?.id === fw.predecessorId),
    )
    out.splice(at >= 0 ? at + 1 : out.length, 0, item)
  }

  const appendix: SlidePlanItem[] = sections
    .filter((s) => !(s.id in FULLWIDTH) && (s.table?.rows.length ?? 0) > 0)
    .map((s) => ({ kind: 'table', section: s }))

  return [...out, ...appendix]
}
