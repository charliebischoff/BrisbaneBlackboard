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
 */
const CAP =
  'rounded-md text-ink-900 flex items-center justify-center ' +
  // The press drop must equal the side face's depth or the cap won't seat
  // flush — so the 2px/3px split has to track the shadow split below.
  'transition-all duration-75 active:shadow-none active:translate-y-[2px] lg:active:translate-y-[3px]'

/**
 * Icon cap. Square on the small-screen rail, where width is what the rail is
 * short of; in the top bar it goes double-width instead — the bar has spare
 * horizontal room and a wider target is easier to hit than a taller one would
 * be, since height there is bought straight out of the court.
 */
const ICON_CAP =
  `${CAP} w-[24px] h-[24px] shadow-[0_2px_0_#9aa0ab] ` +
  `lg:w-[64px] lg:h-[32px] lg:shadow-[0_3px_0_#9aa0ab] bg-white`

/**
 * The court tabs are caps too, so the bar reads as one set of controls. Only
 * their colour carries the selected state, as before. The active cap's side
 * face is a darker orange rather than the grey one — a grey ledge under an
 * orange cap looks like a rendering mistake.
 *
 * Both breakpoints show the two-letter form — asked for directly, and the only
 * thing that fits the 24px rail cap — so the full name lives on aria-label.
 * Width is fixed rather than `auto` so the two tabs match each other and scale
 * with the icon caps beside them.
 */
const TAB_CAP =
  `${CAP} w-[24px] h-[24px] text-[0.6rem] lg:w-[92px] lg:h-auto lg:min-h-[32px] ` +
  `lg:px-3 lg:text-[1rem] leading-none uppercase tracking-wide`
const TAB_ACTIVE = 'bg-accent shadow-[0_2px_0_#a8763a] lg:shadow-[0_3px_0_#a8763a]'
const TAB_IDLE = 'bg-white shadow-[0_2px_0_#9aa0ab] lg:shadow-[0_3px_0_#9aa0ab]'

const TABS: { value: CourtType; label: string; short: string }[] = [
  { value: 'half', label: 'Half court', short: 'HC' },
  { value: 'full', label: 'Full court', short: 'FC' },
]

/** Two-person roster glyph. */
function RosterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
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
      className={`w-4 h-4 ${axis === 'vertical' ? 'rotate-90' : ''}`}
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

/**
 * Chevron for the collapse toggle. It points the way the bar is about to go:
 * left when expanded (the rail slides off the left edge), right when collapsed.
 * At `lg` the same glyph is turned a quarter turn so it points up/down instead,
 * which is the direction the horizontal bar actually moves.
 */
