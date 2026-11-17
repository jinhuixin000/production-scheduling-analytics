import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate ES module; let Vite bundle it and hand over the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ArcLayer, ColumnLayer, GeoJsonLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import type { AppData } from '../lib/data'
import type { Filter, Metric, OdFlow } from '../lib/types'
import { daysIn, odFlows, zoneScaleMax, zoneValue } from '../lib/selectors'
import { buildParticles, LOOP_LENGTH, type FlowParticle } from '../lib/flows'

export interface LayerState { buildings: boolean; zones: boolean; columns: boolean; arcs: boolean; particles: boolean }

maplibregl.setWorkerUrl(new URL(workerUrl, document.baseURI).href)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
const HOME = { center: [-73.972, 40.742] as [number, number], zoom: 11.55, pitch: 56, bearing: 22 }
const RAMP: [number, number, number][] = [[16, 32, 60], [23, 56, 106], [34, 96, 173], [57, 135, 229], [124, 196, 255], [214, 240, 255]]
const ORIGIN: [number, number, number] = [92, 200, 255]
const DEST: [number, number, number] = [226, 96, 150]

function ramp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i
  return [0, 1, 2].map((k) => Math.round(RAMP[i][k] + (RAMP[i + 1][k] - RAMP[i][k]) * f)) as [number, number, number]
}

/** Re-tint the OpenFreeMap dark style to the app's navy palette and add extruded buildings. */
function restyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((l) => {
    const layer = structuredClone(l) as typeof l & { paint?: Record<string, unknown> }
    if (layer.type === 'background') layer.paint = { 'background-color': '#070b15' }
    if (layer.id === 'water') layer.paint = { ...layer.paint, 'fill-color': '#0a1930' }
    if (layer.id === 'building') layer.paint = { 'fill-color': '#101a2e', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 13.5, 0.9] }
    if (layer.id.startsWith('landuse') || layer.id.startsWith('landcover')) layer.paint = { ...layer.paint, 'fill-color': '#0a1220', 'fill-opacity': 0.6 }
    if (layer.type === 'line' && layer.id.startsWith('highway')) {
      const major = /motorway|major/.test(layer.id)
      layer.paint = { ...layer.paint, 'line-color': /casing/.test(layer.id) ? '#0a1120' : major ? '#22324f' : '#16223a' }
    }
    if (layer.type === 'symbol') layer.paint = { ...layer.paint, 'text-color': '#7f8da8', 'text-halo-color': '#070b15', 'text-halo-width': 1.2 }
    return layer
  })
  const firstSymbol = layers.findIndex((l) => l.type === 'symbol' && l.id.startsWith('highway_name'))
  layers.splice(firstSymbol < 0 ? layers.length : firstSymbol, 0, {
    id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 12.5,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, '#131e35', 60, '#1c2d4f', 200, '#2a4474', 400, '#3a5c99'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 12.5, 0, 13.5, ['coalesce', ['get', 'render_height'], 8]],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.88,
      'fill-extrusion-vertical-gradient': true,
    },
  } as never)
  return { ...style, layers } as StyleSpecification
}

const FALLBACK_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#070b15' } }] }

