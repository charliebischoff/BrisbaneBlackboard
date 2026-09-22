import { CourtType } from '../types'

/**
 * Coach-tunable display settings. Third and last localStorage module alongside
 * `rosterStore` and `storage` — no component touches localStorage directly.
 * Reads are synchronous on purpose: settings are needed on the first render of
 * a play, which may happen with no network at all.
 */
export interface Settings {
  /** How many of the most recently drawn lines stay on the board. */
  maxVisibleLines: number
  /**
   * Ball radius in court units, stored separately per court type. Half and
   * full court are drawn at different coordinate scales, so "the same size"
   * on each is a different number — this used to be one shared value with no
   * court-type awareness at all, which is exactly why the ball never matched
   * apparent player size the way the token itself did.
   */
  ballRadius: Record<CourtType, number>
  /**
   * Player token radius in court units, stored separately per court type.
   * Previously a single value with a 1.5x bump applied at render time for
   * full court (see the old `playerTokenRadius`); now each court's value is
   * exactly what gets drawn, no multiplier involved.
   */
  playerRadius: Record<CourtType, number>
}

/**
 * v3 because ballRadius/playerRadius changed shape — a single number each,
 * per court type now, rather than one shared value. Reading a v2 blob as v3
 * would put a whole object where a number is expected; v2 (and the v1 it
 * already carried forward) are migrated on first read, not discarded.
 */
const STORAGE_KEY = 'playbook.settings.v3'
const LEGACY_V2_KEY = 'playbook.settings.v2'
const LEGACY_V1_KEY = 'playbook.settings.v1'

export const MIN_VISIBLE_LINES = 1
export const MAX_VISIBLE_LINES_LIMIT = 8

/** Court units. Shared range for both court types — only the default differs between them. */
export const MIN_BALL_RADIUS = 5
export const MAX_BALL_RADIUS = 20
export const BALL_RADIUS_STEP = 0.5

/** Court units. Shared range for both court types — only the default differs between them. */
export const MIN_PLAYER_RADIUS = 12
export const MAX_PLAYER_RADIUS = 26
export const PLAYER_RADIUS_STEP = 1

/** The token radius the old hard-coded constant used, and what v1's ballScale was a multiple of. */
const LEGACY_TOKEN_RADIUS = 17

/**
 * First-load defaults — deliberately smaller on half court than full. Chosen
 * as 1/4 and 1/2 of each slider's own range (min + fraction * (max - min)),
 * then rounded to a value that lands on that slider's step.
 */
export const DEFAULT_SETTINGS: Settings = {
  maxVisibleLines: 3,
  ballRadius: { half: 9, full: 12.5 },
  playerRadius: { half: 16, full: 19 },
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Normalizes one of the two per-court-type radius settings. Anything read back
 * from storage is untrusted — a half-edited object, a stray string, an old
 * blob mid-migration — so each court's slot falls back independently rather
 * than discarding the whole pair over one bad value.
 */
function normalizeSized(
  raw: unknown,
  fallback: Record<CourtType, number>,
  min: number,
  max: number,
): Record<CourtType, number> {
  const r = (raw ?? {}) as Partial<Record<CourtType, unknown>>
  const half = Number(r.half)
  const full = Number(r.full)
  return {
    half: Number.isFinite(half) ? clamp(half, min, max) : fallback.half,
    full: Number.isFinite(full) ? clamp(full, min, max) : fallback.full,
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
    ballRadius: normalizeSized(raw.ballRadius, DEFAULT_SETTINGS.ballRadius, MIN_BALL_RADIUS, MAX_BALL_RADIUS),
    playerRadius: normalizeSized(
      raw.playerRadius,
      DEFAULT_SETTINGS.playerRadius,
      MIN_PLAYER_RADIUS,
      MAX_PLAYER_RADIUS,
    ),
  }
}

/**
 * v2 stored one flat radius each. Its full-court player size was only ever
 * seen on screen after a 1.5x bump applied separately at render time — so
 * migrating the raw number into both slots as-is would quietly shrink every
 * full-court board that already looked right. That 1.5x gets baked in once,
 * here, and never applied again after.
 *
 * The ball had no court-type distinction in v2 at all, so its one value
 * becomes the starting point for both slots.
 */
function migrateV2(): Settings | null {
  const raw = localStorage.getItem(LEGACY_V2_KEY)
  if (!raw) return null
  const old = JSON.parse(raw) as { maxVisibleLines?: number; ballRadius?: number; playerRadius?: number }
  const ball = Number(old.ballRadius)
  const player = Number(old.playerRadius)
  return normalize({
    maxVisibleLines: old.maxVisibleLines,
    ballRadius: {
      half: Number.isFinite(ball) ? ball : DEFAULT_SETTINGS.ballRadius.half,
      full: Number.isFinite(ball) ? ball : DEFAULT_SETTINGS.ballRadius.full,
    },
    playerRadius: {
      half: Number.isFinite(player) ? player : DEFAULT_SETTINGS.playerRadius.half,
      full: Number.isFinite(player) ? player * 1.5 : DEFAULT_SETTINGS.playerRadius.full,
    },
  })
}

/**
 * v1 predates the ball having an absolute size at all — `ballScale` was a
 * ratio of a fixed 17-unit token, with no court-type distinction. Brought
 * straight to v3: the one resulting size becomes the starting point for both
 * court slots, same reasoning as the ball side of migrateV2.
 */
function migrateV1(): Settings | null {
  const raw = localStorage.getItem(LEGACY_V1_KEY)
  if (!raw) return null
  const old = JSON.parse(raw) as { maxVisibleLines?: number; ballScale?: number }
  const scale = Number(old.ballScale)
  const ball = Number.isFinite(scale) ? scale * LEGACY_TOKEN_RADIUS : undefined
  return normalize({
    maxVisibleLines: old.maxVisibleLines,
    ballRadius: {
      half: ball ?? DEFAULT_SETTINGS.ballRadius.half,
      full: ball ?? DEFAULT_SETTINGS.ballRadius.full,
    },
    playerRadius: DEFAULT_SETTINGS.playerRadius,
  })
}

export const settingsStore = {
  get(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalize(JSON.parse(raw) as Partial<Settings>)
      // Old blobs are left in place rather than removed — costs nothing and
      // makes a bad migration recoverable by hand.
      return migrateV2() ?? migrateV1() ?? DEFAULT_SETTINGS
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
