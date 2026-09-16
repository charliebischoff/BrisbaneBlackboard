import { useEffect, useState } from 'react'
import { usePlayEditor } from './hooks/usePlayEditor'
import CourtEditor from './components/CourtEditor'
import TopBar from './components/TopBar'
import RosterModal from './components/RosterModal'
import SettingsModal from './components/SettingsModal'
import RotatePrompt from './components/RotatePrompt'

export default function App() {
  const editor = usePlayEditor()
  const [isRosterOpen, setIsRosterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Missed-pass feedback used to live in the sidebar toolbar. Move & ball is
  // now the only mode, so a dropped ball must still say something.
  const { ballHint, dismissBallHint, canUndoClear, dismissUndo } = editor
  useEffect(() => {
    if (!ballHint) return
    const timer = window.setTimeout(dismissBallHint, 2500)
    return () => window.clearTimeout(timer)
  }, [ballHint, dismissBallHint])

  // The erase button has no confirm step, so the way back is offered right
  // after — long enough to notice a mistake, short enough to stay out of the way.
  useEffect(() => {
    if (!canUndoClear) return
    const timer = window.setTimeout(dismissUndo, 8000)
    return () => window.clearTimeout(timer)
  }, [canUndoClear, dismissUndo])

  return (
    // Below `lg` the chrome is a side rail, so the root axis is horizontal: a
    // near-square court on a 2.17:1 phone screen is height-bound, and spending
    // the surplus width on chrome buys back the scarce height. h-dvh rather
    // than h-screen because 100vh is wrong on iOS; identical on iPad.
    <div className="h-dvh w-screen bg-ink-900 flex flex-row lg:flex-col overflow-hidden">
      <TopBar
        courtType={editor.courtType}
        onCourtTypeChange={editor.setCourtType}
        onOpenRoster={() => setIsRosterOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onClearRoutes={editor.clearAllRoutes}
        onFlip={editor.flipBoard}
      />

      {/* `lg:` not `md:` — Tailwind's md is 768px, so a landscape phone (874px)
          was already taking the 24px padding, costing 48px of a 402px screen.
          The env() insets clear the home indicator and the right-hand notch
          margin, and are reset at `lg:` so the iPad court keeps its exact size. */}
      <main className="relative flex-1 min-h-0 min-w-0 p-3 lg:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:pb-6 lg:pr-6">
        <CourtEditor editor={editor} />

        {ballHint && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 text-court-line text-sm font-body pointer-events-none">
            {ballHint}
          </div>
        )}

        {canUndoClear && !ballHint && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-3 pl-4 pr-2 py-2 rounded-full bg-black/80 text-court-line text-sm font-body">
            <span>Board erased</span>
            <button
              onClick={editor.undoClearAll}
              className="px-3 py-1.5 rounded-full bg-accent text-ink-900 font-medium"
            >
              Undo
            </button>
          </div>
        )}
      </main>

      {isRosterOpen && (
        <RosterModal
          onCourtIds={editor.onCourtIds}
          onAddToCourt={editor.addPlayerToCourt}
          onRemoveFromCourt={editor.removePlayerFromCourt}
          onRosterChanged={editor.syncCourtWithRoster}
          courtIsFull={editor.courtIsFull}
          onClose={() => setIsRosterOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          settings={editor.settings}
          onMaxVisibleLinesChange={editor.setMaxVisibleLines}
          onBallScaleChange={editor.setBallScale}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <RotatePrompt />
    </div>
  )
}
