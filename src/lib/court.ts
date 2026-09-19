import { CourtType } from '../types'

/**
 * Real pixel dimensions of the two court images — used directly as the
 * Konva coordinate space for each mode, so player/route coordinates map
 * 1:1 onto the artwork with no separate scale factor to keep track of.
 */
export const COURT_DIMENSIONS: Record<CourtType, { width: number; height: number }> = {
  // Shorter than the half-court artwork on purpose — see COURT_IMAGE_SIZE.
  // 339, not 330: the artwork gained a strip of inbounds room above the
  // baseline, which pushed every marking down 9 units. Growing the crop by the
  // same 9 keeps exactly as much court in view at the far end as before.
  half: { width: 474, height: 339 },
  full: { width: 1234, height: 700 },
}

/**
 * The artwork's own pixel size, which is what the image is drawn at. It equals
 * COURT_DIMENSIONS except on the half court, where the coordinate space is cut
 * short so the stage clips the dead strip below the arc — the halfcourt-line
 * end nothing is ever drawn in. That crop is what lets the rest of the court
 * scale up to fill the screen. Drawing at the artwork's real size (rather than
 * stretching it to the coordinate space, or using Konva's `crop`, which is in
 * source-bitmap pixels) keeps the court's proportions exact.
 */
export const COURT_IMAGE_SIZE: Record<CourtType, { width: number; height: number }> = {
  // The files are 2x these figures (948x920, 2468x1400); court units are the
  // artwork at 1x, so both courts stay in the coordinate space they always had.
  half: { width: 474, height: 460 },
  full: { width: 1234, height: 700 },
}

/**
 * Default player token radius, in court units. The live value is a setting now
 * (`settings.playerRadius`), so this is only the fallback and the basis for the
 * layout constants below — those stay fixed on purpose, see SPOT_CLEARANCE.
 */
export const PLAYER_TOKEN_RADIUS = 17

/**
 * Full court is drawn at a larger coordinate scale than half court, so tokens
 * are bumped to keep their apparent size roughly constant between the two.
 */
export function playerTokenRadius(radius: number, courtType: CourtType): number {
  return radius * (courtType === 'full' ? 1.5 : 1)
}

/**
 * Two tokens closer than this read as one blob, so a spot that close is "taken".
 * Deliberately pinned to the default radius rather than the live setting: it is
 * a placement rule, and making it follow the size slider would reshuffle players
 * on the court while the coach is dragging the slider.
 */
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

/**
 * Smallest distance from a player's centre the ball is allowed to rest, so the
 * two never overlap. Depends on both current sizes, so it's a function rather
 * than a constant baked in at import time.
 */
export function ballMinGap(radius: number, playerRadius: number = PLAYER_TOKEN_RADIUS): number {
  return playerRadius + radius + 2
}

export const COURT_IMAGE_SRC: Record<CourtType, string> = {
  half: '/court/half-court.webp',
  full: '/court/full-court.webp',
}
