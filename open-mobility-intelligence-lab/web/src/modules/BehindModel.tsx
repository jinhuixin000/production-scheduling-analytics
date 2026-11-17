import { useEffect, useState } from 'react'
import { REPO_URL, type ModuleProps } from '../App'
import { Card, PageHeader, ProvTag, type Provenance } from '../components/ui'
import { int } from '../lib/format'

interface TestReport { generatedUtc: string; web: { passed: number; total: number; files: number }; pipeline: { passed: number; total: number } | null; build: { typecheck: boolean } }

const CLASSES: { kind: Provenance; what: string; examples: string }[] = [
  { kind: 'observed', what: 'Counted or summed straight from official TLC trip records after cleaning.', examples: 'Trip counts, total distance, fares, pickups and drop-offs per zone, OD pair volumes.' },
  { kind: 'derived', what: 'Calculated from observed values or official geometry.', examples: 'Averages, trips per day, average speed, peak hour, simplified zone polygons and label points.' },
  { kind: 'synthetic', what: 'Generated for illustration. Not a measurement of anything.', examples: 'Animated particles and arc shapes between zones. TLC publishes zones only — there are no GPS traces in this project.' },
  { kind: 'estimated', what: 'Model output that depends on assumptions the user can change.', examples: 'All CO₂ figures in the What-if module, including baseline emissions.' },
]

const LIMITS = [
  'One month (May 2026) of yellow taxis only. Green taxis and app-based for-hire vehicles, which carry most NYC trips, are not included.',
  'Locations are taxi zones, not addresses. Flows are drawn between zone label points; the real routes are unknown.',
  'Weekday means Monday to Friday. Memorial Day (25 May) is counted as a weekday.',
  'Trip records are reported by taxi technology vendors; TLC publishes them without guaranteeing accuracy. Cleaning thresholds are judgement calls, documented on the Data Engineering page.',
  'Average fare is the metered fare only — tips, tolls and surcharges are excluded.',
  'Emissions are scenario estimates with a single fleet-average factor and an assumed empty share. They are not an inventory of the NYC taxi fleet.',
  'The basemap is loaded live from OpenFreeMap; if that service is unreachable, the data layers still render on a plain background.',
]

