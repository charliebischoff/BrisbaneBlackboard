/**
 * Headless checks for `src/lib/routeGeometry.ts`.
 *
 * Same arrangement as `courtBoard.check.ts`: esbuild + node, no test framework —
 * a framework in a repo with none is a bigger diff than what it verifies.
 *
 *   npm run check:routegeometry
 *
 * Lives outside `src/` so `tsc -b` doesn't demand @types/node for `process.exit`.
 * Covers the pure geometry only; nothing about how CourtEditor calls it.
 */
import {
  offsetPolyline,
  endDirection,
  arrowHeadPoints,
  pathLength,
  flattenRoute,
  pointAtFraction,
  squigglePoints,
  lineSeqFloor,
  flipPoint,
  flipVector,
  routeEndPoint,
  toKonvaPoints,
} from '../src/lib/routeGeometry'
import type { Point, PlayerRoute, RouteSegment } from '../src/types'

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}
function eq(name: string, a: unknown, b: unknown) {
  check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b })
}
function near(name: string, got: number, want: number, tol = 1e-9) {
  check(name, Math.abs(got - want) <= tol, { got, want })
}

const P = (x: number, y: number): Point => ({ x, y })
const seg = (points: Point[], seq: number, type: RouteSegment['type'] = 'motion'): RouteSegment => ({
  type,
  points,
  seq,
})

console.log('\n1. toKonvaPoints / pathLength')
{
  eq('flattens in x,y order', toKonvaPoints([P(1, 2), P(3, 4)]), [1, 2, 3, 4])
  eq('empty stays empty', toKonvaPoints([]), [])
  near('3-4-5 triangle path', pathLength([P(0, 0), P(3, 4)]), 5)
  near('single point has no length', pathLength([P(9, 9)]), 0)
  near('empty has no length', pathLength([]), 0)
}

console.log('\n2. offsetPolyline stays parallel and preserves point count')
{
  const line = [P(0, 0), P(10, 0), P(20, 0)]
  const out = offsetPolyline(line, 5)
  eq('same number of points', out.length, line.length)
  // Direction is +x, so the normal is (0, 1): the whole line shifts down by 5.
  eq('offset perpendicular, not along', out, [P(0, 5), P(10, 5), P(20, 5)])
  eq('negative distance mirrors', offsetPolyline(line, -5), [P(0, -5), P(10, -5), P(20, -5)])
  eq('too short to offset -> unchanged', offsetPolyline([P(1, 1)], 5), [P(1, 1)])
}

console.log('\n3. endDirection is a unit vector from a lookback, not the last two points')
{
  const dir = endDirection([P(0, 0), P(10, 0)])
  eq('straight +x', dir, P(1, 0))
  near('unit length', Math.hypot(dir.x, dir.y), 1)

  // A shaky final pixel must not swing the arrow: with a 4-point lookback the
  // overall +x run dominates the 1-unit wobble.
  const shaky = [P(0, 0), P(10, 0), P(20, 0), P(30, 0), P(40, 0), P(40, 1)]
  const d2 = endDirection(shaky)
  check('wobble at the tip barely moves the angle', d2.x > 0.97, d2)

  eq('fewer than 2 points -> +x fallback', endDirection([P(5, 5)]), P(1, 0))

  // Degenerate: every point identical. `len || 1` divides 0 by 1, so this is
  // (0,0) — NOT a unit vector. Pinned because arrowHeadPoints depends on it.
  eq('all-identical points -> zero vector', endDirection([P(2, 2), P(2, 2), P(2, 2)]), P(0, 0))
}

console.log('\n4. arrowHeadPoints: tip sits on the path end')
{
  const tri = arrowHeadPoints([P(0, 0), P(10, 0)], 10)
  eq('6 numbers = 3 vertices', tri.length, 6)
  eq('tip is the last path point', [tri[0], tri[1]], [10, 0])
  // Back corners sit `size` behind the tip, spread symmetrically about the axis.
  near('back corners are behind the tip', tri[2], 0)
  near('corners straddle the axis', tri[3] + tri[5], 0)
  check('corners are not coincident', tri[3] !== tri[5], tri)

  // Degenerate input collapses the triangle onto the tip. Current behaviour.
  const flat = arrowHeadPoints([P(2, 2), P(2, 2)], 10)
  eq('zero-length path -> all vertices at the tip', flat, [2, 2, 2, 2, 2, 2])
}

console.log('\n5. flattenRoute prepends the start point and keeps segment order')
{
  const segments = [seg([P(1, 0), P(2, 0)], 1), seg([P(3, 0)], 2)]
  eq('start + every segment point, in order', flattenRoute(P(0, 0), segments), [
    P(0, 0),
    P(1, 0),
    P(2, 0),
    P(3, 0),
  ])
  eq('no segments -> just the start', flattenRoute(P(4, 4), []), [P(4, 4)])
}

