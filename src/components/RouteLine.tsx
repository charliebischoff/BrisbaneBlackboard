import { Fragment } from 'react'
import { Line } from 'react-konva'
import { RouteSegment } from '../types'
import {
  toKonvaPoints,
  offsetPolyline,
  screenCapPoints,
  arrowHeadPoints,
  squigglePoints,
} from '../lib/routeGeometry'

interface Props {
  /**
   * Drawing only cares about shape and style, never about when a segment happens —
   * so `seq` is dropped, letting callers pass one-off shapes (a live gesture, a
   * ball throw) that have no place in the play's authoring order.
   */
  segments: Omit<RouteSegment, 'seq'>[]
  color: string
}

const DRIBBLE_OFFSET = 2.5
const PASS_DASH = [2, 7] // small dots
const TRANSFER_DASH = [9, 6] // longer dashes — the ball travelling, drag mode
const STROKE_WIDTH = 3

export default function RouteLine({ segments, color }: Props) {
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.points.length < 2) return null
        const flat = toKonvaPoints(segment.points)

        switch (segment.type) {
          case 'dribble':
            return (
              <Fragment key={i}>
                <Line
                  points={toKonvaPoints(offsetPolyline(segment.points, DRIBBLE_OFFSET))}
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  lineCap="round"
                  lineJoin="round"
                />
                <Line
                  points={toKonvaPoints(offsetPolyline(segment.points, -DRIBBLE_OFFSET))}
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  lineCap="round"
                  lineJoin="round"
                />
                <Line points={arrowHeadPoints(segment.points)} closed fill={color} stroke={color} />
              </Fragment>
            )

          case 'pass':
            return (
              <Fragment key={i}>
                <Line
                  points={flat}
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  lineCap="round"
                  dash={PASS_DASH}
                />
                <Line points={arrowHeadPoints(segment.points)} closed fill={color} stroke={color} />
              </Fragment>
            )

          case 'carry':
            return (
              <Fragment key={i}>
                <Line
                  points={toKonvaPoints(squigglePoints(segment.points))}
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  lineCap="round"
                  lineJoin="round"
                />
                {/* Arrowhead from the original path, so it points along the real
                    direction of travel rather than whichever way the wave was going. */}
                <Line points={arrowHeadPoints(segment.points)} closed fill={color} stroke={color} />
              </Fragment>
            )

          case 'balltransfer':
            return (
              <Fragment key={i}>
                <Line
                  points={flat}
                  stroke={color}
                  strokeWidth={STROKE_WIDTH}
                  lineCap="round"
                  dash={TRANSFER_DASH}
                />
                <Line points={arrowHeadPoints(segment.points)} closed fill={color} stroke={color} />
              </Fragment>
            )

          case 'screen':
            return (
              <Fragment key={i}>
                <Line points={flat} stroke={color} strokeWidth={STROKE_WIDTH} lineCap="round" lineJoin="round" />
                <Line points={screenCapPoints(segment.points)} stroke={color} strokeWidth={4} lineCap="round" />
              </Fragment>
            )

          case 'motion':
          default:
            return (
              <Fragment key={i}>
                <Line points={flat} stroke={color} strokeWidth={STROKE_WIDTH} lineCap="round" lineJoin="round" />
                <Line points={arrowHeadPoints(segment.points)} closed fill={color} stroke={color} />
              </Fragment>
            )
        }
      })}
    </>
  )
}
