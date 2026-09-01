import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { RosterPlayer } from '../types'
import { rosterStore } from '../lib/rosterStore'

interface Props {
  onCourtIds: string[]
  onAddToCourt: (player: RosterPlayer) => void
  onRemoveFromCourt: (id: string) => void
  /** Re-reads the roster and reconciles the court with it — call after any roster write. */
  onRosterChanged: () => void
  courtIsFull: boolean
  onClose: () => void
}

const EMPTY_FORM = { name: '', number: '', position: '' }

/**
 * Full-screen roster picker, laid out as a two-column grid. Each player card is
 * one big touch target that
 * toggles them on and off the court — adding and removing are the same gesture.
 * Roster editing itself (add / edit / delete / restore) is destructive, so it
 * lives behind the "Advanced roster editing" disclosure at the bottom.
 */
export default function RosterModal({
  onCourtIds,
  onAddToCourt,
  onRemoveFromCourt,
  onRosterChanged,
  courtIsFull,
  onClose,
}: Props) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  function refresh() {
    setRoster(rosterStore.getAll())
    // The court holds copies of roster fields and can outlive a deletion, so
    // every roster write has to be pushed through to it.
    onRosterChanged()
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

    // Spread the existing record first — the form only covers name/number/
    // position, so editing must not drop photo or captaincy.
    const existing = editingId ? roster.find((p) => p.id === editingId) : undefined
    const player: RosterPlayer = {
      ...existing,
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

  function handleReset() {
    rosterStore.resetToSeed()
    setConfirmReset(false)
    cancelEdit()
    setConfirmDeleteId(null)
    refresh()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="absolute inset-3 md:inset-10 bg-ink-900 rounded-xl flex flex-col overflow-hidden text-court-line font-body shadow-2xl shadow-black/60">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-ink-700">
          <h2 className="font-display text-xl uppercase tracking-wide">
            Roster <span className="text-court-line/40">({onCourtIds.length}/5 on court)</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close roster"
            className="w-[52px] h-[52px] rounded-md text-2xl text-court-line/70 active:bg-ink-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-2 auto-rows-min gap-2">
          {roster.map((player) => {
            const isOnCourt = onCourtIds.includes(player.id)
            const isBlocked = !isOnCourt && courtIsFull
            return (
              <div key={player.id} className="flex flex-col gap-1.5">
                <button
                  className={`min-h-[68px] flex items-center gap-2 px-2.5 rounded-lg text-left transition-colors ${
                    isOnCourt ? 'bg-accent/20 ring-2 ring-accent' : 'bg-ink-800'
                  } ${isBlocked ? 'opacity-30' : 'active:bg-ink-700'}`}
                  disabled={isBlocked}
                  onClick={() => (isOnCourt ? onRemoveFromCourt(player.id) : onAddToCourt(player))}
                  title={isBlocked ? 'Court has 5 offensive players — remove one first' : undefined}
                >
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover shrink-0 bg-ink-900"
                    />
                  ) : (
                    <span className="w-12 h-12 rounded-full bg-ink-900 shrink-0" />
                  )}
                  <span className="w-6 text-center font-display text-base text-court-line/50 shrink-0">
                    {player.number ?? '—'}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base truncate">
                      {player.name}
                      {player.isCaptain && <span className="text-accent text-sm ml-1">(C)</span>}
                    </span>
                    <span className="block text-xs text-court-line/40">{player.position}</span>
                  </span>
                  {/* Half-width cells have no room for a text badge — the accent
                      ring already reads as "on court", this just confirms it. */}
                  {isOnCourt && <span className="shrink-0 w-2 h-2 rounded-full bg-accent" aria-label="On court" />}
                </button>

                {showAdvanced &&
                  (confirmDeleteId === player.id ? (
                    <div className="flex items-stretch gap-1.5">
                      <button
                        className="flex-1 min-h-[44px] px-2 rounded-lg bg-team-defense text-white text-sm"
                        onClick={() => handleRemove(player.id)}
                      >
                        Delete
                      </button>
                      <button
                        className="flex-1 min-h-[44px] px-2 rounded-lg bg-ink-800 text-court-line/80 text-sm"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-stretch gap-1.5">
                      <button
                        className="flex-1 min-h-[44px] px-2 rounded-lg bg-ink-800 text-court-line/70 text-sm"
                        onClick={() => startEdit(player)}
                      >
                        Edit
                      </button>
                      <button
                        className="min-h-[44px] px-3 rounded-lg bg-ink-800 text-court-line/40 text-lg"
                        onClick={() => setConfirmDeleteId(player.id)}
                        title="Delete from roster"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )
          })}
        </div>

        <div className="shrink-0 border-t border-ink-700 p-3">
          <button
            className="w-full min-h-[52px] rounded-lg bg-ink-800 text-court-line/60 text-sm uppercase tracking-wide font-display flex items-center justify-center gap-2"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            Advanced roster editing
            <span>{showAdvanced ? '−' : '+'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs uppercase tracking-wide text-court-line/50 font-display">
                {editingId ? 'Edit player' : 'Add player'}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="col-span-2 bg-ink-800 rounded-md px-3 py-3 text-base"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <input
                  className="bg-ink-800 rounded-md px-3 py-3 text-base"
                  placeholder="#"
                  inputMode="numeric"
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
                <input
                  className="col-span-3 bg-ink-800 rounded-md px-3 py-3 text-base"
                  placeholder="Position (e.g. PG, SF, C)"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                />
              </div>
              {error && <p className="text-xs text-team-defense">{error}</p>}
              <div className="flex gap-2">
                <button
                  className="flex-1 min-h-[52px] rounded-md text-base font-medium bg-accent text-ink-900"
                  onClick={handleSubmit}
                >
                  {editingId ? 'Save changes' : 'Add to roster'}
                </button>
                {editingId && (
                  <button
                    className="min-h-[52px] px-4 rounded-md text-base bg-ink-800 text-court-line/80"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                )}
              </div>

              {confirmReset ? (
                <div className="flex items-center gap-2 text-xs bg-ink-800 rounded-md px-3 py-2">
                  <span className="text-team-defense flex-1">
                    Restores the original 14 — any edits or additions since are lost.
                  </span>
                  <button className="px-3 py-2 rounded bg-team-defense text-white" onClick={handleReset}>
                    Reset
                  </button>
                  <button
                    className="px-3 py-2 rounded bg-ink-700 text-court-line/80"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="text-xs text-court-line/40 underline text-left"
                  onClick={() => setConfirmReset(true)}
                >
                  Restore original squad (undoes accidental deletes)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
