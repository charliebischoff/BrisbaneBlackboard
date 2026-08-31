/**
 * Coach-tunable display settings. Third and last localStorage module alongside
 * `rosterStore` and `storage` — no component touches localStorage directly.
 * Reads are synchronous on purpose: settings are needed on the first render of
 * a play, which may happen with no network at all.
 */
export interface Settings {
  /** How many of the most recently drawn lines stay on the board. */
  maxVisibleLines: number
  /** Ball radius as a multiple of the player token radius. */
  ballScale: number
}

const STORAGE_KEY = 'playbook.settings.v1'

export const MIN_VISIBLE_LINES = 1
export const MAX_VISIBLE_LINES_LIMIT = 8

/** Half a player token up to a full one, in six discrete steps. */
export const MIN_BALL_SCALE = 0.5
export const MAX_BALL_SCALE = 1
export const BALL_SCALE_STEP = 0.1

export const DEFAULT_SETTINGS: Settings = {
  maxVisibleLines: 3,
  ballScale: MIN_BALL_SCALE,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Anything read back from storage is treated as untrusted — an old or hand-edited
 *  value must never put the board into a state the sliders can't express. */
function normalize(raw: Partial<Settings> | null): Settings {
  if (!raw) return DEFAULT_SETTINGS
  const lines = Number(raw.maxVisibleLines)
  const scale = Number(raw.ballScale)
  return {
    maxVisibleLines: Number.isFinite(lines)
      ? clamp(Math.round(lines), MIN_VISIBLE_LINES, MAX_VISIBLE_LINES_LIMIT)
      : DEFAULT_SETTINGS.maxVisibleLines,
    ballScale: Number.isFinite(scale)
      ? clamp(scale, MIN_BALL_SCALE, MAX_BALL_SCALE)
      : DEFAULT_SETTINGS.ballScale,
  }
}

export const settingsStore = {
  get(): Settings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return normalize(raw ? (JSON.parse(raw) as Partial<Settings>) : null)
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