function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      // One branch, not a base + override: both would be `rotate-*` utilities in
      // the same media query, and CSS source order would decide the winner
      // rather than the order they're written in here.
      className={`w-4 h-4 transition-transform duration-150 ${
        collapsed ? 'rotate-180 lg:rotate-[270deg]' : 'lg:rotate-90'
      }`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 5 8 12l7 7" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
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
  // Session-only on purpose: the bar is where every control lives, so starting a
  // session with it hidden would strand anyone who collapsed it and forgot.
  const [isCollapsed, setIsCollapsed] = useState(false)

  const toggle = (
    <button
      onClick={() => setIsCollapsed((v) => !v)}
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}
      className={ICON_CAP}
    >
      <ChevronIcon collapsed={isCollapsed} />
    </button>
  )

  return (
    // Two shapes, one markup. At `lg` this is the horizontal bar it has always
    // been: no fixed height, the 32px caps set it, and the padding holds
    // everything clear of the screen edge — on a tablet the very top few pixels
    // are the hardest place to hit accurately. `pb-1` also leaves room for the
    // caps' 3px side face, which box-shadow draws outside the layout box.
    //
    // Below `lg` it becomes a narrow side rail instead. A landscape phone is
    // 2.17:1 while the half court is wider than tall but not by much, so height
    // is the scarce dimension and width is going spare — putting the chrome in
    // the spare one buys the court real estate. Two columns because the rail
    // carries 7 slots in either court mode, and one column of them would run off
    // a 402px screen.
    //
    // The width is derived, not chosen: 24 + 4 gap + 24 + 4 right padding = 56,
    // plus the left padding on top rather than carved out of it. Writing a flat
    // 52px here is what made the two columns overlap — `grid-cols-2` gives
    // minmax(0,1fr) tracks, so fixed-width caps bleed past them rather than
    // widening the grid. padding-left floors at 4px but yields to the landscape
    // notch, which sits exactly where the rail does, hence the max() in both
    // places. Every small-screen value is reset at `lg:`.
    <header
      className={
        'shrink-0 bg-black font-display text-court-line overflow-y-auto ' +
        'grid content-start gap-1 pb-1 pr-1 ' +
        // A floor of 8px above the first row rather than 4: the very top edge of
        // a tablet is the least accurate place to tap, and the caps sat close
        // enough to it that a high press missed. Yields to the notch inset where
        // that is larger, same as the left edge below.
        '[padding-top:max(0.5rem,env(safe-area-inset-top))] ' +
        '[padding-left:max(0.25rem,env(safe-area-inset-left))] ' +
        (isCollapsed
          ? // One column, one cap. `self-start` matters only at `lg`: the bar is
            // a flex child of a column there, so without it a collapsed bar
            // still stretches the full width as a black strip.
            'grid-cols-1 w-[calc(28px+max(0.25rem,env(safe-area-inset-left)))] ' +
            'lg:flex lg:w-auto lg:self-start lg:pl-3.5 lg:pr-2 '
          : 'grid-cols-2 w-[calc(56px+max(0.25rem,env(safe-area-inset-left)))] ' +
            'lg:flex lg:items-center lg:w-auto lg:gap-3 lg:pl-3.5 lg:pr-2 ')
      }
    >
      {/* `contents` below `lg` so the caps are direct grid items of the rail;
          at `lg` these become the equal-width flanks that keep the court tabs
          optically centred in the bar.
          The gap is still the widest thing the slimmed bar can afford: this bar
          is tapped courtside, mid-sentence, and erase has no confirm — a near
          miss must not land on a neighbour. */}
      {/* The toggle lives inside the left flank rather than beside it so that
          expanding does not shove the court tabs off centre: the flank is one
          flex-1 unit either way. It is the first item in both shapes, which puts
          it top-left of the bar and at the head of the rail. */}
      <span
        className={
          'contents lg:flex lg:items-center ' + (isCollapsed ? '' : 'lg:flex-1 lg:gap-3')
        }
      >
        {toggle}
        {!isCollapsed && (
          <>
        <button onClick={onClearRoutes} aria-label="Erase all lines" className={`${ICON_CAP} text-base`}>
          R
        </button>
        <button onClick={() => onFlip('horizontal')} aria-label="Flip left to right" className={ICON_CAP}>
          <FlipIcon axis="horizontal" />
        </button>
        {/* Half court only has one basket, at the top — a top-to-bottom flip
            would strand the play in the empty half. Full court swaps sidelines,
            which is the SLOB case, so it earns its spot there.
            On half court the slot is held open rather than collapsed: the rail is
            a two-column grid, so dropping a cap shifts every one below it into a
            different position, and the cap that lands where "FC" just was is
            "HC". Two taps on one spot then bounce straight back to half court —
            and since switching clears the board with no undo, that costs a play.
            `invisible` keeps the space without the paint, and takes the
            placeholder out of hit-testing and the a11y tree. It's dropped
            entirely at `lg`, where the bar is a flex row and this would read as a
            hole in it. */}
        {courtType === 'full' ? (
          <button onClick={() => onFlip('vertical')} aria-label="Flip top to bottom" className={ICON_CAP}>
            <FlipIcon axis="vertical" />
          </button>
        ) : (
          <span aria-hidden className={`${ICON_CAP} invisible lg:hidden`} />
        )}
          </>
        )}
      </span>

      {!isCollapsed &&
        TABS.map((tab) => {
        const isActive = courtType === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onCourtTypeChange(tab.value)}
            aria-pressed={isActive}
            aria-label={tab.label}
            className={`${TAB_CAP} ${isActive ? TAB_ACTIVE : TAB_IDLE}`}
          >
            {tab.short}
          </button>
        )
      })}

      {!isCollapsed && (
      <span className="contents lg:flex-1 lg:flex lg:items-center lg:justify-end lg:gap-3">
        <button onClick={onOpenRoster} aria-label="Roster" className={ICON_CAP}>
          <RosterIcon />
        </button>
        <button onClick={onOpenSettings} aria-label="Settings" className={ICON_CAP}>
          <SettingsIcon />
        </button>
      </span>
      )}
    </header>
  )
}
