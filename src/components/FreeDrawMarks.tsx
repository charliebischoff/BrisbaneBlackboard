import { Line } from 'react-konva'
import { FreeDrawMark } from '../types'
import { toKonvaPoints } from '../lib/routeGeometry'

interface Props {
  marks: FreeDrawMark[]
  /**
   * How much of each mark to draw, as a fraction of its length, or null for all
   * of it. Always null today — marks don't take part in the playback clock yet.
   * The prop exists so that when they do, only this component's caller changes.
   */
  reveal: (mark: FreeDrawMark) => number | null
  color: string
}

/**
 * Marker ink: what the coach drew that isn't movement — a defender's spot, a
 * help-side arrow, a box around the elbow.
 *
 * Deliberately not a RouteLine. A route carries meaning in its style (arrowhead,
 * dashes, squiggle) because it says what a player is doing; an annotation says
 * only "look here", so it is a plain stroke and nothing more. Giving it an
 * arrowhead would make it read as a route belonging to whoever it starts near.
 */
const STROKE_WIDTH = 2.5

export default function FreeDrawMarks({ marks, reveal, color }: Props) {
  return (
    <>
      {marks.map((mark) => {
        if (mark.points.length < 2) return null
        const fraction = reveal(mark)
        // Only the fully-drawn case exists so far. When pen-style reveal lands,
        // this is where a `pointsUpTo(mark.points, fraction)` helper slots in
        // alongside `pointAtFraction` in routeGeometry — written then, with
        // checks, rather than guessed at now.
        if (fraction !== null) return null
        return (
          <Line
            key={mark.id}
            points={toKonvaPoints(mark.points)}
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
            /**
             * Load-bearing. A hit-testable scribble is a wall: draw one across a
             * player and Konva hands that player's presses to the line instead,
             * leaving a token that can never be picked up again.
             */
            listening={false}
          />
        )
      })}
    </>
  )
}
