export interface Palette {
  bg: string
  surface: string
  ink: string
  muted: string
  line: string
  accent: string
  ok: string
  warn: string
  bad: string
  excluded: string
  series: string[]
}

export const LIGHT: Palette = {
  bg: '#ffffff',
  surface: '#f8fafc',
  ink: '#0f172a',
  muted: '#64748b',
  line: '#e2e8f0',
  accent: '#2563eb',
  ok: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
  excluded: '#cbd5e1',
  series: ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'],
}

export const DARK: Palette = {
  bg: '#0b1220',
  surface: '#111a2c',
  ink: '#e5e9f0',
  muted: '#94a3b8',
  line: '#1e293b',
  accent: '#3b82f6',
  ok: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
  excluded: '#334155',
  series: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee'],
}
