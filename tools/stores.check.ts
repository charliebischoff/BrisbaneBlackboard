/**
 * Headless checks for the two localStorage modules `src/lib/storage.ts`
 * (saved plays) and `src/lib/settingsStore.ts` (display settings).
 *
 * Same arrangement as the other check files: esbuild + node, no test framework.
 *
 *   npm run check:stores
 *
 * Node has no `localStorage`, so a Map-backed stub is installed on globalThis
 * below — both modules read the global lazily inside their functions, so this
 * works regardless of import order.
 *
 * Expected noise: the corrupt-blob cases below deliberately store unparseable
 * JSON, and both modules `console.error` on a failed read. Error lines in the
 * output are part of the check passing, not a failure.
 */
import { localPlayStore, MAX_PLAYS } from '../src/lib/storage'
import {
  settingsStore,
  DEFAULT_SETTINGS,
  SIZE_LIMITS,
  MIN_VISIBLE_LINES,
  MAX_VISIBLE_LINES_LIMIT,
} from '../src/lib/settingsStore'
import type { Play } from '../src/types'

// --- localStorage stub -------------------------------------------------------
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}
const PLAYS_KEY = 'playbook.plays.v1'
const reset = () => store.clear()

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
function throws(name: string, fn: () => void) {
  try {
    fn()
    check(name, false, 'did not throw')
  } catch {
    check(name, true)
  }
}
function noThrow(name: string, fn: () => void) {
  try {
    fn()
    check(name, true)
  } catch (err) {
    check(name, false, String(err))
  }
}

const play = (id: string, updatedAt: string, over: Partial<Play> = {}): Play =>
  ({
    id,
    name: `play ${id}`,
    courtType: 'half',
    players: [],
    routes: [],
    ballTransfers: [],
    ballHolderId: null,
    ballOffset: { x: 0, y: 0 },
    createdAt: updatedAt,
    updatedAt,
    ...over,
  }) as Play

console.log('\n1. plays: save / getAll / remove round trip')
{
  reset()
  localPlayStore.save(play('a', '2026-01-01T00:00:00.000Z'))
  localPlayStore.save(play('b', '2026-03-01T00:00:00.000Z'))
  eq('both plays come back', localPlayStore.getAll().length, 2)
  eq(
    'newest updatedAt first',
    localPlayStore.getAll().map((p) => p.id),
    ['b', 'a'],
  )
  localPlayStore.remove('b')
  eq(
    'remove drops only that play',
    localPlayStore.getAll().map((p) => p.id),
    ['a'],
  )
  localPlayStore.remove('nope')
  eq('removing an unknown id is a no-op', localPlayStore.getAll().length, 1)
  localPlayStore.clear()
  eq('clear empties the store', localPlayStore.getAll(), [])
}

console.log('\n2. plays: re-saving the same id updates in place and keeps createdAt')
{
  reset()
  localPlayStore.save(play('a', '2026-01-01T00:00:00.000Z'))
  // The editor stamps createdAt = updatedAt = now on every snapshot.
  localPlayStore.save(play('a', '2026-06-01T00:00:00.000Z', { name: 'renamed' }))
  const all = localPlayStore.getAll()
  eq('still one play, not two', all.length, 1)
  eq('new fields applied', all[0].name, 'renamed')
  eq('updatedAt moved', all[0].updatedAt, '2026-06-01T00:00:00.000Z')
  eq('original createdAt survived the update', all[0].createdAt, '2026-01-01T00:00:00.000Z')
}

console.log('\n3. plays: MAX_PLAYS gates new plays only')
{
  reset()
  for (let i = 0; i < MAX_PLAYS; i++) {
    localPlayStore.save(play(`p${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`))
  }
  eq('store is full', localPlayStore.getAll().length, MAX_PLAYS)
  throws('a 101st new play is refused', () => localPlayStore.save(play('overflow', '2026-02-01T00:00:00.000Z')))
  noThrow('updating an existing play still works at the cap', () =>
    localPlayStore.save(play('p0', '2026-09-01T00:00:00.000Z', { name: 'edited at cap' })),
  )
  eq('and did not grow the store', localPlayStore.getAll().length, MAX_PLAYS)
}

console.log('\n4. plays: a corrupt or partial blob must never break the read path')
{
  // Offline reliability is a hard requirement: pulling up a play mid-game must
  // not depend on every stored record being well formed.
  reset()
  store.set(PLAYS_KEY, '{not json')
  eq('unparseable blob reads as empty, not a throw', localPlayStore.getAll(), [])

  reset()
  const broken = { ...play('bad', '2026-01-01T00:00:00.000Z') } as any
  delete broken.updatedAt
  store.set(PLAYS_KEY, JSON.stringify([broken, play('good', '2026-02-01T00:00:00.000Z')]))
  noThrow('a play missing updatedAt does not take the whole list down', () => localPlayStore.getAll())
  eq('the well-formed play is still listed', localPlayStore.getAll().some((p) => p.id === 'good'), true)

  reset()
  store.set(PLAYS_KEY, JSON.stringify({ not: 'an array' }))
  noThrow('a non-array blob does not throw', () => localPlayStore.getAll())
}

