import { useEffect, useState } from 'react'
import { CourtType, LineType, Player } from '../types'
import { EditorMode } from '../hooks/usePlayEditor'

type Editor = {
  courtType: CourtType
  setCourtType: (t: CourtType) => void
  mode: EditorMode
  setMode: (m: EditorMode) => void
  playName: string
  savePlay: (name: string) => void
  isDirty: boolean
  lineType: LineType
  setLineType: (t: LineType) => void
  selectedPlayerId: string | null
  rawPlayers: Player[]
  ballHolderId: string | null
  setBallHolder: (id: string) => void
  ballTransfers: { fromId: string; toId: string }[]
  ballHint: string | null
  dismissBallHint: () => void
  isPlaying: boolean
  speed: number
  setSpeed: (s: number) => void
  play: () => void
  pause: () => void
  resetPlayback: () => void
  clearRoute: (id: string) => void
  clearAllRoutes: () => void
  discardChanges: () => void
  routes: { playerId: string; segments: unknown[] }[]
}

const LINE_TYPES: { type: LineType; label: string; hint: string }[] = [
  { type: 'motion', label: 'Motion', hint: 'solid — moving without the ball' },
  { type: 'pass', label: 'Pass', hint: 'dotted — the ball moving' },
  { type: 'dribble', label: 'Dribble', hint: 'double line — moving with the ball' },
  { type: 'screen', label: 'Screen', hint: 'T-cap — setting a pick' },
]

const MODES: { mode: EditorMode; label: string }[] = [
  { mode: 'position', label: 'Position players' },
  { mode: 'draw', label: 'Draw routes' },
  { mode: 'drag', label: 'Move & ball' },
]

