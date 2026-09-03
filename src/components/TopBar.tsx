import { CourtType } from '../types'

interface Props {
  courtType: CourtType
  onCourtTypeChange: (type: CourtType) => void
  onOpenRoster: () => void
  onOpenSettings: () => void
  onClearRoutes: () => void
}

const TABS: { value: CourtType; label: string }[] = [
  { value: 'half', label: 'Half court' },
  { value: 'full', label: 'Full court' },
]

/** Two-person roster glyph. */
function RosterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.2c3 .2 5 1.9 5 4.8" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8}>
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
}: Props) {
  return (
    <header className="shrink-0 h-[78px] bg-black flex items-center px-2 gap-1 font-display text-court-line">
      {/* Equal-width flanks keep the court tabs optically centred in the bar. */}
      <span className="flex-1 flex items-center">
        <button
          onClick={onClearRoutes}
          aria-label="Erase all lines"
          className="w-[62px] h-[62px] rounded-md bg-white text-ink-900 text-3xl flex items-center justify-center transition-transform duration-75 active:scale-110"
        >
          R
        </button>
      </span>

      {TABS.map((tab) => {
        const isActive = courtType === tab.value
        return (
          <button
            key={tab.value}
            onClick={() => onCourtTypeChange(tab.value)}
            aria-pressed={isActive}
            className={`min-h-[78px] px-5 rounded-md text-[2rem] leading-none uppercase tracking-wide transition-colors ${
              isActive ? 'bg-accent text-ink-900' : 'text-court-line/60 active:bg-ink-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}

      <span className="flex-1 flex items-center justify-end gap-1">
        {/* Play name, on screen for recordings only — deliberately not stored. */}
        <input
          type="text"
          placeholder="NOTES"
          aria-label="Play name"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 mx-2 h-[62px] px-3 rounded-md bg-white text-ink-900 text-2xl text-center uppercase tracking-wide placeholder:text-ink-900/40 outline-none"
        />
        <button
          onClick={onOpenRoster}
          aria-label="Roster"
          className="w-[78px] h-[78px] flex items-center justify-center rounded-md text-court-line/80 active:bg-ink-800"
        >
          <RosterIcon />
        </button>
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="w-[78px] h-[78px] flex items-center justify-center rounded-md text-court-line/80 active:bg-ink-800"
        >
          <SettingsIcon />
        </button>
      </span>
    </header>
  )
}
