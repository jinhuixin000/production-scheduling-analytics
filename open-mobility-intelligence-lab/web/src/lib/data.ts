import { buildOdIndex, buildZoneIndex, type ZoneIndex } from './selectors'
import type { OdFile, OdFlow, QualityFile, Summary, Zone, ZonesFile } from './types'

export interface AppData {
  summary: Summary
  zones: Zone[]
  zoneById: Map<number, Zone>
  zoneIndex: ZoneIndex
  links: ZonesFile['links']
  od: Map<string, OdFlow[]>
  odTopN: number
  geojson: GeoJSON.FeatureCollection
  quality: QualityFile
}

async function getJson<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!res.ok) throw new Error(`Failed to load ${name} (HTTP ${res.status})`)
  return (await res.json()) as T
}

let cache: Promise<AppData> | null = null

/** Loads ~1 MB of pre-aggregated JSON (≈250 KB gzipped) once and builds lookup indexes. */
export function loadData(): Promise<AppData> {
  cache ??= (async () => {
    const [summary, zonesFile, odFile, geojson, quality] = await Promise.all([
      getJson<Summary>('summary.json'),
      getJson<ZonesFile>('zones.json'),
      getJson<OdFile>('od.json'),
      getJson<GeoJSON.FeatureCollection>('zones.geojson'),
      getJson<QualityFile>('quality.json'),
    ])
    return {
      summary,
      zones: zonesFile.zones,
      zoneById: new Map(zonesFile.zones.map((z) => [z.id, z])),
      zoneIndex: buildZoneIndex(zonesFile),
      links: zonesFile.links,
      od: buildOdIndex(odFile),
      odTopN: odFile.topN,
      geojson,
      quality,
    }
  })()
  cache.catch(() => { cache = null })
  return cache
}
