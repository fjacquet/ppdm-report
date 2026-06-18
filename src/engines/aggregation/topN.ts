import type { TopList } from '../../types/reportView'

/** Top `n` items by descending `score`, with the true total and shown count. Pure (no input mutation). */
export function topN<T>(items: T[], n: number, score: (t: T) => number): TopList<T> {
  const sorted = [...items].sort((a, b) => score(b) - score(a))
  const top = sorted.slice(0, Math.max(0, n))
  return { items: top, total: items.length, shown: top.length }
}
