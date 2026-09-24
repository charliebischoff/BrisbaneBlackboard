/**
 * Headless checks for `src/lib/tapGesture.ts`.
 *
 * Same deal as the other checks here: no test runner, esbuild + node, and it
 * lives outside `src/` so `tsc -b` doesn't demand @types/node for `process.exit`.
 *
 *   npm run check:tapgesture
 *
 * This covers the *decision* only. The wiring in `CourtEditor.handleTokenTap`
 * — that the two taps come from Konva's onClick/onTap at all, and that the ref
 * is cleared after a hit — is not covered and has to be walked by hand.
 */
import {
  isDoubleTap,
  DOUBLE_TAP_MS,
  SAME_TAP_FLOOR_MS,
  type TapRecord,
} from '../src/lib/tapGesture'

let failures = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}`, detail === undefined ? '' : JSON.stringify(detail))
  }
}

const T = (playerId: string, at: number): TapRecord => ({ playerId, at })
/** First tap always at t=1000, so a "negative elapsed" case has room below it. */
const FIRST = T('p1', 1000)

console.log('tapGesture')

check('no previous tap is never a double-tap', isDoubleTap(null, T('p1', 1200)) === false)

check(
  'same player, comfortably inside the window',
  isDoubleTap(FIRST, T('p1', 1000 + 200)) === true,
)

check(
  'same player, past the window',
  isDoubleTap(FIRST, T('p1', 1000 + DOUBLE_TAP_MS + 1)) === false,
)

check(
  'exactly at the window ceiling still counts',
  isDoubleTap(FIRST, T('p1', 1000 + DOUBLE_TAP_MS)) === true,
)

check(
  'exactly at the floor counts',
  isDoubleTap(FIRST, T('p1', 1000 + SAME_TAP_FLOOR_MS)) === true,
)

// The reason the floor exists: PlayerToken binds onClick and onTap to the same
// handler, so one physical tap can arrive twice, milliseconds apart.
check(
  'just under the floor is one physical tap, not two',
  isDoubleTap(FIRST, T('p1', 1000 + SAME_TAP_FLOOR_MS - 1)) === false,
)
check('a duplicate event at the same instant is not a double-tap',
  isDoubleTap(FIRST, T('p1', 1000)) === false)

// The reason this isn't Konva's dbltap: its window is stage-global, so this
// pair would have fired on p2.
check(
  'two different players in quick succession is not a double-tap',
  isDoubleTap(FIRST, T('p2', 1000 + 200)) === false,
)

check(
  'a clock that went backwards fails rather than triggering',
  isDoubleTap(FIRST, T('p1', 900)) === false,
)

check(
  'an explicit window argument overrides the default',
  isDoubleTap(FIRST, T('p1', 1000 + 300), 100) === false,
)

console.log(failures === 0 ? '\nall ok' : `\n${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
