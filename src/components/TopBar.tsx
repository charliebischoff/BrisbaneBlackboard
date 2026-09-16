import { useState } from 'react'
import { CourtType } from '../types'
import { FlipAxis } from '../lib/routeGeometry'

interface Props {
  courtType: CourtType
  onCourtTypeChange: (type: CourtType) => void
  onOpenRoster: () => void
  onOpenSettings: () => void
  onClearRoutes: () => void
  onFlip: (axis: FlipAxis) => void
}

/**
 * Every pressable control in the bar is a key cap. The shadow is a visible side
 * face, so it has to be a grey shade of the cap rather than a dark one —
 * anything near black vanishes into the bar and the button reads flat. Pressing
 * removes the face and drops the cap onto it, which is the whole affordance.
 * The notes field deliberately opts out: it isn't pressable.
 */
const CAP =
  'rounded-md text-ink-900 flex items-center justify-center ' +
  // The press drop must equal the side face's depth or the cap won't seat
  // flush — so the 4px/6px split has to track the shadow split below.
  'transition-all duration-75 active:shadow-none active:translate-y-[4px] lg:active:translate-y-[6px]'

/** Square icon cap — the default for everything but the court tabs. */
const ICON_CAP =
  `${CAP} w-[44px] h-[44px] shadow-[0_4px_0_#9aa0ab] ` +
  `lg:w-[62px] lg:h-[62px] lg:shadow-[0_6px_0_#9aa0ab] bg-white`

/**
 * The court tabs are caps too, so the bar reads as one set of controls. Only
 * their colour carries the selected state, as before. The active cap's side
 * face is a darker orange rather than the grey one — a grey ledge under an
 * orange cap looks like a rendering mistake.
 *
 * In the rail there is no room for "HALF COURT", so the label drops to the one
 * word that distinguishes them and the full name moves to aria-label.
 */
const TAB_CAP =
  `${CAP} w-[44px] h-[44px] text-[0.8rem] lg:w-auto lg:h-auto lg:min-h-[62px] ` +
  `lg:px-5 lg:text-[2rem] leading-none uppercase tracking-wide`
const TAB_ACTIVE = 'bg-accent shadow-[0_4px_0_#a8763a] lg:shadow-[0_6px_0_#a8763a]'
const TAB_IDLE = 'bg-white shadow-[0_4px_0_#9aa0ab] lg:shadow-[0_6px_0_#9aa0ab]'

const TABS: { value: CourtType; label: string; short: string }[] = [
  { value: 'half', label: 'Half court', short: 'Half' },
  { value: 'full', label: 'Full court', short: 'Full' },
]

/** Two-person roster glyph. */
function RosterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.2c3 .2 5 1.9 5 4.8" strokeLinecap="round" />
    </svg>
  )
}

/** Two arrows meeting a dashed mirror line — the axis the board folds across. */
function FlipIcon({ axis }: { axis: FlipAxis }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-7 h-7 ${axis === 'vertical' ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18" strokeDasharray="2.5 3" />
      <path d="M8.5 8 4 12l4.5 4" />
      <path d="M4 12h5" />
      <path d="M15.5 8 20 12l-4.5 4" />
      <path d="M20 12h-5" />
    </svg>
  )
}

/** Pencil — the rail's stand-in for the inline notes field. */
function NoteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-7 h-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="M14.5 6.5 17.5 9.5" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="3.2" />
      <path
        d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The app's only chrome: court tabs on the left, roster and settings on the
 * right. Everything the old sidebar carried (modes, line types, playback,
 * saved plays) is hidden for now and will return behind the settings button.
 */
