import { useEffect, useState } from 'react'
import { CourtType } from '../types'
import {
  Settings,
  BALL_RADIUS_STEP,
  MAX_BALL_RADIUS,
  MAX_PLAYER_RADIUS,
  MAX_VISIBLE_LINES_LIMIT,
  MIN_BALL_RADIUS,
  MIN_PLAYER_RADIUS,
  MIN_VISIBLE_LINES,
  PLAYER_RADIUS_STEP,
} from '../lib/settingsStore'

interface Props {
  settings: Settings
  /** Which court's ballRadius/playerRadius slot the two size sliders read and write. */
  courtType: CourtType
  onMaxVisibleLinesChange: (value: number) => void
  onBallRadiusChange: (value: number) => void
  onPlayerRadiusChange: (value: number) => void
  onClose: () => void
}

interface SliderProps {
  label: string
  /** Optional — the size sliders read clearly enough from their label and value alone. */
  hint?: string
  value: number
  min: number
  max: number
  step: number
  /** What the current value reads as to a coach — not always the raw number. */
  display: string
  onChange: (value: number) => void
  /** Extra classes on the wrapper — used to fade sliders in and out of the way. */
  className?: string
  onDragStart?: () => void
}

/** A single discrete slider, sized for a finger on a courtside tablet. */
function StepSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  onChange,
  className = '',
  onDragStart,
}: SliderProps) {
  return (
    <label className={`block transition-opacity duration-150 ${className}`}>
      <span className="flex items-baseline justify-between">
        <span className="font-display text-lg uppercase tracking-wide">{label}</span>
        <span className="font-display text-lg text-accent">{display}</span>
      </span>
      {/* The gap above the track lives on whichever element is last — the hint
          when there is one, the input itself when there isn't. */}
      {hint && <span className="block text-xs text-court-line/40 mb-3">{hint}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={onDragStart}
        className={`settings-slider w-full ${hint ? '' : 'mt-3'}`}
      />
    </label>
  )
}

/**
 * The settings sheet behind the top bar's gear. Every control writes straight
 * through `usePlayEditor` (and from there to localStorage) as it moves — there
 * is no save button, so the court behind updates live.
 */
export default function SettingsModal({
  settings,
  courtType,
  onMaxVisibleLinesChange,
  onBallRadiusChange,
  onPlayerRadiusChange,
  onClose,
}: Props) {
  /**
   * The size sliders are the settings whose effect is invisible behind this sheet,
   * so while it's being dragged the sheet all but disappears and the slider
   * itself drops back too — enough to aim with, little enough to see the ball
   * change size on the court underneath. Opacity doesn't nest here: the fade is
   * applied per element rather than to a wrapper, or the slider could never be
   * more opaque than the sheet containing it.
   */
  const [isSizing, setIsSizing] = useState(false)

  useEffect(() => {
    if (!isSizing) return
    const end = () => setIsSizing(false)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [isSizing])

  /** What everything except the slider being dragged fades to during that drag. */
  const dimmed = isSizing ? 'opacity-5' : 'opacity-100'

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-150 ${
        isSizing ? 'bg-transparent' : 'bg-black/70'
      }`}
    >
      <div
        className={`absolute inset-3 lg:inset-10 rounded-xl flex flex-col overflow-hidden text-court-line font-body transition-colors duration-150 ${
          isSizing ? 'bg-ink-900/5' : 'bg-ink-900 shadow-2xl shadow-black/60'
        }`}
      >
        <div
          className={`shrink-0 flex items-center justify-between px-4 py-3 border-b border-ink-700 transition-opacity duration-150 ${dimmed}`}
        >
          <h2 className="font-display text-xl uppercase tracking-wide">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-[52px] h-[52px] rounded-md text-2xl text-court-line/70 active:bg-ink-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-8 max-w-xl">
          <StepSlider
            label="Visible lines"
            hint="How many of the most recent lines stay on the board."
            value={settings.maxVisibleLines}
            min={MIN_VISIBLE_LINES}
            max={MAX_VISIBLE_LINES_LIMIT}
            step={1}
            display={`${settings.maxVisibleLines}`}
            onChange={onMaxVisibleLinesChange}
            className={dimmed}
          />

          {/* Both sizes are absolute now, and stored separately per court type —
              the ball used to be a fraction of a player token (so this slider
              moved whenever the token did) and shared between half and full
              court despite the two being drawn at different coordinate scales.
              `courtType` picks which of that pair this sheet is currently
              showing; it always matches whichever court is on screen behind it. */}
          <StepSlider
            label="Ball size"
            value={settings.ballRadius[courtType]}
            min={MIN_BALL_RADIUS}
            max={MAX_BALL_RADIUS}
            step={BALL_RADIUS_STEP}
            // Diameter, not radius — it's the width a coach sees on the board.
            display={`${Math.round(settings.ballRadius[courtType] * 2)}`}
            onChange={onBallRadiusChange}
            className={isSizing ? 'opacity-50' : 'opacity-100'}
            onDragStart={() => setIsSizing(true)}
          />

          <StepSlider
            label="Player size"
            value={settings.playerRadius[courtType]}
            min={MIN_PLAYER_RADIUS}
            max={MAX_PLAYER_RADIUS}
            step={PLAYER_RADIUS_STEP}
            display={`${Math.round(settings.playerRadius[courtType] * 2)}`}
            onChange={onPlayerRadiusChange}
            className={isSizing ? 'opacity-50' : 'opacity-100'}
            onDragStart={() => setIsSizing(true)}
          />
        </div>
      </div>
    </div>
  )
}