console.log('\n6. pointAtFraction walks by arc length, not by point index')
{
  // Two segments of very different length: index-based interpolation would put
  // t=0.5 at the shared vertex (10,0); arc-length puts it far along the long leg.
  const path = [P(0, 0), P(10, 0), P(110, 0)]
  eq('t=0 -> first point', pointAtFraction(path, 0), P(0, 0))
  eq('t=1 -> last point', pointAtFraction(path, 1), P(110, 0))
  eq('t=0.5 -> halfway by distance', pointAtFraction(path, 0.5), P(55, 0))
  eq('t below 0 clamps', pointAtFraction(path, -3), P(0, 0))
  eq('t above 1 clamps', pointAtFraction(path, 9), P(110, 0))

  // A duplicated point makes a zero-length segment — the divide-by-zero guard.
  const withDup = [P(0, 0), P(5, 0), P(5, 0), P(10, 0)]
  eq('zero-length segment does not break interpolation', pointAtFraction(withDup, 0.5), P(5, 0))

  eq('empty path -> origin', pointAtFraction([], 0.5), P(0, 0))
  eq('single point -> itself', pointAtFraction([P(7, 7)], 0.5), P(7, 7))
  eq('all points identical -> that point', pointAtFraction([P(7, 7), P(7, 7)], 0.5), P(7, 7))

  // Monotonic along the path: x must never go backwards.
  let prevX = -Infinity
  let monotonic = true
  for (let i = 0; i <= 20; i++) {
    const x = pointAtFraction(path, i / 20).x
    if (x < prevX) monotonic = false
    prevX = x
  }
  check('advances monotonically', monotonic)
}

console.log('\n7. squigglePoints tapers to the exact endpoints')
{
  const straight = [P(0, 0), P(200, 0)]
  const wave = squigglePoints(straight, 4, 16)
  check('resampled denser than the input', wave.length > 10, wave.length)
  // fade = min(1, dist/wavelength, (total-dist)/wavelength) is 0 at both ends,
  // so the wave must meet the token and the arrowhead exactly.
  eq('starts exactly on the path start', wave[0], P(0, 0))
  eq('ends exactly on the path end', wave[wave.length - 1], P(200, 0))
  const maxOffset = Math.max(...wave.map((p) => Math.abs(p.y)))
  check('never exceeds the amplitude', maxOffset <= 4 + 1e-9, maxOffset)
  check('actually waves somewhere', maxOffset > 1, maxOffset)

  eq('shorter than one wavelength -> untouched', squigglePoints([P(0, 0), P(3, 0)], 4, 16), [
    P(0, 0),
    P(3, 0),
  ])
  eq('single point -> untouched', squigglePoints([P(1, 1)], 4, 16), [P(1, 1)])
}

console.log('\n8. lineSeqFloor keeps exactly `limit` most recent lines, inclusive')
{
  const route = (id: string, seqs: number[]): PlayerRoute => ({
    playerId: id,
    segments: seqs.map((s) => seg([P(0, 0)], s)),
  })

  eq('fewer lines than the limit -> keep all', lineSeqFloor([route('a', [1, 2])], [], 3), -Infinity)
  eq('exactly the limit -> keep all', lineSeqFloor([route('a', [1, 2, 3])], [], 3), -Infinity)

  const floor = lineSeqFloor([route('a', [1, 2, 3, 4])], [], 3)
  eq('floor is the 3rd highest seq', floor, 2)
  const kept = [1, 2, 3, 4].filter((s) => s >= floor)
  eq('the floor is inclusive: 3 lines survive', kept, [2, 3, 4])

  // Routes and transfers rank together off the one counter.
  eq(
    'transfers compete with route segments',
    lineSeqFloor([route('a', [1, 5])], [{ seq: 9 }, { seq: 7 }], 2),
    7,
  )
  eq('segments across players rank together', lineSeqFloor([route('a', [1, 4]), route('b', [2, 3])], [], 2), 3)

  // limit 0 indexes seqs[-1]. Unreachable via settings (MIN_VISIBLE_LINES is 1)
  // but the export isn't guarded — pinned so a caller change surfaces it.
  check('limit 0 returns undefined, not a number', lineSeqFloor([route('a', [1, 2])], [], 0) === undefined)
}

console.log('\n9. flipPoint / flipVector')
{
  const dims = { width: 1000, height: 600 }
  eq('horizontal mirrors x only', flipPoint(P(100, 50), 'horizontal', dims), P(900, 50))
  eq('vertical mirrors y only', flipPoint(P(100, 50), 'vertical', dims), P(100, 550))
  eq('centre point is a fixed point', flipPoint(P(500, 300), 'horizontal', dims), P(500, 300))

  for (const axis of ['horizontal', 'vertical'] as const) {
    eq(
      `flipping twice is identity (${axis})`,
      flipPoint(flipPoint(P(123, 456), axis, dims), axis, dims),
      P(123, 456),
    )
    eq(`vector flipped twice is identity (${axis})`, flipVector(flipVector(P(27, -8), axis), axis), P(27, -8))
  }

  // The bug the source comment records: a vector must have no translation term.
  const v = flipVector(P(27, 0), 'horizontal')
  eq('vector flip negates, it does not translate', v, P(-27, 0))
  eq('vertical vector flip negates y only', flipVector(P(27, 8), 'vertical'), P(27, -8))
}

console.log('\n10. routeEndPoint: where the next segment starts')
{
  const fallback = P(50, 50)
  eq('no route -> player position', routeEndPoint(undefined, fallback), fallback)
  eq('empty segments -> player position', routeEndPoint({ playerId: 'a', segments: [] }, fallback), fallback)
  eq(
    'chains from the last point of the last segment',
    routeEndPoint({ playerId: 'a', segments: [seg([P(1, 1), P(2, 2)], 1), seg([P(3, 3), P(9, 9)], 2)] }, fallback),
    P(9, 9),
  )
  eq(
    'segment with no points -> fallback',
    routeEndPoint({ playerId: 'a', segments: [seg([], 1)] }, fallback),
    fallback,
  )
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
