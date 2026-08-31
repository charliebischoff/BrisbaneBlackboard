import { RosterPlayer } from '../types'
import seedRoster from '../data/rosterSeed.json'

const STORAGE_KEY = 'playbook.roster.v1'

/**
 * Player photos were added to the seed after the roster had already been
 * persisted on people's devices, and localStorage wins over the bundled seed.
 * Fill a missing photo back in from the seed by id so existing profiles get
 * artwork without wiping their roster edits. Purely in-memory — an explicit
 * roster edit is what writes it back.
 */
function backfillFromSeed(roster: RosterPlayer[]): RosterPlayer[] {
  const seed = seedRoster as RosterPlayer[]
  return roster.map((p) => {
    if (p.photo) return p
    const seeded = seed.find((s) => s.id === p.id)
    return seeded?.photo ? { ...p, photo: seeded.photo } : p
  })
}

function readRoster(): RosterPlayer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return backfillFromSeed(JSON.parse(raw) as RosterPlayer[])
    // First run on this device: seed from the bundled roster, then persist
    // so future edits (numbers filled in, players transferred, etc.) stick.
    const seeded = seedRoster as RosterPlayer[]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  } catch (err) {
    console.error('Failed to read roster from localStorage', err)
    return seedRoster as RosterPlayer[]
  }
}

function writeRoster(roster: RosterPlayer[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(roster))
  } catch (err) {
    console.error('Failed to write roster to localStorage', err)
    throw new Error('Could not save roster changes — local storage may be full.')
  }
}

export const rosterStore = {
  getAll(): RosterPlayer[] {
    return readRoster().sort((a, b) => {
      if (a.number == null && b.number == null) return a.name.localeCompare(b.name)
      if (a.number == null) return 1
      if (b.number == null) return -1
      return a.number - b.number
    })
  },

  add(player: RosterPlayer) {
    const roster = readRoster()
    roster.push(player)
    writeRoster(roster)
  },

  update(player: RosterPlayer) {
    const roster = readRoster().map((p) => (p.id === player.id ? player : p))
    writeRoster(roster)
  },

  remove(id: string) {
    writeRoster(readRoster().filter((p) => p.id !== id))
  },

  /** Restores the bundled Brisbane Bullets seed roster, discarding local edits. */
  resetToSeed() {
    writeRoster(seedRoster as RosterPlayer[])
  },
}
