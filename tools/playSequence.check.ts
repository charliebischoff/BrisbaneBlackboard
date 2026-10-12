/**
 * Headless checks for `src/lib/playSequence.ts`.
 *
 * Same arrangement as the other check files: esbuild + node, no test framework,
 * and it lives outside `src/` so `tsc -b` doesn't demand @types/node.
 *
 *   npm run check:playsequence
 *
 * This function runs exactly once per load, on data that came off disk, and its
 * only visible output is a counter — so every bug here is silent until a coach
 * reloads a saved play and hits undo. That is why it is covered at all.
 */
import { normalizeSequence } from '../src/lib/playSequence'
import type { BallTransfer, FreeDrawMark, PlayerRoute } from '../src/types'

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

/** `seq?: number` — omit it to stand in for a play written before sequencing. */
const R = (playerId: string, seqs: (number | undefined)[]): PlayerRoute => ({
  playerId,
  segments: seqs.map((seq) => ({ type: 'motion', points: [{ x: 0, y: 0 }], seq }) as any),
})
const T = (seq: number | undefined, points: { x: number; y: number }[] = []): BallTransfer =>
  ({ fromId: 'a', toId: 'b', points, seq }) as any
const M = (id: string, seq: number | undefined): FreeDrawMark =>
  ({ id, points: [{ x: 1, y: 2 }], seq }) as any

const seqsOf = (routes: PlayerRoute[]) => routes.flatMap((r) => r.segments.map((s) => s.seq))

console.log('\n1. a play already carrying seqs is left exactly as it was')
{
  const out = normalizeSequence([R('a', [0, 1]), R('b', [2])], [T(3)], [M('m', 4)])
  eq('route seqs untouched', seqsOf(out.routes), [0, 1, 2])
  eq('transfer seq untouched', out.transfers[0].seq, 3)
  eq('mark seq untouched', out.marks[0].seq, 4)
  // The counter must land one past the highest seq in the play, or the next
  // thing drawn collides with something already on the board.
  eq('counter lands one past the highest', out.nextSeq, 5)
}

console.log('\n2. a legacy play with no seqs at all gets array order')
{
  const out = normalizeSequence([R('a', [undefined, undefined]), R('b', [undefined])], [T(undefined)], [])
  eq('routes numbered in array order', seqsOf(out.routes), [0, 1, 2])
  eq('transfers continue the same counter, not their own', out.transfers[0].seq, 3)
  eq('counter past the lot', out.nextSeq, 4)
}

console.log('\n3. a half-sequenced play: stamped ones win, gaps fill after them')
{
  // Written by a build that sequenced routes but not transfers, or hand-edited.
  const out = normalizeSequence([R('a', [5, undefined])], [T(undefined)], [])
  eq('the real seq is kept', seqsOf(out.routes)[0], 5)
  eq('the missing one lands after it, never on top of it', seqsOf(out.routes)[1], 6)
  eq('and the transfer after that', out.transfers[0].seq, 7)
}

console.log('\n4. a mark holding the highest seq still rebases the counter')
{
  // The bug this function exists to prevent. Marks take no part in playback, so
  // it is tempting to skip them — but they share the counter, and a counter
  // rebased below an existing mark means the next stroke drawn collides with it
  // and undo removes the wrong thing.
  const out = normalizeSequence([R('a', [0])], [], [M('m', 9)])
  eq('the mark is counted', out.nextSeq, 10)
  check('the counter is above every mark', out.nextSeq > Math.max(...out.marks.map((m) => m.seq)))

  // Whole-play invariant, stated once: nothing may share a seq, and the counter
  // must be clear of all of them.
  const mixed = normalizeSequence([R('a', [undefined, 3]), R('b', [undefined])], [T(undefined)], [M('m', undefined), M('n', 8)])
  const all = [...seqsOf(mixed.routes), ...mixed.transfers.map((t) => t.seq), ...mixed.marks.map((m) => m.seq)]
  eq('no two actions share a seq', new Set(all).size, all.length)
  check('counter clears every stamped seq', mixed.nextSeq > Math.max(...all), { all, next: mixed.nextSeq })
}

console.log('\n5. an empty play is a valid play')
{
  const out = normalizeSequence([], [], [])
  eq('nothing in, nothing out', [out.routes, out.transfers, out.marks], [[], [], []])
  // A fresh board starts at 0, so a loaded empty play must match it.
  eq('counter starts at 0', out.nextSeq, 0)
}

console.log('\n6. legacy ball throws are straightened, modern ones are not touched')
{
  const curved = [{ x: 0, y: 0 }, { x: 4, y: 9 }, { x: 6, y: 3 }, { x: 10, y: 0 }]
  const out = normalizeSequence([], [T(0, curved), T(1, [{ x: 0, y: 0 }, { x: 5, y: 5 }]), T(2, [])], [])
  // Endpoints keep the throw's real direction; the curve playback never followed
  // is dropped rather than reinterpreted.
  eq('a raw drag stroke collapses to its endpoints', out.transfers[0].points, [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ])
  eq('an already-straight throw is left alone', out.transfers[1].points, [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
  ])
  eq('an empty points array survives', out.transfers[2].points, [])
}

console.log('\n7. the input is never mutated in place')
{
  // It is called with arrays that came straight off the `Play` object, which
  // `localPlayStore` may still be holding — stamping those in place would edit
  // stored data as a side effect of loading it.
  const routes = [R('a', [undefined])]
  const transfers = [T(undefined, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])]
  const marks = [M('m', undefined)]
  const before = JSON.stringify([routes, transfers, marks])
  normalizeSequence(routes, transfers, marks)
  eq('caller arrays unchanged', JSON.stringify([routes, transfers, marks]), before)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
