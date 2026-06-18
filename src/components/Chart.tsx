import { BarChart, PieChart } from 'echarts/charts'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts/types/dist/shared'
import { type CSSProperties, memo, useEffect, useRef } from 'react'
import { MIDNIGHT_EXECUTIVE_DARK, MIDNIGHT_EXECUTIVE_LIGHT } from '../theme/echartsTheme'

echarts.use([
  BarChart,
  PieChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
])

echarts.registerTheme('midnight-light', MIDNIGHT_EXECUTIVE_LIGHT)
echarts.registerTheme('midnight-dark', MIDNIGHT_EXECUTIVE_DARK)

export interface ChartProps {
  option: EChartsOption
  dark: boolean
  style?: CSSProperties
  ariaLabel?: string
}

function ChartImpl({ option, dark, style, ariaLabel }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option

  // init / theme switch only — option is applied via optionRef to avoid reinit on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const instance = echarts.init(container, dark ? 'midnight-dark' : 'midnight-light', {
      renderer: 'svg',
    })
    instanceRef.current = instance
    instance.setOption(optionRef.current)

    const handleResize = () => instance.resize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      instance.dispose()
      instanceRef.current = null
    }
  }, [dark])

  // lightweight option updates — no reinit
  useEffect(() => {
    instanceRef.current?.setOption(option)
  }, [option])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={style ?? { minHeight: 320, width: '100%' }}
    />
  )
}

export const Chart = memo(ChartImpl)
