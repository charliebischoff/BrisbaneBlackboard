/**
 * Headless checks for `src/lib/courtBoard.ts`.
 *
 * The repo has no test runner and shouldn't grow one for this — a framework in a
 * repo with none is a bigger diff than what it verifies. This runs on esbuild
 * (which ships with vite) plus node:
 *
 *   npm run check:courtboard
 *
 * It lives outside `src/` on purpose: `tsconfig` includes only `src`, so keeping
 * it here means `tsc -b` doesn't demand @types/node for the `process.exit` below.
 *
 * This is the only automated coverage of per-court board retention. The wiring
 * inside `usePlayEditor.setCourtType` is NOT covered here — only the pure logic.
 */
import {
  buildDefaultBoard,
  switchCourt,
  reconcileStash,
  type CourtBoard,
  type CourtStash,
} from '../src/lib/courtBoard'
import type { Player, PlayerRoute, BallTransfer } from '../src/types'

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

const P = (id: string, x = 0, y = 0): Player => ({ id, number: 1, team: 'offense', x, y })
const R = (playerId: string, seq: number): PlayerRoute => ({
  playerId,
  segments: [{ type: 'motion', points: [{ x: 0, y: 0 }], seq }],
})
const T = (fromId: string, toId: string, seq: number): BallTransfer => ({
  fromId,
  toId,
  points: [],
  seq,
})

const board = (over: Partial<CourtBoard> = {}): CourtBoard => ({
  players: [P('a'), P('b')],
  routes: [],
  ballTransfers: [],
  ballOffset: { x: 27, y: 0 },
  ballHolderId: 'a',
  seq: 0,
  ...over,
})

// Stand-ins for DEFAULT_SPOTS[court] — the caller supplies these.
const halfDefaults = board({ players: [P('a', 10, 10), P('b', 20, 20)] })
const fullDefaults = board({ players: [P('a', 100, 100), P('b', 200, 200)] })

console.log('\n1. first visit to an unvisited court -> defaults, not undefined/empty')
{
  const cur = board({ routes: [R('a', 1)], seq: 5 })
  const { board: got } = switchCourt({}, 'half', 'full', cur, fullDefaults)
  eq('players are full court defaults', got.players, fullDefaults.players)
  eq('routes empty', got.routes, [])
  eq('transfers empty', got.ballTransfers, [])
  eq('seq reset to 0', got.seq, 0)
  check('board is defined', got !== undefined && got !== null)
}

console.log('\n2. round trip restores deep-equal, including seq')
{
  const original = board({ players: [P('a', 7, 7)], routes: [R('a', 3)], seq: 9 })
  const s1 = switchCourt({}, 'half', 'full', original, fullDefaults)
  const s2 = switchCourt(s1.stash, 'full', 'half', s1.board, halfDefaults)
  eq('restored board equals original', s2.board, original)
  eq('seq restored', s2.board.seq, 9)
}

console.log('\n3. three-way alternation, no bleed in either direction')
{
  const h = board({ players: [P('a', 1, 1)], routes: [R('a', 1)], seq: 1 })
  const f = board({ players: [P('a', 99, 99)], routes: [R('b', 2)], seq: 2 })

  let s = switchCourt({}, 'half', 'full', h, fullDefaults) // leave half
  s = switchCourt(s.stash, 'full', 'half', f, halfDefaults) // leave full carrying f
  eq('back on half: half content', s.board.routes, h.routes)
  eq('back on half: half seq', s.board.seq, 1)
  s = switchCourt(s.stash, 'half', 'full', s.board, fullDefaults)
  eq('back on full: full content', s.board.routes, f.routes)
  eq('back on full: full seq', s.board.seq, 2)
  eq('back on full: full players', s.board.players, f.players)
}

console.log('\n4. seq monotonicity: new lines sort after restored ones')
{
  // draw on half (seq 1), leave; draw on full (seq 1 of its own), come back,
  // draw again -> the new half line must sort after the restored half line.
  const h = board({ routes: [R('a', 1)], seq: 2 })
  let s = switchCourt({}, 'half', 'full', h, fullDefaults)
  const fWork = { ...s.board, routes: [R('b', 1)], seq: 2 }
  s = switchCourt(s.stash, 'full', 'half', fWork, halfDefaults)
  const restoredSeq = s.board.seq
  const newLineSeq = restoredSeq // next drawn line takes the counter's value
  const restoredMax = Math.max(...s.board.routes.flatMap((r) => r.segments.map((g) => g.seq)))
  check(`new seq ${newLineSeq} > restored max ${restoredMax}`, newLineSeq > restoredMax)
}

console.log('\n5. restore after the stash was cleared -> defaults')
{
  const cur = board({ routes: [R('a', 1)], seq: 4 })
  const s1 = switchCourt({}, 'half', 'full', cur, fullDefaults)
  const cleared: CourtStash = {} // what loadPlay/newPlay do
  const s2 = switchCourt(cleared, 'full', 'half', s1.board, halfDefaults)
  eq('defaults, not the pre-clear board', s2.board.players, halfDefaults.players)
  eq('no leftover routes', s2.board.routes, [])
}

