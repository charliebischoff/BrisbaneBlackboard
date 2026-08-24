/**
 * The four route line types a coach can draw.
 * - motion: player movement without the ball (solid line, arrowhead) — the default
 * - pass: the ball moving between two players (dotted line, arrowhead)
 * - dribble: player moving WITH the ball (double line, arrowhead)
 * - screen: player setting a pick (solid line, flat T-cap instead of arrowhead)
 */
export type LineType = 'motion' | 'pass' | 'dribble' | 'screen'

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
  /** true if every route has zero segments — i.e. just a formation */
  isFormationOnly: boolean
}
