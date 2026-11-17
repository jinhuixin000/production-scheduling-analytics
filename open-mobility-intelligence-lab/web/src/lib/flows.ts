/**
 * SYNTHETIC visual layer. TLC publishes pickup and drop-off ZONES only — no GPS traces.
 * To animate flows we draw particles on a smooth arc between zone label points; the number
 * of particles per OD pair is proportional to the OBSERVED trip count. The paths themselves
 * are illustrative and are never presented as real vehicle trajectories.
 */
import type { OdFlow } from './types'

export interface FlowParticle { path: [number, number, number][]; timestamps: number[]; weight: number }

export const LOOP_LENGTH = 100
const SEGMENTS = 24

/** Deterministic pseudo-random in [0,1) so the animation is identical on every load. */
export function hash01(a: number, b: number, c: number): number {
  let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function buildParticles(
  flows: OdFlow[],
  centroid: (zone: number) => [number, number] | undefined,
  maxPerFlow = 5,
): FlowParticle[] {
  const top = flows.reduce((m, f) => Math.max(m, f.trips), 0)
  const out: FlowParticle[] = []
  if (!top) return out
  for (const f of flows) {
    if (f.pu === f.do) continue
    const a = centroid(f.pu), b = centroid(f.do)
    if (!a || !b) continue
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const distDeg = Math.hypot(dx, dy)
    const peak = Math.min(1400, 200 + distDeg * 9000) // arc apex in metres
    const path: [number, number, number][] = []
    for (let s = 0; s <= SEGMENTS; s++) {
      const t = s / SEGMENTS
      path.push([a[0] + dx * t, a[1] + dy * t, Math.sin(Math.PI * t) * peak])
    }
    const share = f.trips / top
    const n = Math.max(1, Math.round(share * maxPerFlow))
    const travel = 18 + Math.min(30, distDeg * 260) // longer hops take longer
    for (let k = 0; k < n; k++) {
      const start = hash01(f.pu, f.do, k) * (LOOP_LENGTH - travel) // whole hop fits inside one loop
      out.push({ path, timestamps: path.map((_, s) => start + (s / SEGMENTS) * travel), weight: share })
    }
  }
  return out
}
