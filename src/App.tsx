import { useEffect, useState } from 'react'
import { usePlayEditor } from './hooks/usePlayEditor'
import CourtEditor from './components/CourtEditor'
import TopBar, { CollapseToggle } from './components/TopBar'
import RosterModal from './components/RosterModal'
import SettingsModal from './components/SettingsModal'
import RotatePrompt from './components/RotatePrompt'
import { useAppUpdate, applyUpdate } from './hooks/useAppUpdate'

export default function App() {
  const editor = usePlayEditor()
  const updateReady = useAppUpdate()
  const [isRosterOpen, setIsRosterOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // Lives here rather than inside TopBar because collapsing is not just about
  // the bar: it also flips the root layout axis and drops the court's padding,
  // which is where the extra court size actually comes from. Session-only on
  // purpose — starting a session with every control hidden would strand anyone
  // who collapsed it and forgot.
  const [isBarCollapsed, setIsBarCollapsed] = useState(false)
  // Dismissing costs nothing: the waiting worker activates by itself the next
  // time the app is fully closed and reopened. So "Later" means the rest of this
  // session rather than a snooze — a timed reminder's only real effect would be
  // to bring the prompt back mid-game, which is when it must not appear.
  const [isUpdateDismissed, setIsUpdateDismissed] = useState(false)

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
    //
    // Collapsed there is no bar in the flow at all, so the axis is moot — the
    // court is the only child and takes the whole box. That is stronger than the
    // old collapsed rail, which still charged the court ~68px of width on a
    // tablet; the toggle now floats over the court instead (see <main>).
    <div
      className={`h-dvh w-screen bg-ink-900 flex overflow-hidden ${
        isBarCollapsed ? 'flex-row' : 'flex-row lg:flex-col'
      }`}
    >
      {/* Collapsed, the bar is not rendered at all — its only surviving control
          is the toggle, and that moves inside <main> as an overlay so it costs
          the court no layout space in either dimension. */}
      {!isBarCollapsed && (
        <TopBar
          onToggleCollapse={() => setIsBarCollapsed((v) => !v)}
          courtType={editor.courtType}
          onCourtTypeChange={editor.setCourtType}
          onOpenRoster={() => setIsRosterOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onClearRoutes={editor.clearAllRoutes}
          onFlip={editor.flipBoard}
        />
      )}

      {/* `lg:` not `md:` — Tailwind's md is 768px, so a landscape phone (874px)
          was already taking the 24px padding, costing 48px of a 402px screen.
          The env() insets clear the home indicator and the right-hand notch
          margin, and are reset at `lg:` so the iPad court keeps its exact size. */}
      {/* Collapsed, the padding goes too. On a landscape phone the rail already
          costs no height, so this is the only vertical space left to reclaim
          there; on a tablet it stacks with the bar height freed above. The
          safe-area floors stay in both states — the home indicator and the
          right-hand notch margin still have to be cleared. */}
      {/* The top edge is deliberately half the others. The bar above already
          separates the court from the screen edge visually, and since the court
          is height-bound in every real layout, padding there is lost court
          size rather than breathing room. It isn't zero only because the bar's
          caps draw a 3px side face outside their layout box. */}
      <main
        className={
          'relative flex-1 min-h-0 min-w-0 ' +
          (isBarCollapsed
            ? // The left inset floor was the collapsed rail's job; with no rail
              // it has to be held here instead.
              'p-1 lg:p-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] ' +
              'pl-[max(0.25rem,env(safe-area-inset-left))] ' +
              'pr-[max(0.25rem,env(safe-area-inset-right))] lg:pb-2 lg:pr-2 lg:pl-2'
            : 'p-3 lg:p-6 pt-1.5 lg:pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ' +
              'pr-[max(0.75rem,env(safe-area-inset-right))] lg:pb-6 lg:pr-6')
        }
      >
        <CourtEditor editor={editor} />

        {isBarCollapsed && (
          <CollapseToggle
            isCollapsed
            variant="floating"
            onToggleCollapse={() => setIsBarCollapsed((v) => !v)}
          />
        )}

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

        {/* Lowest priority of the three: this one has no timeout, so it must
            not be allowed to sit on top of the erase-undo window, which does.
            Never auto-applies — the play on the board isn't saved anywhere, so
            reloading has to be a deliberate tap. */}
        {updateReady && !isUpdateDismissed && !ballHint && !canUndoClear && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-black/80 text-court-line text-sm font-body">
            <span>Update ready</span>
            {/* Unfilled, so "Reload" stays the one obvious action of the two. */}
            <button
              onClick={() => setIsUpdateDismissed(true)}
              className="px-3 py-1.5 rounded-full text-court-line/80"
            >
              Later
            </button>
            <button
              onClick={applyUpdate}
              className="px-3 py-1.5 rounded-full bg-accent text-ink-900 font-medium"
            >
              Reload
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
          onBallRadiusChange={editor.setBallRadius}
          onPlayerRadiusChange={editor.setPlayerRadius}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <RotatePrompt />
    </div>
  )
}
