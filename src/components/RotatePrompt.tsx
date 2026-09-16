import { useState } from 'react'

/** Phone in portrait with a curved arrow around it — the gesture being asked for. */
function RotateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-16 h-16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="8.5" y="5" width="7" height="14" rx="1.5" />
      <path d="M12 16.8h.01" />
      <path d="M4.8 9.5A8 8 0 0 1 7 6.4" />
      <path d="M4.2 6.4 4.8 9.6 8 9" />
      <path d="M19.2 14.5a8 8 0 0 1-2.2 3.1" />
      <path d="M19.8 17.6 19.2 14.4 16 15" />
    </svg>
  )
}

/**
 * The board is a landscape surface: the half court is nearly square and the
 * full court is 1.76:1, so a portrait phone leaves nothing usable.
 *
 * public/manifest.json asks for landscape, but iOS honours neither the manifest
 * orientation field nor screen.orientation.lock() — on iPhone a CSS overlay is
 * the only lever there is.
 *
 * Visibility is owned by `.rotate-prompt` in index.css — portrait AND under
 * 1024px. The width half is not optional: a bare orientation query also matches
 * an iPad held upright, where the half court is perfectly usable, and blocking
 * that would be a regression.
 */
export default function RotatePrompt() {
  // Orientation lock is common, and a locked phone can never satisfy the
  // prompt — without a way out the app would simply be unusable for them.
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div className="rotate-prompt fixed inset-0 z-50 bg-ink-900 flex-col items-center justify-center gap-4 p-8 text-center text-court-line font-display">
      <RotateIcon />
      <p className="text-3xl uppercase tracking-wide leading-tight">
        Rotate your device
      </p>
      <p className="font-body text-sm text-court-line/60 max-w-xs">
        The board is built for landscape.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="mt-2 px-4 py-2 rounded-md font-body text-sm text-court-line/60 underline underline-offset-4"
      >
        Use anyway
      </button>
    </div>
  )
}