console.log('\n5. settings: defaults and round trip')
{
  reset()
  eq('empty storage -> defaults', settingsStore.get(), DEFAULT_SETTINGS)
  const saved = settingsStore.save({
    maxVisibleLines: 5,
    sizes: { half: { ballRadius: 9, playerRadius: 20 }, full: { ballRadius: 12, playerRadius: 30 } },
  })
  eq('save returns the value it stored', settingsStore.get(), saved)
  eq('per-court sizes survive', settingsStore.get().sizes.full.playerRadius, 30)
  eq('courts stay independent', settingsStore.get().sizes.half.playerRadius, 20)
}

console.log('\n6. settings: anything read back is clamped to what the sliders can express')
{
  reset()
  const out = settingsStore.save({
    maxVisibleLines: 99,
    sizes: {
      half: { ballRadius: 999, playerRadius: -5 },
      full: { ballRadius: 0, playerRadius: 9999 },
    },
  })
  eq('save returns the normalized value, not the input', out.maxVisibleLines, MAX_VISIBLE_LINES_LIMIT)
  eq('half ball clamped to its max', out.sizes.half.ballRadius, SIZE_LIMITS.half.ball.max)
  eq('half player clamped to its min', out.sizes.half.playerRadius, SIZE_LIMITS.half.player.min)
  eq('full ball clamped to its min', out.sizes.full.ballRadius, SIZE_LIMITS.full.ball.min)
  eq('full player clamped to its max', out.sizes.full.playerRadius, SIZE_LIMITS.full.player.max)

  eq('0 visible lines clamps up', settingsStore.save({ ...DEFAULT_SETTINGS, maxVisibleLines: 0 }).maxVisibleLines, MIN_VISIBLE_LINES)
  eq('fractional visible lines rounds', settingsStore.save({ ...DEFAULT_SETTINGS, maxVisibleLines: 3.6 }).maxVisibleLines, 4)

  reset()
  store.set('playbook.settings.v3', JSON.stringify({ maxVisibleLines: 'hi', sizes: { half: {}, full: {} } }))
  eq('garbage field falls back to the default', settingsStore.get().maxVisibleLines, DEFAULT_SETTINGS.maxVisibleLines)
  eq('missing sizes fall back to defaults', settingsStore.get().sizes, DEFAULT_SETTINGS.sizes)
}

console.log('\n7. settings: legacy blobs migrate instead of resetting')
{
  // v2: one flat pair of sizes. Full court takes the 1.5x bump it used to get
  // at render time, so an upgrade changes nothing visually on either court.
  reset()
  store.set('playbook.settings.v2', JSON.stringify({ maxVisibleLines: 2, ballRadius: 10, playerRadius: 16 }))
  const v2 = settingsStore.get()
  eq('v2 maxVisibleLines carried over', v2.maxVisibleLines, 2)
  eq('v2 half sizes taken as-is', v2.sizes.half, { ballRadius: 10, playerRadius: 16 })
  eq('v2 full player gets the legacy 1.5x bump', v2.sizes.full.playerRadius, 24)

  // v1: ballScale was a multiple of a 17-unit token.
  reset()
  store.set('playbook.settings.v1', JSON.stringify({ maxVisibleLines: 4, ballScale: 0.5 }))
  const v1 = settingsStore.get()
  eq('v1 maxVisibleLines carried over', v1.maxVisibleLines, 4)
  eq('v1 ballScale becomes an absolute radius', v1.sizes.half.ballRadius, 8.5)

  // v3 present alongside an older blob: v3 wins.
  reset()
  store.set('playbook.settings.v1', JSON.stringify({ maxVisibleLines: 4, ballScale: 0.5 }))
  store.set('playbook.settings.v3', JSON.stringify({ ...DEFAULT_SETTINGS, maxVisibleLines: 7 }))
  eq('current blob takes priority over legacy', settingsStore.get().maxVisibleLines, 7)

  // Older blobs are left in place on purpose, so a bad migration is recoverable.
  reset()
  store.set('playbook.settings.v2', JSON.stringify({ maxVisibleLines: 2, ballRadius: 10, playerRadius: 16 }))
  settingsStore.get()
  check('legacy blob is not deleted by reading it', store.has('playbook.settings.v2'))

  // A corrupt v2 must not swallow a still-usable v1 migration.
  reset()
  store.set('playbook.settings.v2', '{broken')
  store.set('playbook.settings.v1', JSON.stringify({ maxVisibleLines: 4, ballScale: 0.5 }))
  eq('corrupt v2 falls through to v1', settingsStore.get().maxVisibleLines, 4)

  reset()
  store.set('playbook.settings.v3', '{broken')
  eq('corrupt current blob -> defaults, not a throw', settingsStore.get(), DEFAULT_SETTINGS)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
