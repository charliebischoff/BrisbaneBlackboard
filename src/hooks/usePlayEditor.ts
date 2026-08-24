import { useCallback, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { CourtType, LineType, Play, Player, PlayerRoute, Point, RosterPlayer, RouteSegment } from '../types'
import { flattenRoute, pathLength, pointAtFraction, routeEndPoint } from '../lib/routeGeometry'
import { rosterStore } from '../lib/rosterStore'
import { COURT_DIMENSIONS } from '../lib/court'

export type EditorMode = 'position' | 'draw'

const MAX_OFFENSE_ON_COURT = 5
const MIN_POINT_SPACING = 4 // court units between recorded points while dragging — keeps arrays small
const MIN_GESTURE_LENGTH = 6 // shorter than this, treat the press as a tap (select) not a draw
const PASS_CATCH_RADIUS = 38 // how close a pass has to end to a player to count as reaching them

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

function buildDefaultPlayers(courtType: CourtType): Player[] {
  const roster = rosterStore.getAll()
  const spots = DEFAULT_SPOTS[courtType]
  return roster.slice(0, MAX_OFFENSE_ON_COURT).map((rp, i) => ({
    id: rp.id,
    number: rp.number ?? 0,
    team: 'offense' as const,
    name: rp.name,
    photoUrl: rp.photo,
    x: spots[i].x,
    y: spots[i].y,
  }))
}

interface DrawGesture {
  playerId: string
  points: Point[]
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

  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1) // 0.5x - 2x
  const [playbackT, setPlaybackT] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

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
      setSelectedPlayerId((current) => (current === id ? null : current))
      setBallHolderId((current) => {
        if (current !== id) return current
        const remaining = players.filter((p) => p.id !== id)
        return remaining[0]?.id ?? null
      })
    },
    [players],
  )

  // --- Freehand route drawing ------------------------------------------

  /** Starts a new drawn segment for a player — called on press-down in draw mode. */
  const startDrawGesture = useCallback(
    (playerId: string) => {
      if (mode !== 'draw') return
      const player = players.find((p) => p.id === playerId)
      if (!player) return
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

    const newSegment: RouteSegment = { type: lineType, points: gesture.points }
    setRoutes((prev) => {
      const existing = prev.find((r) => r.playerId === gesture.playerId)
      if (!existing) return [...prev, { playerId: gesture.playerId, segments: [newSegment] }]
      return prev.map((r) =>
        r.playerId === gesture.playerId ? { ...r, segments: [...r.segments, newSegment] } : r,
      )
    })

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
  }, [drawGesture, lineType, players, routes])

  const clearRoute = useCallback((playerId: string) => {
    setRoutes((prev) => prev.filter((r) => r.playerId !== playerId))
  }, [])

  const clearAllRoutes = useCallback(() => setRoutes([]), [])

  // --- Playback -----------------------------------------------------

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
        const DURATION_SECONDS = 3.5 // full route, at 1x speed
        const next = prev + (dt * speed) / DURATION_SECONDS
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
    if (!routes.some((r) => r.segments.length > 0)) return
    setIsPlaying(true)
    lastTsRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [routes, tick])

  const pause = useCallback(() => stopPlayback(), [stopPlayback])

  const resetPlayback = useCallback(() => {
    stopPlayback()
    setPlaybackT(0)
  }, [stopPlayback])

  /** Player positions to render right now — animated if a route exists and playback has progressed, static otherwise. */
  const displayPlayers = useMemo(() => {
    if (playbackT === 0) return players
    return players.map((p) => {
      const route = routes.find((r) => r.playerId === p.id)
      if (!route || route.segments.length === 0) return p
      const flat = flattenRoute({ x: p.x, y: p.y }, route.segments)
      const pos = pointAtFraction(flat, playbackT)
      return { ...p, x: pos.x, y: pos.y }
    })
  }, [players, routes, playbackT])

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
        isFormationOnly: routes.every((r) => r.segments.length === 0),
      }
    },
    [playId, players, routes, courtType, ballHolderId],
  )

  const loadPlay = useCallback(
    (play: Play) => {
      stopPlayback()
      setPlayId(play.id)
      setPlayName(play.name)
      setCourtTypeRaw(play.courtType ?? 'half')
      setPlayers(play.players)
      setRoutes(play.routes)
      setBallHolderId(play.ballHolderId ?? play.players[0]?.id ?? null)
      setSelectedPlayerId(null)
      setDrawGesture(null)
      setPlaybackT(0)
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
    setBallHolderId(fresh[0]?.id ?? null)
    setSelectedPlayerId(null)
    setDrawGesture(null)
    setPlaybackT(0)
  }, [stopPlayback, courtType])

  return {
    playId,
    playName,
    setPlayName,
    courtType,
    courtDimensions: COURT_DIMENSIONS[courtType],
    setCourtType,
    players: displayPlayers,
    rawPlayers: players,
    routes,
    selectedPlayerId,
    mode,
    lineType,
    ballHolderId,
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
    clearRoute,
    clearAllRoutes,
    play,
    pause,
    resetPlayback,
    toPlaySnapshot,
    loadPlay,
    newPlay,
  }
}
