import { CourtType, LineType, Player } from '../types'
import { EditorMode } from '../hooks/usePlayEditor'

type Editor = {
  courtType: CourtType
  setCourtType: (t: CourtType) => void
  mode: EditorMode
  setMode: (m: EditorMode) => void
  lineType: LineType
  setLineType: (t: LineType) => void
  selectedPlayerId: string | null
  rawPlayers: Player[]
  ballHolderId: string | null
  isPlaying: boolean
  speed: number
  setSpeed: (s: number) => void
  play: () => void
  pause: () => void
  resetPlayback: () => void
  clearRoute: (id: string) => void
  clearAllRoutes: () => void
  routes: { playerId: string; segments: unknown[] }[]
}

const LINE_TYPES: { type: LineType; label: string; hint: string }[] = [
  { type: 'motion', label: 'Motion', hint: 'solid — moving without the ball' },
  { type: 'pass', label: 'Pass', hint: 'dotted — the ball moving' },
  { type: 'dribble', label: 'Dribble', hint: 'double line — moving with the ball' },
  { type: 'screen', label: 'Screen', hint: 'T-cap — setting a pick' },
]

export default function Toolbar({ editor }: { editor: Editor }) {
  const ballHolder = editor.rawPlayers.find((p) => p.id === editor.ballHolderId)
  const hasAnyRoute = editor.routes.some((r) => r.segments.length > 0)

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
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              editor.mode === 'position' ? 'bg-accent text-ink-900' : 'bg-ink-700 text-court-line/80'
            }`}
            onClick={() => editor.setMode('position')}
          >
            Position players
          </button>
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              editor.mode === 'draw' ? 'bg-accent text-ink-900' : 'bg-ink-700 text-court-line/80'
            }`}
            onClick={() => editor.setMode('draw')}
          >
            Draw routes
          </button>
        </div>
        {editor.mode === 'draw' && (
          <p className="text-xs text-court-line/50 mt-2">
            Press and drag a player to draw — like a whiteboard.
          </p>
        )}
      </div>

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

      {/* Possession */}
      <div className="flex items-center gap-2 text-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
        <span className="text-court-line/50">Ball:</span>
        <span className="truncate">{ballHolder ? ballHolder.name ?? `#${ballHolder.number}` : '—'}</span>
      </div>

      {/* Playback */}
      <div>
        <p className="text-xs uppercase tracking-wide text-court-line/50 mb-2 font-display">Playback</p>
        <div className="flex items-center gap-2">
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-ink-900 disabled:opacity-30"
            disabled={!hasAnyRoute}
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

      {hasAnyRoute && (
        <button className="text-xs text-court-line/40 underline text-left" onClick={editor.clearAllRoutes}>
          Clear all routes
        </button>
      )}
    </div>
  )
}
