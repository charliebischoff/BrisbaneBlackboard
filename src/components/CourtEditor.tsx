import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Circle } from 'react-konva'
import Konva from 'konva'
import Court from './Court'
import PlayerToken from './PlayerToken'
import RouteLine from './RouteLine'
import FreeDrawMarks from './FreeDrawMarks'
import BallToken from './BallToken'
import PlayerSwapMenu from './PlayerSwapMenu'
import { usePlayEditor, passCatchRadius } from '../hooks/usePlayEditor'
import { BALL_COLOR, PLAYER_TOKEN_RADIUS } from '../lib/court'
import { lineSeqFloor } from '../lib/routeGeometry'
import { isDoubleTap, type TapRecord } from '../lib/tapGesture'

const TEAM_COLOR = { offense: '#3b82f6', defense: '#dc2626' } as const
const BALL_LINE_COLOR = BALL_COLOR
/** Catch-radius disc under each player while the ball is in the air — brighter for the one it's over. */
const CATCH_FILL = 'rgba(224, 112, 58, 0.12)'
const CATCH_FILL_ACTIVE = 'rgba(224, 112, 58, 0.32)'
/**
 * Marker ink. Deliberately none of the three colours already in play — offense
 * blue, defense red, ball orange — so an annotation can never be mistaken for
 * something a player or the ball did.
 */
const MARK_COLOR = '#1f2937'

type Editor = ReturnType<typeof usePlayEditor>

interface Props {
  editor: Editor
  /** The roster button's own handler — a double-tap on a token is the same action. */
  onOpenRoster: () => void
}

/** Fits the current court's fixed aspect ratio into whatever space the parent gives it. */
function useResponsiveScale(
  containerRef: React.RefObject<HTMLDivElement>,
  courtWidth: number,
  courtHeight: number,
) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return
      const { clientWidth, clientHeight } = containerRef.current
      const s = Math.min(clientWidth / courtWidth, clientHeight / courtHeight)
      setScale(s > 0 ? s : 1)
    }
    measure()
    window.addEventListener('resize', measure)
    // Not every container resize fires a window resize (iOS URL-bar collapse,
    // PWA display-mode changes). A stale scale isn't only cosmetic: incoming
    // pointer coordinates are divided by it, so strokes would land offset from
    // the finger.
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
    // Re-measure immediately when the court's own dimensions change (i.e.
    // switching full/half), not just on window resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtWidth, courtHeight])

  return scale
}

