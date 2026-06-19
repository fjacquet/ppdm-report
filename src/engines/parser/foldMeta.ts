import type { CaptureMeta } from '../../types/ppdm'

/** Fold N capture metas into one estate meta (first identity, latest date, unanimous base). */
export function foldMeta(metas: CaptureMeta[]): CaptureMeta {
  const first = metas[0]
  if (!first) throw new Error('foldMeta requires at least one meta')
  const dates = metas
    .map((m) => m.capturedAt)
    .filter(Boolean)
    .sort()
  return {
    projectId: first.projectId,
    customer: first.customer,
    collectorBuild: first.collectorBuild,
    capturedAt: dates.at(-1) ?? '',
    baseTen: metas.every((m) => m.baseTen)
      ? true
      : metas.every((m) => !m.baseTen)
        ? false
        : first.baseTen,
  }
}
