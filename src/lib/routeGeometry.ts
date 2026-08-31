import { Point, PlayerRoute, RouteSegment } from '../types'

/** Converts a Point[] into the flat number[] Konva.Line expects. */
export function toKonvaPoints(points: Point[]): number[] {
  const flat: number[] = []
  for (const p of points) flat.push(p.x, p.y)
  return flat
}

/**
 * Offsets a freehand polyline perpendicular to its local direction by
 * `distance`, used to draw the two parallel strokes of a 'dribble' line.
 * Each vertex's normal is estimated from its neighbors, which keeps the
 * offset line roughly parallel even through curves/jitter in a hand-drawn
 * path — a true parallel curve isn't necessary here, just a convincing one.
 */
export function offsetPolyline(points: Point[], distance: number): Point[] {
  if (points.length < 2) return points
  return points.map((p, i) => {
    const prev = points[Math.max(i - 1, 0)]
    const next = points[Math.min(i + 1, points.length - 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    return { x: p.x + nx * distance, y: p.y + ny * distance }
  })
}

/** Direction (unit vector) at the END of a freehand path, for arrowheads/caps. */
export function endDirection(points: Point[]): { x: number; y: number } {
  if (points.length < 2) return { x: 1, y: 0 }
  // Look a few points back rather than just the last two, so a shaky
  // final pixel of the drag doesn't skew the arrow's angle.
  const lookback = Math.min(4, points.length - 1)
  const from = points[points.length - 1 - lookback]
  const to = points[points.length - 1]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/**
 * A filled triangle's points for a hand-drawn arrowhead at the end of a
 * path. Drawn as a standalone shape (rather than Konva's built-in Arrow)
 * so it works the same way whether the line under it is single, double,
 * or dotted.
 */
export function arrowHeadPoints(points: Point[], size = 11): number[] {
  const tip = points[points.length - 1]
  const dir = endDirection(points)
  const nx = -dir.y
  const ny = dir.x
  const backX = tip.x - dir.x * size
  const backY = tip.y - dir.y * size
  const spread = size * 0.55
  return [
    tip.x, tip.y,
    backX + nx * spread, backY + ny * spread,
    backX - nx * spread, backY - ny * spread,
  ]
}

/** The flat T-cap points for a 'screen' segment's end, perpendicular to its direction. */
export function screenCapPoints(points: Point[]): number[] {
  const end = points[points.length - 1]
  const dir = endDirection(points)
  const nx = -dir.y
  const ny = dir.x
  const half = 9
  return [end.x - nx * half, end.y - ny * half, end.x + nx * half, end.y + ny * half]
}

/** Total length of a Point[] path — used to tell a real drag from an accidental tap. */
export function pathLength(points: Point[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }
  return len
}

/**
 * Concatenates a route's segments into one continuous point path, for
 * animation playback. Line-type styling doesn't matter here — only motion
 * along the path does.
 */
export function flattenRoute(startPoint: Point, segments: RouteSegment[]): Point[] {
  const flat: Point[] = [startPoint]
  for (const seg of segments) {
    flat.push(...seg.points)
  }
  return flat
}

/** Position along a flattened path at fraction t (0-1), for animation playback. */
export function pointAtFraction(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  const total = pathLength(points)
  if (total === 0) return points[0]

  const target = total * Math.min(Math.max(t, 0), 1)
  let covered = 0

  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (covered + segLen >= target) {
      const segT = segLen === 0 ? 0 : (target - covered) / segLen
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * segT,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * segT,
      }
    }
    covered += segLen
  }
  return points[points.length - 1]
}

/**
 * Turns a path into a sine wave running along it — the "carrying the ball"
 * style. The path is first resampled at even arc-length steps: applying the
 * sine straight to a freehand polyline (whose points sit a variable ~4 units
 * apart) gives noise rather than a wave, because phase would advance by point
 * index instead of by distance travelled.
 *
 * The wave is faded in and out over the first and last wavelength so the line
 * still meets the player token and the arrowhead cleanly.
 */
export function squigglePoints(points: Point[], amplitude = 4, wavelength = 16): Point[] {
  const total = pathLength(points)
  if (points.length < 2 || total < wavelength) return points

  const STEP = 3 // court units between resampled points — smooth enough at any zoom
  const count = Math.max(2, Math.round(total / STEP))
  const out: Point[] = []

  for (let i = 0; i <= count; i++) {
    const dist = (total * i) / count
    const here = pointAtFraction(points, dist / total)
    // Tangent from a short lookahead/lookbehind, so the normal follows curves.
    const ahead = pointAtFraction(points, Math.min(dist + STEP, total) / total)
    const behind = pointAtFraction(points, Math.max(dist - STEP, 0) / total)
    const tx = ahead.x - behind.x
    const ty = ahead.y - behind.y
    const len = Math.hypot(tx, ty) || 1

    // Taper the amplitude near both ends of the stroke.
    const fade = Math.min(1, dist / wavelength, (total - dist) / wavelength)
    const offset = Math.sin((dist / wavelength) * Math.PI * 2) * amplitude * fade

    out.push({ x: here.x + (-ty / len) * offset, y: here.y + (tx / len) * offset })
  }
  return out
}

/**
 * Hard cap on how many lines are *kept in state*. Well above the largest
 * visible-lines setting (see `lib/settingsStore`) so nothing a coach might want back is thrown away
 * eagerly, but low enough that a long session can't grow the play forever.
 */
export const MAX_STORED_LINES = 30

/**
 * The lowest `seq` still worth keeping, so only the `limit` most recent lines
 * survive. Player route segments and ball transfers are stamped from the same
 * counter in `usePlayEditor`, so they rank together — "most recent" is global
 * across the whole play, not per player.
 *
 * Returns -Infinity when there are fewer than `limit` lines, i.e. keep them all.
 */
export function lineSeqFloor(
  routes: PlayerRoute[],
  ballTransfers: { seq: number }[],
  limit: number,
): number {
  const seqs: number[] = []
  for (const route of routes) for (const segment of route.segments) seqs.push(segment.seq)
  for (const transfer of ballTransfers) seqs.push(transfer.seq)
  if (seqs.length <= limit) return -Infinity
  seqs.sort((a, b) => b - a)
  return seqs[limit - 1]
}

/** The point a player's NEXT drawn segment should start from — the end of their last segment, or their court position if they have none yet. */
export function routeEndPoint(route: PlayerRoute | undefined, fallback: Point): Point {
  if (!route || route.segments.length === 0) return fallback
  const lastSegment = route.segments[route.segments.length - 1]
  return lastSegment.points[lastSegment.points.length - 1] ?? fallback
}
