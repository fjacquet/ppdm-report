/**
 * Midnight Executive ECharts theme — light + dark variants.
 *
 * Pure data module: no React, no DOM. Maps palette tokens into ECharts theme
 * objects. All values are sRGB hex — zrender cannot parse oklch().
 */
import { DARK, LIGHT } from './palette'

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

export const MIDNIGHT_EXECUTIVE_LIGHT: MidnightExecutiveTheme = {
  color: LIGHT.series,
  backgroundColor: LIGHT.bg,
  textStyle: { fontFamily: FONT_FAMILY, color: LIGHT.muted },
  categoryAxis: {
    axisLine: { lineStyle: { color: LIGHT.muted } },
    splitLine: { lineStyle: { color: LIGHT.line } },
    axisLabel: { color: LIGHT.muted },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: LIGHT.muted } },
    splitLine: { lineStyle: { color: LIGHT.line } },
    axisLabel: { color: LIGHT.muted },
  },
  legend: { textStyle: { color: LIGHT.ink } },
  tooltip: {
    backgroundColor: LIGHT.surface,
    borderColor: LIGHT.line,
    textStyle: { color: LIGHT.ink },
  },
}

export const MIDNIGHT_EXECUTIVE_DARK: MidnightExecutiveTheme = {
  color: DARK.series,
  backgroundColor: DARK.bg,
  textStyle: { fontFamily: FONT_FAMILY, color: DARK.muted },
  categoryAxis: {
    axisLine: { lineStyle: { color: DARK.muted } },
    splitLine: { lineStyle: { color: DARK.line } },
    axisLabel: { color: DARK.muted },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: DARK.muted } },
    splitLine: { lineStyle: { color: DARK.line } },
    axisLabel: { color: DARK.muted },
  },
  legend: { textStyle: { color: DARK.ink } },
  tooltip: {
    backgroundColor: DARK.surface,
    borderColor: DARK.line,
    textStyle: { color: DARK.ink },
  },
}
