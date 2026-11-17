import { useState } from 'react'
import type { ModuleProps } from '../App'
import { Card, PageHeader, ProvTag, Stat } from '../components/ui'
import Sql from '../components/Sql'
import { bytes, int, pct } from '../lib/format'

const STEPS = [
  { n: '01', title: 'Acquire', body: 'Download the official Parquet, zone lookup and shapefile; record size and SHA-256.', tool: 'Python' },
  { n: '02', title: 'Profile', body: 'Check schema and types, count NULLs per column, look for duplicates.', tool: 'DuckDB SQL' },
  { n: '03', title: 'Clean', body: 'Flag each row with the first rule it breaks, keep the rest, derive hour, weekday and speed.', tool: 'DuckDB SQL' },
  { n: '04', title: 'Integrate', body: 'Reproject zones from EPSG:2263 to WGS84, simplify shared borders, join the lookup.', tool: 'GeoPandas' },
  { n: '05', title: 'Aggregate', body: 'Build the KPI cube, zone × hour demand and ranked OD flows with GROUPING SETS.', tool: 'DuckDB SQL' },
  { n: '06', title: 'Validate', body: 'Reconcile every aggregate to the cleaned table and recompute totals in NumPy.', tool: 'SQL + NumPy' },
  { n: '07', title: 'Publish', body: 'Write compact JSON so the browser loads thousands of cells, never millions of rows.', tool: 'Static JSON' },
]

