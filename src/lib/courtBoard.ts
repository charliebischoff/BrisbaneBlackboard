/**
 * Per-court board retention.
 *
 * Half court and full court each keep their own positions and drawn lines, so
 * switching between them doesn't throw the work away. The two courts are *not*
 * scaled versions of each other (different aspect ratio, different basket
 * placement), so geometry is never translated between them — these are two
 * independent boards that happen to share a roster, not one board rendered two
 * ways. That constraint is the whole reason the switch used to reset.
 *
 * Deliberately pure and free of React, so it can be exercised headlessly. The
 * caller supplies the incoming court's defaults rather than this module reaching
 * for DEFAULT_SPOTS or the size settings, which keeps the coordinate-space
 * knowledge in one place (the editor hook) and this file testable on its own.
 *
 * The stash is written once on the way out of a court and read once on the way
 * back in — there is never a second live board kept in sync with the first, so
 * there is no invariant that can drift between switches.
 */
import type { BallTransfer, CourtType, Player, PlayerRoute, Point } from '../types'

/** Everything about a court that survives a switch away from it. */
export interface CourtBoard {
  players: Player[]
  routes: PlayerRoute[]
  ballTransfers: BallTransfer[]
  ballOffset: Point
  ballHolderId: string | null
  /**
   * The authoring-order counter as it stood on this court. Travels with the
   * board because it is shared by routes and transfers and drives playback
   * order: restore a board without it and the lines replay in the wrong order,
   * while newly drawn ones interleave among the restored ones instead of
   * landing after them.
   */
  seq: number
}

/** Boards for courts that have been visited and left. Absent = never visited. */
export type CourtStash = Partial<Record<CourtType, CourtBoard>>

/** Shallow-copies the arrays so a restored board can't be mutated through the stash. */
function copy(board: CourtBoard): CourtBoard {
  return {
    players: [...board.players],
    routes: [...board.routes],
    ballTransfers: [...board.ballTransfers],
    ballOffset: { ...board.ballOffset },
    ballHolderId: board.ballHolderId,
    seq: board.seq,
  }
}

/**
 * Stash the board being left and produce the one being entered.
 *
 * `defaults` is what a court that has never been visited starts as — the same
 * reset that used to happen on every switch. It is only consulted when there is
 * nothing stashed for `to`.
 */
export function switchCourt(
  stash: CourtStash,
  from: CourtType,
  to: CourtType,
  current: CourtBoard,
  defaults: CourtBoard,
): { stash: CourtStash; board: CourtBoard } {
  // Switching to the court already shown would otherwise stash and immediately
  // restore, which is harmless but makes the caller's intent ambiguous.
  if (from === to) return { stash, board: current }
  const next: CourtStash = { ...stash, [from]: copy(current) }
  const stashed = next[to]
  return { stash: next, board: copy(stashed ?? defaults) }
}

/**
 * Drop players who have left the roster from every stashed board.
 *
 * Without this, deleting a player while standing on one court would leave them
 * on the other court's stashed board, where they'd reappear on the next switch —
 * with no roster card left to remove them and still counting toward the
 * five-player cap. Mirrors what `syncCourtWithRoster` does to the live board.
 *
 * Reconciles rather than clearing: editing the roster shouldn't cost the coach
 * the other court's work.
 */
export function reconcileStash(stash: CourtStash, validIds: Set<string>): CourtStash {
  const out: CourtStash = {}
  for (const key of Object.keys(stash) as CourtType[]) {
    const board = stash[key]
    if (!board) continue
    const gone = (id: string) => !validIds.has(id)
    const players = board.players.filter((p) => validIds.has(p.id))
    out[key] = {
      ...board,
      players,
      routes: board.routes.filter((r) => !gone(r.playerId)),
      ballTransfers: board.ballTransfers.filter((t) => !gone(t.fromId) && !gone(t.toId)),
      // Hand the ball to a survivor rather than dropping it. This mirrors what
      // `syncCourtWithRoster` does to the live board — leaving it null would
      // restore a board whose ball has silently vanished, since nothing on the
      // restore path picks a new holder.
      ballHolderId:
        board.ballHolderId && gone(board.ballHolderId)
          ? players[0]?.id ?? null
          : board.ballHolderId,
    }
  }
  return out
}
