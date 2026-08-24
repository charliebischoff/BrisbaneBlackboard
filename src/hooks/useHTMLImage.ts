import { useEffect, useState } from 'react'

/**
 * Konva's <Image> needs an actual HTMLImageElement, not a URL string.
 * This loads one and returns it once ready (undefined before that, or if
 * no src was given) — used by PlayerToken to render roster headshots on
 * the court.
 */
export function useHTMLImage(src?: string): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined)

  useEffect(() => {
    if (!src) {
      setImage(undefined)
      return
    }
    let cancelled = false
    const img = new window.Image()
    img.src = src
    img.onload = () => {
      if (!cancelled) setImage(img)
    }
    return () => {
      cancelled = true
    }
  }, [src])

  return image
}
