import { CourtType } from '../types'

/**
 * Real pixel dimensions of the two court images — used directly as the
 * Konva coordinate space for each mode, so player/route coordinates map
 * 1:1 onto the artwork with no separate scale factor to keep track of.
 */
export const COURT_DIMENSIONS: Record<CourtType, { width: number; height: number }> = {
  half: { width: 474, height: 479 },
  full: { width: 1234, height: 700 },
}

/** Player token radius, in court units. Shared so the ball can be sized and spaced against it. */
export const PLAYER_TOKEN_RADIUS = 17

/** The ball puck — deliberately half the player token, per the drag-mode brief. */
export const BALL_RADIUS = PLAYER_TOKEN_RADIUS / 2

/** The ball's orange. Shared so the puck, its drawn path, and the possession ring all read as the same object. */
export const BALL_COLOR = '#e0703a'

/** Smallest distance from a player's centre the ball is allowed to rest, so the two never overlap. */
export const BALL_MIN_GAP = PLAYER_TOKEN_RADIUS + BALL_RADIUS + 2

export const COURT_IMAGE_SRC: Record<CourtType, string> = {
  half: '/court/half-court.webp',
  full: '/court/full-court.jpg',
}
