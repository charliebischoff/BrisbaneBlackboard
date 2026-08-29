import { useCallback, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import {
  BallTransfer,
  CourtType,
  LineType,
  Play,
  Player,
  PlayerRoute,
  Point,
  RosterPlayer,
  RouteSegment,
} from '../types'
import { pathLength, pointAtFraction, routeEndPoint } from '../lib/routeGeometry'
import { rosterStore } from '../lib/rosterStore'
import { localPlayStore } from '../lib/storage'
import { BALL_MIN_GAP, COURT_DIMENSIONS } from '../lib/court'

/**
 * Everything that makes a play a play, in a form two versions can be compared by.
 * Used only to answer "has this changed since it was last saved?" — never stored,
 * so its exact shape doesn't matter as long as it's stable across renders.
 */
function playSignatureOf(p: Pick<Play, 'courtType' | 'players' | 'routes' | 'ballHolderId'> & {
  ballOffset: Point
  ballTransfers: BallTransfer[]
}): string {
  return JSON.stringify([p.courtType, p.players, p.routes, p.ballHolderId, p.ballOffset, p.ballTransfers])
}

/**
 * - position: nudge players around, no drawing
 * - draw: player stays put, freehand a route out of them, style picked by hand
 * - drag: the player *moves* with the cursor and the route trails behind; the
 *   ball is a real draggable puck and line style is inferred from possession
 */
export type EditorMode = 'position' | 'draw' | 'drag'

const MAX_OFFENSE_ON_COURT = 5
const MIN_POINT_SPACING = 4 // court units between recorded points while dragging — keeps arrays small
const MIN_GESTURE_LENGTH = 6 // shorter than this, treat the press as a tap (select) not a draw

/** How close a pass has to end to a player to count as reaching them. Exported — drag mode draws this radius. */
export const PASS_CATCH_RADIUS = 38

/** Where the ball sits relative to its carrier until the coach drops it somewhere else. */
const DEFAULT_BALL_OFFSET: Point = { x: BALL_MIN_GAP, y: 0 }

/**
 * Default 5-player spots, tuned by eye against each court image — these are
 * real pixel coordinates in that image's own space (see COURT_DIMENSIONS),
 * not a percentage, since the two courts aren't just scaled versions of
 * each other (different aspect ratio, different basket placement).
 */
const DEFAULT_SPOTS: Record<CourtType, Point[]> = {
  half: [
    { x: 237, y: 265 }, // top of the arc
    { x: 114, y: 306 }, // left wing
    { x: 360, y: 306 }, // right wing
    { x: 161, y: 92 }, // left post
    { x: 313, y: 92 }, // right post
  ],
  full: [
    { x: 905, y: 350 }, // top of the arc, attacking the right basket
    { x: 980, y: 230 }, // left wing
    { x: 980, y: 470 }, // right wing
    { x: 1160, y: 215 }, // left post
    { x: 1160, y: 485 }, // right post
  ],
}

/**
 * Your five default starters, by roster id (see src/data/rosterSeed.json).
 * Listed order maps 1:1 onto DEFAULT_SPOTS for each court type above.
 */
const DEFAULT_STARTER_IDS = [
  'arnas-velicka',
  'tyrell-harrison',
  'harry-rouhliadeff',
  'nate-hinton',
  'sam-mcdaniel',
]

function buildDefaultPlayers(courtType: CourtType): Player[] {
  const roster = rosterStore.getAll()
  const spots = DEFAULT_SPOTS[courtType]

  const starters = DEFAULT_STARTER_IDS
    .map((id) => roster.find((rp) => rp.id === id))
    .filter((rp): rp is RosterPlayer => rp != null)
  // If a starter's id doesn't match anyone on the current roster (renamed,
  // deleted, roster reset with different ids), fill the gap from the rest
  // of the roster rather than quietly starting fewer than 5 players.
  const fallback = roster.filter((rp) => !starters.includes(rp))
  const selected = [...starters, ...fallback].slice(0, MAX_OFFENSE_ON_COURT)

  return selected.map((rp, i) => ({
    id: rp.id,
    number: rp.number ?? 0,
    team: 'offense' as const,
    name: rp.name,
    photoUrl: rp.photo,
    x: spots[i].x,
    y: spots[i].y,
  }))
}

/** Playback pacing. Each action gets a slice of the clock proportional to its path length. */
const MIN_ACTION_WEIGHT = 40 // court units — floor, so a tiny stroke still gets a readable slice
const SECONDS_PER_ACTION = 1.2
const MIN_DURATION_SECONDS = 3.5
const MAX_DURATION_SECONDS = 12

interface DrawGesture {
  playerId: string
  points: Point[]
}

/**
 * Stamps a global authoring order onto a play loaded from storage.
 *
 * Plays written before sequencing existed have no `seq` at all; the best
 * available guess at their order is the order things sit in the arrays. Doing it
 * here, at the load boundary, keeps playback free of any legacy branch.
 * Returns the next free counter value alongside the normalized data.
 *
 * Ball throws are straightened here too: plays written before `endBallDrag` began
 * committing a straight line still carry the raw drag stroke, which playback has
 * never followed. First and last point preserve the throw's real direction; the
 * exact endpoints of an old throw aren't recoverable (`ballOffset` describes only
 * the final holder), so nothing is invented beyond dropping the curve.
 */
function normalizeSequence(
  routes: PlayerRoute[],
  transfers: BallTransfer[],
): { routes: PlayerRoute[]; transfers: BallTransfer[]; nextSeq: number } {
  let counter = 0
  const stamp = (seq: number | undefined): number => {
    const value = typeof seq === 'number' ? seq : counter
    counter = Math.max(counter, value) + 1
    return value
  }
  const nextRoutes = routes.map((r) => ({
    ...r,
    segments: r.segments.map((s) => ({ ...s, seq: stamp(s.seq) })),
  }))
  const nextTransfers = transfers.map((t) => ({
    ...t,
    seq: stamp(t.seq),
    points: t.points.length > 2 ? [t.points[0], t.points[t.points.length - 1]] : t.points,
  }))
  return { routes: nextRoutes, transfers: nextTransfers, nextSeq: counter }
}

export function usePlayEditor() {
  const [playId, setPlayId] = useState(() => uuid())
  const [playName, setPlayName] = useState('Untitled Play')
  const [courtType, setCourtTypeRaw] = useState<CourtType>('half')
  const [players, setPlayers] = useState<Player[]>(() => buildDefaultPlayers('half'))
  const [routes, setRoutes] = useState<PlayerRoute[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [mode, setMode] = useState<EditorMode>('draw')
  const [lineType, setLineType] = useState<LineType>('motion')
  const [ballHolderId, setBallHolderId] = useState<string | null>(() => buildDefaultPlayers('half')[0]?.id ?? null)
  const [drawGesture, setDrawGesture] = useState<DrawGesture | null>(null)

  // --- Ball, as a real object (drag mode) ------------------------------
  const [ballOffset, setBallOffset] = useState<Point>(DEFAULT_BALL_OFFSET)
  const [ballTransfers, setBallTransfers] = useState<BallTransfer[]>([])
  const [ballGesture, setBallGesture] = useState<Point[] | null>(null)
  const [ballHint, setBallHint] = useState<string | null>(null)

  // The play as it was last persisted or loaded, and its signature.
  // null = nothing to revert to; this play has never been written.
  const [savedPlay, setSavedPlay] = useState<Play | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1) // 0.5x - 2x
  const [playbackT, setPlaybackT] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  /**
   * Global authoring order, shared by route segments and ball transfers. Rebased
   * (not reset) when a play is loaded — a counter restarting at 0 would slot
   * newly drawn actions into the middle of a loaded play's sequence.
   */
  const seqRef = useRef(0)
  const nextSeq = useCallback(() => seqRef.current++, [])

  const selectPlayer = useCallback((id: string) => {
    setSelectedPlayerId((current) => (current === id ? null : id))
  }, [])

  const clearSelection = useCallback(() => setSelectedPlayerId(null), [])

  const movePlayer = useCallback((id: string, x: number, y: number) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, x, y } : p)))
  }, [])

  // --- Court type -------------------------------------------------------

  const stopPlaybackRef = useRef<() => void>(() => {})

  /**
   * Switching court types changes the coordinate space entirely (different
   * aspect ratio, different basket placement) — a half-court formation
   * doesn't translate to a sensible full-court one by simple rescaling.
   * So this resets whoever's currently on court to that court type's
   * default spots, and clears drawn routes (they were drawn against
   * geometry that no longer applies). Roster selection itself is
   * untouched — same players, fresh positions.
   */
  const setCourtType = useCallback((type: CourtType) => {
    stopPlaybackRef.current()
    setCourtTypeRaw(type)
    setPlayers((prev) => {
      const spots = DEFAULT_SPOTS[type]
      return prev.map((p, i) => {
        const spot = spots[i % spots.length]
        return { ...p, x: spot.x, y: spot.y }
      })
    })
    setRoutes([])
    // Ball geometry was drawn against a court that no longer applies, same as routes.
    setBallTransfers([])
    seqRef.current = 0
    setBallOffset(DEFAULT_BALL_OFFSET)
    setBallGesture(null)
    setBallHint(null)
    setSelectedPlayerId(null)
    setDrawGesture(null)
    setPlaybackT(0)
  }, [])

  // --- Roster <-> court ------------------------------------------------

  const onCourtIds = useMemo(() => players.map((p) => p.id), [players])
  const courtIsFull = useMemo(
    () => players.filter((p) => p.team === 'offense').length >= MAX_OFFENSE_ON_COURT,
    [players],
  )

  const addPlayerToCourt = useCallback(
    (rosterPlayer: RosterPlayer) => {
      setPlayers((prev) => {
        if (prev.some((p) => p.id === rosterPlayer.id)) return prev
        const offenseCount = prev.filter((p) => p.team === 'offense').length
        if (offenseCount >= MAX_OFFENSE_ON_COURT) return prev
        const spots = DEFAULT_SPOTS[courtType]
        const spot = spots[offenseCount % spots.length]
        return [
          ...prev,
          {
            id: rosterPlayer.id,
            number: rosterPlayer.number ?? 0,
            team: 'offense',
            name: rosterPlayer.name,
            photoUrl: rosterPlayer.photo,
            x: spot.x,
            y: spot.y,
          },
        ]
      })
    },
    [courtType],
  )

  const removePlayerFromCourt = useCallback(
    (id: string) => {
      setPlayers((prev) => prev.filter((p) => p.id !== id))
      setRoutes((prev) => prev.filter((r) => r.playerId !== id))
      // A transfer that names a player who is no longer on court can't be drawn
      // or animated, so it goes with them.
      setBallTransfers((prev) => prev.filter((t) => t.fromId !== id && t.toId !== id))
      setSelectedPlayerId((current) => (current === id ? null : current))
      setBallHolderId((current) => {
        if (current !== id) return current
        const remaining = players.filter((p) => p.id !== id)
        return remaining[0]?.id ?? null
      })
    },
    [players],
  )

  /**
   * Where each player currently *stands*, ignoring playback — the end of their
   * drawn route, or their start spot if they have none. This is what drag mode
   * shows and what the ball is dropped against.
   *
   * Note it is derived, never stored: `player.x/y` stays the start-of-play
   * position, because route points are absolute and chain forward from it
   * (see flattenRoute). Writing the drag end back into player.x/y would make
   * playback jump backwards and replay the route.
   */
  const restingPositions = useMemo(() => {
    const map = new Map<string, Point>()
    for (const p of players) {
      map.set(p.id, routeEndPoint(routes.find((r) => r.playerId === p.id), { x: p.x, y: p.y }))
    }
    return map
  }, [players, routes])

  // --- Ball dragging (drag mode) ---------------------------------------

  const startBallDrag = useCallback(
    (x: number, y: number) => {
      if (mode !== 'drag') return
      // Editing and the playback clock don't mix — drop back to the resting board.
      stopPlaybackRef.current()
      setPlaybackT(0)
      setBallHint(null)
      setBallGesture([{ x, y }])
    },
    [mode],
  )

  const extendBallDrag = useCallback((x: number, y: number) => {
    setBallGesture((prev) => (prev ? [...prev, { x, y }] : prev))
  }, [])

  /**
   * Release. The ball only lands if it's inside some other player's catch
   * radius — there is no snapping and the rim isn't a target. Anywhere else and
   * the whole gesture is thrown away, leaving the ball where it was.
   */
  const endBallDrag = useCallback(() => {
    if (!ballGesture) return
    const points = ballGesture
    setBallGesture(null)

    const drop = points[points.length - 1]
    let closest: { id: string; dist: number; pos: Point } | null = null
    for (const p of players) {
      if (p.id === ballHolderId) continue
      const pos = restingPositions.get(p.id) ?? { x: p.x, y: p.y }
      const dist = Math.hypot(pos.x - drop.x, pos.y - drop.y)
      if (dist <= PASS_CATCH_RADIUS && (!closest || dist < closest.dist)) closest = { id: p.id, dist, pos }
    }

    if (!closest) {
      setBallHint('Drag ball to player')
      return
    }

    // Rest the ball where it was dropped relative to the catcher, pushed out
    // along that same direction far enough not to overlap their token.
    let dx = drop.x - closest.pos.x
    let dy = drop.y - closest.pos.y
    const len = Math.hypot(dx, dy)
    if (len < 0.001) {
      dx = DEFAULT_BALL_OFFSET.x
      dy = DEFAULT_BALL_OFFSET.y
    } else if (len < BALL_MIN_GAP) {
      dx = (dx / len) * BALL_MIN_GAP
      dy = (dy / len) * BALL_MIN_GAP
    }

    const fromId = ballHolderId
    if (fromId) {
      // The drag is a pointing device, not a flight path — what's kept is the straight
      // line from where the ball was to where it lands, however loopy the stroke was.
      // These are the same two spots `ballPosition` interpolates between during
      // playback, so the drawn arrow and the flying ball share one geometry. Storing
      // the raw stroke would paint a path the ball never follows.
      // Tail comes from where the ball *is*, not from `points[0]` — that's the raw
      // press position, so grabbing the token off-centre would skew the arrow.
      const origin = restingPositions.get(fromId) ?? { x: 0, y: 0 }
      const straight: Point[] = [
        { x: origin.x + ballOffset.x, y: origin.y + ballOffset.y },
        { x: closest.pos.x + dx, y: closest.pos.y + dy },
      ]
      // Taken outside the updater — those run twice under StrictMode.
      const seq = nextSeq()
      setBallTransfers((prev) => [...prev, { fromId, toId: closest!.id, points: straight, seq }])
    }
    setBallHolderId(closest.id)
    setBallOffset({ x: dx, y: dy })
    setBallHint(null)
  }, [ballGesture, players, ballHolderId, ballOffset, restingPositions, nextSeq])

  const dismissBallHint = useCallback(() => setBallHint(null), [])

  /**
   * Hands the ball to a player directly — this sets who has it *at the start*
   * of the play. Any recorded throws go with it: `ballTransfers` is a chain
   * anchored to the previous starting holder, so keeping it would leave the
   * resting state and playback disagreeing about who ends up with the ball.
   * Player routes are untouched.
   */
  const setBallHolder = useCallback((id: string) => {
    setBallHolderId(id)
    setBallTransfers([])
    setBallOffset(DEFAULT_BALL_OFFSET)
    setBallGesture(null)
    setBallHint(null)
  }, [])

  // --- Freehand route drawing ------------------------------------------

  /** Starts a new drawn segment for a player — called on press-down in draw mode. */
  const startDrawGesture = useCallback(
    (playerId: string) => {
      if (mode !== 'draw' && mode !== 'drag') return
      const player = players.find((p) => p.id === playerId)
      if (!player) return
      // Same as the ball: a press means "edit", so the clock goes back to rest
      // rather than leaving the token rendered at a playback position.
      stopPlaybackRef.current()
      setPlaybackT(0)
      const route = routes.find((r) => r.playerId === playerId)
      const start = routeEndPoint(route, { x: player.x, y: player.y })
      setDrawGesture({ playerId, points: [start] })
    },
    [mode, players, routes],
  )

  /** Appends a point to the in-progress gesture — called on pointer move while dragging. */
  const extendDrawGesture = useCallback((x: number, y: number) => {
    setDrawGesture((prev) => {
      if (!prev) return prev
      const last = prev.points[prev.points.length - 1]
      if (Math.hypot(x - last.x, y - last.y) < MIN_POINT_SPACING) return prev
      return { ...prev, points: [...prev.points, { x, y }] }
    })
  }, [])

  /** Finalizes the in-progress gesture on release — commits a route segment, or discards a mere tap. */
  const endDrawGesture = useCallback(() => {
    if (!drawGesture) return
    const gesture = drawGesture
    setDrawGesture(null)

    if (pathLength(gesture.points) < MIN_GESTURE_LENGTH) return // was a tap, not a draw

    /**
     * In drag mode the coach never picks a style: a player carrying the ball
     * draws a squiggle, everyone else draws a solid motion line. The ball's own
     * travel is not a route segment at all — see ballTransfers.
     */
    const segmentType: LineType =
      mode === 'drag' ? (ballHolderId === gesture.playerId ? 'carry' : 'motion') : lineType

    const newSegment: RouteSegment = { type: segmentType, points: gesture.points, seq: nextSeq() }
    setRoutes((prev) => {
      const existing = prev.find((r) => r.playerId === gesture.playerId)
      if (!existing) return [...prev, { playerId: gesture.playerId, segments: [newSegment] }]
      return prev.map((r) =>
        r.playerId === gesture.playerId ? { ...r, segments: [...r.segments, newSegment] } : r,
      )
    })

    // Draw mode infers possession from the stroke that was drawn. Drag mode
    // doesn't — there the ball is dragged explicitly, so a player drag never
    // changes who has it.
    if (mode !== 'draw') return

    if (lineType === 'dribble') {
      setBallHolderId(gesture.playerId)
    } else if (lineType === 'pass') {
      const endPoint = gesture.points[gesture.points.length - 1]
      let closest: { id: string; dist: number } | null = null
      for (const p of players) {
        if (p.id === gesture.playerId) continue
        const route = routes.find((r) => r.playerId === p.id)
        const pos = routeEndPoint(route, { x: p.x, y: p.y })
        const dist = Math.hypot(pos.x - endPoint.x, pos.y - endPoint.y)
        if (dist <= PASS_CATCH_RADIUS && (!closest || dist < closest.dist)) closest = { id: p.id, dist }
      }
      if (closest) setBallHolderId(closest.id)
    }
  }, [drawGesture, lineType, players, routes, mode, ballHolderId, nextSeq])

  const clearRoute = useCallback((playerId: string) => {
    setRoutes((prev) => prev.filter((r) => r.playerId !== playerId))
  }, [])

  const clearAllRoutes = useCallback(() => {
    setRoutes([])
    setBallTransfers([])
    seqRef.current = 0
  }, [])

  // --- Playback -----------------------------------------------------

  /**
   * The play as an ordered schedule: every drawn action — player strokes and ball
   * throws alike — in the order the coach authored it, each occupying its own
   * window of the 0→1 clock. Actions never overlap; a play is a chain of one
   * thing after another, which is what makes "A cuts, A passes, B cuts" read
   * correctly instead of happening all at once.
   *
   * Window length is proportional to path length (floored, so a flick of a stroke
   * doesn't flash past), so a long cut takes longer than a short one.
   */
  const timeline = useMemo(() => {
    type Event = {
      seq: number
      kind: 'move' | 'transfer'
      playerId?: string
      fromId?: string
      toId?: string
      points: Point[]
      weight: number
      tStart: number
      tEnd: number
    }

    const events: Event[] = []
    for (const route of routes) {
      for (const segment of route.segments) {
        events.push({
          seq: segment.seq,
          kind: 'move',
          playerId: route.playerId,
          points: segment.points,
          weight: Math.max(pathLength(segment.points), MIN_ACTION_WEIGHT),
          tStart: 0,
          tEnd: 0,
        })
      }
    }
    for (const transfer of ballTransfers) {
      events.push({
        seq: transfer.seq,
        kind: 'transfer',
        fromId: transfer.fromId,
        toId: transfer.toId,
        points: transfer.points,
        weight: Math.max(pathLength(transfer.points), MIN_ACTION_WEIGHT),
        tStart: 0,
        tEnd: 0,
      })
    }

    events.sort((a, b) => a.seq - b.seq)

    const total = events.reduce((sum, e) => sum + e.weight, 0)
    let running = 0
    for (const e of events) {
      e.tStart = total > 0 ? running / total : 0
      running += e.weight
      e.tEnd = total > 0 ? running / total : 1
    }
    return events
  }, [routes, ballTransfers])

  /**
   * Where each player is at time t, by their own actions only: inside an active
   * window they travel along that one stroke; outside it they stand still — at
   * the end of their last finished action, or at their start spot before their
   * first one.
   */
  const playerPositionsAt = useCallback(
    (t: number): Map<string, Point> => {
      const map = new Map<string, Point>()
      for (const event of timeline) {
        if (event.kind !== 'move' || !event.playerId) continue
        if (t <= event.tStart) continue
        if (t >= event.tEnd) {
          map.set(event.playerId, event.points[event.points.length - 1])
          continue
        }
        const span = event.tEnd - event.tStart
        const localT = span > 0 ? (t - event.tStart) / span : 1
        map.set(event.playerId, pointAtFraction(event.points, localT))
      }
      return map
    },
    [timeline],
  )

  /** Seconds for the whole play at 1x — grows with how much there is to watch. */
  const durationSeconds = useMemo(
    () =>
      Math.min(
        MAX_DURATION_SECONDS,
        Math.max(MIN_DURATION_SECONDS, SECONDS_PER_ACTION * timeline.length),
      ),
    [timeline],
  )
  const durationRef = useRef(durationSeconds)
  durationRef.current = durationSeconds

  const stopPlayback = useCallback(() => {
    setIsPlaying(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    lastTsRef.current = null
  }, [])
  stopPlaybackRef.current = stopPlayback

  const tick = useCallback(
    (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts

      setPlaybackT((prev) => {
        // Read through a ref so a mid-play edit can't stale-close the clock.
        const next = prev + (dt * speed) / durationRef.current
        if (next >= 1) {
          stopPlayback()
          return 1
        }
        return next
      })

      rafRef.current = requestAnimationFrame(tick)
    },
    [speed, stopPlayback],
  )

  const play = useCallback(() => {
    // A play with nothing but ball movement is still worth animating.
    if (!routes.some((r) => r.segments.length > 0) && ballTransfers.length === 0) return
    setIsPlaying(true)
    lastTsRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [routes, ballTransfers, tick])

  const pause = useCallback(() => stopPlayback(), [stopPlayback])

  const resetPlayback = useCallback(() => {
    stopPlayback()
    setPlaybackT(0)
  }, [stopPlayback])

  /** Player positions to render right now — animated if a route exists and playback has progressed, static otherwise. */
  const displayPlayers = useMemo(() => {
    if (playbackT === 0) return players
    const at = playerPositionsAt(playbackT)
    return players.map((p) => {
      const pos = at.get(p.id)
      return pos ? { ...p, x: pos.x, y: pos.y } : p
    })
  }, [players, playerPositionsAt, playbackT])

  /**
   * What the court actually renders. Same as displayPlayers except at rest in
   * drag mode, where a player stands at the end of their route — that's what
   * makes dragging look like the player moved.
   */
  const renderPlayers = useMemo(() => {
    if (mode !== 'drag') return displayPlayers
    // A live gesture wins over the clock: pressing a token resets playback to 0
    // anyway, but rendering the tip unconditionally means the token never lags a
    // frame behind that reset.
    const dragging = drawGesture && drawGesture.points.length > 0 ? drawGesture : null
    if (playbackT !== 0 && !dragging) return displayPlayers
    return players.map((p) => {
      // Mid-drag the gesture hasn't been committed to a route yet, so follow its
      // tip directly — that's what makes the player appear to move with the cursor.
      if (dragging?.playerId === p.id) {
        const tip = dragging.points[dragging.points.length - 1]
        return { ...p, x: tip.x, y: tip.y }
      }
      const pos = restingPositions.get(p.id)
      return pos ? { ...p, x: pos.x, y: pos.y } : p
    })
  }, [displayPlayers, players, restingPositions, playbackT, mode, drawGesture])

  /**
   * The ball, derived from wherever the tokens already are rather than from a
   * path of its own — so it stays glued to its carrier with zero drift, and
   * playback needs no second animation engine.
   *
   * Each throw has an authored window on the timeline, same as every other
   * action. Inside it the ball lerps between the two players' live positions;
   * outside it the ball is simply held by whoever owns it at that moment.
   */
  const ballPosition = useMemo<Point | null>(() => {
    const byId = new Map(renderPlayers.map((p) => [p.id, p]))
    const at = (id: string | null): Point | null => {
      const p = id ? byId.get(id) : undefined
      return p ? { x: p.x, y: p.y } : null
    }
    const held = (id: string | null): Point | null => {
      const pos = at(id)
      return pos ? { x: pos.x + ballOffset.x, y: pos.y + ballOffset.y } : null
    }

    /**
     * Where the ball attaches to one end of a throw. `ballOffset` is a single
     * global value — the offset from the *last* drop — so using it for every
     * carrier puts earlier throws in the wrong place. Each transfer's own stored
     * line already records both attachment points, so read the offset back off it,
     * relative to that player's resting spot, and hang it on their live position.
     */
    const onThrow = (id: string, points: Point[], end: 0 | 1): Point | null => {
      const pos = at(id)
      if (!pos) return null
      const anchor = points.length > 1 ? points[end === 0 ? 0 : points.length - 1] : null
      const rest = restingPositions.get(id)
      if (!anchor || !rest) return { x: pos.x + ballOffset.x, y: pos.y + ballOffset.y }
      return { x: pos.x + (anchor.x - rest.x), y: pos.y + (anchor.y - rest.y) }
    }

    const throws = timeline.filter((e) => e.kind === 'transfer')
    if (throws.length === 0) return held(ballHolderId)

    // At rest the court shows the *end* state — players stand at the end of
    // their routes, so the ball sits with whoever ended up holding it, exactly
    // where it was dropped. The transfer timeline below only applies once
    // playback is running.
    if (playbackT === 0) return held(ballHolderId)

    for (let k = 0; k < throws.length; k++) {
      const t = throws[k]
      // Waiting to be thrown: sit on the tail of this throw, or on the head of the
      // previous one, so entering a flight never makes the ball jump.
      if (playbackT < t.tStart) {
        return k === 0
          ? onThrow(t.fromId!, t.points, 0)
          : onThrow(throws[k - 1].toId!, throws[k - 1].points, 1)
      }
      if (playbackT < t.tEnd) {
        const from = onThrow(t.fromId!, t.points, 0)
        const to = onThrow(t.toId!, t.points, 1)
        if (!from || !to) return from ?? to
        const span = t.tEnd - t.tStart
        const f = span > 0 ? (playbackT - t.tStart) / span : 1
        return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }
      }
    }
    const last = throws[throws.length - 1]
    return onThrow(last.toId!, last.points, 1)
  }, [renderPlayers, timeline, ballHolderId, ballOffset, restingPositions, playbackT])

  // --- Save / load ----------------------------------------------------

  const toPlaySnapshot = useCallback(
    (name: string): Play => {
      const now = new Date().toISOString()
      return {
        id: playId,
        name,
        createdAt: now,
        updatedAt: now,
        players,
        routes,
        courtType,
        ballHolderId,
        ballOffset,
        ballTransfers,
        isFormationOnly: routes.every((r) => r.segments.length === 0) && ballTransfers.length === 0,
      }
    },
    [playId, players, routes, courtType, ballHolderId, ballOffset, ballTransfers],
  )

  const playSignature = useMemo(
    () => playSignatureOf({ courtType, players, routes, ballHolderId, ballOffset, ballTransfers }),
    [courtType, players, routes, ballHolderId, ballOffset, ballTransfers],
  )

  /**
   * Has anything changed since this play was last written to storage?
   *
   * A play that has never been saved is only "dirty" once there is actually
   * something to lose — otherwise a freshly opened editor would nag on the
   * first mode switch about an empty court.
   */
  const isDirty =
    savedSignature === null
      ? routes.some((r) => r.segments.length > 0) || ballTransfers.length > 0
      : playSignature !== savedSignature

  /**
   * The single persistence path. Lives here rather than in a component so the
   * saved-signature can only ever be updated by a write that actually succeeded —
   * localPlayStore.save throws on a full quota, and that throw propagates.
   */
  const savePlay = useCallback(
    (name: string) => {
      const snapshot = toPlaySnapshot(name)
      localPlayStore.save(snapshot)
      // Signature taken from the snapshot itself, not from the current render's
      // state, so what's marked clean is exactly what was written.
      setSavedPlay(snapshot)
      setSavedSignature(
        playSignatureOf({
          courtType: snapshot.courtType ?? 'half',
          players: snapshot.players,
          routes: snapshot.routes,
          ballHolderId: snapshot.ballHolderId,
          ballOffset: snapshot.ballOffset ?? DEFAULT_BALL_OFFSET,
          ballTransfers: snapshot.ballTransfers ?? [],
        }),
      )
    },
    [toPlaySnapshot],
  )

  const loadPlay = useCallback(
    (play: Play) => {
      stopPlayback()
      setPlayId(play.id)
      setPlayName(play.name)
      setCourtTypeRaw(play.courtType ?? 'half')
      setPlayers(play.players)
      // Plays written before sequencing carry no order; stamp one from array order
      // here, and rebase the counter so newly drawn actions land after, not among,
      // what was loaded.
      const seq = normalizeSequence(play.routes, play.ballTransfers ?? [])
      seqRef.current = seq.nextSeq
      setRoutes(seq.routes)
      setBallHolderId(play.ballHolderId ?? play.players[0]?.id ?? null)
      // Both optional — plays saved before drag mode existed simply have none.
      setBallOffset(play.ballOffset ?? DEFAULT_BALL_OFFSET)
      setBallTransfers(seq.transfers)
      setBallGesture(null)
      setBallHint(null)
      setSelectedPlayerId(null)
      setDrawGesture(null)
      setPlaybackT(0)
      // A just-loaded play is by definition unmodified. The defaults applied
      // above have to be mirrored here or it would read as dirty immediately.
      setSavedPlay(play)
      setSavedSignature(
        playSignatureOf({
          courtType: play.courtType ?? 'half',
          players: play.players,
          routes: seq.routes,
          ballHolderId: play.ballHolderId ?? play.players[0]?.id ?? null,
          ballOffset: play.ballOffset ?? DEFAULT_BALL_OFFSET,
          ballTransfers: seq.transfers,
        }),
      )
    },
    [stopPlayback],
  )

  const newPlay = useCallback(() => {
    stopPlayback()
    // Keep the current court type — a coach is usually drawing several
    // plays in the same context in one sitting.
    const fresh = buildDefaultPlayers(courtType)
    setPlayId(uuid())
    setPlayName('Untitled Play')
    setPlayers(fresh)
    setRoutes([])
    seqRef.current = 0
    setBallHolderId(fresh[0]?.id ?? null)
    setBallOffset(DEFAULT_BALL_OFFSET)
    setBallTransfers([])
    setBallGesture(null)
    setBallHint(null)
    setSelectedPlayerId(null)
    setDrawGesture(null)
    setPlaybackT(0)
    // Never saved — but an empty court isn't dirty either (see isDirty).
    setSavedPlay(null)
    setSavedSignature(null)
  }, [stopPlayback, courtType])

  /**
   * Throw away edits made since the last save. Reverts to the saved play if
   * there is one, otherwise starts fresh.
   *
   * Note this is deliberately wider than clearAllRoutes: the dirty check covers
   * player positions, court type and possession too, so clearing only the routes
   * would leave the play still dirty with nothing visible left to discard.
   */
  const discardChanges = useCallback(() => {
    if (savedPlay) loadPlay(savedPlay)
    else newPlay()
  }, [savedPlay, loadPlay, newPlay])

  return {
    playId,
    playName,
    setPlayName,
    courtType,
    courtDimensions: COURT_DIMENSIONS[courtType],
    setCourtType,
    players: renderPlayers,
    rawPlayers: players,
    routes,
    selectedPlayerId,
    mode,
    lineType,
    ballHolderId,
    ballOffset,
    ballTransfers,
    ballGesture,
    ballPosition,
    ballHint,
    drawGesture,
    isPlaying,
    speed,
    playbackT,
    onCourtIds,
    courtIsFull,
    setMode,
    setLineType,
    setSpeed,
    selectPlayer,
    clearSelection,
    movePlayer,
    addPlayerToCourt,
    removePlayerFromCourt,
    startDrawGesture,
    extendDrawGesture,
    endDrawGesture,
    setBallHolder,
    startBallDrag,
    extendBallDrag,
    endBallDrag,
    dismissBallHint,
    clearRoute,
    clearAllRoutes,
    play,
    pause,
    resetPlayback,
    toPlaySnapshot,
    savePlay,
    isDirty,
    discardChanges,
    loadPlay,
    newPlay,
  }
}
