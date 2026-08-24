import { Group, Circle, Text, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { Player } from '../types'
import { EditorMode } from '../hooks/usePlayEditor'
import { useHTMLImage } from '../hooks/useHTMLImage'

interface Props {
  player: Player
  isSelected: boolean
  hasBall: boolean
  mode: EditorMode
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
  onSelect,
  onMove,
  onDragStateChange,
  onDrawStart,
}: Props) {
  const radius = 17
  const isPositionMode = mode === 'position'
  const photo = useHTMLImage(player.photoUrl)

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    onMove(player.id, e.target.x(), e.target.y())
  }

  function handlePointerDown() {
    if (!isPositionMode) onDrawStart(player.id)
  }

  return (
    <Group
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
      {hasBall && <Circle radius={radius + 8} stroke="#e0a458" strokeWidth={2.5} />}
      {isSelected && <Circle radius={radius + 4} stroke="#f5efe0" strokeWidth={2} dash={[3, 3]} />}

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
        <Circle radius={9} fill={TEAM_COLOR[player.team]} stroke="#f5efe0" strokeWidth={1.5} />
        <Text
          text={player.number > 0 ? String(player.number) : '?'}
          fontSize={10}
          fontStyle="bold"
          fill="#f5efe0"
          width={18}
          height={18}
          offsetX={9}
          offsetY={9}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>

      {player.name && (
        <Text
          text={player.name.split(' ').slice(-1)[0]}
          fontSize={10}
          fontStyle="500"
          fill="#f5efe0"
          width={90}
          offsetX={45}
          y={radius + 6}
          align="center"
          listening={false}
          shadowColor="black"
          shadowBlur={3}
          shadowOpacity={0.8}
        />
      )}
    </Group>
  )
}
