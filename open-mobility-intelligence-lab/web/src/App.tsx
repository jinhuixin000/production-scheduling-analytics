import { lazy, Suspense, useEffect, useState } from 'react'
import { loadData, type AppData } from './lib/data'
import type { Filter } from './lib/types'
import { Spinner } from './components/ui'

const Explorer = lazy(() => import('./modules/Explorer'))
const Analytics = lazy(() => import('./modules/Analytics'))
const Simulation = lazy(() => import('./modules/Simulation'))
const DataEngineering = lazy(() => import('./modules/DataEngineering'))
const BehindModel = lazy(() => import('./modules/BehindModel'))

const TABS = [
  { id: 'explorer', label: '3D Explorer' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'simulation', label: 'What-if' },
  { id: 'data', label: 'Data Engineering' },
  { id: 'model', label: 'Behind the Model' },
] as const
type TabId = (typeof TABS)[number]['id']

export const REPO_URL = 'https://github.com/jinhuixin000/production-scheduling-analytics/tree/main/open-mobility-intelligence-lab'

const tabFromHash = (): TabId => {
  const h = window.location.hash.replace(/^#\/?/, '')
  return (TABS.find((t) => t.id === h)?.id ?? 'explorer') as TabId
}

export interface ModuleProps { data: AppData; filter: Filter; setFilter: (f: Filter) => void; go: (t: TabId) => void }

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash)
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  // One filter shared by the map and the dashboard, so both always describe the same slice.
  const [filter, setFilter] = useState<Filter>({ dayType: 0, hour: -1 })

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    setError(null)
    loadData().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [attempt])

  const go = (t: TabId) => { window.location.hash = `/${t}` }
  const props = data ? { data, filter, setFilter, go } : null
  const immersive = tab === 'explorer'

  return (
    <div className={`flex h-full flex-col ${immersive ? '' : 'page-bg'}`}>
      <nav className={`z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 lg:px-6 ${immersive ? 'absolute inset-x-0 top-0 bg-ink-950/55 backdrop-blur-xl' : 'bg-ink-950/80 backdrop-blur-xl'}`}>
        <a href="#/explorer" className="flex shrink-0 items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#0f1b33" stroke="rgba(148,170,210,.3)" />
            <path d="M7 22 L13 10 L19 18 L25 8" stroke="#5cc8ff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden text-[13.5px] font-semibold tracking-tight text-text sm:block">Open Mobility Intelligence Lab</span>
        </a>
        <div className="mx-auto flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-xl border border-line bg-black/25 p-1" role="tablist" aria-label="Modules">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${tab === t.id ? 'bg-white/10 text-text' : 'text-text-3 hover:text-text-2'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-text-2 hover:text-text md:flex">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          Source
        </a>
      </nav>

      <main className={`relative min-h-0 flex-1 ${immersive ? '' : 'overflow-y-auto'}`}>
        {error ? (
          <div className="grid h-full place-items-center p-6">
            <div className="card max-w-md p-6 text-center">
              <h2 className="text-base font-semibold">The data files could not be loaded</h2>
              <p className="mt-2 text-sm text-text-2">{error}</p>
              <button onClick={() => setAttempt((a) => a + 1)} className="mt-4 rounded-lg bg-s1 px-4 py-2 text-sm font-medium text-white cursor-pointer">Try again</button>
            </div>
          </div>
        ) : !props ? (
          <Spinner label="Loading pre-aggregated trip data…" />
        ) : (
          <Suspense fallback={<Spinner label="Loading module…" />}>
            {tab === 'explorer' && <Explorer {...props} />}
            {tab !== 'explorer' && (
              <div key={tab} className="fade-in mx-auto w-full max-w-[1320px] px-4 pb-16 pt-8 lg:px-8">
                {tab === 'analytics' && <Analytics {...props} />}
                {tab === 'simulation' && <Simulation {...props} />}
                {tab === 'data' && <DataEngineering {...props} />}
                {tab === 'model' && <BehindModel {...props} />}
              </div>
            )}
          </Suspense>
        )}
      </main>
    </div>
  )
}
