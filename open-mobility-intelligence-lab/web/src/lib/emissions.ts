/**
 * What-if emissions model (ESTIMATED RESULTS — not measured emissions).
 *
 *   VKT        = loaded distance / (1 − empty share)          total vehicle distance incl. deadhead
 *   EF         = CO2 per gallon / fuel economy                 tailpipe CO2 per mile
 *   Emissions  = VKT × EF
 *
 * Scenario: loaded distance × (1 − improvement), a new empty share and a new fuel economy.
 * Scope: tailpipe CO2 only. No CH4/N2O, no upstream fuel or electricity emissions.
 */

/** U.S. EPA, "Greenhouse Gas Emissions from a Typical Passenger Vehicle": 8,887 g CO2 per gallon of gasoline. */
export const CO2_G_PER_GALLON_GASOLINE = 8887
/** Same EPA source: the average passenger vehicle gets about 22.2 mpg (≈ 400 g CO2/mile). */
export const EPA_TYPICAL_MPG = 22.2
export const KM_PER_MILE = 1.609344

export interface FleetPreset { id: string; label: string; mpg: number | null; note: string }
/** mpg === null means zero tailpipe CO2 (battery electric). */
export const FLEET_PRESETS: FleetPreset[] = [
  { id: 'epa', label: 'Typical gasoline car', mpg: EPA_TYPICAL_MPG, note: 'EPA typical passenger vehicle, 22.2 mpg ≈ 400 g CO₂/mi' },
  { id: 'hybrid', label: 'Hybrid sedan', mpg: 45, note: 'Assumed 45 mpg — illustrative, not a measured fleet value' },
  { id: 'bev', label: 'Battery electric', mpg: null, note: 'Zero tailpipe CO₂; electricity generation is out of scope' },
]

export interface ScenarioInputs {
  /** Revenue (passenger-on-board) distance in miles. */
  loadedDistanceMi: number
  /** Share of total vehicle distance driven without a passenger, 0 ≤ e < 1. */
  baselineEmptyShare: number
  /** Tailpipe emission factor of the baseline fleet, g CO2 per mile. */
  baselineEfGPerMi: number
  /** Fractional reduction of loaded distance (routing / pooling), 0–1. */
  distanceImprovement: number
  scenarioEmptyShare: number
  scenarioEfGPerMi: number
}

export interface ScenarioResult {
  baselineVktMi: number
  scenarioVktMi: number
  baselineT: number
  scenarioT: number
  reductionT: number
  /** Fraction of baseline emissions avoided (negative when the scenario is worse). */
  reductionPct: number
}

export function efFromMpg(mpg: number | null): number {
  if (mpg === null) return 0
  if (!(mpg > 0)) throw new RangeError('fuel economy must be positive')
  return CO2_G_PER_GALLON_GASOLINE / mpg
}

export function totalVkt(loadedMi: number, emptyShare: number): number {
  if (!(emptyShare >= 0 && emptyShare < 1)) throw new RangeError('empty share must be in [0, 1)')
  if (loadedMi < 0) throw new RangeError('distance must be non-negative')
  return loadedMi / (1 - emptyShare)
}

/** grams → metric tonnes */
export const tonnes = (vktMi: number, efGPerMi: number) => (vktMi * efGPerMi) / 1e6

export function runScenario(i: ScenarioInputs): ScenarioResult {
  if (!(i.distanceImprovement >= 0 && i.distanceImprovement <= 1)) throw new RangeError('improvement must be in [0, 1]')
  if (i.baselineEfGPerMi < 0 || i.scenarioEfGPerMi < 0) throw new RangeError('emission factor must be non-negative')
  const baselineVktMi = totalVkt(i.loadedDistanceMi, i.baselineEmptyShare)
  const scenarioVktMi = totalVkt(i.loadedDistanceMi * (1 - i.distanceImprovement), i.scenarioEmptyShare)
  const baselineT = tonnes(baselineVktMi, i.baselineEfGPerMi)
  const scenarioT = tonnes(scenarioVktMi, i.scenarioEfGPerMi)
  const reductionT = baselineT - scenarioT
  return { baselineVktMi, scenarioVktMi, baselineT, scenarioT, reductionT, reductionPct: baselineT > 0 ? reductionT / baselineT : 0 }
}

export interface TornadoBar { key: keyof ScenarioInputs; label: string; low: number; high: number; lowInput: number; highInput: number }

const LABELS: Record<keyof ScenarioInputs, string> = {
  loadedDistanceMi: 'Loaded distance',
  baselineEmptyShare: 'Baseline empty share',
  baselineEfGPerMi: 'Baseline emission factor',
  distanceImprovement: 'Distance improvement',
  scenarioEmptyShare: 'Scenario empty share',
  scenarioEfGPerMi: 'Scenario emission factor',
}
const clampInput = (key: keyof ScenarioInputs, v: number) =>
  key === 'baselineEmptyShare' || key === 'scenarioEmptyShare' ? Math.min(0.95, Math.max(0, v))
    : key === 'distanceImprovement' ? Math.min(1, Math.max(0, v)) : Math.max(0, v)

/**
 * One-at-a-time sensitivity: move each input ±swing (relative) with the others fixed
 * and record the absolute reduction (t CO2). Sorted by impact, largest first.
 */
export function tornado(inputs: ScenarioInputs, swing = 0.2): TornadoBar[] {
  const keys = Object.keys(LABELS) as (keyof ScenarioInputs)[]
  return keys
    .map((key) => {
      const lowInput = clampInput(key, inputs[key] * (1 - swing))
      const highInput = clampInput(key, inputs[key] * (1 + swing))
      return {
        key, label: LABELS[key], lowInput, highInput,
        low: runScenario({ ...inputs, [key]: lowInput }).reductionT,
        high: runScenario({ ...inputs, [key]: highInput }).reductionT,
      }
    })
    .sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low))
}

/** Two-way sensitivity grid of reduction % over distance improvement × scenario empty share. */
export function sensitivityGrid(inputs: ScenarioInputs, improvements: number[], emptyShares: number[]): number[][] {
  return emptyShares.map((e) =>
    improvements.map((p) => runScenario({ ...inputs, distanceImprovement: p, scenarioEmptyShare: e }).reductionPct),
  )
}
