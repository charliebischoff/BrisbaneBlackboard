import { useRef } from 'react'
import { Group, Circle, Text, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { pulse } from '../lib/pulse'
import { CourtType, Player } from '../types'
import { EditorMode } from '../hooks/usePlayEditor'
import { useHTMLImage } from '../hooks/useHTMLImage'
import { BALL_COLOR, PLAYER_TOKEN_RADIUS } from '../lib/court'

interface Props {
  player: Player
  isSelected: boolean
  hasBall: boolean
  mode: EditorMode
  courtType: CourtType
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

export default function PlayerToken({
  player,
  isSelected,
  hasBall,
  mode,
  courtType,
  onSelect,
  onMove,
  onDragStateChange,
  onDrawStart,
}: Props) {
  // Full court is a much wider coordinate space than half court, so it gets
  // scaled down more to fit the screen — bump token size to compensate, or
  // players read as too small to see at a glance.
  const sizeScale = courtType === 'full' ? 1.50 : 1
  const radius = PLAYER_TOKEN_RADIUS * sizeScale
  const isPositionMode = mode === 'position'
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
      {/* Drag mode draws a real ball, so the stand-in possession ring is redundant there. */}
      {hasBall && mode !== 'drag' && <Circle radius={radius + 8} stroke={BALL_COLOR} strokeWidth={2.5} />}
      {/* Dark ink, not cream — the court is white line art, so a light ring vanishes. */}
      {isSelected && <Circle radius={radius + 4} stroke="#1f2937" strokeWidth={2} dash={[3, 3]} />}

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
          fontSize={10 * sizeScale}
          fontStyle="500"
          fill="#1f2937"
          width={90 * sizeScale}
          offsetX={45 * sizeScale}
          y={radius + 6}
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
