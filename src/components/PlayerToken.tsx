import { useRef } from 'react'
import { Group, Circle, Text, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { pulse } from '../lib/pulse'
import { CourtType, Player } from '../types'
import { EditorMode } from '../hooks/usePlayEditor'
import { useHTMLImage } from '../hooks/useHTMLImage'
import { BALL_COLOR, COURT_DIMENSIONS, touchRadius } from '../lib/court'

interface Props {
  player: Player
  isSelected: boolean
  hasBall: boolean
  mode: EditorMode
  courtType: CourtType
  /** Token radius in court units, already carrying the full-court size bump. */
  radius: number
  /** Court display scale, so the grab area can stay a constant size in screen pixels. */
  scale: number
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onDragStateChange: (dragging: boolean) => void
  /** Fired on press-down when in draw mode — starts a freehand route gesture at the CourtEditor level. */
  onDrawStart: (id: string) => void
}

const TEAM_COLOR: Record<Player['team'], string> = {
  offense: '#3b82f6',
  defense: '#dc2626',
}

/** Name label type size, at sizeScale 1. Shared so the offset math can't drift from the Text node. */
const LABEL_FONT_SIZE = 10
/** Konva's height for a single unstyled line — fontSize x its default lineHeight. */
const LABEL_LINE_HEIGHT = LABEL_FONT_SIZE * 1.2
/** Clear air between the token's edge and the label. */
const LABEL_GAP = 6

export default function PlayerToken({
  player,
  isSelected,
  hasBall,
  mode,
  courtType,
  radius,
  scale,
  onSelect,
  onMove,
  onDragStateChange,
  onDrawStart,
}: Props) {
  // `radius` arrives already bumped for full court (see `playerTokenRadius`).
  // The label keeps its own scale factor: type size follows the court, not the
  // coach's token-size preference, or a large token would drag the name out of
  // proportion with everything else on the board.
  const sizeScale = courtType === 'full' ? 1.50 : 1
  const isPositionMode = mode === 'position'

  // The name sits under the token, and the stage clips — so near the bottom edge
  // it would be cut off or lost entirely. The half court's coordinate space is
  // cropped short of its artwork (see COURT_IMAGE_SIZE), which puts that edge
  // inside the band a ball handler at the top of the arc actually occupies.
  // Flipping the label above the token keeps it readable without reserving a
  // dead margin along the baseline, which would cost every court real height.
  // `radius` already carries sizeScale; only the type size still needs it.
  const labelOffset = radius + LABEL_GAP
  const labelDrop = labelOffset + LABEL_LINE_HEIGHT * sizeScale
  const labelAbove = player.y + labelDrop > COURT_DIMENSIONS[courtType].height
  const groupRef = useRef<Konva.Group>(null)
  const photo = useHTMLImage(player.photoUrl)

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    onMove(player.id, e.target.x(), e.target.y())
  }

  function handlePointerDown() {
    // Visual acknowledgement of the touch — nothing else depends on it.
    pulse(groupRef.current)
    if (!isPositionMode) onDrawStart(player.id)
  }

  return (
    <Group
      ref={groupRef}
      x={player.x}
      y={player.y}
      draggable={isPositionMode}
      onDragStart={() => onDragStateChange(true)}
      onDragMove={handleDragMove}
      onDragEnd={() => onDragStateChange(false)}
      onClick={() => onSelect(player.id)}
      onTap={() => onSelect(player.id)}
      onMouseDown={handlePointerDown}
      onTouchStart={handlePointerDown}
    >
      {/* Invisible grab area, sized in screen pixels rather than court units so a
          fingertip works at any court scale — see touchRadius. First child so it
          sits under everything; `transparent` rather than no fill because Konva
          only hit-tests a shape that has one. */}
      <Circle radius={touchRadius(radius, scale)} fill="transparent" />
      {/* Drag mode draws a real ball, so the stand-in possession ring is redundant there. */}
      {hasBall && mode !== 'drag' && <Circle radius={radius + 8} stroke={BALL_COLOR} strokeWidth={2.5} />}
      {/* Dark ink, not cream — the court is white line art, so a light ring vanishes.
          Hidden in drag mode: selection's only consumer is the per-player route
          clear, which lives in the toolbar that mode doesn't show — so the ring
          would be a mark the coach can't act on or dismiss except by tapping
          bare court. */}
      {isSelected && mode !== 'drag' && (
        <Circle radius={radius + 4} stroke="#1f2937" strokeWidth={2} dash={[3, 3]} />
      )}

      {photo ? (
        <Group clipFunc={(ctx) => ctx.arc(0, 0, radius, 0, Math.PI * 2, false)}>
          <KonvaImage image={photo} x={-radius} y={-radius} width={radius * 2} height={radius * 2} />
        </Group>
      ) : (
        <Circle radius={radius} fill={TEAM_COLOR[player.team]} />
      )}

      {/* Team-color ring — always drawn, over the photo if there is one, so
          offense/defense stays readable regardless of photo. */}
      <Circle radius={radius} stroke={TEAM_COLOR[player.team]} strokeWidth={2.5} />

      {/* Number badge — bottom-right of the token, always visible even with a photo */}
      <Group x={radius * 0.68} y={radius * 0.68}>
        <Circle radius={9 * sizeScale} fill={TEAM_COLOR[player.team]} stroke="#f5efe0" strokeWidth={1.5} />
        <Text
          text={player.number > 0 ? String(player.number) : '?'}
          fontSize={10 * sizeScale}
          fontStyle="bold"
          fill="#f5efe0"
          width={18 * sizeScale}
          height={18 * sizeScale}
          offsetX={9 * sizeScale}
          offsetY={9 * sizeScale}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>

      {player.name && (
        <Text
          text={player.name.split(' ').slice(-1)[0]}
          fontSize={LABEL_FONT_SIZE * sizeScale}
          fontStyle="500"
          fill="#1f2937"
          width={90 * sizeScale}
          offsetX={45 * sizeScale}
          y={labelAbove ? -labelDrop : labelOffset}
          align="center"
          listening={false}
          shadowColor="white"
          shadowBlur={3}
          shadowOpacity={0.8}
        />
      )}
    </Group>
  )
}