export default function CourtEditor({ editor, onOpenRoster }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width: COURT_WIDTH, height: COURT_HEIGHT } = editor.courtDimensions
  const scale = useResponsiveScale(containerRef, COURT_WIDTH, COURT_HEIGHT)

  /**
   * Pointer position in court units, clamped to what the stage actually shows:
   * a stroke that ran off the edge would leave the player's resting position
   * (the end of their route) outside the Stage, which clips — an invisible token
   * can never be pressed again, and erasing banks the off-court spot rather than
   * recovering it. Kept here so route drawing and ball dragging are bounded by
   * the same rule.
   */

  /**
   * `margin` makes the rule above explicit rather than baked in: a free-draw
   * mark leaves no token behind, so none of that reasoning applies to it and it
   * passes 0. Clamping an annotation inward by a token radius would stop a coach
   * ringing the sideline, which is exactly where a defender's spot gets drawn.
   */
  function stagePoint(
    stage: Konva.Stage,
    margin = PLAYER_TOKEN_RADIUS,
  ): { x: number; y: number } | null {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    const clamp = (v: number, max: number) => Math.min(max - margin, Math.max(margin, v))
    return {
      x: clamp(pointer.x / scale, COURT_WIDTH),
      y: clamp(pointer.y / scale, COURT_HEIGHT),
    }
  }

  /**
   * A player's token position in real page pixels, for anchoring the swap popover.
   * Has to account for the wrapper div's flex-centering (court-stage-wrapper is
   * flex items-center justify-center) — the Stage isn't flush against the
   * container's top-left corner whenever the court doesn't perfectly fill it,
   * which is most of the time on any screen that isn't exactly the court's aspect ratio.
   */
  function getPlayerAnchor(playerId: string): { x: number; y: number } | null {
    if (!containerRef.current) return null
    const player = editor.players.find((p) => p.id === playerId)
    if (!player) return null
    const rect = containerRef.current.getBoundingClientRect()
    const offsetX = (rect.width - COURT_WIDTH * scale) / 2
    const offsetY = (rect.height - COURT_HEIGHT * scale) / 2
    return {
      x: rect.left + offsetX + player.x * scale,
      y: rect.top + offsetY + player.y * scale,
    }
  }

  function handlePointerMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!editor.drawGesture && !editor.ballGesture && !editor.markGesture) return
    const stage = e.target.getStage()
    if (!stage) return
    // Only one gesture is ever live: pressing the ball never starts a route.
    if (editor.ballGesture) {
      const pt = stagePoint(stage)
      if (pt) editor.extendBallDrag(pt.x, pt.y)
    } else if (editor.drawGesture) {
      const pt = stagePoint(stage)
      if (pt) editor.extendDrawGesture(pt.x, pt.y)
    } else {
      // Unclamped: an annotation may run right to the edge of the stage.
      const pt = stagePoint(stage, 0)
      if (pt) editor.extendMarkGesture(pt.x, pt.y)
    }
  }

  function handlePointerUp() {
    if (editor.ballGesture) editor.endBallDrag()
    if (editor.drawGesture) editor.endDrawGesture()
    if (editor.markGesture) editor.endMarkGesture()
  }

  /**
   * Press on bare court — which is to say, an annotation stroke. There is no
   * marker mode: anything that isn't a player or the ball is ink.
   *
   * The only press handler on the Stage itself — tokens capture their own, and
   * they don't stop propagation, so this has to check that the press really
   * landed on nothing. `Court` and the lines layer both draw with
   * `listening={false}`, so bare court *and* a drawn line report the Stage as
   * the target; that's the same fact `handleStageClick` below relies on.
   *
   * A second finger is ignored rather than allowed to restart the stroke: on an
   * iPad the usual cause is a palm, not a deliberate gesture.
   */
  function handleStagePointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()
    if (!stage || e.target !== stage) return
    const evt = e.evt as TouchEvent
    if (evt.touches && evt.touches.length > 1) return
    const pt = stagePoint(stage, 0)
    if (pt) editor.startMarkGesture(pt.x, pt.y)
  }

  function handleBallDragStart(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()
    const pt = stage ? stagePoint(stage) : null
    if (pt) editor.startBallDrag(pt.x, pt.y)
  }

  /** The player the ball is currently hovering over, so their catch radius can brighten. */
  const ballHoverId = (() => {
    if (!editor.ballGesture) return null
    const tip = editor.ballGesture[editor.ballGesture.length - 1]
    let closest: { id: string; dist: number } | null = null
    for (const p of editor.players) {
      if (p.id === editor.ballHolderId) continue
      const dist = Math.hypot(p.x - tip.x, p.y - tip.y)
      if (dist <= passCatchRadius(editor.playerRadius) && (!closest || dist < closest.dist))
        closest = { id: p.id, dist }
    }
    return closest?.id ?? null
  })()

  /** True when the player being dragged would collect a loose ball on release. */
  const ballPickupHover = (() => {
    const loose = editor.ballLoosePos
    if (!loose || !editor.drawGesture) return false
    const tip = editor.drawGesture.points[editor.drawGesture.points.length - 1]
    return !!tip && Math.hypot(tip.x - loose.x, tip.y - loose.y) <= passCatchRadius(editor.playerRadius)
  })()

  const ballDisplayPosition = editor.ballGesture
    ? editor.ballGesture[editor.ballGesture.length - 1]
    : editor.ballPosition

  /**
   * Only the most recent few lines stay on the board — older ones fade out of
   * view as soon as a new drag is released. Nothing is deleted here; state is
   * pruned separately at a much higher cap in usePlayEditor.
   */
  const visibleFloor = useMemo(
    () => lineSeqFloor(editor.routes, editor.ballTransfers, editor.settings.maxVisibleLines),
    [editor.routes, editor.ballTransfers, editor.settings.maxVisibleLines],
  )

  /**
   * Last token tap, for double-tap detection. A ref rather than state: nothing
   * renders off it, and a re-render between the two taps would be a wasted frame
   * in the middle of a gesture.
   */
  const lastTapRef = useRef<TapRecord | null>(null)

  /** id of the on-court player whose swap popover is open, or null if none is. */
  const [swapMenuFor, setSwapMenuFor] = useState<string | null>(null)

  /**
   * Token tap. Selection behaves exactly as it always has — including on the
   * second tap, where the toggle runs twice and nets back to where it started.
   * A double-tap additionally opens the roster, which is the whole feature.
   *
   * Konva fires click/tap whenever press and release land on the same node, so
   * this also runs at the end of a stroke that started and finished on the token
   * — meaning any two such events inside the window read as a double-tap, not
   * only two deliberate taps. The cost is a roster the coach didn't ask for: the
   * strokes themselves still commit, and a sub-MIN_GESTURE_LENGTH press is still
   * discarded before it can touch seqRef. Cheaper to wear than to thread gesture
   * length through to here.
   */
  
  function handleTokenTap(id: string) {
    editor.selectPlayer(id)
    const next: TapRecord = { playerId: id, at: performance.now() }
    if (isDoubleTap(lastTapRef.current, next)) {
      // Cleared so a third quick tap starts a fresh pair rather than firing again.
      lastTapRef.current = null
      setSwapMenuFor(id)
      return
    }
    lastTapRef.current = next
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    // Tapping empty court (not a player token) clears the current selection.
    if (e.target === e.target.getStage()) editor.clearSelection()
  }

  return (
    <div ref={containerRef} className="court-stage-wrapper w-full h-full flex items-center justify-center">
      <Stage
        width={COURT_WIDTH * scale}
        height={COURT_HEIGHT * scale}
        scaleX={scale}
        scaleY={scale}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={handleStagePointerDown}
        onTouchStart={handleStagePointerDown}
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        // Without this an interrupted touch (system gesture, notification, palm
        // rejection) leaves the gesture live and freezes the token under it.
        onTouchCancel={handlePointerUp}
        onMouseLeave={handlePointerUp}
        className="rounded-lg shadow-2xl shadow-black/50"
      >
        <Court courtType={editor.courtType} />

        {/* Lines are ordinary Konva nodes, and arrowheads are filled polygons, so
            left listening they would hit-test — making every drawn line a dead
            zone for ink: the press would target the line, the bare-court test in
            handleStagePointerDown would fail, and the stroke would never start,
            on exactly the busy board an annotation is most needed. Nothing is
            lost by switching the layer off: a press on a line has never done
            anything but fall through. */}
        <Layer listening={false}>
          {/* Under the routes: an annotation is the backdrop a play is drawn
              against, and a coach's ring around the elbow must never obscure
              the cut that runs through it. */}
          <FreeDrawMarks marks={editor.marks} reveal={editor.markReveal} color={MARK_COLOR} />

          {editor.markGesture && editor.markGesture.length > 1 && (
            <FreeDrawMarks
              marks={[{ id: 'live', points: editor.markGesture, seq: -1 }]}
              reveal={() => null}
              color={MARK_COLOR}
            />
          )}

          {editor.routes.map((route) => {
            const player = editor.rawPlayers.find((p) => p.id === route.playerId)
            if (!player) return null
            const segments = route.segments.filter((s) => s.seq >= visibleFloor)
            if (segments.length === 0) return null
            return <RouteLine key={route.playerId} segments={segments} color={TEAM_COLOR[player.team]} />
          })}

          {/* Ball throws — kept out of player routes so they animate the ball, not the passer.
              A pickup (no `fromId`) draws nothing: the ball didn't travel, the player walked
              to it, and that walk is already drawn as their route. */}
          {editor.ballTransfers
            .filter((transfer) => transfer.seq >= visibleFloor && transfer.fromId !== null)
            .map((transfer, i) => (
              <RouteLine key={`ball-${i}`} segments={[{ type: 'balltransfer', points: transfer.points }]} color={BALL_LINE_COLOR} />
            ))}

          {editor.ballGesture && editor.ballGesture.length > 1 && (
            <RouteLine segments={[{ type: 'balltransfer', points: editor.ballGesture }]} color={BALL_LINE_COLOR} />
          )}

          {/* Live preview of the segment currently being dragged out */}
          {editor.drawGesture &&
            (() => {
              const player = editor.rawPlayers.find((p) => p.id === editor.drawGesture!.playerId)
              if (!player) return null
              // Drag mode infers the style from possession rather than the picker.
              const previewType =
                editor.mode === 'drag'
                  ? editor.ballHolderId === player.id
                    ? 'carry'
                    : 'motion'
                  : editor.lineType
              return (
                <RouteLine
                  segments={[{ type: previewType, points: editor.drawGesture.points }]}
                  color={TEAM_COLOR[player.team]}
                />
              )
            })()}
        </Layer>

        {/* This layer is the whole of "anywhere but the players and the ball":
            it keeps listening, so a press on a token is a route and a press on
            the ball is a throw, and everything that misses them falls through to
            the Stage as ink. The consequence is that a stroke can't begin on top
            of a player — see the README's known gaps. */}
        <Layer>
          {/* Drop targets, only while the ball is actually in hand */}
          {editor.ballGesture &&
            editor.players
              .filter((p) => p.id !== editor.ballHolderId)
              .map((p) => (
                <Circle
                  key={`catch-${p.id}`}
                  x={p.x}
                  y={p.y}
                  radius={passCatchRadius(editor.playerRadius)}
                  fill={ballHoverId === p.id ? CATCH_FILL_ACTIVE : CATCH_FILL}
                  listening={false}
                />
              ))}

          {/* The mirror of the above: with the ball on the floor, dragging a
              player shows where they have to finish to pick it up. */}
          {editor.drawGesture && editor.ballLoosePos && (
            <Circle
              x={editor.ballLoosePos.x}
              y={editor.ballLoosePos.y}
              radius={passCatchRadius(editor.playerRadius)}
              fill={ballPickupHover ? CATCH_FILL_ACTIVE : CATCH_FILL}
              listening={false}
            />
          )}

          {editor.players.map((player) => (
            <PlayerToken
              key={player.id}
              player={player}
              isSelected={editor.selectedPlayerId === player.id}
              hasBall={editor.ballHolderId === player.id}
              mode={editor.mode}
              courtType={editor.courtType}
              radius={editor.playerRadius}
              scale={scale}
              onSelect={handleTokenTap}
              onMove={editor.movePlayer}
              onDragStateChange={() => {}}
              onDrawStart={editor.startDrawGesture}
            />
          ))}

          {editor.mode === 'drag' && ballDisplayPosition && (
            <BallToken
              position={ballDisplayPosition}
              radius={editor.ballRadius}
              isDragging={!!editor.ballGesture}
              onDragStart={handleBallDragStart}
            />
          )}
        </Layer>
      </Stage>

      {swapMenuFor && (
        <PlayerSwapMenu
          outgoingId={swapMenuFor}
          anchor={getPlayerAnchor(swapMenuFor) ?? { x: 0, y: 0 }}
          onCourtIds={editor.onCourtIds}
          onSwap={editor.swapPlayerOnCourt}
          onClose={() => setSwapMenuFor(null)}
        />
      )}
    </div>
  )
}