export default function MapView({ data, filter, metric, layers, arcCount, selected, onSelect, resetSignal }: {
  data: AppData; filter: Filter; metric: Metric; layers: LayerState; arcCount: number
  selected: number | null; onSelect: (zone: number | null) => void; resetSignal: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const [basemap, setBasemap] = useState<'loading' | 'ok' | 'offline'>('loading')
  const [webglError, setWebglError] = useState(false)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect

  const days = daysIn(data.summary, filter.dayType)
  const scaleMax = useMemo(() => zoneScaleMax(data.zoneIndex, metric, filter.hour === -1 ? filter : { ...filter, hour: 0 }), [data, metric, filter.dayType, filter.hour === -1]) // eslint-disable-line react-hooks/exhaustive-deps
  const flows = useMemo(() => odFlows(data.od, filter).filter((f) => f.pu !== f.do).slice(0, arcCount), [data, filter, arcCount])
  const particles = useMemo(
    () => buildParticles(flows, (z) => data.zoneById.get(z)?.centroid),
    [flows, data],
  )
  const columnData = useMemo(() => data.zones.filter((z) => z.pickups + z.dropoffs > 0), [data])

  // Latest props for the animation loop, which lives outside React's render cycle.
  const live = useRef({ data, filter, metric, layers, selected, flows, particles, columnData, scaleMax, days })
  live.current = { data, filter, metric, layers, selected, flows, particles, columnData, scaleMax, days }

  useEffect(() => {
    let cancelled = false
    let raf = 0
    ;(async () => {
      let style = FALLBACK_STYLE
      let ok = false
      try {
        const res = await fetch(STYLE_URL)
        if (!res.ok) throw new Error(String(res.status))
        style = restyle((await res.json()) as StyleSpecification)
        ok = true
      } catch { /* basemap host unreachable: data layers still render on a plain background */ }
      if (cancelled || !container.current) return
      let m: maplibregl.Map
      try {
        m = new maplibregl.Map({
          container: container.current, style, ...HOME, minZoom: 9, maxZoom: 17, maxPitch: 75,
          maxBounds: [[-75.2, 40.0], [-72.6, 41.4]], attributionControl: false,
        })
      } catch {
        setWebglError(true)
        return
      }
      map.current = m
      // Keep the city clear of the floating panels on wide screens.
      if (window.innerWidth >= 1100) m.setPadding({ left: 330, right: 290, top: 40, bottom: 90 })
      m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Trips: NYC TLC' }), 'bottom-right')
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left')
      setBasemap(ok ? 'ok' : 'offline')

      const ov = new MapboxOverlay({
        interleaved: false,
        layers: [],
        getTooltip: (info) => {
          const { object, layer } = info as { object?: unknown; layer?: { id: string } }
          if (!object || !layer) return null
          const L = live.current
          const style = { background: 'rgba(13,20,36,.96)', color: '#e8edf7', border: '1px solid rgba(148,170,210,.28)', borderRadius: '10px', padding: '8px 10px', fontSize: '12px', lineHeight: '1.5', boxShadow: '0 12px 32px -12px rgba(0,0,0,.8)' }
          if (layer.id === 'od-arcs') {
            const f = object as OdFlow
            const a = L.data.zoneById.get(f.pu)?.name, b = L.data.zoneById.get(f.do)?.name
            return { html: `<b>${a} → ${b}</b><br/>${(f.trips / L.days).toLocaleString('en-US', { maximumFractionDigits: 1 })} trips / day · ${f.avgDistanceMi.toFixed(1)} mi · $${f.avgFareUsd.toFixed(2)} avg fare`, style }
          }
          const id = (object as { id?: number; properties?: { id: number } }).properties?.id ?? (object as { id: number }).id
          const z = L.data.zoneById.get(id)
          if (!z) return null
          const v = zoneValue(L.data.zoneIndex, L.metric, L.filter, id) / L.days
          return { html: `<b>${z.name}</b> <span style="color:#6c7a94">· ${z.borough}</span><br/>${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${L.metric === 'pickups' ? 'pickups' : 'drop-offs'} / day`, style }
        },
      })
      overlay.current = ov
      m.addControl(ov)

      const build = (time: number) => {
        const L = live.current
        const value = (zone: number) => zoneValue(L.data.zoneIndex, L.metric, L.filter, zone)
        const norm = (zone: number) => (L.scaleMax ? value(zone) / L.scaleMax : 0)
        const trigger = `${L.metric}|${L.filter.dayType}|${L.filter.hour}`
        const touches = (f: OdFlow) => L.selected === null || f.pu === L.selected || f.do === L.selected
        const topTrips = L.flows[0]?.trips ?? 1
        return [
          new GeoJsonLayer({
            id: 'zones', data: L.data.geojson as never, visible: L.layers.zones, pickable: true, stroked: true, filled: true,
            getFillColor: (f: { properties: { id: number } }) => {
              const t = Math.sqrt(norm(f.properties.id))
              return [...ramp(t), Math.round(18 + 150 * t)] as [number, number, number, number]
            },
            getLineColor: (f: { properties: { id: number } }) => (f.properties.id === L.selected ? [92, 200, 255, 255] : [130, 160, 210, 46]),
            getLineWidth: (f: { properties: { id: number } }) => (f.properties.id === L.selected ? 3 : 1),
            lineWidthUnits: 'pixels', autoHighlight: true, highlightColor: [92, 200, 255, 50],
            updateTriggers: { getFillColor: trigger, getLineColor: L.selected, getLineWidth: L.selected },
            transitions: { getFillColor: 500 },
            onClick: (info: { object?: { properties: { id: number } } }) => { if (info.object) selectRef.current(info.object.properties.id) },
          } as never),
          new ColumnLayer({
            id: 'demand-columns', data: L.columnData, visible: L.layers.columns, pickable: true, extruded: true,
            diskResolution: 6, radius: 115, elevationScale: 1,
            getPosition: (z: { centroid: [number, number] }) => z.centroid,
            getElevation: (z: { id: number }) => norm(z.id) * 3200,
            getFillColor: (z: { id: number }) => [...ramp(0.25 + 0.75 * Math.sqrt(norm(z.id))), 235] as [number, number, number, number],
            material: { ambient: 0.55, diffuse: 0.6, shininess: 40, specularColor: [120, 180, 255] },
            updateTriggers: { getElevation: trigger, getFillColor: trigger },
            transitions: { getElevation: { duration: 650, easing: (t: number) => 1 - Math.pow(1 - t, 3) }, getFillColor: 500 },
            onClick: (info: { object?: { id: number } }) => { if (info.object) selectRef.current(info.object.id) },
          } as never),
          new ArcLayer({
            id: 'od-arcs', data: L.flows, visible: L.layers.arcs, pickable: true, greatCircle: false,
            getSourcePosition: (f: OdFlow) => L.data.zoneById.get(f.pu)!.centroid,
            getTargetPosition: (f: OdFlow) => L.data.zoneById.get(f.do)!.centroid,
            getSourceColor: (f: OdFlow) => [...ORIGIN, touches(f) ? 200 : 18] as [number, number, number, number],
            getTargetColor: (f: OdFlow) => [...DEST, touches(f) ? 200 : 18] as [number, number, number, number],
            getWidth: (f: OdFlow) => 1 + 5 * Math.sqrt(f.trips / topTrips),
            getHeight: 0.55, widthUnits: 'pixels',
            updateTriggers: { getSourceColor: L.selected, getTargetColor: L.selected },
          } as never),
          new TripsLayer({
            id: 'flow-particles', data: L.particles, visible: L.layers.particles,
            getPath: (p: FlowParticle) => p.path, getTimestamps: (p: FlowParticle) => p.timestamps,
            getColor: [225, 245, 255], getWidth: (p: FlowParticle) => 2 + 2.5 * p.weight,
            widthUnits: 'pixels', widthMinPixels: 2, capRounded: true, jointRounded: true,
            fadeTrail: true, trailLength: 7, currentTime: time % LOOP_LENGTH, opacity: 0.9,
          } as never),
        ]
      }

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const t0 = performance.now()
      const tick = () => {
        ov.setProps({ layers: build(reduced ? 40 : ((performance.now() - t0) / 1000) * 9) })
        raf = requestAnimationFrame(tick)
      }
      tick()
      m.on('click', (e: maplibregl.MapMouseEvent) => {
        // Clicking empty water / outside every zone clears the selection.
        const picked = ov.pickObject({ x: e.point.x, y: e.point.y, radius: 2 })
        if (!picked) selectRef.current(null)
      })
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      overlay.current?.finalize()
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || basemap !== 'ok') return
    const apply = () => { if (m.getLayer('building-3d')) m.setLayoutProperty('building-3d', 'visibility', layers.buildings ? 'visible' : 'none') }
    if (m.isStyleLoaded()) apply(); else m.once('load', apply)
  }, [layers.buildings, basemap])

  useEffect(() => {
    if (resetSignal > 0) map.current?.flyTo({ ...HOME, duration: 1400, essential: true })
  }, [resetSignal])

  useEffect(() => {
    const z = selected === null ? null : data.zoneById.get(selected)
    if (!z || !map.current) return
    const m = map.current
    if (!m.getBounds().contains(z.centroid)) m.flyTo({ center: z.centroid, zoom: Math.max(m.getZoom(), 11.5), duration: 1200, essential: true })
  }, [selected, data])

  return (
    <div className="absolute inset-0">
      {/* inline style: maplibre-gl.css sets position:relative on the container and would win over a utility class */}
      <div ref={container} style={{ position: "absolute", inset: 0 }} />
      {webglError ? (
        <div className="absolute inset-0 grid place-items-center bg-ink-950 p-6 text-center text-sm text-text-2">
          This browser could not start WebGL, which the 3D map needs. The Analytics, What-if and Data pages work without it.
        </div>
      ) : null}
      {basemap === 'offline' ? (
        <div className="glass absolute left-1/2 top-[68px] z-10 -translate-x-1/2 px-3 py-1.5 text-[11.5px] text-text-2">
          Basemap tiles are unreachable — data layers are shown without streets and buildings.
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(4,7,14,.55) 100%)' }} />
    </div>
  )
}
