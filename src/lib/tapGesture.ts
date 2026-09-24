/**
 * Double-tap detection for player tokens.
 *
 * Deliberately not Konva's built-in `dbltap`/`dblclick`: Konva tracks the
 * double-click window on the Stage, not per node, so a quick tap on one player
 * followed by another would fire `dbltap` on the second. The trigger has to be
 * guarded on player identity, which means owning the timing here.
 *
 * Pure on purpose — the decision is a function of (previous tap, this tap), so
 * it can be checked headlessly (`tools/tapGesture.check.ts`) even though the
 * gesture plumbing around it lives in a component.
 */

/** Ceiling between the two taps. Matches Konva's own double-click window. */
export const DOUBLE_TAP_MS = 400

/**
 * Floor between the two taps. `PlayerToken` binds both `onClick` and `onTap` to
 * the same handler. Today only one of the two ever fires for a single physical
 * tap — Konva calls `preventDefault()` on a touchstart that lands on a listening
 * shape (Stage `_pointerdown`), which suppresses the synthesised mouse click, so
 * touch gives `tap` and a mouse gives `click`. That has always been invisible
 * because selection is a toggle: two calls would have netted to zero. Read as a
 * gesture they would not — a doubled event would open the roster on every single
 * tap, and it would only show up on the iPad, not in `npm run dev`. So the floor
 * stands as a guard: anything this close together is one tap, not two.
 */
export const SAME_TAP_FLOOR_MS = 50

export interface TapRecord {
  playerId: string
  /** Milliseconds from any monotonic clock — `performance.now()` at the call site. */
  at: number
}

/**
 * True when `next` completes a double-tap begun by `prev`: same player, and
 * separated by more than one event's worth of time but less than the window.
 * A negative gap (clock moved backwards) fails the floor and so reads as false.
 */
export function isDoubleTap(
  prev: TapRecord | null,
  next: TapRecord,
  windowMs: number = DOUBLE_TAP_MS,
): boolean {
  if (!prev) return false
  if (prev.playerId !== next.playerId) return false
  const elapsed = next.at - prev.at
  return elapsed >= SAME_TAP_FLOOR_MS && elapsed <= windowMs
}
