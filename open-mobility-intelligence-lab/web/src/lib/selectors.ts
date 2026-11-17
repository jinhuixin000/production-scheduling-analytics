/**
 * Pure selectors over the pre-aggregated files. Every number on screen is produced
 * here from additive measures (counts and sums), so each KPI is traceable to a formula.
 */
import type { DayType, Filter, Hour, Kpis, Metric, OdFile, OdFlow, Summary, ZonesFile } from './types'

export const MAX_ZONE_ID = 263

export function daysIn(summary: Pick<Summary, 'days'>, dayType: DayType): number {
  if (dayType === 1) return summary.days.weekday
  if (dayType === 2) return summary.days.weekend
  return summary.days.weekday + summary.days.weekend
}

const matches = (rowDay: number, rowHour: number, f: Filter) =>
  (f.dayType === 0 || rowDay === f.dayType) && (f.hour === -1 || rowHour === f.hour)

/** KPIs = ratios of sums over the cube cells selected by the filter. */
export function kpisFor(summary: Summary, f: Filter): Kpis {
  let trips = 0, distanceMi = 0, fareUsd = 0, durationMin = 0
  for (const c of summary.cube) {
    if (!matches(c[0], c[1], f)) continue
    trips += c[2]; distanceMi += c[3]; fareUsd += c[4]; durationMin += c[6]
  }
  const days = daysIn(summary, f.dayType)
  return {
    trips, distanceMi, fareUsd, days,
    avgDistanceMi: trips ? distanceMi / trips : 0,
    avgFareUsd: trips ? fareUsd / trips : 0,
    avgDurationMin: trips ? durationMin / trips : 0,
    avgSpeedMph: durationMin ? distanceMi / (durationMin / 60) : 0,
    tripsPerDay: days ? trips / days : 0,
  }
}

/** Average trips per calendar day for each pickup hour (24 values). */
export function hourlyDemand(summary: Summary, dayType: DayType): number[] {
  const out = new Array<number>(24).fill(0)
  for (const c of summary.cube) if (dayType === 0 || c[0] === dayType) out[c[1]] += c[2]
  const days = daysIn(summary, dayType)
  return out.map((v) => v / days)
}

export function peakHour(hourly: number[]): number {
  let best = 0
  hourly.forEach((v, h) => { if (v > hourly[best]) best = h })
  return best
}

/** Trip-distance histogram: counts per 1-mile bin, last bin is "max+". */
export function distanceHistogram(summary: Summary, f: Filter): number[] {
  const out = new Array<number>(summary.distHistMaxBin + 1).fill(0)
  for (const r of summary.distHist) if (matches(r[0], r[1], f)) out[r[2]] += r[3]
  return out
}

/**
 * Dense zone-demand index: value[metric][dayType][hour + 1][zoneId].
 * hour slot 0 holds the all-day total; dayType 0 holds weekday + weekend.
 */
export interface ZoneIndex { pickups: Float64Array; dropoffs: Float64Array }
const Z = MAX_ZONE_ID + 1
const slot = (dayType: number, hour: Hour, zone: number) => (dayType * 25 + (hour + 1)) * Z + zone

export function buildZoneIndex(file: Pick<ZonesFile, 'zoneHour'>): ZoneIndex {
  const pickups = new Float64Array(3 * 25 * Z)
  const dropoffs = new Float64Array(3 * 25 * Z)
  for (const [zone, day, hour, pu, dof] of file.zoneHour) {
    for (const d of [0, day]) for (const h of [-1, hour]) {
      pickups[slot(d, h, zone)] += pu
      dropoffs[slot(d, h, zone)] += dof
    }
  }
  return { pickups, dropoffs }
}

export const zoneValue = (idx: ZoneIndex, metric: Metric, f: Filter, zone: number) =>
  idx[metric][slot(f.dayType, f.hour, zone)]

/** Largest single-zone value across all 24 hours — a stable scale for timeline playback. */
export function zoneScaleMax(idx: ZoneIndex, metric: Metric, f: Filter): number {
  const arr = idx[metric]
  let max = 0
  const hours = f.hour === -1 ? [-1] : Array.from({ length: 24 }, (_, h) => h)
  for (const h of hours) for (let z = 1; z < Z; z++) max = Math.max(max, arr[slot(f.dayType, h, z)])
  return max
}

export function topZones(idx: ZoneIndex, metric: Metric, f: Filter, n: number): { zone: number; value: number }[] {
  const all = []
  for (let z = 1; z < Z; z++) all.push({ zone: z, value: zoneValue(idx, metric, f, z) })
  return all.sort((a, b) => b.value - a.value || a.zone - b.zone).slice(0, n)
}

export function zoneHourly(idx: ZoneIndex, metric: Metric, dayType: DayType, zone: number): number[] {
  return Array.from({ length: 24 }, (_, h) => idx[metric][slot(dayType, h, zone)])
}

/** OD slices are pre-ranked in SQL per (dayType, hour); this is a lookup, not an aggregation. */
export function buildOdIndex(file: OdFile): Map<string, OdFlow[]> {
  const m = new Map<string, OdFlow[]>()
  for (const r of file.rows) {
    const key = `${r[0]}|${r[1]}`
    let list = m.get(key)
    if (!list) m.set(key, (list = []))
    list.push({ pu: r[2], do: r[3], trips: r[4], avgDistanceMi: r[5], avgFareUsd: r[6], avgDurationMin: r[7] })
  }
  return m
}

export const odFlows = (idx: Map<string, OdFlow[]>, f: Filter): OdFlow[] => idx.get(`${f.dayType}|${f.hour}`) ?? []
