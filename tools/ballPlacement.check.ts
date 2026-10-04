/**
 * Headless checks for `src/lib/ballPlacement.ts`.
 *
 * Same arrangement as the other check scripts: esbuild + node, no test runner,
 * and it lives outside `src/` so `tsc -b` doesn't demand @types/node for the
 * `process.exit` below.
 *
 *   npm run check:ballplacement
 *
 * What's covered is the snap rule only. Whether the editor then records a
 * transfer, clears possession, or leaves the ball loose is wiring in
 * `usePlayEditor` and is NOT verified here.
 */
import { nearestCatcher, restingOffset, type CatchCandidate } from '../src/lib/ballPlacement'

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

const C = (id: string, x: number, y: number): CatchCandidate => ({ id, pos: { x, y } })
const FALLBACK = { x: 27, y: 0 }

console.log('\n1. nearestCatcher: in radius, out of radius, and the boundary')
{
  const list = [C('a', 100, 100)]
  eq('a drop on the token catches', nearestCatcher({ x: 100, y: 100 }, list, 38)?.id, 'a')
  eq('just inside catches', nearestCatcher({ x: 137, y: 100 }, list, 38)?.id, 'a')
  // The boundary is inclusive — `<=`. Pinning it so a later `<` is a visible change.
  eq('exactly on the radius catches', nearestCatcher({ x: 138, y: 100 }, list, 38)?.id, 'a')
  eq('a hair outside is open floor', nearestCatcher({ x: 139, y: 100 }, list, 38), null)
  eq('out of bounds, nowhere near anyone', nearestCatcher({ x: 5, y: 450 }, list, 38), null)
  eq('nobody on court at all', nearestCatcher({ x: 100, y: 100 }, [], 38), null)
}

console.log('\n2. nearestCatcher: nearest wins, and ties are stable')
{
  const list = [C('far', 120, 100), C('near', 105, 100)]
  eq('the closer one wins regardless of order', nearestCatcher({ x: 100, y: 100 }, list, 38)?.id, 'near')

  // Two players exactly equidistant: first-wins, so the answer never depends on
  // Konva's z-order the way a hit test would.
  const tied = [C('first', 90, 100), C('second', 110, 100)]
  eq('a tie goes to the first candidate', nearestCatcher({ x: 100, y: 100 }, tied, 38)?.id, 'first')
  eq('...and flipping the list flips the winner', nearestCatcher({ x: 100, y: 100 }, [...tied].reverse(), 38)?.id, 'second')

  eq('the catcher reports its own position', nearestCatcher({ x: 100, y: 100 }, list, 38)?.pos, {
    x: 105,
    y: 100,
  })
}

console.log('\n3. restingOffset: the drop direction is kept, the overlap is not')
{
  // Dropped well clear of the token: taken exactly as dropped, no nudging.
  eq('a clear drop keeps its exact spot', restingOffset({ x: 130, y: 100 }, { x: 100, y: 100 }, 20, FALLBACK), {
    x: 30,
    y: 0,
  })

  // Dropped on top of the token: pushed out along the same line to the min gap,
  // so the puck never overlaps its carrier.
  eq('an overlapping drop is pushed out, direction intact', restingOffset({ x: 105, y: 100 }, { x: 100, y: 100 }, 20, FALLBACK), {
    x: 20,
    y: 0,
  })
  const diag = restingOffset({ x: 103, y: 104 }, { x: 100, y: 100 }, 20, FALLBACK)
  check('a diagonal push lands on the gap circle', Math.abs(Math.hypot(diag.x, diag.y) - 20) < 1e-9, diag)
  check('...pointing the same way it was dropped', Math.abs(diag.x * 4 - diag.y * 3) < 1e-9, diag)

  // Dead centre has no direction to preserve, so the default side is used.
  eq('a dead-centre drop falls back', restingOffset({ x: 100, y: 100 }, { x: 100, y: 100 }, 20, FALLBACK), FALLBACK)
  const copied = restingOffset({ x: 100, y: 100 }, { x: 100, y: 100 }, 20, FALLBACK)
  copied.x = -1
  eq('the fallback is copied, not handed out by reference', FALLBACK.x, 27)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
