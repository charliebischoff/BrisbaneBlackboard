import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RosterPlayer } from '../types'
import { rosterStore } from '../lib/rosterStore'

interface Props {
  /** id of the on-court player being replaced. */
  outgoingId: string
  /** Page-space pixel coordinates to anchor the menu near (the tapped token's on-screen position). */
  anchor: { x: number; y: number }
  onCourtIds: string[]
  onSwap: (outgoingId: string, incoming: RosterPlayer) => void
  onClose: () => void
}

const MENU_WIDTH = 240
const MENU_MAX_HEIGHT = 320
const EDGE_PADDING = 12

/**
 * Small roster popover anchored next to a double-tapped player token — tap a
 * name, they swap in on the spot. Portaled to document.body rather than
 * rendered inline: it's positioned in page pixels (not court units), and a
 * portal sidesteps any clipping from CourtEditor's own sized-to-the-Stage
 * container without needing to touch that container's overflow behavior.
 */
export default function PlayerSwapMenu({ outgoingId, anchor, onCourtIds, onSwap, onClose }: Props) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRoster(rosterStore.getAll())
  }, [])

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Keep the menu fully on screen regardless of how close to an edge the
  // tapped token was — a post near the sideline would otherwise push it
  // halfway off the viewport.
  const left = Math.min(Math.max(anchor.x, EDGE_PADDING), window.innerWidth - MENU_WIDTH - EDGE_PADDING)
  const top = Math.min(Math.max(anchor.y, EDGE_PADDING), window.innerHeight - MENU_MAX_HEIGHT - EDGE_PADDING)

  return createPortal(
    <div
      ref={menuRef}
      style={{ left, top, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      className="fixed z-[60] bg-ink-800 rounded-lg shadow-2xl shadow-black/60 overflow-y-auto text-court-line font-body py-1"
    >
      {roster.map((player) => {
        const isOnCourt = onCourtIds.includes(player.id)
        const isOutgoing = player.id === outgoingId
        return (
          <button
            key={player.id}
            disabled={isOnCourt}
            onClick={() => {
              if (isOnCourt) return
              onSwap(outgoingId, player)
              onClose()
            }}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-left ${
              isOnCourt ? 'opacity-30' : 'active:bg-ink-700'
            } ${isOutgoing ? 'ring-1 ring-inset ring-accent/60' : ''}`}
          >
            {player.photo ? (
              <img src={player.photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 bg-ink-900" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-ink-900 shrink-0" />
            )}
            <span className="w-5 text-center text-xs text-court-line/50 font-display shrink-0">
              {player.number ?? '—'}
            </span>
            <span className="flex-1 text-sm truncate">
              {player.name}
              {player.isCaptain && <span className="text-accent text-xs ml-1">(C)</span>}
            </span>
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