export default function Toolbar({ editor }: { editor: Editor }) {
  const ballHolder = editor.rawPlayers.find((p) => p.id === editor.ballHolderId)
  const hasAnyRoute = editor.routes.some((r) => r.segments.length > 0)
  // Ball passes are work too — without this a ball-only play has no Clear button.
  const hasAnyWork = hasAnyRoute || editor.ballTransfers.length > 0

  // Mode the coach asked for while drag-mode work was unsaved — held until they choose.
  const [pendingMode, setPendingMode] = useState<EditorMode | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  function requestMode(next: EditorMode) {
    // Leaving drag mode with work on the court is the only guarded transition;
    // entering it, or switching within it, is free.
    if (editor.mode === 'drag' && next !== 'drag' && editor.isDirty) {
      setSaveError(null)
      setPendingMode(next)
      return
    }
    editor.setMode(next)
  }

  function saveAndSwitch() {
    try {
      editor.savePlay(editor.playName)
    } catch (err) {
      // Stay in drag mode with the work intact rather than switching on a failed save.
      setSaveError(err instanceof Error ? err.message : 'Failed to save.')
      return
    }
    if (pendingMode) editor.setMode(pendingMode)
    setPendingMode(null)
  }

  function discardAndSwitch() {
    editor.discardChanges()
    if (pendingMode) editor.setMode(pendingMode)
    setPendingMode(null)
  }

  // The hint is transient — there's no toast system here, so it's plain text that clears itself.
  const { ballHint, dismissBallHint } = editor
  useEffect(() => {
    if (!ballHint) return
    const t = setTimeout(dismissBallHint, 2500)
    return () => clearTimeout(t)
  }, [ballHint, dismissBallHint])

  return (
    <div className="flex flex-col gap-4 p-4 bg-ink-800 rounded-lg text-court-line font-body">
      {/* Court type */}
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Court</p>
        <div className="flex gap-2">
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              editor.courtType === 'half' ? 'bg-accent text-ink-900' : 'bg-ink-700 text-court-line/80'
            }`}
            onClick={() => editor.setCourtType('half')}
          >
            Half court
          </button>
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              editor.courtType === 'full' ? 'bg-accent text-ink-900' : 'bg-ink-700 text-court-line/80'
            }`}
            onClick={() => editor.setCourtType('full')}
          >
            Full court
          </button>
        </div>
        <p className="text-xs text-court-line/40 mt-2">
          Switching resets player positions to a default spot and clears drawn routes.
        </p>
      </div>

      {/* Mode toggle */}
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Mode</p>
        <div className="flex gap-2">
          {MODES.map(({ mode, label }) => (
            <button
              key={mode}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                editor.mode === mode ? 'bg-accent text-ink-900' : 'bg-ink-700 text-court-line/80'
              }`}
              onClick={() => requestMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Leaving drag mode with work on the court — save it, bin it, or stay put. */}
        {pendingMode && (
          <div className="mt-2 p-3 rounded-md bg-ink-700 border border-accent/40">
            <p className="text-xs text-court-line/80">
              This play has unsaved changes. Save before switching mode?
            </p>
            <div className="flex gap-2 mt-2">
              <button
                className="flex-1 py-1.5 rounded-md text-xs font-medium bg-accent text-ink-900"
                onClick={saveAndSwitch}
              >
                Save &amp; switch
              </button>
              <button
                className="flex-1 py-1.5 rounded-md text-xs font-medium bg-ink-800 text-team-defense"
                onClick={discardAndSwitch}
              >
                Discard
              </button>
              <button
                className="py-1.5 px-3 rounded-md text-xs bg-ink-800 text-court-line/70"
                onClick={() => setPendingMode(null)}
              >
                Cancel
              </button>
            </div>
            {saveError && <p className="text-xs text-team-defense mt-2">{saveError}</p>}
          </div>
        )}
        {editor.mode === 'draw' && (
          <p className="text-xs text-court-line/50 mt-2">
            Press and drag a player to draw — like a whiteboard.
          </p>
        )}
        {editor.mode === 'drag' && (
          <p className="text-xs text-court-line/50 mt-2">
            Drag a player and they move, trailing their route — squiggly with the ball, solid
            without. Drag the ball onto another player to pass.
          </p>
        )}
      </div>

      {editor.ballHint && (
        <p className="text-xs text-accent bg-ink-700 rounded-md px-2 py-1.5">{editor.ballHint}</p>
      )}

      {/* Line type picker */}
      {editor.mode === 'draw' && (
        <div>
          <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Line type</p>
          <div className="grid grid-cols-2 gap-2">
            {LINE_TYPES.map(({ type, label, hint }) => (
              <button
                key={type}
                title={hint}
                className={`py-2 px-2 rounded-md text-sm font-medium transition text-left ${
                  editor.lineType === type ? 'bg-team-offense text-white' : 'bg-ink-700 text-court-line/80'
                }`}
                onClick={() => editor.setLineType(type)}
              >
                {label}
              </button>
            ))}
          </div>
          {editor.selectedPlayerId && (
            <button
              className="mt-2 text-xs text-court-line/50 underline"
              onClick={() => editor.clearRoute(editor.selectedPlayerId!)}
            >
              Clear selected player's route
            </button>
          )}
        </div>
      )}

      {/* Possession — who starts the play with the ball. Hidden in drag mode,
          where the ball is a real puck and possession is set by dragging it. */}
      {editor.mode !== 'drag' && (
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Ball at start</p>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
          <select
            className="flex-1 min-w-0 bg-ink-700 rounded-md px-2 py-2 text-sm"
            value={editor.ballHolderId ?? ''}
            onChange={(e) => editor.setBallHolder(e.target.value)}
            disabled={editor.rawPlayers.length === 0}
          >
            {!ballHolder && <option value="">— nobody —</option>}
            {editor.rawPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? `#${p.number}`}
              </option>
            ))}
          </select>
        </div>
        {editor.ballTransfers.length > 0 && (
          <p className="text-xs text-court-line/40 mt-2">
            Changing this clears the {editor.ballTransfers.length} drawn ball
            {editor.ballTransfers.length === 1 ? ' pass' : ' passes'}.
          </p>
        )}
      </div>
      )}

      {/* Playback */}
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Playback</p>
        <div className="flex items-center gap-2">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-ink-900 disabled:opacity-30"
            disabled={!hasAnyWork}
            onClick={editor.isPlaying ? editor.pause : editor.play}
          >
            {editor.isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-ink-700 text-court-line/80"
            onClick={editor.resetPlayback}
          >
            ↺
          </button>
          <select
            className="ml-auto bg-ink-700 rounded-md px-2 py-2 text-sm"
            value={editor.speed}
            onChange={(e) => editor.setSpeed(Number(e.target.value))}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>
      </div>

      {hasAnyWork && (
        <button className="text-xs text-court-line/40 underline text-left" onClick={editor.clearAllRoutes}>
          Clear all routes
        </button>
      )}
    </div>
  )
}
