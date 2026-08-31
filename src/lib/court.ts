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
