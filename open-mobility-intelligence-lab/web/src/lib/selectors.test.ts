import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildOdIndex, buildZoneIndex, daysIn, distanceHistogram, hourlyDemand, kpisFor, odFlows, peakHour, topZones, zoneHourly, zoneScaleMax, zoneValue } from './selectors'
import type { OdFile, QualityFile, Summary, ZonesFile } from './types'

// ---- hand-built fixture: answers are known by inspection ------------------------------
const fixture: Summary = {
  month: '2000-01', generatedUtc: '', days: { weekday: 2, weekend: 1 }, kpis: {},
  cube: [
    // dayType, hour, trips, distance, fare, total, durationMin, passengers, passengerRows
    [1, 8, 10, 30, 200, 250, 150, 12, 10],
    [1, 9, 30, 60, 300, 360, 300, 30, 30],
    [2, 8, 20, 100, 500, 600, 400, 40, 20],
  ],
  daily: [], dowHour: [], distHistMaxBin: 3,
  distHist: [[1, 8, 0, 4], [1, 8, 3, 6], [1, 9, 1, 30], [2, 8, 3, 20]],
}

describe('KPI selectors (fixture)', () => {
  it('sums the whole cube with no filter', () => {
    const k = kpisFor(fixture, { dayType: 0, hour: -1 })
    expect(k.trips).toBe(60)
    expect(k.distanceMi).toBe(190)
    expect(k.avgDistanceMi).toBeCloseTo(190 / 60, 12)
    expect(k.avgFareUsd).toBeCloseTo(1000 / 60, 12)
    expect(k.days).toBe(3)
    expect(k.tripsPerDay).toBe(20)
  })
  it('uses ratio of sums, not a mean of cell means', () => {
    const k = kpisFor(fixture, { dayType: 1, hour: -1 })
    expect(k.avgDistanceMi).toBeCloseTo(90 / 40, 12) // not (3 + 2) / 2
    expect(k.avgSpeedMph).toBeCloseTo(90 / (450 / 60), 12)
  })
  it('filters by day type and hour together', () => {
    expect(kpisFor(fixture, { dayType: 2, hour: 8 }).trips).toBe(20)
    expect(kpisFor(fixture, { dayType: 0, hour: 8 }).trips).toBe(30)
  })
  it('returns zeros, not NaN, for an empty slice', () => {
    const k = kpisFor(fixture, { dayType: 2, hour: 9 })
    expect(k.trips).toBe(0)
    expect(k.avgFareUsd).toBe(0)
    expect(k.avgSpeedMph).toBe(0)
  })
  it('hourly demand is per calendar day of the chosen day type', () => {
    expect(hourlyDemand(fixture, 1)[9]).toBe(15)
    expect(hourlyDemand(fixture, 0)[8]).toBe(10)
    expect(peakHour(hourlyDemand(fixture, 1))).toBe(9)
    expect(daysIn(fixture, 2)).toBe(1)
  })
  it('histogram respects the filter and keeps the overflow bin', () => {
    expect(distanceHistogram(fixture, { dayType: 0, hour: -1 })).toEqual([4, 30, 0, 26])
    expect(distanceHistogram(fixture, { dayType: 1, hour: 8 })).toEqual([4, 0, 0, 6])
  })
})

describe('zone and OD indexes (fixture)', () => {
  const idx = buildZoneIndex({ zoneHour: [[5, 1, 8, 10, 1], [5, 2, 8, 4, 0], [7, 1, 9, 3, 12], [5, 1, 9, 2, 2]] })
  it('rolls up all-day and all-day-type totals', () => {
    expect(zoneValue(idx, 'pickups', { dayType: 0, hour: -1 }, 5)).toBe(16)
    expect(zoneValue(idx, 'pickups', { dayType: 1, hour: 8 }, 5)).toBe(10)
    expect(zoneValue(idx, 'pickups', { dayType: 0, hour: 8 }, 5)).toBe(14)
    expect(zoneValue(idx, 'dropoffs', { dayType: 1, hour: -1 }, 7)).toBe(12)
    expect(zoneValue(idx, 'pickups', { dayType: 2, hour: 9 }, 5)).toBe(0)
  })
  it('ranks zones and gives a stable scale across hours', () => {
    expect(topZones(idx, 'pickups', { dayType: 0, hour: -1 }, 2).map((t) => t.zone)).toEqual([5, 7])
    expect(zoneScaleMax(idx, 'pickups', { dayType: 0, hour: 3 })).toBe(14)
    expect(zoneScaleMax(idx, 'pickups', { dayType: 0, hour: -1 })).toBe(16)
    expect(zoneHourly(idx, 'dropoffs', 1, 7)[9]).toBe(12)
  })
  it('looks up pre-ranked OD slices', () => {
    const od = buildOdIndex({ topN: 2, rows: [[0, -1, 1, 2, 9, 1, 2, 3], [0, -1, 2, 1, 5, 1, 2, 3], [1, 8, 1, 2, 4, 1, 2, 3]] })
    expect(odFlows(od, { dayType: 0, hour: -1 }).map((f) => f.trips)).toEqual([9, 5])
    expect(odFlows(od, { dayType: 1, hour: 8 })[0]).toMatchObject({ pu: 1, do: 2, trips: 4 })
    expect(odFlows(od, { dayType: 2, hour: 3 })).toEqual([])
  })
})

