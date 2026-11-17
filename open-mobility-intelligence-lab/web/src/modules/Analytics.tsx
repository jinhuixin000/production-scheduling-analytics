import { useMemo } from 'react'
import type { ModuleProps } from '../App'
import Chart, { axisCommon, INK, SEQ, SERIES, tooltipCommon } from '../components/Chart'
import { Card, PageHeader, ProvTag, Segmented, Stat } from '../components/ui'
import { daysIn, distanceHistogram, hourlyDemand, kpisFor, odFlows, peakHour, topZones } from '../lib/selectors'
import { compact, dec1, hourLabel, hourRange, int, pct, usd } from '../lib/format'
import type { DayType, Metric } from '../lib/types'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

export default function Analytics({ data, filter, setFilter }: ModuleProps) {
  const { summary } = data
  const k = useMemo(() => kpisFor(summary, filter), [summary, filter])
  const days = daysIn(summary, filter.dayType)
  const hourlySel = useMemo(() => hourlyDemand(summary, filter.dayType), [summary, filter.dayType])
  const peak = peakHour(hourlySel)
  const top3 = useMemo(() => hourlySel.map((v, h) => ({ v, h })).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.h).sort((a, b) => a - b), [hourlySel])

  const hourlyOption = useMemo(() => {
    const wd = hourlyDemand(summary, 1), we = hourlyDemand(summary, 2)
    const line = (name: string, values: number[], color: string, dim: boolean) => ({
      name, type: 'line', data: values.map((v) => Math.round(v)), smooth: 0.25, symbol: 'circle', symbolSize: 6, showSymbol: false,
      lineStyle: { width: 2, color, opacity: dim ? 0.35 : 1 }, itemStyle: { color, borderColor: '#0f1728', borderWidth: 2 },
      areaStyle: dim ? undefined : { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}33` }, { offset: 1, color: `${color}00` }] } },
      markLine: name === 'Weekday' && filter.hour !== -1 ? { silent: true, symbol: 'none', label: { formatter: hourLabel(filter.hour), color: INK.text2, fontSize: 11 }, lineStyle: { color: SERIES.accent, type: 'solid', width: 1 }, data: [{ xAxis: filter.hour }] } : undefined,
    })
    return {
      grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: INK.text2, fontSize: 11.5 } },
      tooltip: { ...tooltipCommon, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: INK.axis } }, valueFormatter: (v: number) => `${fmt(v)} trips / day` },
      xAxis: { ...axisCommon, type: 'category', boundaryGap: false, data: Array.from({ length: 24 }, (_, h) => hourLabel(h)), axisLabel: { ...axisCommon.axisLabel, interval: 2 }, splitLine: { show: false } },
      yAxis: { ...axisCommon, type: 'value', axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => compact(v) } },
      series: [line('Weekday', wd, SERIES.weekday, filter.dayType === 2), line('Weekend', we, SERIES.weekend, filter.dayType === 1)],
    }
  }, [summary, filter.dayType, filter.hour])

  const dailyOption = useMemo(() => ({
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: INK.text2, fontSize: 11.5 } },
    tooltip: { ...tooltipCommon, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,170,210,.06)' } },
      formatter: (ps: { dataIndex: number }[]) => { const d = summary.daily[ps[0].dataIndex]; return `<b>${DOW[d[1] - 1]}, ${d[0]}</b><br/>${fmt(d[2])} trips · ${compact(d[3])} mi` } },
    xAxis: { ...axisCommon, type: 'category', data: summary.daily.map((d) => d[0].slice(8)), axisLabel: { ...axisCommon.axisLabel, interval: 1 }, splitLine: { show: false } },
    yAxis: { ...axisCommon, type: 'value', axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => compact(v) } },
    series: [1, 2].map((dt) => ({
      name: dt === 1 ? 'Weekday' : 'Weekend', type: 'bar', stack: 'd', barCategoryGap: '28%',
      itemStyle: { color: dt === 1 ? SERIES.weekday : SERIES.weekend, borderRadius: [3, 3, 0, 0], opacity: filter.dayType === 0 || filter.dayType === dt ? 1 : 0.3 },
      data: summary.daily.map((d) => ((d[1] <= 5 ? 1 : 2) === dt ? d[2] : null)),
    })),
  }), [summary, filter.dayType])

  const heatOption = useMemo(() => {
    const cells = summary.dowHour.map((r) => [r[1], r[0] - 1, Math.round(r[2] / r[3])])
    const max = Math.max(...cells.map((c) => c[2]))
    return {
      grid: { left: 8, right: 12, top: 6, bottom: 44, containLabel: true },
      tooltip: { ...tooltipCommon, formatter: (p: { value: number[] }) => `<b>${DOW[p.value[1]]} ${hourRange(p.value[0])}</b><br/>${fmt(p.value[2])} trips on an average day` },
      xAxis: { ...axisCommon, type: 'category', data: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')), splitLine: { show: false }, axisLine: { show: false } },
      yAxis: { ...axisCommon, type: 'category', data: DOW, inverse: true, splitLine: { show: false }, axisLine: { show: false } },
      visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 160, text: [compact(max), '0'], textStyle: { color: INK.text3, fontSize: 11 }, inRange: { color: SEQ } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: '#0f1728', borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: SERIES.accent, borderWidth: 1 } } }],
    }
  }, [summary])

  const zoneBars = (metric: Metric) => {
    const top = topZones(data.zoneIndex, metric, filter, 10).reverse()
    return {
      grid: { left: 4, right: 56, top: 4, bottom: 4, containLabel: true },
      tooltip: { ...tooltipCommon, trigger: 'item', formatter: (p: { name: string; value: number }) => `<b>${p.name}</b><br/>${fmt(p.value)} ${metric === 'pickups' ? 'pickups' : 'drop-offs'} / day` },
      xAxis: { ...axisCommon, type: 'value', show: false },
      yAxis: { ...axisCommon, type: 'category', data: top.map((t) => data.zoneById.get(t.zone)?.name ?? ''), axisLine: { show: false }, axisLabel: { color: INK.text2, fontSize: 11.5, width: 150, overflow: 'truncate' } },
      series: [{ type: 'bar', data: top.map((t) => Math.round(t.value / days)), barWidth: 12, itemStyle: { color: SERIES.weekday, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: INK.text2, fontSize: 11, formatter: (p: { value: number }) => fmt(p.value) } }],
    }
  }
  const pickupOption = useMemo(() => zoneBars('pickups'), [data, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const dropoffOption = useMemo(() => zoneBars('dropoffs'), [data, filter]) // eslint-disable-line react-hooks/exhaustive-deps

  const hist = useMemo(() => distanceHistogram(summary, filter), [summary, filter])
  const histOption = useMemo(() => {
    const total = hist.reduce((a, b) => a + b, 0) || 1
    const labels = hist.map((_, i) => (i === summary.distHistMaxBin ? `${i}+` : `${i}–${i + 1}`))
    return {
      grid: { left: 8, right: 12, top: 10, bottom: 22, containLabel: true },
      tooltip: { ...tooltipCommon, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(148,170,210,.06)' } },
        formatter: (ps: { dataIndex: number }[]) => { const i = ps[0].dataIndex; return `<b>${labels[i]} mi</b><br/>${fmt(hist[i])} trips · ${pct(hist[i] / total)}` } },
      xAxis: { ...axisCommon, type: 'category', data: labels, name: 'Trip distance (miles)', nameLocation: 'middle', nameGap: 28, axisLabel: { ...axisCommon.axisLabel, interval: 1, formatter: (v: string) => v.split('–')[0] }, splitLine: { show: false } },
      yAxis: { ...axisCommon, type: 'value', axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => compact(v) } },
      series: [{ type: 'bar', data: hist, barCategoryGap: '14%', itemStyle: { color: SERIES.weekday, borderRadius: [3, 3, 0, 0] } }],
    }
  }, [hist, summary.distHistMaxBin])
  const histTotal = hist.reduce((a, b) => a + b, 0) || 1
  const under3 = (hist[0] + hist[1] + hist[2]) / histTotal

  const flows = useMemo(() => odFlows(data.od, filter).slice(0, 12), [data, filter])
  const slice = `${['All days', 'Weekdays', 'Weekends'][filter.dayType]} · ${filter.hour === -1 ? 'all hours' : hourRange(filter.hour)}`

  return (
    <>
      <PageHeader eyebrow="Module 2 · Mobility Analytics" title="What 3.9 million trips say about how the city moves"
        lead={<>Every number below is computed from the cleaned NYC TLC records for {summary.month}. Hover the <span className="font-mono text-accent">ƒ</span> beside a KPI to see its formula.</>}
        right={<ProvTag kind="observed">NYC TLC · {summary.month}</ProvTag>} />

      {/* One filter row; it drives every tile and chart, and the 3D map shares it. */}
      <div className="card mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Day type</span>
          <Segmented label="Day type" value={filter.dayType} onChange={(v: DayType) => setFilter({ ...filter, dayType: v })}
            options={[{ value: 0, label: 'All days' }, { value: 1, label: 'Weekdays' }, { value: 2, label: 'Weekends' }]} />
        </div>
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="eyebrow shrink-0">Pickup hour</span>
          <input type="range" min={-1} max={23} step={1} value={filter.hour} aria-label="Pickup hour" onChange={(e) => setFilter({ ...filter, hour: +e.target.value })} />
          <span className="w-24 shrink-0 text-right text-[12.5px] font-medium tabular-nums">{filter.hour === -1 ? 'All hours' : hourRange(filter.hour)}</span>
        </div>
        {(filter.dayType !== 0 || filter.hour !== -1) ? (
          <button onClick={() => setFilter({ dayType: 0, hour: -1 })} className="text-[12px] font-medium text-accent cursor-pointer">Clear filters</button>
        ) : null}
      </div>

      <div className="card mb-4 grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total trips" value={compact(k.trips)} sub={`${int(k.tripsPerDay)} per day · ${k.days} days`} formula="COUNT(*) FROM trips_clean WHERE <filter>" />
        <Stat label="Total distance" value={compact(k.distanceMi)} unit="mi" sub={`${compact(k.distanceMi * 1.609344)} km`} formula="SUM(distance_mi)" />
        <Stat label="Avg trip distance" value={dec1(k.avgDistanceMi)} unit="mi" sub={`${dec1(k.avgDistanceMi * 1.609344)} km`} formula="SUM(distance_mi) / COUNT(*)" />
        <Stat label="Avg fare" value={usd(k.avgFareUsd)} sub={`${usd(k.avgDistanceMi ? k.avgFareUsd / k.avgDistanceMi : 0)} per mile`} formula="SUM(fare_amount) / COUNT(*) — metered fare, excludes tips, tolls and surcharges" />
        <Stat label="Avg duration" value={dec1(k.avgDurationMin)} unit="min" sub={`${dec1(k.avgSpeedMph)} mph average speed`} formula="SUM(duration_s) / 60 / COUNT(*);  speed = SUM(distance) / SUM(duration)" />
        <Stat label="Peak hour" value={hourLabel(peak)} sub={`${int(hourlySel[peak])} trips/day · top 3: ${top3.map((h) => String(h).padStart(2, '0')).join(', ')}h`} formula="argmax over pickup_hour of COUNT(*) / days, for the selected day type" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Hourly demand" subtitle="Average trips per day by pickup hour. Click a point to filter the page to that hour.">
          <Chart ariaLabel="Hourly demand, weekday versus weekend" option={hourlyOption} height={270} onClick={(p) => setFilter({ ...filter, hour: p.dataIndex })} />
        </Card>
        <Card title="Daily trips across the month" subtitle="Each bar is one calendar day; weekends are in orange.">
          <Chart ariaLabel="Trips per calendar day" option={dailyOption} height={270} />
        </Card>
        <Card title="Demand by weekday and hour" subtitle="Trips on an average day. The evening peak is strongest Tuesday to Thursday; late nights belong to the weekend." className="xl:col-span-2">
          <Chart ariaLabel="Heatmap of trips by day of week and hour" option={heatOption} height={300} />
        </Card>
        <Card title="Top pickup zones" subtitle={`Pickups per day · ${slice}`}>
          <Chart ariaLabel="Top ten pickup zones" option={pickupOption} height={300} />
        </Card>
        <Card title="Top drop-off zones" subtitle={`Drop-offs per day · ${slice}`}>
          <Chart ariaLabel="Top ten drop-off zones" option={dropoffOption} height={300} />
        </Card>
        <Card title="Trip distance distribution" subtitle={`${pct(under3, 0)} of trips in this slice are shorter than 3 miles. Bins are 1 mile wide; the last bin holds 20 miles and above.`}>
          <Chart ariaLabel="Histogram of trip distance" option={histOption} height={400} />
        </Card>
        <Card title="Origin–destination flows" subtitle={`Strongest zone pairs · ${slice}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-text-3">
                  <th className="pb-2 font-semibold">Origin → destination</th>
                  <th className="pb-2 text-right font-semibold">Trips/day</th>
                  <th className="pb-2 text-right font-semibold">Avg mi</th>
                  <th className="pb-2 text-right font-semibold">Avg fare</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={`${f.pu}-${f.do}`} className="border-t border-line">
                    <td className="relative py-[7px] pr-2">
                      <span className="absolute inset-y-1 left-0 rounded bg-s1/15" style={{ width: `${(f.trips / flows[0].trips) * 100}%` }} />
                      <span className="relative text-text-2">{data.zoneById.get(f.pu)?.name} <span className="text-text-3">→</span> {data.zoneById.get(f.do)?.name}</span>
                    </td>
                    <td className="py-[7px] text-right tabular-nums text-text">{dec1(f.trips / days)}</td>
                    <td className="py-[7px] text-right tabular-nums text-text-2">{dec1(f.avgDistanceMi)}</td>
                    <td className="py-[7px] text-right tabular-nums text-text-2">{usd(f.avgFareUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
