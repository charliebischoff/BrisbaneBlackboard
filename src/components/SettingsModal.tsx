import { useEffect, useState } from 'react'
import {
  MAX_VISIBLE_LINES_LIMIT,
  MIN_VISIBLE_LINES,
  SIZE_LIMITS,
  Settings,
} from '../lib/settingsStore'
import type { CourtType } from '../types'

interface Props {
  settings: Settings
  /** Which court's sizes the two size sliders read and write. */
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
  // Sizes are stored per court type, so both sliders read and write whichever
  // court is currently on the board — and use that court's own bounds.
  const sizes = settings.sizes[courtType]
  const limits = SIZE_LIMITS[courtType]
  const courtLabel = courtType === 'full' ? 'full court' : 'half court'

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

          {/* Both sizes are absolute court units, stored separately for each
              court. The ball used to be a fraction of a player token, and full
              court used to bump tokens by 1.5x at render time — so the two
              courts could never be tuned apart and the number shown was a lie
              on full court. Now the value is what renders, on this court only. */}
          <StepSlider
            label="Ball size"
            hint={`Applies to ${courtLabel} only.`}
            value={sizes.ballRadius}
            min={limits.ball.min}
            max={limits.ball.max}
            step={limits.ball.step}
            // Diameter, not radius — it's the width a coach sees on the board.
            display={`${Math.round(sizes.ballRadius * 2)}`}
            onChange={onBallRadiusChange}
            className={isSizing ? 'opacity-50' : 'opacity-100'}
            onDragStart={() => setIsSizing(true)}
          />

          <StepSlider
            label="Player size"
            hint={`Applies to ${courtLabel} only.`}
            value={sizes.playerRadius}
            min={limits.player.min}
            max={limits.player.max}
            step={limits.player.step}
            display={`${Math.round(sizes.playerRadius * 2)}`}
            onChange={onPlayerRadiusChange}
            className={isSizing ? 'opacity-50' : 'opacity-100'}
            onDragStart={() => setIsSizing(true)}
          />
        </div>
      </div>
    </div>
  )
}
