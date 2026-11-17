import { useMemo, useState } from 'react'
import type { ModuleProps } from '../App'
import Chart, { axisCommon, INK, SERIES, tooltipCommon } from '../components/Chart'
import { Card, PageHeader, ProvTag, Stat } from '../components/ui'
import { CO2_G_PER_GALLON_GASOLINE, EPA_TYPICAL_MPG, FLEET_PRESETS, KM_PER_MILE, efFromMpg, runScenario, sensitivityGrid, tornado, type ScenarioInputs } from '../lib/emissions'
import { compact, dec1, int, pct } from '../lib/format'

interface Controls { distanceScale: number; baseEmpty: number; baseMpg: number; improvement: number; scenEmpty: number; scenFleet: string; scenMpg: number }
const DEFAULTS: Controls = { distanceScale: 1, baseEmpty: 0.4, baseMpg: EPA_TYPICAL_MPG, improvement: 0, scenEmpty: 0.4, scenFleet: 'epa', scenMpg: EPA_TYPICAL_MPG }
const PRESETS: { id: string; label: string; blurb: string; patch: Partial<Controls> }[] = [
  { id: 'baseline', label: 'Baseline', blurb: 'No change', patch: {} },
  { id: 'routing', label: 'Smarter routing', blurb: '−8% loaded miles', patch: { improvement: 0.08 } },
  { id: 'dispatch', label: 'Better dispatch', blurb: 'Empty share 40% → 30%', patch: { scenEmpty: 0.3 } },
  { id: 'hybrid', label: 'Hybrid fleet', blurb: '45 mpg vehicles', patch: { scenFleet: 'hybrid', scenMpg: 45 } },
  { id: 'combined', label: 'Combined', blurb: 'All three together', patch: { improvement: 0.08, scenEmpty: 0.3, scenFleet: 'hybrid', scenMpg: 45 } },
]

/** A reduction is shown as −x, an increase as +x, and exactly zero carries no sign. */
const signed = (v: number, text: string) => (Math.abs(v) < 1e-9 ? text : `${v < 0 ? '+' : '−'}${text}`)

function Slider({ label, value, min, max, step, onChange, display, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string; hint?: string
}) {
  const id = label.replace(/\W+/g, '-').toLowerCase()
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium text-text">{label}</label>
        <span className="text-[13px] font-semibold tabular-nums text-text">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-text-3">{hint}</p> : null}
    </div>
  )
}