export default function DataEngineering({ data }: ModuleProps) {
  const q = data.quality
  const files = Object.keys(q.sql)
  const [file, setFile] = useState(files[1] ?? files[0])
  const maxExcluded = Math.max(...q.rules.map((r) => r.excluded), 1)
  const passed = q.checks.filter((c) => c.pass).length
  const nullCols = q.schema.filter((s) => s.nulls > 0)
  const outBytes = Object.values(q.outputBytes).reduce((a, b) => a + b, 0)
  const rawBytes = q.sources[0]?.bytes ?? 0
  const maxT = Math.max(...q.timings.map((t) => t.seconds), 0.001)

  return (
    <>
      <PageHeader eyebrow="Module 4 · Data Engineering & Validation" title="From 4.09 million raw records to a 1 MB browser payload"
        lead="The pipeline is a set of plain SQL files run by DuckDB from Python. Every exclusion is counted, every aggregate is reconciled, and the whole run is reproducible from the public source files."
        right={<ProvTag kind="derived">pipeline run {q.generatedUtc.slice(0, 10)}</ProvTag>} />

      <div className="card mb-4 grid grid-cols-2 gap-x-6 gap-y-5 p-5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Raw records" value={int(q.rawRows)} sub={`${bytes(rawBytes)} Parquet`} />
        <Stat label="Clean records" value={int(q.cleanRows)} sub={`${pct(q.cleanRows / q.rawRows, 2)} retained`} />
        <Stat label="Excluded" value={int(q.excludedRows)} sub={`${pct(q.excludedRows / q.rawRows, 2)} of raw · ${q.rules.filter((r) => r.excluded > 0).length} rules fired`} />
        <Stat label="Validation checks" value={`${passed} / ${q.checks.length}`} sub={passed === q.checks.length ? 'All passed' : 'Failures present'} />
        <Stat label="Pipeline run time" value={q.totalSeconds.toFixed(1)} unit="s" sub={`DuckDB ${q.environment.duckdb} · Python ${q.environment.python}`} />
        <Stat label="Browser payload" value={bytes(outBytes)} sub={`${Math.round(rawBytes / outBytes)}× smaller than the raw file`} />
      </div>

      <Card title="Pipeline" subtitle="Seven steps, one command: python pipeline/download.py && python pipeline/run_pipeline.py" className="mb-4">
        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-black/20 p-3">
              <div className="flex items-center justify-between"><span className="font-mono text-[11px] text-accent">{s.n}</span><span className="text-[10px] text-text-3">{s.tool}</span></div>
              <div className="mt-1.5 text-[13px] font-semibold">{s.title}</div>
              <p className="mt-1 text-[11.5px] leading-snug text-text-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Anomalous trips removed" subtitle="Rules run in order and each raw row is counted once, under the first rule it breaks. Raw = clean + excluded, exactly.">
          <div className="flex flex-col gap-1.5">
            {q.rules.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_84px] items-center gap-3 text-[12.5px]">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10.5px] text-text-3">{r.id.slice(0, 3)}</span>
                    <span className="truncate text-text-2" title={r.description}>{r.description}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/[0.05]"><div className="h-1.5 rounded-full bg-s1" style={{ width: `${Math.max(r.excluded ? 1 : 0, (r.excluded / maxExcluded) * 100)}%` }} /></div>
                </div>
                <div className="text-right"><div className="tabular-nums text-text">{int(r.excluded)}</div><div className="text-[10.5px] tabular-nums text-text-3">{pct(r.excluded / q.rawRows, 2)}</div></div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Missing values in the raw file" subtitle={`${nullCols.length} of ${q.schema.length} columns contain NULLs. They share one cause: ${int(nullCols[0]?.nulls ?? 0)} records submitted without the optional meter fields. None of these columns feeds a KPI, so the rows are kept.`}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {q.schema.map((s) => (
                <div key={s.column} className="flex items-center justify-between gap-2 border-b border-line py-1 text-[12px]">
                  <span className="truncate font-mono text-[11.5px] text-text-2">{s.column}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] uppercase text-text-3">{s.type}</span>
                    <span className={`w-14 text-right tabular-nums ${s.nulls ? 'text-warn' : 'text-text-3'}`}>{s.nulls ? pct(s.null_pct / 100, 1) : '0'}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Statistical outliers" subtitle="Tukey fences (Q3 + 1.5 × IQR) on the cleaned table. Flagged, not removed: a long airport trip is unusual but real.">
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-text-3">
                {['Metric', 'Median', 'P75', 'P99', 'Upper fence', 'Flagged'].map((h, i) => <th key={h} className={`pb-2 font-semibold ${i ? 'text-right' : ''}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {q.outliers.map((o) => (
                  <tr key={o.metric} className="border-t border-line">
                    <td className="py-1.5 font-mono text-[11.5px] text-text-2">{o.metric}</td>
                    {[o.p50, o.p75, o.p99, o.upper_fence].map((v, i) => <td key={i} className="py-1.5 text-right tabular-nums text-text-2">{v.toFixed(1)}</td>)}
                    <td className="py-1.5 text-right tabular-nums text-text">{int(o.flagged_rows)} <span className="text-text-3">({pct(o.flagged_rows / q.cleanRows, 1)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Validation results" subtitle="Run at the end of every pipeline execution; a failed check stops the export.">
          <ul className="flex flex-col">
            {q.checks.map((c) => (
              <li key={c.id} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-t border-line py-1.5 text-[12.5px] first:border-t-0">
                <span className={`inline-flex items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${c.pass ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>{c.pass ? '✓ Pass' : '✕ Fail'}</span>
                <span className="min-w-0"><span className="text-text">{c.name}</span><span className="block truncate text-[11px] text-text-3" title={c.detail}>{c.detail}</span></span>
                <span className="text-right font-mono text-[11px] tabular-nums text-text-2">{c.actual}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Processing time" subtitle={`Measured on the pipeline run that produced this site (${q.environment.machine}).`}>
            <div className="flex flex-col gap-2">
              {q.timings.filter((t) => t.seconds > 0).map((t) => (
                <div key={t.step} className="grid grid-cols-[1fr_52px] items-center gap-3 text-[12.5px]">
                  <div><div className="text-text-2">{t.step}</div><div className="mt-1 h-1.5 rounded-full bg-white/[0.05]"><div className="h-1.5 rounded-full bg-s1" style={{ width: `${(t.seconds / maxT) * 100}%` }} /></div></div>
                  <div className="text-right tabular-nums text-text">{t.seconds.toFixed(2)} s</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Source files" subtitle="Checksums let anyone confirm they are analysing the same bytes.">
            {q.sources.map((s) => (
              <div key={s.file} className="border-t border-line py-2 text-[12px] first:border-t-0">
                <div className="flex items-baseline justify-between gap-3"><a href={s.url} className="truncate font-medium text-accent underline-offset-2 hover:underline">{s.title}</a><span className="shrink-0 tabular-nums text-text-3">{bytes(s.bytes)}</span></div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-text-3" title={s.sha256}>sha256 {s.sha256}</div>
              </div>
            ))}
          </Card>
          <Card title="Zone geometry" subtitle="GIS processing of the official taxi-zone shapefile.">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
              {[['Source CRS', q.gis.source_crs], ['Target CRS', q.gis.target_crs], ['Zones', q.gis.unique_location_ids], ['Simplification', `${q.gis.simplify_tolerance_ft} ft tolerance`], ['Vertices before', int(Number(q.gis.vertices_before))], ['Vertices after', int(Number(q.gis.vertices_after))]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-2 border-b border-line py-1"><dt className="text-text-3">{k}</dt><dd className="tabular-nums text-text-2">{String(v)}</dd></div>
              ))}
            </dl>
          </Card>
        </div>

        <Card title="The SQL that produced this site" subtitle="These are the exact files the pipeline executed, shipped with the data." className="xl:col-span-2"
          right={<div className="flex flex-wrap gap-1" role="tablist" aria-label="SQL files">
            {files.map((f) => <button key={f} role="tab" aria-selected={f === file} onClick={() => setFile(f)} className={`rounded-md px-2.5 py-1 font-mono text-[11px] cursor-pointer ${f === file ? 'bg-s1/20 text-text' : 'text-text-3 hover:text-text-2'}`}>{f}</button>)}
          </div>}>
          <Sql code={q.sql[file]} />
        </Card>
      </div>
    </>
  )
}
