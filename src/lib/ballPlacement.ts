/**
 * Where a dropped ball ends up.
 *
 * Two rules, pulled out of the editor hook so they can be exercised headlessly
 * and so the ball-drag path and the walk-onto-a-loose-ball path can't drift
 * apart: who catches it, and how far off their centre it rests.
 *
 * Deliberately pure and free of React, and the caller supplies the radii rather
 * than this module reaching for the size settings — same arrangement as
 * `courtBoard.ts`, and the reason both are testable on their own.
 */
import type { Point } from '../types'

/** The minimum an on-court player needs to be a catch candidate. */
export interface CatchCandidate {
  id: string
  pos: Point
}

/**
 * The player a ball dropped at `drop` lands with, or null for the open floor.
 *
 * Nearest wins. Ties are broken by the order `candidates` arrives in — strictly
 * first-wins rather than last-wins, so the result doesn't depend on Konva's
 * z-order the way a hit test would.
 */
export function nearestCatcher(
  drop: Point,
  candidates: CatchCandidate[],
  radius: number,
): { id: string; dist: number; pos: Point } | null {
  let best: { id: string; dist: number; pos: Point } | null = null
  for (const c of candidates) {
    const dist = Math.hypot(c.pos.x - drop.x, c.pos.y - drop.y)
    if (dist <= radius && (!best || dist < best.dist)) best = { id: c.id, dist, pos: c.pos }
  }
  return best
}

/**
 * The caught ball's resting offset from its new carrier: the direction it was
 * actually dropped in, pushed out along that same line far enough that the puck
 * doesn't overlap the token. Dropping dead-centre has no direction to keep, so
 * it falls back to `fallback`.
 */
export function restingOffset(
  drop: Point,
  playerPos: Point,
  minGap: number,
  fallback: Point,
): Point {
  const dx = drop.x - playerPos.x
  const dy = drop.y - playerPos.y
  const len = Math.hypot(dx, dy)
  if (len < 0.001) return { ...fallback }
  if (len < minGap) return { x: (dx / len) * minGap, y: (dy / len) * minGap }
  return { x: dx, y: dy }
}
