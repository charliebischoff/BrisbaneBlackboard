import { CourtType } from '../types'

/**
 * Real pixel dimensions of the two court images — used directly as the
 * Konva coordinate space for each mode, so player/route coordinates map
 * 1:1 onto the artwork with no separate scale factor to keep track of.
 */
export const COURT_DIMENSIONS: Record<CourtType, { width: number; height: number }> = {
  half: { width: 474, height: 442 },
  full: { width: 1234, height: 700 },
}

/** Player token radius, in court units. Shared so the ball can be sized and spaced against it. */
export const PLAYER_TOKEN_RADIUS = 17

/** Two tokens closer than this read as one blob, so a spot that close is "taken". */
export const SPOT_CLEARANCE = PLAYER_TOKEN_RADIUS * 2.5

/**
 * Apple's minimum comfortable touch target. In screen pixels — divide by the
 * court's display scale to get court units, since the court is scaled to fit.
 */
export const MIN_TOUCH_TARGET_PX = 44

/**
 * Radius, in court units, of a player's grab area at a given display scale.
 *
 * On a landscape phone the court fits at ~0.8, which would leave the 17-unit
 * token only 27px across — well under a fingertip. Rather than draw the token
 * bigger (which would distort the play's spacing against the court), the hit
 * area is grown on its own.
 *
 * Clamped to half the minimum legal separation: a grab area wider than that
 * would overlap its neighbour's, and Konva breaks the tie by z-order rather
 * than proximity, so dragging into a tight post pairing would pick up whichever
 * token happened to render last.
 *
 * The `radius` floor means that wherever the court renders at scale >= ~1 —
 * every iPad — this collapses to the token's own outline and nothing changes.
 */
export function touchRadius(radius: number, scale: number): number {
  return Math.max(radius, Math.min(MIN_TOUCH_TARGET_PX / 2 / scale, SPOT_CLEARANCE / 2))
}

/** The ball puck at its default size — half the player token, per the drag-mode brief. */
export const BALL_RADIUS = PLAYER_TOKEN_RADIUS / 2

/** The ball's orange. Shared so the puck, its drawn path, and the possession ring all read as the same object. */
export const BALL_COLOR = '#e0703a'

/** Ball radius for a size setting expressed as a multiple of the player token. */
export function ballRadius(scale: number): number {
  return PLAYER_TOKEN_RADIUS * scale
}

/**
 * Smallest distance from a player's centre the ball is allowed to rest, so the
 * two never overlap. Depends on the ball's current size, so it's a function
 * rather than a constant baked in at import time.
 */
export function ballMinGap(radius: number): number {
  return PLAYER_TOKEN_RADIUS + radius + 2
}

export const COURT_IMAGE_SRC: Record<CourtType, string> = {
  half: '/court/half-court.webp',
  full: '/court/full-court.webp',
}
