import { TOP_N_DEFAULT } from '../../types/ppdm'
import type { OpsInsights, TopList } from '../../types/reportView'
import { topN } from './topN'

function emptyTop<T>(): TopList<T> {
  return { items: [], total: 0, shown: 0 }
}

/** A fully-empty ops-insights value (the default for products that don't populate it). */
export function emptyOpsInsights(): OpsInsights {
  return {
    agentVersions: [],
    atRisk: { overtime: emptyTop(), staleBackups: emptyTop() },
    longestBackups: emptyTop(),
  }
}

/** Concat items across servers, re-cap to N by score, keep the true summed total. */
function mergeTop<T>(lists: TopList<T>[], n: number, score: (t: T) => number): TopList<T> {
  const items = lists.flatMap((l) => l.items)
  const total = lists.reduce((a, l) => a + l.total, 0)
  const capped = topN(items, n, score)
  return { items: capped.items, total, shown: capped.items.length }
}

/** Fold per-server OpsInsights into one. Identity on a single view. Pure. */
export function mergeOpsInsights(list: OpsInsights[]): OpsInsights {
  const first = list[0]
  if (list.length <= 1 && first) return first

  const versions = new Map<string, number>()
  for (const oi of list) {
    for (const r of oi.agentVersions) {
      versions.set(r.version, (versions.get(r.version) ?? 0) + r.count)
    }
  }
  const agentVersions = [...versions.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)

  return {
    agentVersions,
    atRisk: {
      overtime: mergeTop(
        list.map((o) => o.atRisk.overtime),
        TOP_N_DEFAULT,
        () => 0,
      ),
      staleBackups: mergeTop(
        list.map((o) => o.atRisk.staleBackups),
        TOP_N_DEFAULT,
        () => 0,
      ),
    },
    longestBackups: mergeTop(
      list.map((o) => o.longestBackups),
      TOP_N_DEFAULT,
      (r) => r.durationHr,
    ),
  }
}
