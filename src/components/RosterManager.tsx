import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { RosterPlayer } from '../types'
import { rosterStore } from '../lib/rosterStore'

interface Props {
  onCourtIds: string[]
  onAddToCourt: (player: RosterPlayer) => void
  onRemoveFromCourt: (id: string) => void
  courtIsFull: boolean
}

const EMPTY_FORM = { name: '', number: '', position: '' }

export default function RosterManager({ onCourtIds, onAddToCourt, onRemoveFromCourt, courtIsFull }: Props) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function refresh() {
    setRoster(rosterStore.getAll())
  }

  useEffect(refresh, [])

  function startEdit(player: RosterPlayer) {
    setEditingId(player.id)
    setForm({ name: player.name, number: player.number?.toString() ?? '', position: player.position })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    const name = form.name.trim()
    if (!name) {
      setError('Player needs a name.')
      return
    }
    const number = form.number.trim() === '' ? null : Number(form.number)
    if (number !== null && (Number.isNaN(number) || number < 0 || number > 99)) {
      setError('Number must be 0–99, or left blank.')
      return
    }

    const player: RosterPlayer = {
      id: editingId ?? uuid(),
      name,
      number,
      position: form.position.trim(),
    }

    if (editingId) {
      rosterStore.update(player)
    } else {
      rosterStore.add(player)
    }
    refresh()
    cancelEdit()
  }

  function handleRemove(id: string) {
    if (onCourtIds.includes(id)) onRemoveFromCourt(id)
    rosterStore.remove(id)
    setConfirmDeleteId(null)
    refresh()
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-ink-800 rounded-lg text-court-line font-body">
      <button
        className="flex items-center justify-between text-xs uppercase tracking-wide text-court-line/50 font-display"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span>Roster ({roster.length})</span>
        <span>{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen && (
        <>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {roster.map((player) => {
              const isOnCourt = onCourtIds.includes(player.id)
              const isConfirmingDelete = confirmDeleteId === player.id
              return (
                <div key={player.id} className="flex items-center gap-2 bg-ink-700/60 rounded-md px-2 py-1.5">
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover shrink-0 bg-ink-900"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-ink-900 shrink-0" />
                  )}
                  <span className="w-6 text-center text-xs text-court-line/50 font-display shrink-0">
                    {player.number ?? '—'}
                  </span>
                  <button className="flex-1 text-left text-sm truncate" onClick={() => startEdit(player)}>
                    {player.name}
                    {player.isCaptain && <span className="text-accent text-xs ml-1">(C)</span>}
                    <span className="text-court-line/40 text-xs ml-1">{player.position}</span>
                  </button>
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-team-defense whitespace-nowrap">
                        Deletes from roster
                      </span>
                      <button
                        className="text-xs px-2 py-1 rounded bg-team-defense text-white"
                        onClick={() => handleRemove(player.id)}
                      >
                        Delete
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded bg-ink-700 text-court-line/80"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        className={`text-xs px-2 py-1 rounded ${
                          isOnCourt ? 'bg-team-offense/80 text-white' : 'bg-ink-700 text-court-line/60'
                        } ${!isOnCourt && courtIsFull ? 'opacity-30' : ''}`}
                        disabled={!isOnCourt && courtIsFull}
                        onClick={() => (isOnCourt ? onRemoveFromCourt(player.id) : onAddToCourt(player))}
                        title={!isOnCourt && courtIsFull ? 'Court has 5 offensive players — remove one first' : undefined}
                      >
                        {isOnCourt ? 'On court' : 'Add'}
                      </button>
                      <button
                        className="text-xs text-court-line/40 hover:text-team-defense"
                        onClick={() => setConfirmDeleteId(player.id)}
                        title="Delete from roster"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-ink-700 pt-3">
            <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">
              {editingId ? 'Edit player' : 'Add player'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <input
                className="col-span-2 bg-ink-700 rounded-md px-2 py-1.5 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <input
                className="bg-ink-700 rounded-md px-2 py-1.5 text-sm"
                placeholder="#"
                inputMode="numeric"
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              />
              <input
                className="col-span-3 bg-ink-700 rounded-md px-2 py-1.5 text-sm"
                placeholder="Position (e.g. PG, SF, C)"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />
            </div>
            {error && <p className="text-xs text-team-defense mt-2">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button className="flex-1 py-1.5 rounded-md text-sm font-medium bg-accent text-ink-900" onClick={handleSubmit}>
                {editingId ? 'Save changes' : 'Add to roster'}
              </button>
              {editingId && (
                <button className="py-1.5 px-3 rounded-md text-sm bg-ink-700 text-court-line/80" onClick={cancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
