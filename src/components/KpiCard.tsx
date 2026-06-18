interface KpiCardProps {
  value: string
  label: string
  detail?: string
  tone: 'accent' | 'ok' | 'warn' | 'bad' | 'muted'
}

const toneClasses: Record<KpiCardProps['tone'], { border: string; value: string }> = {
  accent: {
    border: 'border-blue-500 dark:border-blue-400',
    value: 'text-blue-600 dark:text-blue-400',
  },
  ok: {
    border: 'border-green-500 dark:border-green-400',
    value: 'text-green-600 dark:text-green-400',
  },
  warn: {
    border: 'border-amber-500 dark:border-amber-400',
    value: 'text-amber-600 dark:text-amber-400',
  },
  bad: {
    border: 'border-red-500 dark:border-red-400',
    value: 'text-red-600 dark:text-red-400',
  },
  muted: {
    border: 'border-slate-400 dark:border-slate-500',
    value: 'text-slate-500 dark:text-slate-400',
  },
}

export function KpiCard({ value, label, detail, tone }: KpiCardProps) {
  const classes = toneClasses[tone]
  return (
    <div
      className={`border-l-4 ${classes.border} bg-white dark:bg-slate-900 rounded-r px-4 py-3 shadow-sm`}
    >
      <p className={`text-3xl font-bold leading-none ${classes.value}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {detail !== undefined && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{detail}</p>
      )}
    </div>
  )
}
