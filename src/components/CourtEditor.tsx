import { useEffect, useRef, useState } from 'react'
import { Stage, Layer } from 'react-konva'
import Konva from 'konva'
import Court from './Court'
import PlayerToken from './PlayerToken'
import RouteLine from './RouteLine'
import { usePlayEditor } from '../hooks/usePlayEditor'

const TEAM_COLOR = { offense: '#3b82f6', defense: '#dc2626' } as const

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
    if (!editor.drawGesture) return
    const stage = e.target.getStage()
    if (!stage) return
    const pt = stagePoint(stage)
    if (!pt) return
    editor.extendDrawGesture(pt.x, pt.y)
  }

  function handlePointerUp() {
    if (editor.drawGesture) editor.endDrawGesture()
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

          {/* Live preview of the segment currently being dragged out */}
          {editor.drawGesture &&
            (() => {
              const player = editor.rawPlayers.find((p) => p.id === editor.drawGesture!.playerId)
              if (!player) return null
              return (
                <RouteLine
                  segments={[{ type: editor.lineType, points: editor.drawGesture.points }]}
                  color={TEAM_COLOR[player.team]}
                />
              )
            })()}
        </Layer>

        <Layer>
          {editor.players.map((player) => (
            <PlayerToken
              key={player.id}
              player={player}
              isSelected={editor.selectedPlayerId === player.id}
              hasBall={editor.ballHolderId === player.id}
              mode={editor.mode}
              onSelect={editor.selectPlayer}
              onMove={editor.movePlayer}
              onDragStateChange={() => {}}
              onDrawStart={editor.startDrawGesture}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  )
}