export default function TopBar({
  courtType,
  onCourtTypeChange,
  onOpenRoster,
  onOpenSettings,
  onClearRoutes,
  onFlip,
}: Props) {
  // Still deliberately not persisted — component state only, so it survives the
  // popover closing but nothing more. See the input's comment below.
  const [note, setNote] = useState('')
  const [isNoteOpen, setIsNoteOpen] = useState(false)

  return (
    // Two shapes, one markup. At `lg` this is the horizontal bar it has always
    // been: no fixed height, the 62px caps set it, and the padding holds
    // everything clear of the screen edge — on a tablet the very top few pixels
    // are the hardest place to hit accurately. `pb-2` also leaves room for the
    // caps' 6px side face, which box-shadow draws outside the layout box.
    //
    // Below `lg` it becomes a 96px side rail instead. A landscape phone is
    // 2.17:1 while the half court is nearly square, so height is the scarce
    // dimension and width is going spare — putting the chrome in the spare one
    // buys the court ~19%. Two columns because full-court mode has 8 controls,
    // and one column of 44px caps does not fit in 402px of screen.
    //
    // padding-left floors at 4px but yields to the landscape notch, which sits
    // exactly where the rail does. Every small-screen value is reset at `lg:`.
    <header
      className={
        'shrink-0 bg-black font-display text-court-line overflow-y-auto ' +
        'grid grid-cols-2 content-start gap-1.5 w-[96px] py-2 pr-1 ' +
        '[padding-left:max(0.25rem,env(safe-area-inset-left))] ' +
        'lg:flex lg:items-center lg:w-auto lg:gap-6 lg:pt-3 lg:pb-2 lg:pl-7 lg:pr-4'
      }
    >
      {/* `contents` below `lg` so the caps are direct grid items of the rail;
          at `lg` these become the equal-width flanks that keep the court tabs
          optically centred in the bar.
          Gaps are deliberately wide there: this bar is tapped courtside,
          mid-sentence, and erase has no confirm — neighbours must not be
          reachable by a near miss. */}
      <span className="contents lg:flex-1 lg:flex lg:items-center lg:gap-6">
        <button onClick={onClearRoutes} aria-label="Erase all lines" className={`${ICON_CAP} text-3xl`}>
          R
        </button>
        <button onClick={() => onFlip('horizontal')} aria-label="Flip left to right" className={ICON_CAP}>
          <FlipIcon axis="horizontal" />
        </button>
        {/* Half court only has one basket, at the top — a top-to-bottom flip
            would strand the play in the empty half. Full court swaps sidelines,
            which is the SLOB case, so it earns its spot there. */}
        {courtType === 'full' && (
          <button onClick={() => onFlip('vertical')} aria-label="Flip top to bottom" className={ICON_CAP}>
            <FlipIcon axis="vertical" />
          </button>
        )}
      </span>

      {TABS.map((tab) => {
        const isActive = courtType === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onCourtTypeChange(tab.value)}
            aria-pressed={isActive}
            aria-label={tab.label}
            className={`${TAB_CAP} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          >
            <span className="lg:hidden">{tab.short}</span>
            <span className="hidden lg:inline">{tab.label}</span>
          </button>
        )
      })}

      <span className="contents lg:flex-1 lg:flex lg:items-center lg:justify-end lg:gap-6">
        {/* Play name, on screen for recordings only — deliberately not stored.
            Flat on purpose: it's a text field, so it must not wear the raised
            cap the pressable controls use.
            A 44px rail can't hold a text field, so below `lg` it moves behind a
            cap and opens as a popover over the court instead. The value lives in
            state rather than in the DOM because the popover unmounts on close —
            an uncontrolled input would silently wipe the caption every time. */}
        <input
          type="text"
          placeholder="NOTES"
          aria-label="Play name"
          autoComplete="off"
          spellCheck={false}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="hidden lg:block flex-1 min-w-0 h-[62px] px-3 rounded-md bg-white text-ink-900 text-2xl text-center uppercase tracking-wide placeholder:text-ink-900/40 outline-none"
        />
        <button
          onClick={() => setIsNoteOpen((open) => !open)}
          aria-label="Play name"
          aria-expanded={isNoteOpen}
          className={`${ICON_CAP} lg:hidden`}
        >
          <NoteIcon />
        </button>
        <button onClick={onOpenRoster} aria-label="Roster" className={ICON_CAP}>
          <RosterIcon />
        </button>
        <button onClick={onOpenSettings} aria-label="Settings" className={ICON_CAP}>
          <SettingsIcon />
        </button>
      </span>

      {isNoteOpen && (
        <input
          type="text"
          placeholder="NOTES"
          aria-label="Play name"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => setIsNoteOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setIsNoteOpen(false)
          }}
          className="lg:hidden fixed left-[104px] top-2 z-40 w-[240px] h-[44px] px-3 rounded-md bg-white text-ink-900 text-base text-center uppercase tracking-wide placeholder:text-ink-900/40 outline-none shadow-lg shadow-black/50"
        />
      )}
    </header>
  )
}
