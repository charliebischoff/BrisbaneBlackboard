import { usePlayEditor } from './hooks/usePlayEditor'
import CourtEditor from './components/CourtEditor'
import Toolbar from './components/Toolbar'
import PlaysLibrary from './components/PlaysLibrary'
import RosterManager from './components/RosterManager'

export default function App() {
  const editor = usePlayEditor()

  return (
    <div className="h-screen w-screen bg-ink-900 flex flex-col md:flex-row overflow-hidden">
      <main className="flex-1 min-h-0 p-3 md:p-6">
        <CourtEditor editor={editor} />
      </main>

      <aside className="w-full md:w-80 shrink-0 p-3 md:p-6 md:pl-0 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <img src="/bullets-logo.png" alt="Brisbane Bullets" className="h-12 w-auto" />
          <h1 className="font-display text-2xl tracking-wide text-court-line uppercase">Playbook</h1>
        </div>
        <Toolbar editor={editor} />
        <RosterManager
          onCourtIds={editor.onCourtIds}
          onAddToCourt={editor.addPlayerToCourt}
          onRemoveFromCourt={editor.removePlayerFromCourt}
          courtIsFull={editor.courtIsFull}
        />
        <PlaysLibrary
          playName={editor.playName}
          setPlayName={editor.setPlayName}
          onSave={editor.toPlaySnapshot}
          onLoad={editor.loadPlay}
          onNew={editor.newPlay}
        />
      </aside>
    </div>
  )
}
