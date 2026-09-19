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
   * Ball radius in court units — absolute, not a fraction of the player token.
   * It used to be a multiple of the token, which meant resizing players moved
   * the ball too, and the "% of a player" label was a lie on full court where
   * tokens get a 1.5x bump the ball never did.
   */
  ballRadius: number
  /** Player token radius in court units, before the full-court size bump. */
  playerRadius: number
}

/**
 * v2 because `ballScale` (0.5–1.0, a ratio) and `ballRadius` (court units)
 * occupy the same slot conceptually but not numerically — reading a v1 blob as
 * v2 would give a half-pixel ball. v1 is migrated on first read, not discarded.
 */
const STORAGE_KEY = 'playbook.settings.v2'
const LEGACY_STORAGE_KEY = 'playbook.settings.v1'

export const MIN_VISIBLE_LINES = 1
export const MAX_VISIBLE_LINES_LIMIT = 8

/** Court units. The old range was 8.5–17 (half to a full token); this widens both ends. */
export const MIN_BALL_RADIUS = 5
export const MAX_BALL_RADIUS = 20
export const BALL_RADIUS_STEP = 0.5

/** Court units, at half-court scale. 17 was the fixed value before the slider existed. */
export const MIN_PLAYER_RADIUS = 12
export const MAX_PLAYER_RADIUS = 26
export const PLAYER_RADIUS_STEP = 1

/** The token radius the old hard-coded constant used, and what v1's ballScale was a multiple of. */
const LEGACY_TOKEN_RADIUS = 17

export const DEFAULT_SETTINGS: Settings = {
  maxVisibleLines: 3,
  ballRadius: LEGACY_TOKEN_RADIUS / 2,
  playerRadius: LEGACY_TOKEN_RADIUS,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Anything read back from storage is treated as untrusted — an old or hand-edited
 *  value must never put the board into a state the sliders can't express. */
function normalize(raw: Partial<Settings> | null): Settings {
  if (!raw) return DEFAULT_SETTINGS
  const lines = Number(raw.maxVisibleLines)
  const ball = Number(raw.ballRadius)
  const player = Number(raw.playerRadius)
  return {
    maxVisibleLines: Number.isFinite(lines)
      ? clamp(Math.round(lines), MIN_VISIBLE_LINES, MAX_VISIBLE_LINES_LIMIT)
      : DEFAULT_SETTINGS.maxVisibleLines,
    ballRadius: Number.isFinite(ball)
      ? clamp(ball, MIN_BALL_RADIUS, MAX_BALL_RADIUS)
      : DEFAULT_SETTINGS.ballRadius,
    playerRadius: Number.isFinite(player)
      ? clamp(player, MIN_PLAYER_RADIUS, MAX_PLAYER_RADIUS)
      : DEFAULT_SETTINGS.playerRadius,
  }
}

/**
 * One-time read of the v1 blob. `ballScale` was a multiple of a 17-unit token,
 * so the absolute radius is just that product; `maxVisibleLines` carries over
 * unchanged, which is the whole reason this isn't a plain reset to defaults.
 */
function migrateLegacy(): Settings | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!raw) return null
  const old = JSON.parse(raw) as { maxVisibleLines?: number; ballScale?: number }
  const scale = Number(old.ballScale)
  return normalize({
    maxVisibleLines: Number(old.maxVisibleLines),
    ballRadius: Number.isFinite(scale) ? scale * LEGACY_TOKEN_RADIUS : undefined,
    playerRadius: DEFAULT_SETTINGS.playerRadius,
  })
}

export const settingsStore = {
  get(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return normalize(JSON.parse(raw) as Partial<Settings>)
      // The v1 blob is left in place rather than removed — it costs nothing and
      // makes a bad migration recoverable by hand.
      return migrateLegacy() ?? DEFAULT_SETTINGS
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
