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
 * Geometry is written once on the way out of a court and read once on the way
 * back in. *Squad membership* is the one exception: who is on the court is the
 * same on both, so the three actions that change it — substitute, add, remove —
 * apply themselves to the stashed board at the same time as the live one, via
 * the helpers at the foot of this file. That keeps the two boards
 * squad-identical by construction, so the switch itself still has nothing to
 * reconcile.
 */
import type { BallTransfer, CourtType, FreeDrawMark, Player, PlayerRoute, Point } from '../types'

/** Everything about a court that survives a switch away from it. */
export interface CourtBoard {
  players: Player[]
  routes: PlayerRoute[]
  ballTransfers: BallTransfer[]
  /**
   * Freehand annotations. Per-court for the same reason as everything else
   * here: the two courts are different coordinate spaces, so a circle drawn
   * around the half-court elbow means nothing on the full court.
   */
  marks: FreeDrawMark[]
  ballOffset: Point
  ballHolderId: string | null
  /**
   * Where the ball lies when nobody holds it — null while it is held. Never
   * populated at the same time as `ballHolderId`. Per-court like everything
   * else here: a ball left out of bounds on the half court stays there while
   * the coach works on the full court.
   */
  ballLoosePos: Point | null
  /**
   * The authoring-order counter as it stood on this court. Travels with the
   * board because it is shared by routes and transfers and drives playback
   * order: restore a board without it and the lines replay in the wrong order,
   * while newly drawn ones interleave among the restored ones instead of
   * landing after them.
   */
  seq: number
  /**
   * The visible-lines cutoff on this court — lines below it have aged off and
   * must stay off. Travels with the board for the same reason `seq` does: it is
   * a position on *this* court's authoring timeline and means nothing on the
   * other one. Leave it behind and a mark retired on half court comes back the
   * moment you switch to full court and return.
   *
   * `-Infinity` = nothing retired yet. Safe as a float here where it would not
   * be in `Play`: the stash is in-memory and session-only, so it never goes
   * near JSON.
   */
  retiredSeq: number
}

/** Boards for courts that have been visited and left. Absent = never visited. */
export type CourtStash = Partial<Record<CourtType, CourtBoard>>

/**
 * The board a court starts as when it has never been visited — the same reset
 * that used to happen on every switch.
 *
 * The caller supplies `spots` and `ballOffsetX` rather than this module reaching
 * for `DEFAULT_SPOTS` or the size settings, for the reason in the header: the
 * coordinate-space knowledge stays in the editor hook and this stays testable.
 *
 * Possession carries over — the coach's chosen ball handler shouldn't change
 * just because they looked at the other court.
 */
export function buildDefaultBoard(
  players: Player[],
  spots: Point[],
  ballOffsetX: number,
  ballHolderId: string | null,
): CourtBoard {
  return {
    // Wraps if there are more players than spots, which stacks the extras
    // exactly on top of the first few. Pre-existing — the old reset did the
    // same — and not worked around here.
    players: players.map((p, i) => {
      const spot = spots[i % spots.length]
      return { ...p, x: spot.x, y: spot.y }
    }),
    routes: [],
    ballTransfers: [],
    marks: [],
    ballOffset: { x: ballOffsetX, y: 0 },
    ballHolderId,
    // A court being opened for the first time starts with the ball in hand —
    // `ballHolderId` carries over, so there is nothing loose to carry with it.
    ballLoosePos: null,
    seq: 0,
    retiredSeq: -Infinity,
  }
}

/** Shallow-copies the arrays so a restored board can't be mutated through the stash. */
function copy(board: CourtBoard): CourtBoard {
  return {
    players: [...board.players],
    routes: [...board.routes],
    ballTransfers: [...board.ballTransfers],
    marks: [...board.marks],
    ballOffset: { ...board.ballOffset },
    ballHolderId: board.ballHolderId,
    ballLoosePos: board.ballLoosePos ? { ...board.ballLoosePos } : null,
    seq: board.seq,
    retiredSeq: board.retiredSeq,
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
    // `...board` carries `marks` through untouched, and that is deliberate: a
    // mark belongs to nobody, so deleting a player can't orphan one. Filtering
    // them here would silently wipe a coach's annotations on a roster edit.
    out[key] = {
      ...board,
      players,
      routes: board.routes.filter((r) => !gone(r.playerId)),
      // A null end is the floor, not a departed player — `gone(null)` would be
      // true and would quietly delete every pickup and put-down on the board.
      ballTransfers: board.ballTransfers.filter(
        (t) => (t.fromId === null || !gone(t.fromId)) && (t.toId === null || !gone(t.toId)),
      ),
      // Hand the ball to a survivor rather than dropping it. This mirrors what
      // `syncCourtWithRoster` does to the live board — leaving it null would
      // restore a board whose ball has silently vanished, since nothing on the
      // restore path picks a new holder. A ball already lying loose is left
      // alone: it isn't anyone's, so losing a player can't strand it.
      ballHolderId:
        board.ballHolderId && gone(board.ballHolderId)
          ? players[0]?.id ?? null
          : board.ballHolderId,
    }
  }
  return out
}

