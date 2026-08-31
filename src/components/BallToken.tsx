import { useRef } from 'react'
import { Circle, Group, Line } from 'react-konva'
import Konva from 'konva'
import { Point } from '../types'
import { BALL_COLOR } from '../lib/court'
import { pulse } from '../lib/pulse'

interface Props {
  position: Point
  /** Ball radius in court units — coach-tunable in settings. */
  radius: number
  /** True while the coach is dragging it — lifts it above the court a little. */
  isDragging: boolean
  onDragStart: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
}

const BALL_FILL = BALL_COLOR
const BALL_SEAM = '#8a3a12'
/** Floor on the invisible press target. At the smallest ball size the puck is a
 *  ~8px circle — unusable on a scaled-down full court — so the target is padded
 *  out to this. It deliberately does not grow with the ball: a target wider than
 *  the ball/player min gap would swallow presses meant for an adjacent player. */
const MIN_TOUCH_RADIUS = 21.25

/**
 * The ball as a real object — sized between half a player token and a full one,
 * per the ball-size setting.
 * It has no drag handlers of its own beyond press-down: the move and release are
 * handled at the Stage level in CourtEditor, the same way route drawing is, so a
 * release on empty court can be cancelled rather than dropping the ball there.
 */
export default function BallToken({ position, radius, isDragging, onDragStart }: Props) {
  const r = radius
  const groupRef = useRef<Konva.Group>(null)

  function handleDragStart(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    pulse(groupRef.current)
    onDragStart(e)
  }

  return (
    <Group
      ref={groupRef}
      x={position.x}
      y={position.y}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      shadowColor="black"
      shadowBlur={isDragging ? 8 : 3}
      shadowOpacity={0.6}
    >
      {/* The ball is drawn small on purpose, but a ~8px circle is an unusable
          finger target on a full court scaled down to an iPad — this invisible
          disc is what actually gets pressed. */}
      <Circle radius={Math.max(r, MIN_TOUCH_RADIUS)} fill="transparent" />
      <Circle radius={r} fill={BALL_FILL} stroke={BALL_SEAM} strokeWidth={1.2} listening={false} />
      <Line points={[-r, 0, r, 0]} stroke={BALL_SEAM} strokeWidth={1} listening={false} />
      <Line points={[0, -r, 0, r]} stroke={BALL_SEAM} strokeWidth={1} listening={false} />
    </Group>
  )
}