console.log('\n6. reconcileStash drops a deleted player and their geometry, both courts')
{
  const withGone = (): CourtBoard =>
    board({
      players: [P('a'), P('gone')],
      routes: [R('a', 1), R('gone', 2)],
      ballTransfers: [T('a', 'gone', 3), T('a', 'a', 4)],
      ballHolderId: 'gone',
    })
  const stash: CourtStash = { half: withGone(), full: withGone() }
  const out = reconcileStash(stash, new Set(['a', 'b']))
  for (const c of ['half', 'full'] as const) {
    eq(`${c}: player dropped`, out[c]!.players.map((p) => p.id), ['a'])
    eq(`${c}: route dropped`, out[c]!.routes.map((r) => r.playerId), ['a'])
    eq(`${c}: transfer touching them dropped`, out[c]!.ballTransfers.map((t) => t.seq), [4])
    // Must match what syncCourtWithRoster does to the LIVE board: hand the ball
    // to a survivor. Returning null here would restore a board whose ball has
    // vanished, because nothing on the restore path picks a new holder.
    eq(`${c}: departed holder replaced by a survivor`, out[c]!.ballHolderId, 'a')
  }
  // Nobody left to hold it -> null is the only honest answer.
  const emptied = reconcileStash(
    { half: board({ players: [P('gone')], ballHolderId: 'gone' }) },
    new Set(['a']),
  )
  eq('no survivors -> null holder', emptied.half!.ballHolderId, null)
  const kept = reconcileStash({ half: board({ ballHolderId: 'a' }) }, new Set(['a', 'b']))
  eq('surviving holder kept', kept.half!.ballHolderId, 'a')
}

console.log('\n7. stash isolation: mutating the returned board must not reach the stash')
{
  const cur = board({ routes: [R('a', 1)], seq: 3 })
  const s1 = switchCourt({}, 'half', 'full', cur, fullDefaults)
  // Come back to half, then mutate what we got.
  const s2 = switchCourt(s1.stash, 'full', 'half', s1.board, halfDefaults)
  s2.board.routes.push(R('zzz', 99))
  s2.board.ballOffset.x = -1
  const s3 = switchCourt(s2.stash, 'half', 'full', s2.board, fullDefaults)
  const s4 = switchCourt(s3.stash, 'full', 'half', s3.board, halfDefaults)
  check('stashed copy not polluted by push', s4.board.routes.length === 2, s4.board.routes.length)
  // (2 because the push happened before the re-stash — the check that matters is
  // that the ORIGINAL stash entry from s1 was not retroactively changed.)
  eq('original s1 stash entry intact', s1.stash.half!.routes.length, 1)
  eq('original s1 stash offset intact', s1.stash.half!.ballOffset.x, 27)
}

console.log('\n8. switching to the court already shown is a no-op')
{
  const cur = board({ routes: [R('a', 1)], seq: 3 })
  const s = switchCourt({}, 'half', 'half', cur, halfDefaults)
  eq('board unchanged', s.board, cur)
  eq('stash untouched', s.stash, {})
}

console.log('\n9. buildDefaultBoard: the reset a never-visited court starts as')
{
  const spots = [
    { x: 10, y: 11 },
    { x: 20, y: 21 },
    { x: 30, y: 31 },
  ]
  const roster = [P('a'), P('b'), P('c')]
  const got = buildDefaultBoard(roster, spots, 27, 'b')

  eq('players land on spots in order', got.players.map((p) => [p.x, p.y]), [
    [10, 11],
    [20, 21],
    [30, 31],
  ])
  eq('identity survives the move', got.players.map((p) => p.id), ['a', 'b', 'c'])
  eq('team survives the move', got.players.map((p) => p.team), ['offense', 'offense', 'offense'])
  eq('routes cleared', got.routes, [])
  eq('transfers cleared', got.ballTransfers, [])
  eq('seq reset', got.seq, 0)
  eq('ball offset from the caller, y zeroed', got.ballOffset, { x: 27, y: 0 })
  eq('possession carries over', got.ballHolderId, 'b')
  eq('null possession stays null', buildDefaultBoard(roster, spots, 27, null).ballHolderId, null)
  check('roster not mutated in place', roster[0].x === 0 && roster[0].y === 0)

  // More players than spots: `i % spots.length` wraps, so the extras stack
  // exactly on the first few. Pinning what it actually does, not endorsing it.
  const many = [P('a'), P('b'), P('c'), P('d'), P('e')]
  eq('extras wrap onto the first spots', buildDefaultBoard(many, spots, 27, null).players.map((p) => [p.x, p.y]), [
    [10, 11],
    [20, 21],
    [30, 31],
    [10, 11],
    [20, 21],
  ])
}

console.log('\n10. CourtBoard field set — tripwire for a field added but never applied')
{
  // `setCourtType` applies these one by one. Add a seventh field to CourtBoard
  // and forget the matching setter and the board restores incomplete, silently.
  // This fails the moment the shape changes, forcing a look at the apply step.
  eq(
    'exactly the six known fields',
    Object.keys(buildDefaultBoard([P('a')], [{ x: 0, y: 0 }], 27, 'a')).sort(),
    ['ballHolderId', 'ballOffset', 'ballTransfers', 'players', 'routes', 'seq'],
  )
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
