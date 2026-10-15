import type { BallTransfer, FreeDrawMark, PlayerRoute } from '../types'

/**
 * Stamps a global authoring order onto a play loaded from storage.
 *
 * Plays written before sequencing existed have no `seq` at all; the best
 * available guess at their order is the order things sit in the arrays. Doing it
 * at the load boundary keeps playback free of any legacy branch. Returns the
 * next free counter value alongside the normalized data.
 *
 * Ball throws are straightened here too: plays written before `endBallDrag` began
 * committing a straight line still carry the raw drag stroke, which playback has
 * never followed. First and last point preserve the throw's real direction; the
 * exact endpoints of an old throw aren't recoverable (`ballOffset` describes only
 * the final holder), so nothing is invented beyond dropping the curve.
 *
 * Lives here rather than inside `usePlayEditor` purely so it can be checked
 * headlessly — same reason `courtBoard.ts` is a module. Keep it React-free.
 */
/**
 * One above the highest `seq` present — i.e. where the counter has to resume so
 * the next line drawn lands after everything still on the board.
 *
 * The erase paths used to ask `normalizeSequence` for this, which rebuilt every
 * route, transfer and mark array purely so the caller could read the counter off
 * the end. Same answer, no allocation, and it says what it means.
 *
 * 0 for an empty board, matching the counter's starting value.
 */
export function nextSeqAfter(
  routes: PlayerRoute[],
  transfers: BallTransfer[],
  marks: FreeDrawMark[],
): number {
  let highest = -1
  for (const route of routes) {
    for (const segment of route.segments) {
      if (segment.seq > highest) highest = segment.seq
    }
  }
  for (const transfer of transfers) if (transfer.seq > highest) highest = transfer.seq
  for (const mark of marks) if (mark.seq > highest) highest = mark.seq
  return highest + 1
}

export function normalizeSequence(
  routes: PlayerRoute[],
  transfers: BallTransfer[],
  marks: FreeDrawMark[],
): {
  routes: PlayerRoute[]
  transfers: BallTransfer[]
  marks: FreeDrawMark[]
  nextSeq: number
} {
  let counter = 0
  const stamp = (seq: number | undefined): number => {
    const value = typeof seq === 'number' ? seq : counter
    counter = Math.max(counter, value) + 1
    return value
  }
  const nextRoutes = routes.map((r) => ({
    ...r,
    segments: r.segments.map((s) => ({ ...s, seq: stamp(s.seq) })),
  }))
  const nextTransfers = transfers.map((t) => ({
    ...t,
    seq: stamp(t.seq),
    points: t.points.length > 2 ? [t.points[0], t.points[t.points.length - 1]] : t.points,
  }))
  // Marks have to be stamped here too, even though they take no part in
  // playback. They share the counter, so a play whose highest seq belongs to a
  // mark would otherwise rebase `seqRef` below that mark — and the next stroke
  // drawn would collide with it, leaving undo to remove the wrong thing.
  const nextMarks = marks.map((m) => ({ ...m, seq: stamp(m.seq) }))
  return { routes: nextRoutes, transfers: nextTransfers, marks: nextMarks, nextSeq: counter }
}
