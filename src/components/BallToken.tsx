import { Circle, Group, Line } from 'react-konva'
import Konva from 'konva'
import { Point } from '../types'
import { BALL_COLOR, BALL_RADIUS } from '../lib/court'

interface Props {
  position: Point
  /** True while the coach is dragging it — lifts it above the court a little. */
  isDragging: boolean
  onDragStart: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
}

const BALL_FILL = BALL_COLOR
const BALL_SEAM = '#8a3a12'

/**
 * The ball as a real object — half a player token wide, per the drag-mode brief.
 * It has no drag handlers of its own beyond press-down: the move and release are
 * handled at the Stage level in CourtEditor, the same way route drawing is, so a
 * release on empty court can be cancelled rather than dropping the ball there.
 */
export default function BallToken({ position, isDragging, onDragStart }: Props) {
  const r = BALL_RADIUS

  return (
    <Group
      x={position.x}
      y={position.y}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      shadowColor="black"
      shadowBlur={isDragging ? 8 : 3}
      shadowOpacity={0.6}
    >
      <Circle radius={r} fill={BALL_FILL} stroke={BALL_SEAM} strokeWidth={1.2} />
      <Line points={[-r, 0, r, 0]} stroke={BALL_SEAM} strokeWidth={1} listening={false} />
      <Line points={[0, -r, 0, r]} stroke={BALL_SEAM} strokeWidth={1} listening={false} />
    </Group>
  )
}
