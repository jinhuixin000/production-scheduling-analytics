/** 0 = all days, 1 = weekday (Mon–Fri), 2 = weekend. */
export type DayType = 0 | 1 | 2
/** -1 = all hours, otherwise the pickup hour 0–23 (local NYC time). */
export type Hour = number
export type Metric = 'pickups' | 'dropoffs'
export interface Filter { dayType: DayType; hour: Hour }

export interface Summary {
  month: string
  generatedUtc: string
  days: { weekday: number; weekend: number }
  kpis: Record<string, number>
  /** [dayType(1|2), hour, trips, distanceMi, fareUsd, totalUsd, durationMin, passengers, passengerRows] */
  cube: number[][]
  /** [date, isoDow, trips, distanceMi, fareUsd] */
  daily: [string, number, number, number, number][]
  /** [isoDow, hour, trips, days] */
  dowHour: number[][]
  distHistMaxBin: number
  /** [dayType, hour, binMi, trips] */
  distHist: number[][]
}

export interface Zone {
  id: number
  name: string
  borough: string
  serviceZone: string
  centroid: [number, number]
  areaSqMi: number
  pickups: number
  dropoffs: number
  avgDistanceMi: number | null
  avgFareUsd: number | null
  avgDurationMin: number | null
  avgSpeedMph: number | null
}

export interface ZonesFile {
  zones: Zone[]
  /** [zoneId, dayType(1|2), hour, pickups, dropoffs] */
  zoneHour: number[][]
  links: { out: Record<string, [number, number][]>; in: Record<string, [number, number][]> }
}

export interface OdFile {
  topN: number
  /** [dayType(0|1|2), hour(-1..23), puZone, doZone, trips, avgDistanceMi, avgFareUsd, avgDurationMin] */
  rows: number[][]
}

export interface QualityFile {
  month: string
  generatedUtc: string
  sources: { title: string; url: string; file: string; bytes: number; sha256: string; retrieved_utc: string }[]
  landingPage: string
  environment: { python: string; duckdb: string; machine: string }
  rawRows: number
  cleanRows: number
  excludedRows: number
  rawSummary: Record<string, string>
  duplicateRows: number
  schema: { column: string; type: string; nulls: number; null_pct: number }[]
  thresholds: Record<string, number>
  rules: { id: string; description: string; excluded: number }[]
  outliers: { metric: string; p25: number; p50: number; p75: number; p99: number; upper_fence: number; flagged_rows: number }[]
  gis: Record<string, string | number>
  checks: { id: string; name: string; detail: string; expected: string; actual: string; pass: boolean }[]
  timings: { step: string; seconds: number }[]
  totalSeconds: number
  outputBytes: Record<string, number>
  sql: Record<string, string>
}

export interface OdFlow {
  pu: number; do: number; trips: number
  avgDistanceMi: number; avgFareUsd: number; avgDurationMin: number
}

export interface Kpis {
  trips: number
  distanceMi: number
  fareUsd: number
  avgDistanceMi: number
  avgFareUsd: number
  avgDurationMin: number
  avgSpeedMph: number
  /** number of calendar days the filter covers */
  days: number
  tripsPerDay: number
}