export default function Simulation({ data }: ModuleProps) {
  const observedMi = data.summary.kpis.total_distance_mi
  const [c, setC] = useState<Controls>(DEFAULTS)
  const [preset, setPreset] = useState('baseline')
  const up = (patch: Partial<Controls>) => { setPreset('custom'); setC((s) => ({ ...s, ...patch })) }

  const fleet = FLEET_PRESETS.find((f) => f.id === c.scenFleet)
  const scenarioEf = c.scenFleet === 'bev' ? 0 : efFromMpg(c.scenMpg)
  const inputs: ScenarioInputs = useMemo(() => ({
    loadedDistanceMi: observedMi * c.distanceScale, baselineEmptyShare: c.baseEmpty, baselineEfGPerMi: efFromMpg(c.baseMpg),
    distanceImprovement: c.improvement, scenarioEmptyShare: c.scenEmpty, scenarioEfGPerMi: scenarioEf,
  }), [observedMi, c, scenarioEf])
  const r = useMemo(() => runScenario(inputs), [inputs])
  const bars = useMemo(() => tornado(inputs, 0.2), [inputs])

  const compareOption = useMemo(() => ({
    grid: { left: 8, right: 16, top: 34, bottom: 4, containLabel: true },
    tooltip: { ...tooltipCommon, trigger: 'item', formatter: (p: { name: string; value: number }) => `<b>${p.name}</b><br/>${int(p.value)} t CO₂ (estimated)` },
    xAxis: { ...axisCommon, type: 'category', data: ['Baseline', 'Scenario'], splitLine: { show: false }, axisLabel: { color: INK.text2, fontSize: 12 } },
    yAxis: { ...axisCommon, type: 'value', name: 't CO₂ / month', axisLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => compact(v) } },
    series: [{ type: 'bar', barWidth: 64, data: [{ value: Math.round(r.baselineT), itemStyle: { color: SERIES.neutral } }, { value: Math.round(r.scenarioT), itemStyle: { color: SERIES.weekday } }],
      itemStyle: { borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', color: INK.text, fontSize: 12, fontWeight: 600, formatter: (p: { value: number }) => `${int(p.value)} t` } }],
  }), [r])

  const tornadoOption = useMemo(() => {
    const rows = [...bars].reverse()
    const display = (key: string, v: number) => key === 'loadedDistanceMi' ? `${compact(v)} mi` : key.endsWith('Share') || key === 'distanceImprovement' ? pct(v, 0) : `${Math.round(v)} g/mi`
    return {
      grid: { left: 8, right: 24, top: 24, bottom: 28, containLabel: true },
      tooltip: { ...tooltipCommon, trigger: 'item', formatter: (p: { dataIndex: number }) => { const b = rows[p.dataIndex]; return `<b>${b.label}</b><br/>−20% (${display(b.key, b.lowInput)}): ${int(b.low)} t avoided<br/>+20% (${display(b.key, b.highInput)}): ${int(b.high)} t avoided` } },
      xAxis: { ...axisCommon, type: 'value', name: 'Emissions avoided (t CO₂)', nameLocation: 'middle', nameGap: 26, axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => compact(v) } },
      yAxis: { ...axisCommon, type: 'category', data: rows.map((b) => b.label), axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: INK.text2, fontSize: 11.5 } },
      series: [
        { type: 'bar', stack: 't', silent: true, itemStyle: { color: 'transparent' }, data: rows.map((b) => Math.min(b.low, b.high)) },
        { type: 'bar', stack: 't', barWidth: 12, itemStyle: { color: SERIES.weekday, borderRadius: 4 }, data: rows.map((b) => Math.abs(b.high - b.low)),
          markLine: { silent: true, symbol: 'none', lineStyle: { color: SERIES.accent, width: 1, type: 'solid' }, label: { formatter: 'current', color: INK.text2, fontSize: 10.5 }, data: [{ xAxis: r.reductionT }] } },
      ],
    }
  }, [bars, r.reductionT])

  const gridOption = useMemo(() => {
    const improvements = [0, 0.04, 0.08, 0.12, 0.16, 0.2], empties = [0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2]
    const g = sensitivityGrid(inputs, improvements, empties)
    const cells = g.flatMap((row, y) => row.map((v, x) => [x, y, +(v * 100).toFixed(1)]))
    const bound = Math.max(5, ...cells.map((cell) => Math.abs(cell[2])))
    return {
      grid: { left: 34, right: 12, top: 8, bottom: 78, containLabel: true },
      tooltip: { ...tooltipCommon, formatter: (p: { value: number[] }) => `Loaded distance −${pct(improvements[p.value[0]], 0)}<br/>Empty share ${pct(empties[p.value[1]], 0)}<br/><b>${p.value[2] >= 0 ? '−' : '+'}${Math.abs(p.value[2]).toFixed(1)}% emissions</b> vs baseline` },
      xAxis: { ...axisCommon, type: 'category', data: improvements.map((v) => `${Math.round(v * 100)}%`), name: 'Loaded-distance improvement', nameLocation: 'middle', nameGap: 28, splitLine: { show: false }, axisLine: { show: false } },
      yAxis: { ...axisCommon, type: 'category', data: empties.map((v) => `${Math.round(v * 100)}%`), name: 'Scenario empty share', nameLocation: 'middle', nameGap: 40, splitLine: { show: false }, axisLine: { show: false } },
      // Diverging: blue = emissions fall, orange = emissions rise, neutral grey at zero.
      visualMap: { min: -bound, max: bound, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 180, text: [`−${bound.toFixed(0)}% CO₂`, `+${bound.toFixed(0)}% CO₂`], textStyle: { color: INK.text3, fontSize: 11 }, inRange: { color: ['#d95926', '#8a4a34', '#3b4458', '#2b5c9c', '#3987e5', '#8fccff'] } },
      series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: '#0f1728', borderWidth: 2, borderRadius: 3 }, label: { show: true, color: '#f2f5fb', fontSize: 11, formatter: (p: { value: number[] }) => `${p.value[2] > 0 ? '−' : p.value[2] < 0 ? '+' : ''}${Math.abs(p.value[2]).toFixed(0)}%` } }],
    }
  }, [inputs])

  return (
    <>
      <PageHeader eyebrow="Module 3 · What-if Simulation" title="How much CO₂ could better operations avoid?"
        lead={<>A transparent scenario model on top of the observed trip distance. Results are <b className="text-text">estimates under stated assumptions</b>, not measured emissions of real taxis.</>}
        right={<ProvTag kind="estimated">model output</ProvTag>} />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Operating scenarios">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => { setPreset(p.id); setC({ ...DEFAULTS, distanceScale: c.distanceScale, baseEmpty: c.baseEmpty, baseMpg: c.baseMpg, scenEmpty: c.baseEmpty, ...p.patch }) }}
            aria-pressed={preset === p.id}
            className={`rounded-xl border px-3.5 py-2 text-left transition-colors cursor-pointer ${preset === p.id ? 'border-s1 bg-s1/15' : 'border-line bg-white/[0.02] hover:border-line-strong'}`}>
            <span className="block text-[12.5px] font-semibold text-text">{p.label}</span>
            <span className="block text-[11px] text-text-3">{p.blurb}</span>
          </button>
        ))}
        {preset === 'custom' ? <span className="self-center rounded-full border border-line px-2.5 py-1 text-[11px] text-text-3">Custom scenario</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-4">
          <Card title="Baseline assumptions" subtitle="What the fleet looks like today.">
            <div className="flex flex-col gap-5">
              <Slider label="Loaded distance" min={0.5} max={1.5} step={0.05} value={c.distanceScale} onChange={(v) => up({ distanceScale: v })}
                display={`${compact(observedMi * c.distanceScale)} mi`}
                hint={`100% = ${compact(observedMi)} mi with a passenger on board, observed in ${data.summary.month}. Now at ${Math.round(c.distanceScale * 100)}%.`} />
              <Slider label="Empty (deadhead) share" min={0} max={0.6} step={0.01} value={c.baseEmpty} onChange={(v) => up({ baseEmpty: v, scenEmpty: preset === 'baseline' ? v : c.scenEmpty })}
                display={pct(c.baseEmpty, 0)} hint="Share of all vehicle miles driven without a passenger. Not in the TLC data — an assumption you can change." />
              <Slider label="Fleet fuel economy" min={15} max={60} step={0.1} value={c.baseMpg} onChange={(v) => up({ baseMpg: v })}
                display={`${c.baseMpg.toFixed(1)} mpg`} hint={`= ${Math.round(efFromMpg(c.baseMpg))} g CO₂/mi (${Math.round(efFromMpg(c.baseMpg) / KM_PER_MILE)} g/km). EPA typical passenger vehicle: ${EPA_TYPICAL_MPG} mpg.`} />
            </div>
          </Card>
          <Card title="Scenario levers" subtitle="What changes.">
            <div className="flex flex-col gap-5">
              <Slider label="Loaded-distance improvement" min={0} max={0.3} step={0.01} value={c.improvement} onChange={(v) => up({ improvement: v })}
                display={`−${pct(c.improvement, 0)}`} hint="Shorter passenger trips from better routing or pooling." />
              <Slider label="Empty (deadhead) share" min={0} max={0.6} step={0.01} value={c.scenEmpty} onChange={(v) => up({ scenEmpty: v })}
                display={pct(c.scenEmpty, 0)} hint="Lower with better dispatch and repositioning." />
              <div>
                <div className="mb-2 text-[12.5px] font-medium text-text">Vehicle type</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {FLEET_PRESETS.map((f) => (
                    <button key={f.id} aria-pressed={c.scenFleet === f.id} onClick={() => up({ scenFleet: f.id, scenMpg: f.mpg ?? c.scenMpg })}
                      className={`rounded-lg border px-2 py-2 text-[11.5px] font-medium leading-tight cursor-pointer ${c.scenFleet === f.id ? 'border-s1 bg-s1/15 text-text' : 'border-line text-text-2 hover:border-line-strong'}`}>{f.label}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-text-3">{fleet?.note}</p>
              </div>
              {c.scenFleet !== 'bev' ? (
                <Slider label="Scenario fuel economy" min={15} max={60} step={0.1} value={c.scenMpg} onChange={(v) => up({ scenMpg: v, scenFleet: c.scenFleet })}
                  display={`${c.scenMpg.toFixed(1)} mpg`} hint={`= ${Math.round(scenarioEf)} g CO₂/mi`} />
              ) : null}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="card grid grid-cols-2 gap-x-6 gap-y-5 p-5 xl:grid-cols-4">
            <Stat label="Baseline emissions" value={int(r.baselineT)} unit="t CO₂" sub={`${compact(r.baselineVktMi)} vehicle-mi`} formula="loaded_mi / (1 − empty_share) × EF ÷ 1e6" />
            <Stat label="Scenario emissions" value={int(r.scenarioT)} unit="t CO₂" sub={`${compact(r.scenarioVktMi)} vehicle-mi`} formula="loaded_mi × (1 − improvement) / (1 − empty_share′) × EF′ ÷ 1e6" />
            <Stat label="Absolute reduction" value={signed(r.reductionT, int(Math.abs(r.reductionT)))} unit="t CO₂" sub={r.reductionT < 0 ? 'Scenario emits more' : 'per month, tailpipe only'} formula="baseline − scenario" />
            <Stat label="Percentage reduction" value={`${signed(r.reductionPct, dec1(Math.abs(r.reductionPct) * 100))}%`} sub={r.reductionPct < 0 ? 'Increase vs baseline' : 'vs baseline'} formula="(baseline − scenario) / baseline" />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <Card title="Baseline vs scenario" subtitle="Estimated monthly tailpipe CO₂.">
              <Chart ariaLabel="Baseline versus scenario emissions" option={compareOption} height={270} />
            </Card>
            <Card title="Sensitivity: which assumption matters most?" subtitle="Each bar moves one input ±20% with the others held fixed and shows the range of emissions avoided.">
              <Chart ariaLabel="Tornado sensitivity chart" option={tornadoOption} height={270} />
            </Card>
          </div>
          <Card title="Two-way sensitivity" subtitle="Emission change versus baseline for every combination of routing improvement and empty share, at the scenario's vehicle type.">
            <Chart ariaLabel="Two-way sensitivity grid" option={gridOption} height={340} />
          </Card>
          <Card title="Model, source and limits">
            <div className="grid gap-4 text-[12.5px] leading-relaxed text-text-2 md:grid-cols-2">
              <div>
                <pre className="rounded-lg border border-line bg-black/25 p-3 font-mono text-[11.5px] leading-relaxed text-text">{`VKT       = loaded_mi / (1 − empty_share)\nEF        = ${int(CO2_G_PER_GALLON_GASOLINE)} g CO₂/gal ÷ mpg\nEmissions = VKT × EF`}</pre>
                <p className="mt-2">Emission factor source: U.S. EPA, <a className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle">Greenhouse Gas Emissions from a Typical Passenger Vehicle</a> — 8,887 g CO₂ per gallon of gasoline; typical vehicle 22.2 mpg ≈ 400 g CO₂ per mile.</p>
              </div>
              <ul className="list-disc space-y-1.5 pl-4">
                <li><b className="text-text">Observed:</b> only the loaded distance ({compact(observedMi)} mi).</li>
                <li><b className="text-text">Assumed:</b> empty share, fuel economy and every scenario lever. The 45 mpg hybrid figure is illustrative.</li>
                <li>Tailpipe CO₂ only: no CH₄ or N₂O, no fuel production, no electricity generation for electric vehicles.</li>
                <li>One average factor for the whole fleet; real taxis vary by model, speed, idling and season.</li>
                <li>Use it to compare scenarios, not to report the emissions of the NYC taxi fleet.</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
