import { useEffect, useState } from 'react'
import { Play } from '../types'
import { localPlayStore } from '../lib/storage'

const MAX_PLAYS = 100

interface Props {
  playName: string
  setPlayName: (name: string) => void
  onSave: (name: string) => Play
  onLoad: (play: Play) => void
  onNew: () => void
}

export default function PlaysLibrary({ playName, setPlayName, onSave, onLoad, onNew }: Props) {
  const [plays, setPlays] = useState<Play[]>([])
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    setPlays(localPlayStore.getAll())
  }

  useEffect(refresh, [])

  function handleSave() {
    setError(null)
    if (plays.length >= MAX_PLAYS && !plays.some((p) => p.name === playName)) {
      setError(`You've hit the ${MAX_PLAYS}-play limit. Delete an old play to save a new one.`)
      return
    }
    try {
      const snapshot = onSave(playName)
      localPlayStore.save(snapshot)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    }
  }

  function handleDelete(id: string) {
    localPlayStore.remove(id)
    refresh()
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-ink-800 rounded-lg text-court-line font-body">
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Play name</p>
        <input
          value={playName}
          onChange={(e) => setPlayName(e.target.value)}
          className="w-full bg-ink-700 rounded-md px-3 py-2 text-sm"
        />
        <div className="flex gap-2 mt-2">
          <button className="flex-1 py-2 rounded-md text-sm font-medium bg-accent text-ink-900" onClick={handleSave}>
            Save play
          </button>
          <button className="py-2 px-3 rounded-md text-sm bg-ink-700 text-court-line/80" onClick={onNew}>
            New
          </button>
        </div>
        {error && <p className="text-xs text-team-defense mt-2">{error}</p>}
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">
          Saved plays ({plays.length}/{MAX_PLAYS})
        </p>
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {plays.length === 0 && <p className="text-xs text-court-line/40">No plays saved yet.</p>}
          {plays.map((play) => (
            <div key={play.id} className="flex items-center gap-2 bg-ink-700/60 rounded-md px-2 py-1.5">
              <button className="flex-1 text-left text-sm truncate" onClick={() => onLoad(play)}>
                {play.name}
                {play.isFormationOnly && <span className="text-court-line/40 text-xs ml-1">(formation)</span>}
              </button>
              <button
                className="text-xs text-court-line/40 hover:text-team-defense"
                onClick={() => handleDelete(play.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
