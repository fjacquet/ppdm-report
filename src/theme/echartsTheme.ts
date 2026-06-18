/**
 * Midnight Executive ECharts theme — light + dark variants.
 *
 * Pure data module: no React, no DOM. Maps palette tokens into ECharts theme
 * objects. All values are sRGB hex — zrender cannot parse oklch().
 */
import { DARK, LIGHT, type Palette } from './palette'

const FONT_FAMILY = 'Arial, Helvetica, sans-serif'

export interface MidnightExecutiveTheme {
  readonly color: readonly string[]
  readonly backgroundColor: string
  readonly textStyle: { readonly fontFamily: string; readonly color: string }
  readonly categoryAxis: {
    readonly axisLine: { readonly lineStyle: { readonly color: string } }
    readonly splitLine: { readonly lineStyle: { readonly color: string } }
    readonly axisLabel: { readonly color: string }
  }
  readonly valueAxis: {
    readonly axisLine: { readonly lineStyle: { readonly color: string } }
    readonly splitLine: { readonly lineStyle: { readonly color: string } }
    readonly axisLabel: { readonly color: string }
  }
  readonly legend: { readonly textStyle: { readonly color: string } }
  readonly tooltip: {
    readonly backgroundColor: string
    readonly borderColor: string
    readonly textStyle: { readonly color: string }
  }
}

function makeTheme(p: Palette): MidnightExecutiveTheme {
  return {
    color: p.series,
    backgroundColor: p.bg,
    textStyle: { fontFamily: FONT_FAMILY, color: p.muted },
    categoryAxis: {
      axisLine: { lineStyle: { color: p.muted } },
      splitLine: { lineStyle: { color: p.line } },
      axisLabel: { color: p.muted },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: p.muted } },
      splitLine: { lineStyle: { color: p.line } },
      axisLabel: { color: p.muted },
    },
    legend: { textStyle: { color: p.ink } },
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.line,
      textStyle: { color: p.ink },
    },
  }
}

export const MIDNIGHT_EXECUTIVE_LIGHT: MidnightExecutiveTheme = makeTheme(LIGHT)
export const MIDNIGHT_EXECUTIVE_DARK: MidnightExecutiveTheme = makeTheme(DARK)