/** The roster fields an on-court player carries a copy of. */
export interface IncomingPlayer {
  id: string
  number: number | null
  name?: string
  photoUrl?: string
}

function mapBoards(stash: CourtStash, fn: (board: CourtBoard) => CourtBoard): CourtStash {
  const out: CourtStash = {}
  for (const key of Object.keys(stash) as CourtType[]) {
    const board = stash[key]
    if (board) out[key] = fn(board)
  }
  return out
}

/**
 * Substitutes one player for another on every stashed board — the stash-side
 * half of `swapPlayerOnCourt`.
 *
 * A substitution is a *rename*, not a remove-plus-add: the incoming player
 * inherits the outgoing player's spot, routes and ball history on each court
 * separately. That's what lets the squad follow the coach across the switch
 * while geometry stays per-court, and it leaves `seq`/`retiredSeq` alone, so
 * playback order survives untouched.
 */
export function substituteInStash(
  stash: CourtStash,
  outgoingId: string,
  incoming: IncomingPlayer,
): CourtStash {
  return mapBoards(stash, (board) => {
    // Already there: renaming would produce two of them. Leave the whole board
    // alone rather than rewriting routes onto a player who is on it twice.
    if (board.players.some((p) => p.id === incoming.id)) return board
    const rename = (id: string | null) => (id === outgoingId ? incoming.id : id)
    return {
      ...board,
      players: board.players.map((p) =>
        p.id === outgoingId
          ? { ...p, id: incoming.id, number: incoming.number, name: incoming.name, photoUrl: incoming.photoUrl }
          : p,
      ),
      routes: board.routes.map((r) => (r.playerId === outgoingId ? { ...r, playerId: incoming.id } : r)),
      // Remapped, never filtered: a null end is the floor, so dropping the
      // outgoing player's transfers would turn their passes into put-downs.
      ballTransfers: board.ballTransfers.map((t) => ({
        ...t,
        fromId: rename(t.fromId),
        toId: rename(t.toId),
      })),
      ballHolderId: rename(board.ballHolderId),
    }
  })
}

/**
 * Puts a player on every stashed board — the stash-side half of
 * `addPlayerToCourt`.
 *
 * `pickSpot` and `ballOffsetFor` are callbacks rather than values, because where
 * they land and how far the ball sits from them depend on that court's own
 * default spots and token sizes, and this module deliberately knows nothing
 * about either coordinate space.
 */
export function addPlayerToStash(
  stash: CourtStash,
  player: Player,
  pickSpot: (board: CourtBoard, court: CourtType) => Point,
  ballOffsetFor: (court: CourtType) => Point,
): CourtStash {
  const out: CourtStash = {}
  for (const key of Object.keys(stash) as CourtType[]) {
    const board = stash[key]
    if (!board) continue
    if (board.players.some((p) => p.id === player.id)) {
      out[key] = board
      continue
    }
    const spot = pickSpot(board, key)
    // Same rule as the live court: a board with no ball at all hands it to
    // whoever refills it, since there is no possession control in the UI. A
    // ball lying loose is still a ball, so it isn't taken.
    const handOver = board.ballHolderId == null && board.ballLoosePos == null
    out[key] = {
      ...board,
      players: [...board.players, { ...player, x: spot.x, y: spot.y }],
      ballHolderId: handOver ? player.id : board.ballHolderId,
      // The stored offset was measured against whoever last held it there, so
      // it means nothing relative to the newcomer.
      ballOffset: handOver ? ballOffsetFor(key) : board.ballOffset,
    }
  }
  return out
}

/**
 * Takes a player off every stashed board — the stash-side half of
 * `removePlayerFromCourt`.
 *
 * Deliberately gentler than the live version, which bins the *whole* transfer
 * chain when the departing player held the ball. Each board has its own
 * `ballHolderId`, so that rule here would destroy transfers unrelated to this
 * player on a court the coach can't see and didn't act on. Possession is passed
 * to a survivor instead, exactly as `reconcileStash` does.
 */
export function removePlayerFromStash(stash: CourtStash, id: string): CourtStash {
  return mapBoards(stash, (board) => {
    const players = board.players.filter((p) => p.id !== id)
    if (players.length === board.players.length) return board
    return {
      ...board,
      players,
      routes: board.routes.filter((r) => r.playerId !== id),
      ballTransfers: board.ballTransfers.filter((t) => t.fromId !== id && t.toId !== id),
      ballHolderId: board.ballHolderId === id ? players[0]?.id ?? null : board.ballHolderId,
    }
  })
}
