// src/components/Details.tsx
import type { ReactNode } from 'react'

/** Collapsible drill-down built on the native <details> element (accessible, no JS state). */
export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer select-none text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}
