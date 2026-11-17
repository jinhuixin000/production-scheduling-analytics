import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, CustomChart, HeatmapChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([BarChart, LineChart, HeatmapChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent, CanvasRenderer])

export const INK = { text: '#e8edf7', text2: '#a3b0c8', text3: '#6c7a94', grid: 'rgba(148,170,210,0.10)', axis: 'rgba(148,170,210,0.25)' }
export const SERIES = { weekday: '#3987e5', weekend: '#d95926', accent: '#5cc8ff', neutral: '#5b6b88' }
/** Single-hue sequential ramp for the dark surface: low values recede, high values glow. */
export const SEQ = ['#10203c', '#17386a', '#2260ad', '#3987e5', '#7cc4ff', '#d6f0ff']

export const axisCommon = {
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  axisLabel: { color: INK.text3, fontSize: 11 },
  splitLine: { lineStyle: { color: INK.grid } },
  nameTextStyle: { color: INK.text3, fontSize: 11 },
}
export const tooltipCommon = {
  backgroundColor: 'rgba(13,20,36,0.96)',
  borderColor: 'rgba(148,170,210,0.28)',
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: INK.text, fontSize: 12 },
  extraCssText: 'box-shadow:0 12px 32px -12px rgba(0,0,0,.8);border-radius:10px;',
}

export default function Chart({ option, height = 280, onClick, ariaLabel }: {
  option: EChartsCoreOption; height?: number; onClick?: (params: { dataIndex: number; name: string; value: unknown }) => void; ariaLabel: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const click = useRef(onClick)
  click.current = onClick

  useEffect(() => {
    const c = echarts.init(el.current!, undefined, { renderer: 'canvas' })
    chart.current = c
    c.on('click', (p) => click.current?.(p as never))
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current!)
    return () => { ro.disconnect(); c.dispose(); chart.current = null }
  }, [])

  useEffect(() => {
    chart.current?.setOption({ animationDuration: 500, textStyle: { fontFamily: 'inherit' }, ...option }, true)
  }, [option])

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: '100%' }} />
}
