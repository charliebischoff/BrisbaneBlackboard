import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker registration, kept behind one module the way storage is kept
 * behind lib/*Store.ts — nothing else in the app should know the PWA plumbing
 * exists.
 *
 * Registration happens here at module scope rather than in an effect. It must
 * run exactly once, and React 18's StrictMode mounts every component twice in
 * development; a module-level call sidesteps that without a guard ref.
 */

/** Set once a new worker is installed and parked in `waiting`. */
let updateReady = false
const listeners = new Set<() => void>()

const updateSW = registerSW({
  // Register on script eval rather than waiting for the window `load` event.
  // Courtside the app is opened on bad connections, and the sooner the worker
  // is in place the sooner the next launch is served from cache.
  immediate: true,
  onNeedRefresh() {
    updateReady = true
    listeners.forEach((notify) => notify())
  },
})

let isReloading = false
function reloadOnce() {
  if (isReloading) return
  isReloading = true
  window.location.reload()
}

/**
 * Applies the waiting update: tells the new worker to skip waiting, then
 * reloads onto it.
 *
 * The reload is ours to do. The plugin's client does attach a `controlling`
 * listener, but it only reloads when workbox flags the event `isUpdate`, which
 * is false on the first session after install — `clientsClaim` claims a page
 * that registered with no controller, so workbox never counts it as an update.
 * The tap would then activate the new worker and leave the old code running,
 * toast still up, looking like the button did nothing.
 *
 * `controllerchange` rather than a bare reload after `updateSW`, so the reload
 * lands once the new worker is actually in charge and not a moment before —
 * otherwise the old one serves the very page we reloaded for. The timeout is
 * the backstop: a tap must never be swallowed, even if the event never comes.
 *
 * Deliberately never called automatically — the current play isn't persisted
 * anywhere, so reloading is the user's decision, not ours.
 */
export function applyUpdate() {
  navigator.serviceWorker?.addEventListener('controllerchange', reloadOnce, { once: true })
  void updateSW(true)
  window.setTimeout(reloadOnce, 3000)
}

/** True once a new version is downloaded and waiting to be applied. */
export function useAppUpdate(): boolean {
  const [ready, setReady] = useState(updateReady)

  useEffect(() => {
    // The update may have landed between module eval and this subscribe.
    setReady(updateReady)
    const notify = () => setReady(true)
    listeners.add(notify)
    return () => {
      listeners.delete(notify)
    }
  }, [])

  return ready
}
