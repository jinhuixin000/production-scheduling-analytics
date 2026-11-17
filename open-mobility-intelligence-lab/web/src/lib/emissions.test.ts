import { describe, expect, it } from 'vitest'
import { CO2_G_PER_GALLON_GASOLINE, EPA_TYPICAL_MPG, efFromMpg, runScenario, sensitivityGrid, tornado, totalVkt, type ScenarioInputs } from './emissions'

const base: ScenarioInputs = {
  loadedDistanceMi: 1_000_000, baselineEmptyShare: 0.4, baselineEfGPerMi: 400,
  distanceImprovement: 0, scenarioEmptyShare: 0.4, scenarioEfGPerMi: 400,
}

describe('emission factor', () => {
  it('reproduces the EPA typical-vehicle figure of about 400 g CO2 per mile', () => {
    expect(efFromMpg(EPA_TYPICAL_MPG)).toBeCloseTo(CO2_G_PER_GALLON_GASOLINE / 22.2, 10)
    expect(Math.round(efFromMpg(EPA_TYPICAL_MPG))).toBe(400)
  })
  it('is zero for a battery-electric fleet (tailpipe scope)', () => expect(efFromMpg(null)).toBe(0))
  it('rejects non-positive fuel economy', () => {
    expect(() => efFromMpg(0)).toThrow(RangeError)
    expect(() => efFromMpg(-5)).toThrow(RangeError)
  })
})

describe('vehicle distance', () => {
  it('adds deadhead: 40% empty share turns 600 loaded miles into 1000', () => expect(totalVkt(600, 0.4)).toBeCloseTo(1000, 9))
  it('equals loaded distance with no empty running', () => expect(totalVkt(123, 0)).toBe(123))
  it('rejects an empty share of 100% or more, and negatives', () => {
    expect(() => totalVkt(1, 1)).toThrow(RangeError)
    expect(() => totalVkt(1, -0.1)).toThrow(RangeError)
    expect(() => totalVkt(-1, 0.2)).toThrow(RangeError)
  })
})

describe('scenario', () => {
  it('matches a hand calculation', () => {
    // 1,000,000 / 0.6 = 1,666,666.67 mi × 400 g = 666.67 t
    const r = runScenario(base)
    expect(r.baselineT).toBeCloseTo(666.6667, 3)
    expect(r.reductionT).toBeCloseTo(0, 9)
    expect(r.reductionPct).toBe(0)
  })
  it('a distance improvement reduces emissions by the same percentage', () => {
    expect(runScenario({ ...base, distanceImprovement: 0.08 }).reductionPct).toBeCloseTo(0.08, 12)
  })
  it('lowering the empty share from 40% to 30% saves 1 − 0.6/0.7', () => {
    expect(runScenario({ ...base, scenarioEmptyShare: 0.3 }).reductionPct).toBeCloseTo(1 - 0.6 / 0.7, 12)
  })
  it('levers combine multiplicatively, not additively', () => {
    const r = runScenario({ ...base, distanceImprovement: 0.1, scenarioEmptyShare: 0.3, scenarioEfGPerMi: 200 })
    expect(1 - r.reductionPct).toBeCloseTo(0.9 * (0.6 / 0.7) * 0.5, 12)
  })
  it('reports an increase as a negative reduction', () => {
    const r = runScenario({ ...base, scenarioEmptyShare: 0.5 })
    expect(r.reductionT).toBeLessThan(0)
    expect(r.reductionPct).toBeCloseTo(1 - 0.6 / 0.5, 12)
  })
  it('scales linearly with loaded distance while the percentage is unchanged', () => {
    const a = runScenario({ ...base, distanceImprovement: 0.1 })
    const b = runScenario({ ...base, loadedDistanceMi: 2_000_000, distanceImprovement: 0.1 })
    expect(b.baselineT).toBeCloseTo(2 * a.baselineT, 9)
    expect(b.reductionPct).toBeCloseTo(a.reductionPct, 12)
  })
  it('handles a zero baseline without dividing by zero', () => {
    expect(runScenario({ ...base, loadedDistanceMi: 0 }).reductionPct).toBe(0)
  })
  it('validates inputs', () => {
    expect(() => runScenario({ ...base, distanceImprovement: 1.2 })).toThrow(RangeError)
    expect(() => runScenario({ ...base, scenarioEfGPerMi: -1 })).toThrow(RangeError)
  })
})

describe('sensitivity', () => {
  const scen = { ...base, distanceImprovement: 0.1, scenarioEmptyShare: 0.3, scenarioEfGPerMi: 300 }
  it('tornado covers all six inputs, sorted by impact', () => {
    const bars = tornado(scen)
    expect(bars).toHaveLength(6)
    const spans = bars.map((b) => Math.abs(b.high - b.low))
    expect([...spans].sort((x, y) => y - x)).toEqual(spans)
  })
  it('tornado end points equal direct model runs', () => {
    const bar = tornado(scen).find((b) => b.key === 'scenarioEfGPerMi')!
    expect(bar.low).toBeCloseTo(runScenario({ ...scen, scenarioEfGPerMi: 240 }).reductionT, 9)
    expect(bar.high).toBeCloseTo(runScenario({ ...scen, scenarioEfGPerMi: 360 }).reductionT, 9)
  })
  it('grid is rows of empty share × columns of improvement and is monotonic', () => {
    const g = sensitivityGrid(base, [0, 0.1, 0.2], [0.5, 0.4, 0.3])
    expect(g).toHaveLength(3)
    expect(g[1][0]).toBeCloseTo(0, 12) // baseline cell
    expect(g[1][2]).toBeGreaterThan(g[1][1]) // more improvement, more reduction
    expect(g[2][0]).toBeGreaterThan(g[1][0]) // lower empty share, more reduction
    expect(g[0][0]).toBeLessThan(0) // higher empty share is worse than baseline
  })
})
