/**
 * Coach-tunable display settings. Third and last localStorage module alongside
 * `rosterStore` and `storage` — no component touches localStorage directly.
 * Reads are synchronous on purpose: settings are needed on the first render of
 * a play, which may happen with no network at all.
 */
import type { CourtType } from '../types'

/** Ball and player radius, in court units, for one court type. */
export interface CourtSizes {
  /**
   * Ball radius in court units — absolute, not a fraction of the player token.
   * It used to be a multiple of the token, which meant resizing players moved
   * the ball too.
   */
  ballRadius: number
  /** Player token radius in court units, as rendered — no bump applied on top. */
  playerRadius: number
}

export interface Settings {
  /** How many of the most recently drawn lines stay on the board. Global: it's
   *  a legibility preference, not a size, so it doesn't split per court. */
  maxVisibleLines: number
  /**
   * Sizes are per court type. The two courts aren't scaled versions of each
   * other, and a coach who wants a tiny ball on half court often wants
   * something else entirely on full court. Previously one shared pair of
   * numbers with a hard-coded 1.5x bump on full court that applied to players
   * but not the ball — so the courts could never be tuned independently.
   */
  sizes: Record<CourtType, CourtSizes>
}

/**
 * v3 because `sizes` is nested per court where v2 had two flat scalars. v2 in
 * turn replaced v1's `ballScale` (0.5–1.0, a ratio) with `ballRadius` (court
 * units) — same slot conceptually, not numerically. Both older blobs are
 * migrated on first read, not discarded.
 */
const STORAGE_KEY = 'playbook.settings.v3'
const V2_STORAGE_KEY = 'playbook.settings.v2'
const V1_STORAGE_KEY = 'playbook.settings.v1'

export const MIN_VISIBLE_LINES = 1
export const MAX_VISIBLE_LINES_LIMIT = 8

interface SizeBound {
  min: number
  max: number
  step: number
}

/**
 * Per-court slider bounds, in court units. Full court's coordinate space is
 * ~2.6x wider than half court's, so the same numbers cover a much smaller
 * apparent range there — its bounds are widened at both ends to compensate.
 */
export const SIZE_LIMITS: Record<CourtType, { ball: SizeBound; player: SizeBound }> = {
  half: {
    ball: { min: 5, max: 20, step: 0.5 },
    player: { min: 12, max: 26, step: 1 },
  },
  full: {
    // Floor stays at half court's 5 rather than scaling up with the rest of the
    // range: a coach already running a tiny ball would otherwise have it
    // clamped larger on the first load after this split.
    ball: { min: 5, max: 30, step: 0.5 },
    player: { min: 18, max: 40, step: 1 },
  },
}

/** The token radius the old hard-coded constant used, and what v1's ballScale was a multiple of. */
const LEGACY_TOKEN_RADIUS = 17

/**
 * The bump full court used to apply to player tokens at render time. Now it
 * only seeds full court's defaults and migrates old flat blobs, so upgrading
 * leaves both courts looking exactly as they did.
 */
const LEGACY_FULL_COURT_BUMP = 1.5

export const DEFAULT_SETTINGS: Settings = {
  maxVisibleLines: 3,
  sizes: {
    half: {
      ballRadius: LEGACY_TOKEN_RADIUS / 2,
      playerRadius: LEGACY_TOKEN_RADIUS,
    },
    full: {
      ballRadius: LEGACY_TOKEN_RADIUS / 2,
      playerRadius: LEGACY_TOKEN_RADIUS * LEGACY_FULL_COURT_BUMP,
    },
  },
}

/** The shape v1 and v2 both stored: one pair of sizes for both courts. */
interface FlatSettings {
  maxVisibleLines?: number
  ballRadius?: number
  playerRadius?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeSizes(raw: Partial<CourtSizes> | undefined, courtType: CourtType): CourtSizes {
  const limits = SIZE_LIMITS[courtType]
  const fallback = DEFAULT_SETTINGS.sizes[courtType]
  const ball = Number(raw?.ballRadius)
  const player = Number(raw?.playerRadius)
  return {
    ballRadius: Number.isFinite(ball)
      ? clamp(ball, limits.ball.min, limits.ball.max)
      : fallback.ballRadius,
    playerRadius: Number.isFinite(player)
      ? clamp(player, limits.player.min, limits.player.max)
      : fallback.playerRadius,
  }
}

/** Anything read back from storage is treated as untrusted — an old or hand-edited
 *  value must never put the board into a state the sliders can't express. */
function normalize(raw: Partial<Settings> | null): Settings {
  if (!raw) return DEFAULT_SETTINGS
  const lines = Number(raw.maxVisibleLines)
  return {
    maxVisibleLines: Number.isFinite(lines)
      ? clamp(Math.round(lines), MIN_VISIBLE_LINES, MAX_VISIBLE_LINES_LIMIT)
      : DEFAULT_SETTINGS.maxVisibleLines,
    sizes: {
      half: normalizeSizes(raw.sizes?.half, 'half'),
      full: normalizeSizes(raw.sizes?.full, 'full'),
    },
  }
}

/**
 * One shared mapping from the old flat shape to the per-court one. Half court
 * takes the stored value as-is and full court takes the player radius times the
 * bump it used to get at render time, so an upgrade changes nothing visually on
 * either court.
 */
function flatToNested(flat: FlatSettings): Partial<Settings> {
  const ball = Number(flat.ballRadius)
  const player = Number(flat.playerRadius)
  return {
    maxVisibleLines: flat.maxVisibleLines,
    sizes: {
      half: { ballRadius: ball, playerRadius: player },
      full: { ballRadius: ball, playerRadius: player * LEGACY_FULL_COURT_BUMP },
    },
  }
}

/**
 * v1's `ballScale` was a multiple of a 17-unit token, so the absolute radius is
 * just that product; `maxVisibleLines` carries over unchanged, which is the
 * whole reason this isn't a plain reset to defaults. Returns the *flat* shape —
 * `flatToNested` and `normalize` are applied by the caller, once.
 */
/** A legacy blob that won't parse is treated as absent, so the next-oldest one
 *  still gets its chance — otherwise a corrupt v2 would throw past v1 and reset
 *  settings a coach could still have recovered. */
function parseOrNull<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.error('Ignoring unreadable legacy settings blob', err)
    return null
  }
}

function readLegacyV1(): FlatSettings | null {
  const old = parseOrNull<{ maxVisibleLines?: number; ballScale?: number }>(
    localStorage.getItem(V1_STORAGE_KEY),
  )
  if (!old) return null
  const scale = Number(old.ballScale)
  return {
    maxVisibleLines: Number(old.maxVisibleLines),
    ballRadius: Number.isFinite(scale) ? scale * LEGACY_TOKEN_RADIUS : undefined,
    playerRadius: DEFAULT_SETTINGS.sizes.half.playerRadius,
  }
}

function readLegacyV2(): FlatSettings | null {
  return parseOrNull<FlatSettings>(localStorage.getItem(V2_STORAGE_KEY))
}

export const settingsStore = {
  get(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalize(JSON.parse(raw) as Partial<Settings>)
      // Older blobs are left in place rather than removed — they cost nothing
      // and make a bad migration recoverable by hand.
      const legacy = readLegacyV2() ?? readLegacyV1()
      return legacy ? normalize(flatToNested(legacy)) : DEFAULT_SETTINGS
    } catch (err) {
      console.error('Failed to read settings from localStorage', err)
      return DEFAULT_SETTINGS
    }
  },

  save(settings: Settings): Settings {
    const next = normalize(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch (err) {
      console.error('Failed to write settings to localStorage', err)
    }
    return next
  },
}
