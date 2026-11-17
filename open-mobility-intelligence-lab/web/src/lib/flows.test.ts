import { describe, expect, it } from 'vitest'
import { buildParticles, hash01, LOOP_LENGTH } from './flows'
import { highlightSql } from '../components/Sql'
import { compact, hourRange, pct } from './format'

const centroid = (z: number): [number, number] | undefined => ({ 1: [-74, 40.7], 2: [-73.9, 40.8], 3: [-73.8, 40.65] } as Record<number, [number, number]>)[z]
const flow = (pu: number, d: number, trips: number) => ({ pu, do: d, trips, avgDistanceMi: 1, avgFareUsd: 1, avgDurationMin: 1 })

describe('synthetic flow particles', () => {
  it('is deterministic', () => {
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3))
    expect(buildParticles([flow(1, 2, 10)], centroid)).toEqual(buildParticles([flow(1, 2, 10)], centroid))
  })
  it('allocates particles in proportion to observed volume', () => {
    const p = buildParticles([flow(1, 2, 100), flow(2, 3, 20)], centroid, 5)
    expect(p.filter((x) => x.weight === 1)).toHaveLength(5)
    expect(p.filter((x) => x.weight === 0.2)).toHaveLength(1)
  })
  it('starts and ends on the zone label points at ground level', () => {
    const [p] = buildParticles([flow(1, 2, 10)], centroid)
    expect(p.path[0]).toEqual([-74, 40.7, 0])
    const last = p.path[p.path.length - 1]
    expect(last[0]).toBeCloseTo(-73.9, 9)
    expect(last[2]).toBeCloseTo(0, 6)
    expect(Math.max(...p.path.map((c) => c[2]))).toBeGreaterThan(100)
  })
  it('keeps every hop inside one animation loop with increasing timestamps', () => {
    for (const p of buildParticles([flow(1, 2, 100), flow(2, 3, 60), flow(3, 1, 30)], centroid)) {
      expect(p.timestamps[0]).toBeGreaterThanOrEqual(0)
      expect(p.timestamps[p.timestamps.length - 1]).toBeLessThanOrEqual(LOOP_LENGTH)
      for (let i = 1; i < p.timestamps.length; i++) expect(p.timestamps[i]).toBeGreaterThan(p.timestamps[i - 1])
    }
  })
  it('skips intra-zone flows, unknown zones and empty input', () => {
    expect(buildParticles([flow(1, 1, 50)], centroid)).toEqual([])
    expect(buildParticles([flow(1, 99, 50)], centroid)).toEqual([])
    expect(buildParticles([], centroid)).toEqual([])
  })
})

describe('formatting and SQL highlighting', () => {
  it('formats compact numbers, percentages and hour ranges', () => {
    expect(compact(3_875_963)).toBe('3.88M')
    expect(compact(12_345)).toBe('12.3K')
    expect(compact(950)).toBe('950')
    expect(pct(0.0525, 2)).toBe('5.25%')
    expect(hourRange(8)).toBe('08:00–08:59')
  })
  it('escapes HTML and marks comments, strings and keywords', () => {
    const html = highlightSql("SELECT a < 1 AS x, 'R01' -- note <b>")
    expect(html).toContain('<span class="k">SELECT</span>')
    expect(html).toContain('a &lt; ')
    expect(html).toContain("<span class=\"s\">'R01'</span>")
    expect(html).toContain('<span class="c">-- note &lt;b&gt;</span>')
  })
})
