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

export const COURT_IMAGE_SRC: Record<CourtType, string> = {
  half: '/court/half-court.webp',
  full: '/court/full-court.jpg',
}