export default function BehindModel({ data }: ModuleProps) {
  const q = data.quality
  const [tests, setTests] = useState<TestReport | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/tests.json`).then((r) => (r.ok ? r.json() : null)).then(setTests).catch(() => setTests(null))
  }, [])

  return (
    <>
      <PageHeader eyebrow="Module 5 · Behind the Model" title="Sources, formulas, architecture and limits"
        lead="Everything needed to check this work: where the data comes from, how each number is computed, what was tested and what the project cannot tell you." />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Data sources and licensing">
          <table className="w-full text-[12.5px]">
            <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:align-top [&_tr:first-child_td]:border-t-0">
              <tr><td className="w-36 pr-3 font-medium text-text">Trip records</td><td className="text-text-2"><a className="text-accent hover:underline" href={q.landingPage} target="_blank" rel="noreferrer">NYC Taxi &amp; Limousine Commission — TLC Trip Record Data</a>, Yellow Taxi, {q.month}. Public open data published by the City of New York; attribution to NYC TLC.</td></tr>
              <tr><td className="pr-3 font-medium text-text">Zones</td><td className="text-text-2">TLC Taxi Zone Lookup Table and Taxi Zone Shapefile (263 zones, EPSG:2263), same TLC page.</td></tr>
              <tr><td className="pr-3 font-medium text-text">Basemap</td><td className="text-text-2"><a className="text-accent hover:underline" href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> vector tiles (OpenMapTiles schema). Map data © <a className="text-accent hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, ODbL. Free public tile service, no API key; attribution shown on the map.</td></tr>
              <tr><td className="pr-3 font-medium text-text">Emission factor</td><td className="text-text-2"><a className="text-accent hover:underline" href="https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle" target="_blank" rel="noreferrer">U.S. EPA — Greenhouse Gas Emissions from a Typical Passenger Vehicle</a>: 8,887 g CO₂ per gallon of gasoline, 22.2 mpg typical vehicle.</td></tr>
              <tr><td className="pr-3 font-medium text-text">Not used</td><td className="text-text-2">No private, corporate, thesis or GPS-trace data of any kind. No paid APIs or services.</td></tr>
            </tbody>
          </table>
        </Card>

        <Card title="What kind of number is it?" subtitle="Every figure in the app belongs to exactly one of four classes.">
          <div className="flex flex-col">
            {CLASSES.map((c) => (
              <div key={c.kind} className="grid grid-cols-[96px_1fr] gap-3 border-t border-line py-2.5 first:border-t-0">
                <div><ProvTag kind={c.kind} /></div>
                <div className="text-[12.5px] leading-relaxed"><div className="text-text">{c.what}</div><div className="text-text-3">{c.examples}</div></div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="System architecture" subtitle="Static by design: no server, no database at runtime, no cost." className="xl:col-span-2">
          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_auto_1.3fr_auto_1fr_auto_1.3fr]">
            {[
              { t: 'Public sources', lines: ['TLC Parquet (4.09 M rows)', 'Zone lookup CSV', 'Zone shapefile'], tag: 'nyc.gov / TLC' },
              { t: 'Offline pipeline', lines: ['Python orchestrates', 'DuckDB runs the SQL', 'GeoPandas / Shapely for zones', '18 validation checks'], tag: 'pipeline/' },
              { t: 'Static data', lines: ['summary · zones · od', 'zones.geojson · quality', `${Object.keys(q.outputBytes).length + 1} JSON files, about 1 MB`], tag: 'web/public/data/' },
              { t: 'Browser app', lines: ['React + TypeScript + Vite', 'MapLibre GL + deck.gl (WebGL)', 'ECharts, Tailwind CSS', 'Pure selectors and model, unit-tested'], tag: 'GitHub Pages' },
            ].flatMap((b, i) => [
              i > 0 ? <div key={`a${i}`} aria-hidden="true" className="hidden items-center text-text-3 lg:flex">→</div> : null,
              <div key={b.t} className="rounded-xl border border-line bg-black/20 p-3.5">
                <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{b.t}</span><span className="font-mono text-[10px] text-text-3">{b.tag}</span></div>
                <ul className="mt-2 space-y-1 text-[12px] text-text-2">{b.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>,
            ])}
          </div>
        </Card>

        <Card title="Formulas">
          <dl className="[&_dd]:mb-3 [&_dd]:mt-1 [&_dd]:rounded-lg [&_dd]:border [&_dd]:border-line [&_dd]:bg-black/25 [&_dd]:px-3 [&_dd]:py-2 [&_dd]:font-mono [&_dd]:text-[11.5px] [&_dd]:leading-relaxed [&_dd]:text-text [&_dt]:text-[12.5px] [&_dt]:text-text-2">
            <dt>KPIs — ratios of sums over the filtered cube, never averages of averages</dt>
            <dd>avg_distance = Σ distance_mi / Σ trips<br />avg_fare = Σ fare_amount / Σ trips<br />avg_speed = Σ distance_mi / (Σ duration_s / 3600)<br />trips_per_day = Σ trips / days in the selected day type</dd>
            <dt>Cleaning — implied speed</dt>
            <dd>speed_mph = distance_mi / (duration_s / 3600) ≤ {q.thresholds.max_speed_mph}</dd>
            <dt>Outlier flag — Tukey upper fence</dt>
            <dd>x &gt; Q3 + 1.5 × (Q3 − Q1)</dd>
            <dt>Emissions scenario</dt>
            <dd>VKT = loaded_mi / (1 − empty_share)<br />EF = 8,887 g CO₂/gal ÷ mpg<br />E = VKT × EF ÷ 10⁶ &nbsp;[t CO₂]<br />reduction % = (E_base − E_scenario) / E_base</dd>
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Test results" subtitle={tests ? `Last run ${tests.generatedUtc.slice(0, 16).replace('T', ' ')} UTC` : 'Run npm run test:report to generate this section.'}>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ['Pipeline validation', `${q.checks.filter((c) => c.pass).length} / ${q.checks.length}`, 'data reconciliation checks'],
                ['Front-end unit tests', tests ? `${tests.web.passed} / ${tests.web.total}` : '—', tests ? `Vitest · ${tests.web.files} files` : 'Vitest'],
                ['Pipeline unit tests', tests?.pipeline ? `${tests.pipeline.passed} / ${tests.pipeline.total}` : '—', 'pytest'],
              ].map(([l, v, s]) => (
                <div key={l} className="rounded-xl border border-line bg-black/20 p-3">
                  <div className="text-[22px] font-semibold tabular-nums text-text">{v}</div>
                  <div className="mt-0.5 text-[11.5px] font-medium text-text-2">{l}</div>
                  <div className="text-[10.5px] text-text-3">{s}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-text-3">Unit tests cover the cleaning rules on hand-built fixtures, the KPI selectors, the emissions model (including edge cases and input validation) and the synthetic flow generator. TypeScript runs in strict mode.</p>
          </Card>
          <Card title="Reproduce the analysis" subtitle="About two minutes on a laptop; no accounts or keys.">
            <pre className="overflow-x-auto rounded-lg border border-line bg-black/30 p-3 font-mono text-[11.5px] leading-relaxed text-text">{`git clone <repo> && cd open-mobility-intelligence-lab
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt
python pipeline/download.py        # official files + SHA-256
python pipeline/run_pipeline.py    # clean, aggregate, validate, export
pytest pipeline/tests
cd web && npm ci && npm test && npm run dev`}</pre>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-s1 px-3.5 py-2 text-[12.5px] font-medium text-white hover:brightness-110">View the source on GitHub <span aria-hidden="true">→</span></a>
          </Card>
        </div>

        <Card title="Technical limits" subtitle="What this project does not show." className="xl:col-span-2">
          <ul className="grid list-disc grid-cols-1 gap-x-10 gap-y-2 pl-4 text-[12.5px] leading-relaxed text-text-2 md:grid-cols-2">
            {LIMITS.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[11.5px] text-text-3">Built from {int(q.rawRows)} public trip records. Open-source stack; total running cost NT$0.</p>
        </Card>
      </div>
    </>
  )
}
