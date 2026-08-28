import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Circle } from 'react-konva'
import Konva from 'konva'
import Court from './Court'
import PlayerToken from './PlayerToken'
import RouteLine from './RouteLine'
import BallToken from './BallToken'
import { usePlayEditor, PASS_CATCH_RADIUS } from '../hooks/usePlayEditor'
import { BALL_COLOR } from '../lib/court'

const TEAM_COLOR = { offense: '#3b82f6', defense: '#dc2626' } as const
const BALL_LINE_COLOR = BALL_COLOR
/** Catch-radius disc under each player while the ball is in the air — brighter for the one it's over. */
const CATCH_FILL = 'rgba(224, 112, 58, 0.12)'
const CATCH_FILL_ACTIVE = 'rgba(224, 112, 58, 0.32)'

type Editor = ReturnType<typeof usePlayEditor>

interface Props {
  editor: Editor
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
    return () => window.removeEventListener('resize', measure)
    // Re-measure immediately when the court's own dimensions change (i.e.
    // switching full/half), not just on window resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtWidth, courtHeight])

  return scale
}

export default function CourtEditor({ editor }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width: COURT_WIDTH, height: COURT_HEIGHT } = editor.courtDimensions
  const scale = useResponsiveScale(containerRef, COURT_WIDTH, COURT_HEIGHT)

  function stagePoint(stage: Konva.Stage): { x: number; y: number } | null {
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    return { x: pointer.x / scale, y: pointer.y / scale }
  }

  function handlePointerMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!editor.drawGesture && !editor.ballGesture) return
    const stage = e.target.getStage()
    if (!stage) return
    const pt = stagePoint(stage)
    if (!pt) return
    // Only one gesture is ever live: pressing the ball never starts a route.
    if (editor.ballGesture) editor.extendBallDrag(pt.x, pt.y)
    else editor.extendDrawGesture(pt.x, pt.y)
  }

  function handlePointerUp() {
    if (editor.ballGesture) editor.endBallDrag()
    if (editor.drawGesture) editor.endDrawGesture()
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
      if (dist <= PASS_CATCH_RADIUS && (!closest || dist < closest.dist)) closest = { id: p.id, dist }
    }
    return closest?.id ?? null
  })()

  const ballDisplayPosition = editor.ballGesture
    ? editor.ballGesture[editor.ballGesture.length - 1]
    : editor.ballPosition

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
        onMouseMove={handlePointerMove}
        onTouchMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchEnd={handlePointerUp}
        onMouseLeave={handlePointerUp}
        className="rounded-lg shadow-2xl shadow-black/50"
      >
        <Court courtType={editor.courtType} />

        <Layer>
          {editor.routes.map((route) => {
            const player = editor.rawPlayers.find((p) => p.id === route.playerId)
            if (!player) return null
            return <RouteLine key={route.playerId} segments={route.segments} color={TEAM_COLOR[player.team]} />
          })}

          {/* Ball throws — kept out of player routes so they animate the ball, not the passer */}
          {editor.ballTransfers.map((transfer, i) => (
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
                  radius={PASS_CATCH_RADIUS}
                  fill={ballHoverId === p.id ? CATCH_FILL_ACTIVE : CATCH_FILL}
                  listening={false}
                />
              ))}

          {editor.players.map((player) => (
            <PlayerToken
              key={player.id}
              player={player}
              isSelected={editor.selectedPlayerId === player.id}
              hasBall={editor.ballHolderId === player.id}
              mode={editor.mode}
              courtType={editor.courtType}
              onSelect={editor.selectPlayer}
              onMove={editor.movePlayer}
              onDragStateChange={() => {}}
              onDrawStart={editor.startDrawGesture}
            />
          ))}

          {editor.mode === 'drag' && ballDisplayPosition && (
            <BallToken
              position={ballDisplayPosition}
              isDragging={!!editor.ballGesture}
              onDragStart={handleBallDragStart}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}
