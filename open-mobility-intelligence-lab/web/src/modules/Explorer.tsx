import { useEffect, useMemo, useState } from 'react'
import type { ModuleProps } from '../App'
import MapView, { type LayerState } from './MapView'
import { HourBars, ProvTag, Segmented, Stat, Toggle } from '../components/ui'
import { daysIn, hourlyDemand, kpisFor, peakHour, topZones, zoneHourly, zoneValue } from '../lib/selectors'
import { compact, dec1, hourLabel, hourRange, int, usd } from '../lib/format'
import type { DayType, Metric } from '../lib/types'

const DAY_OPTIONS: { value: DayType; label: string }[] = [
  { value: 0, label: 'All days' }, { value: 1, label: 'Weekdays' }, { value: 2, label: 'Weekends' },
]

export default function Explorer({ data, filter, setFilter, go }: ModuleProps) {
  const [metric, setMetric] = useState<Metric>('pickups')
  const [layers, setLayers] = useState<LayerState>({ buildings: true, zones: true, columns: true, arcs: true, particles: true })
  const [arcCount, setArcCount] = useState(60)
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [reset, setReset] = useState(0)
  const [showLayers, setShowLayers] = useState(true)

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setFilter({ ...filter, hour: (Math.max(filter.hour, -1) + 1) % 24 }), 1500)
    return () => window.clearInterval(id)
  }, [playing, filter, setFilter])

  const k = useMemo(() => kpisFor(data.summary, filter), [data, filter])
  const hourly = useMemo(() => hourlyDemand(data.summary, filter.dayType), [data, filter.dayType])
  const peak = peakHour(hourly)
  const days = daysIn(data.summary, filter.dayType)
  const top = useMemo(() => topZones(data.zoneIndex, metric, filter, 6), [data, metric, filter])
  const zone = selected === null ? null : data.zoneById.get(selected) ?? null
  const month = new Date(`${data.summary.month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const sliceLabel = `${DAY_OPTIONS[filter.dayType].label} · ${filter.hour === -1 ? 'all hours' : hourRange(filter.hour)}`
  const set = (key: keyof LayerState) => (v: boolean) => setLayers((s) => ({ ...s, [key]: v }))

  return (
    <div className="absolute inset-0 overflow-hidden bg-ink-950">
      <MapView data={data} filter={filter} metric={metric} layers={layers} arcCount={arcCount} selected={selected} onSelect={setSelected} resetSignal={reset} />

      {/* Left: headline + KPIs for the current slice */}
      <aside className="glass fade-in absolute left-3 top-[68px] z-20 w-[min(340px,calc(100vw-24px))] p-4 lg:left-5 lg:p-5">
        <div className="eyebrow !text-accent">New York City · {month}</div>
        <h1 className="mt-1.5 text-[19px] font-semibold leading-tight tracking-tight">
          {compact(data.summary.kpis.total_trips)} yellow-taxi trips,<br />one city in motion
        </h1>
        <p className="mt-1.5 hidden text-[12px] leading-relaxed text-text-2 sm:block">
          Official NYC TLC trip records, cleaned with SQL and aggregated to 263 taxi zones. Drag to rotate, scroll to zoom, click a zone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ProvTag kind="observed">NYC TLC</ProvTag>
          <span className="text-[11px] text-text-3">{sliceLabel}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line pt-4">
          <Stat compact label="Trips" value={compact(k.trips)} sub={`${int(k.tripsPerDay)} per day`} formula="COUNT(*) over cleaned trips in the selected slice" />
          <Stat compact label="Total distance" value={compact(k.distanceMi)} unit="mi" sub={`${compact(k.distanceMi * 1.609344)} km`} formula="SUM(trip_distance)" />
          <Stat compact label="Avg distance" value={dec1(k.avgDistanceMi)} unit="mi" sub={`${dec1(k.avgDurationMin)} min avg`} formula="SUM(trip_distance) / COUNT(*)" />
          <Stat compact label="Avg fare" value={usd(k.avgFareUsd)} sub={`${dec1(k.avgSpeedMph)} mph avg speed`} formula="SUM(fare_amount) / COUNT(*)  — metered fare, before tips and surcharges" />
        </div>
        <div className="mt-4 hidden border-t border-line pt-3 sm:block">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="eyebrow">Trips per day by hour</span>
            <span className="text-[11px] text-text-3">peak {hourLabel(peak)} · {int(hourly[peak])}</span>
          </div>
          <HourBars values={hourly} active={filter.hour} onSelect={(h) => setFilter({ ...filter, hour: h === filter.hour ? -1 : h })} />
          <div className="mt-1 flex justify-between text-[10px] text-text-3"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </div>
        <button onClick={() => go('analytics')} className="mt-3 hidden w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white/[0.03] py-2 text-[12px] font-medium text-text-2 hover:text-text sm:flex cursor-pointer">
          Open the full analytics dashboard <span aria-hidden="true">→</span>
        </button>
      </aside>

      {/* Right: layers + zone inspector */}
      <aside className="absolute right-3 top-[68px] z-20 hidden w-[300px] flex-col gap-3 md:flex lg:right-5" style={{ maxHeight: 'calc(100% - 190px)' }}>
        <div className="glass p-3">
          <button onClick={() => setShowLayers((s) => !s)} aria-expanded={showLayers} className="flex w-full items-center justify-between px-2 py-1 cursor-pointer">
            <span className="eyebrow">Map layers</span>
            <span className="text-[11px] text-text-3">{showLayers ? 'Hide' : 'Show'}</span>
          </button>
          {showLayers ? (
            <div className="mt-1">
              <Toggle checked={layers.columns} onChange={set('columns')} label="Demand columns" hint="Height = trips per day in the zone" />
              <Toggle checked={layers.zones} onChange={set('zones')} label="Zone heat" hint="263 TLC taxi zones" />
              <Toggle checked={layers.arcs} onChange={set('arcs')} label="OD flows" hint="Cyan = origin, pink = destination" />
              <Toggle checked={layers.particles} onChange={set('particles')} label="Flow animation" hint="Synthetic paths, density ∝ real volume" />
              <Toggle checked={layers.buildings} onChange={set('buildings')} label="3D buildings" hint="OpenStreetMap, zoom in to see" />
              <div className="mt-2 border-t border-line px-2 pt-2.5">
                <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                  <label htmlFor="arcs" className="text-text-2">Top OD pairs shown</label>
                  <span className="font-medium tabular-nums text-text">{arcCount}</span>
                </div>
                <input id="arcs" type="range" min={10} max={data.odTopN} step={10} value={arcCount} onChange={(e) => setArcCount(+e.target.value)} />
                <div className="mt-3 flex items-center gap-2 text-[10.5px] text-text-3">
                  <span>Low</span>
                  <span className="h-1.5 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#10203c,#17386a,#2260ad,#3987e5,#7cc4ff,#d6f0ff)' }} />
                  <span>High demand</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass min-h-0 overflow-y-auto p-4">
          {zone ? (
            <div key={zone.id} className="fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="eyebrow">Zone {zone.id} · {zone.borough}</div>
                  <h2 className="mt-1 text-[16px] font-semibold leading-tight">{zone.name}</h2>
                  <div className="mt-0.5 text-[11.5px] text-text-3">{zone.serviceZone} · {zone.areaSqMi.toFixed(2)} sq mi</div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close zone details" className="rounded-md px-1.5 text-lg leading-none text-text-3 hover:text-text cursor-pointer">×</button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Stat compact label="Pickups/day" value={int(zoneValue(data.zoneIndex, 'pickups', filter, zone.id) / days)} formula="COUNT(*) WHERE pu_zone = zone, divided by days in the slice" />
                <Stat compact label="Drop-offs/day" value={int(zoneValue(data.zoneIndex, 'dropoffs', filter, zone.id) / days)} formula="COUNT(*) WHERE do_zone = zone, divided by days in the slice" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-black/20 p-2.5 text-center">
                {[['Avg fare', zone.avgFareUsd === null ? '—' : usd(zone.avgFareUsd)], ['Avg trip', zone.avgDistanceMi === null ? '—' : `${dec1(zone.avgDistanceMi)} mi`], ['Avg time', zone.avgDurationMin === null ? '—' : `${dec1(zone.avgDurationMin)} min`]].map(([l, v]) => (
                  <div key={l}><div className="text-[10px] text-text-3">{l}</div><div className="text-[13px] font-semibold tabular-nums">{v}</div></div>
                ))}
              </div>
              <div className="mt-1 text-[10.5px] text-text-3">Averages cover all trips starting here in {month}.</div>
              <div className="mt-3">
                <div className="eyebrow mb-1">Pickups by hour</div>
                <HourBars values={zoneHourly(data.zoneIndex, 'pickups', filter.dayType, zone.id)} active={filter.hour} height={40} onSelect={(h) => setFilter({ ...filter, hour: h })} />
              </div>
              {(['out', 'in'] as const).map((dir) => {
                const list = data.links[dir][String(zone.id)] ?? []
                const max = list[0]?.[1] ?? 1
                return (
                  <div key={dir} className="mt-3">
                    <div className="eyebrow mb-1.5">{dir === 'out' ? 'Top destinations' : 'Top origins'} · month</div>
                    {list.length === 0 ? <div className="text-[12px] text-text-3">No trips recorded.</div> : null}
                    {list.slice(0, 5).map(([other, n]) => (
                      <button key={other} onClick={() => setSelected(other)} className="group relative mb-1 flex w-full items-center justify-between overflow-hidden rounded-md px-2 py-1 text-left text-[12px] hover:bg-white/[0.05] cursor-pointer">
                        <span className="absolute inset-y-0 left-0 rounded-md bg-s1/20" style={{ width: `${(n / max) * 100}%` }} />
                        <span className="relative truncate text-text-2 group-hover:text-text">{data.zoneById.get(other)?.name ?? other}</span>
                        <span className="relative ml-2 shrink-0 tabular-nums text-text-3">{int(n)}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">Busiest zones · {metric === 'pickups' ? 'pickups' : 'drop-offs'}</span>
                <span className="text-[10.5px] text-text-3">per day</span>
              </div>
              <div className="mt-2">
                {top.map((t, i) => (
                  <button key={t.zone} onClick={() => setSelected(t.zone)} className="group relative mb-1 flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-white/[0.05] cursor-pointer">
                    <span className="absolute inset-y-0 left-0 rounded-md bg-s1/20" style={{ width: `${(t.value / (top[0].value || 1)) * 100}%` }} />
                    <span className="relative w-4 text-[11px] tabular-nums text-text-3">{i + 1}</span>
                    <span className="relative flex-1 truncate text-text-2 group-hover:text-text">{data.zoneById.get(t.zone)?.name}</span>
                    <span className="relative tabular-nums text-text">{int(t.value / days)}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-3">Click any zone on the map to inspect its demand profile and strongest connections.</p>
            </div>
          )}
        </div>
      </aside>

      {/* Bottom: timeline */}
      <div className="glass absolute bottom-3 left-1/2 z-20 w-[min(860px,calc(100vw-24px))] -translate-x-1/2 px-4 py-3 lg:bottom-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <button onClick={() => { if (!playing && filter.hour === -1) setFilter({ ...filter, hour: 0 }); setPlaying((p) => !p) }}
            aria-label={playing ? 'Pause timeline' : 'Play 24-hour timeline'}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-s1 text-white shadow-[0_0_0_5px_rgba(57,135,229,.18)] hover:brightness-110 cursor-pointer">
            {playing
              ? <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1" width="3.2" height="10" rx="1" /><rect x="7.3" y="1" width="3.2" height="10" rx="1" /></svg>
              : <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2.5 1.2v9.6a.6.6 0 0 0 .9.5l8-4.8a.6.6 0 0 0 0-1L3.4.7a.6.6 0 0 0-.9.5Z" /></svg>}
          </button>
          <div className="min-w-[200px] flex-1">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold tabular-nums">{filter.hour === -1 ? 'All 24 hours' : hourRange(filter.hour)}</span>
              <button onClick={() => { setPlaying(false); setFilter({ ...filter, hour: -1 }) }} disabled={filter.hour === -1}
                className="text-[11.5px] font-medium text-accent disabled:text-text-3 cursor-pointer disabled:cursor-default">Show all day</button>
            </div>
            <input type="range" min={0} max={23} step={1} value={filter.hour === -1 ? 0 : filter.hour} aria-label="Pickup hour"
              onChange={(e) => { setPlaying(false); setFilter({ ...filter, hour: +e.target.value }) }} style={{ opacity: filter.hour === -1 ? 0.45 : 1 }} />
            <div className="mt-1 flex justify-between text-[10px] text-text-3">{[0, 3, 6, 9, 12, 15, 18, 21, 23].map((h) => <span key={h}>{String(h).padStart(2, '0')}</span>)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" label="Day type" value={filter.dayType} options={DAY_OPTIONS} onChange={(v) => setFilter({ ...filter, dayType: v })} />
            <Segmented size="sm" label="Demand metric" value={metric} options={[{ value: 'pickups', label: 'Pickups' }, { value: 'dropoffs', label: 'Drop-offs' }]} onChange={setMetric} />
            <button onClick={() => setReset((r) => r + 1)} className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] font-medium text-text-2 hover:text-text cursor-pointer">Reset view</button>
          </div>
        </div>
      </div>
    </div>
  )
}
