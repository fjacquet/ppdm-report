import type { Palette } from '../../theme/palette'
import type { ExportTone } from './types'

/** Canonical tone → palette hex (with '#'). */
export function toneHex(tone: ExportTone, p: Palette): string {
  switch (tone) {
    case 'ok':
      return p.ok
    case 'warn':
      return p.warn
    case 'bad':
      return p.bad
    case 'muted':
      return p.muted
    default:
      return p.accent
  }
}
