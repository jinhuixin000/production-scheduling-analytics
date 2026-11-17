import type { ReactNode } from 'react'

export type Provenance = 'observed' | 'derived' | 'synthetic' | 'estimated'
const PROV: Record<Provenance, { label: string; dot: string; title: string }> = {
  observed: { label: 'Observed', dot: '#2fbf8a', title: 'Counted directly from official NYC TLC trip records' },
  derived: { label: 'Derived', dot: '#5cc8ff', title: 'Computed from observed data (ratios, aggregates, geometry)' },
  synthetic: { label: 'Synthetic', dot: '#c9a0ff', title: 'Generated for illustration — not a measurement' },
  estimated: { label: 'Estimated', dot: '#e0a02a', title: 'Model output that depends on stated assumptions' },
}

/** Every figure in the app carries one of these four labels. Colour is backed by text. */
export function ProvTag({ kind, children }: { kind: Provenance; children?: ReactNode }) {
  const p = PROV[kind]
  return (
    <span title={p.title} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/[0.03] px-2 py-[3px] text-[10.5px] font-medium tracking-wide text-text-2 whitespace-nowrap">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
      {p.label}{children ? <span className="text-text-3">· {children}</span> : null}
    </span>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label, size = 'md' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-black/25 p-0.5">
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={`${size === 'sm' ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-xs'} rounded-md font-medium transition-colors cursor-pointer ${
            o.value === value ? 'bg-s1/90 text-white shadow-[0_1px_8px_rgba(57,135,229,.45)]' : 'text-text-2 hover:text-text'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.04] cursor-pointer">
      <span>
        <span className="block text-[12.5px] font-medium text-text">{label}</span>
        {hint ? <span className="block text-[10.5px] text-text-3">{hint}</span> : null}
      </span>
      <span className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? 'bg-s1' : 'bg-white/15'}`}>
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} />
      </span>
    </button>
  )
}

/** Stat tile: label, hero value, optional context line and a hover formula for traceability. */
export function Stat({ label, value, unit, sub, formula, compact }: {
  label: string; value: string; unit?: string; sub?: ReactNode; formula?: string; compact?: boolean
}) {
  return (
    <div className="group relative min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="eyebrow truncate">{label}</span>
        {formula ? (
          <span tabIndex={0} aria-label={`Formula: ${formula}`} className="peer grid h-3.5 w-3.5 shrink-0 cursor-help place-items-center rounded-full border border-line-strong text-[9px] font-semibold text-text-3 hover:text-accent focus:text-accent">ƒ</span>
        ) : null}
        {formula ? (
          <span role="tooltip" className="pointer-events-none absolute left-0 top-5 z-30 hidden w-64 rounded-lg border border-line-strong bg-ink-800 p-2.5 font-mono text-[11px] leading-relaxed text-text-2 shadow-xl peer-hover:block peer-focus:block">
            {formula}
          </span>
        ) : null}
      </div>
      <div className={`mt-1 flex items-baseline gap-1.5 font-semibold tracking-tight text-text ${compact ? 'text-[22px]' : 'text-[28px]'}`}>
        <span className="tabular-nums">{value}</span>
        {unit ? <span className="text-xs font-medium text-text-3">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11.5px] text-text-3">{sub}</div> : null}
    </div>
  )
}

export function Card({ title, subtitle, right, children, className = '' }: {
  title?: string; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {title ? (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-text">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12px] leading-snug text-text-3">{subtitle}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function PageHeader({ eyebrow, title, lead, right }: { eyebrow: string; title: string; lead: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <div className="eyebrow !text-accent">{eyebrow}</div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-text">{title}</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-2">{lead}</p>
      </div>
      {right}
    </header>
  )
}

/** 24-bar SVG sparkline with a selectable hour; used where a full chart would be overkill. */
export function HourBars({ values, active, onSelect, height = 56, color = '#3987e5' }: {
  values: number[]; active: number; onSelect?: (h: number) => void; height?: number; color?: string
}) {
  const max = Math.max(...values, 1)
  return (
    <svg viewBox={`0 0 240 ${height}`} className="block w-full" role="img" aria-label="Demand by hour of day" preserveAspectRatio="none">
      {values.map((v, h) => {
        const bh = Math.max(1.5, (v / max) * (height - 4))
        const on = active === h
        return (
          <g key={h} onClick={onSelect ? () => onSelect(h) : undefined} className={onSelect ? 'cursor-pointer' : undefined}>
            <rect x={h * 10} y={0} width={10} height={height} fill="transparent" />
            <rect x={h * 10 + 1.5} y={height - bh} width={7} height={bh} rx={1.5}
              fill={on ? '#5cc8ff' : color} opacity={active === -1 || on ? 0.95 : 0.4}>
              <title>{`${String(h).padStart(2, '0')}:00 — ${Math.round(v).toLocaleString('en-US')}`}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-[240px] place-items-center text-text-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
        {label}
      </div>
    </div>
  )
}
