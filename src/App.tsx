import { useEffect, useState } from 'react'
import { usePlayEditor } from './hooks/usePlayEditor'
import CourtEditor from './components/CourtEditor'
import TopBar from './components/TopBar'
import RosterModal from './components/RosterModal'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const editor = usePlayEditor()
  const [isRosterOpen, setIsRosterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Missed-pass feedback used to live in the sidebar toolbar. Move & ball is
  // now the only mode, so a dropped ball must still say something.
  const { ballHint, dismissBallHint } = editor
  useEffect(() => {
    if (!ballHint) return
    const timer = window.setTimeout(dismissBallHint, 2500)
    return () => window.clearTimeout(timer)
  }, [ballHint, dismissBallHint])

  return (
    <div className="h-screen w-screen bg-ink-900 flex flex-col overflow-hidden">
      <TopBar
        courtType={editor.courtType}
        onCourtTypeChange={editor.setCourtType}
        onOpenRoster={() => setIsRosterOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onClearRoutes={editor.clearAllRoutes}
      />

      <main className="relative flex-1 min-h-0 min-w-0 p-3 md:p-6">
        <CourtEditor editor={editor} />

        {ballHint && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/80 text-court-line text-sm font-body pointer-events-none">
            {ballHint}
          </div>
        )}
      </main>

      {isRosterOpen && (
        <RosterModal
          onCourtIds={editor.onCourtIds}
          onAddToCourt={editor.addPlayerToCourt}
          onRemoveFromCourt={editor.removePlayerFromCourt}
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
    </div>
  )
}
