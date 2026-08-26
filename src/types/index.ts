/**
 * The four route line types a coach can draw.
 * - motion: player movement without the ball (solid line, arrowhead) — the default
 * - pass: the ball moving between two players (dotted line, arrowhead)
 * - dribble: player moving WITH the ball (double line, arrowhead)
 * - screen: player setting a pick (solid line, flat T-cap instead of arrowhead)
 *
 * The last two are only produced by drag mode, where the style is inferred from
 * possession rather than picked by the coach:
 * - carry: player moving while holding the ball (squiggly line, arrowhead)
 * - balltransfer: the ball's own path from one player to another (dashed line, arrowhead)
 */
export type LineType = 'motion' | 'pass' | 'dribble' | 'screen' | 'carry' | 'balltransfer'

export interface Point {
  x: number
  y: number
}

/**
 * One continuous freehand stroke — drawn in a single press-drag-release
 * gesture — in a single line style. A player's full route is an ordered
 * chain of these; each segment starts where the previous one ended (or at
 * the player's court position, for the first segment).
 */
export interface RouteSegment {
  type: LineType
  points: Point[]
}

export interface Player {
  id: string
  number: number
  team: 'offense' | 'defense'
  x: number
  y: number
  name?: string // copied from the roster entry at the time it was added to the court
  photoUrl?: string // placeholder for later — jersey number renders until this is set
}

/**
 * A team member as managed on the roster screen — independent of whether
 * they're currently placed on the court for the play being edited. `number`
 * is nullable because it isn't always known/confirmed when a player is
 * first added; the coach can fill it in later.
 */
export interface RosterPlayer {
  id: string
  name: string
  number: number | null
  position: string
  isCaptain?: boolean
  /** Path under /public to a cropped headshot, e.g. "/players/tyrell-harrison.png". Omitted = falls back to jersey number/initial. */
  photo?: string
}

export interface PlayerRoute {
  playerId: string
  segments: RouteSegment[]
}

/**
 * One throw of the ball from one player to another, drawn in drag mode by
 * dragging the ball itself. Deliberately NOT a segment on the passer's route —
 * routes are movement-only, and anything in a route animates the *player*.
 */
export interface BallTransfer {
  fromId: string
  toId: string
  points: Point[]
}

export type CourtType = 'full' | 'half'

export interface Play {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  players: Player[]
  routes: PlayerRoute[]
  courtType: CourtType
  /** who has the ball at the start of the play, for the possession highlight */
  ballHolderId: string | null
  /** ball centre relative to its carrier's centre. Optional — plays saved before drag mode existed have none. */
  ballOffset?: Point
  /** ordered ball throws, drag mode only. Optional for the same reason. */
  ballTransfers?: BallTransfer[]
  /** true if every route has zero segments — i.e. just a formation */
  isFormationOnly: boolean
}