// ---- the published data files must agree with each other ------------------------------
const load = <T,>(name: string) => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf8')) as T

describe('published data files', () => {
  const summary = load<Summary>('summary.json')
  const zones = load<ZonesFile>('zones.json')
  const od = load<OdFile>('od.json')
  const quality = load<QualityFile>('quality.json')
  const geo = load<{ features: { properties: { id: number } }[] }>('zones.geojson')
  const all = { dayType: 0 as const, hour: -1 }

  it('front-end KPIs equal the SQL headline KPIs', () => {
    const k = kpisFor(summary, all)
    expect(k.trips).toBe(summary.kpis.total_trips)
    expect(k.trips).toBe(quality.cleanRows)
    expect(k.distanceMi / summary.kpis.total_distance_mi).toBeCloseTo(1, 6)
    expect(k.avgFareUsd).toBeCloseTo(summary.kpis.avg_fare_usd, 3)
    expect(k.avgDistanceMi).toBeCloseTo(summary.kpis.avg_distance_mi, 3)
  })
  it('row conservation: raw = clean + excluded', () => {
    expect(quality.rawRows).toBe(quality.cleanRows + quality.rules.reduce((a, r) => a + r.excluded, 0))
  })
  it('zone pickups and drop-offs both reconcile to total trips', () => {
    const idx = buildZoneIndex(zones)
    let pu = 0, dropoff = 0
    for (const z of zones.zones) { pu += zoneValue(idx, 'pickups', all, z.id); dropoff += zoneValue(idx, 'dropoffs', all, z.id) }
    expect(pu).toBe(quality.cleanRows)
    expect(dropoff).toBe(quality.cleanRows)
    expect(zones.zones.reduce((a, z) => a + z.pickups, 0)).toBe(quality.cleanRows)
  })
  it('weekday + weekend slices add up to the all-days slice', () => {
    expect(kpisFor(summary, { dayType: 1, hour: -1 }).trips + kpisFor(summary, { dayType: 2, hour: -1 }).trips).toBe(quality.cleanRows)
    expect(summary.days.weekday + summary.days.weekend).toBe(summary.daily.length)
  })
  it('histogram and daily series reconcile', () => {
    expect(distanceHistogram(summary, all).reduce((a, b) => a + b, 0)).toBe(quality.cleanRows)
    expect(summary.daily.reduce((a, d) => a + d[2], 0)).toBe(quality.cleanRows)
  })
  it('every zone has a polygon and every OD endpoint is a known zone', () => {
    const ids = new Set(geo.features.map((f) => f.properties.id))
    expect(ids.size).toBe(263)
    for (const z of zones.zones) expect(ids.has(z.id)).toBe(true)
    for (const r of od.rows) { expect(ids.has(r[2])).toBe(true); expect(ids.has(r[3])).toBe(true) }
  })
  it('OD slices are ranked, capped at topN and never exceed the slice total', () => {
    const idx = buildOdIndex(od)
    for (const [key, list] of idx) {
      expect(list.length).toBeLessThanOrEqual(od.topN)
      for (let i = 1; i < list.length; i++) expect(list[i - 1].trips).toBeGreaterThanOrEqual(list[i].trips)
      const [d, h] = key.split('|').map(Number)
      expect(list.reduce((a, f) => a + f.trips, 0)).toBeLessThanOrEqual(kpisFor(summary, { dayType: d as 0 | 1 | 2, hour: h }).trips)
    }
    expect(idx.size).toBe(3 * 25)
  })
  it('all pipeline validation checks passed', () => {
    expect(quality.checks.length).toBeGreaterThanOrEqual(18)
    expect(quality.checks.every((c) => c.pass)).toBe(true)
  })
})
