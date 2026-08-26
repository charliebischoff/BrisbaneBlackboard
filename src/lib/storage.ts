import { Play } from '../types'

const STORAGE_KEY = 'playbook.plays.v1'

/**
 * Ceiling on stored plays. Enforced here rather than at a call site so every
 * save path hits it — there is more than one button that writes.
 */
export const MAX_PLAYS = 100

/**
 * Everything the rest of the app needs from persistence.
 * Swapping this module for a Supabase-backed one later (for cloud sync
 * across coaches/devices) shouldn't require touching any component —
 * just re-implement these four functions.
 */
export interface PlayStore {
  getAll(): Play[]
  save(play: Play): void
  remove(id: string): void
  clear(): void
}

function readAll(): Play[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Play[]
  } catch (err) {
    console.error('Failed to read plays from localStorage', err)
    return []
  }
}

function writeAll(plays: Play[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plays))
  } catch (err) {
    // Most likely quota exceeded. At ~2-5KB per play, 100 plays is a few
    // hundred KB — well under the 5-10MB localStorage limit in practice —
    // but surface the error rather than silently losing a save.
    console.error('Failed to write plays to localStorage', err)
    throw new Error('Could not save play — local storage may be full.')
  }
}

export const localPlayStore: PlayStore = {
  getAll() {
    return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },

  save(play: Play) {
    const plays = readAll()
    const idx = plays.findIndex((p) => p.id === play.id)
    if (idx >= 0) {
      // The editor stamps createdAt = updatedAt = now on every snapshot, so the
      // original creation date only survives if it's carried over here.
      plays[idx] = { ...play, createdAt: plays[idx].createdAt ?? play.createdAt }
    } else {
      if (plays.length >= MAX_PLAYS) {
        throw new Error(`You've hit the ${MAX_PLAYS}-play limit. Delete an old play to save a new one.`)
      }
      plays.push(play)
    }
    writeAll(plays)
  },

  remove(id: string) {
    const plays = readAll().filter((p) => p.id !== id)
    writeAll(plays)
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY)
  },
}
