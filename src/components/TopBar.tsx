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
  'transition-all duration-75 active:shadow-none active:translate-y-[6px]'

/** Square icon cap — the default for everything but the court tabs. */
const ICON_CAP = `${CAP} w-[62px] h-[62px] bg-white shadow-[0_6px_0_#9aa0ab]`

/**
 * The court tabs are caps too, so the bar reads as one set of controls. Only
 * their colour carries the selected state, as before. The active cap's side
 * face is a darker orange rather than the grey one — a grey ledge under an
 * orange cap looks like a rendering mistake.
 */
const TAB_CAP = `${CAP} min-h-[62px] px-5 text-[2rem] leading-none uppercase tracking-wide`
const TAB_ACTIVE = 'bg-accent shadow-[0_6px_0_#a8763a]'
const TAB_IDLE = 'bg-white shadow-[0_6px_0_#9aa0ab]'

const TABS: { value: CourtType; label: string }[] = [
  { value: 'half', label: 'Half court' },
  { value: 'full', label: 'Full court' },
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
  return (
    // No fixed height: the 62px controls set it, and the padding then holds
    // everything clear of the screen edge — on a tablet the very top few pixels
    // are the hardest place to hit accurately. `pb-2` also leaves room for the
    // caps' 6px side face, which box-shadow draws outside the layout box.
    <header className="shrink-0 bg-black flex items-center pt-3 pb-2 pl-7 pr-4 gap-6 font-display text-court-line">
      {/* Equal-width flanks keep the court tabs optically centred in the bar. */}
      {/* Gaps are deliberately wide: this bar is tapped courtside, mid-sentence,
          and erase has no confirm — neighbours must not be reachable by a near miss. */}
      <span className="flex-1 flex items-center gap-6">
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
            className={`${TAB_CAP} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          >
            {tab.label}
          </button>
        )
      })}

      <span className="flex-1 flex items-center justify-end gap-6">
        {/* Play name, on screen for recordings only — deliberately not stored.
            Flat on purpose: it's a text field, so it must not wear the raised
            cap the pressable controls use. */}
        <input
          type="text"
          placeholder="NOTES"
          aria-label="Play name"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 h-[62px] px-3 rounded-md bg-white text-ink-900 text-2xl text-center uppercase tracking-wide placeholder:text-ink-900/40 outline-none"
        />
        <button onClick={onOpenRoster} aria-label="Roster" className={ICON_CAP}>
          <RosterIcon />
        </button>
        <button onClick={onOpenSettings} aria-label="Settings" className={ICON_CAP}>
          <SettingsIcon />
        </button>
      </span>
    </header>
  )
}
