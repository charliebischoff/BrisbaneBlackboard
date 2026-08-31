import Konva from 'konva'

/**
 * Quick "you touched this" pop for a Konva node: scale up, then straight back.
 * Purely visual — nothing in the editor state changes.
 *
 * Scale is set imperatively rather than through React props on purpose; the
 * nodes this runs on re-render every frame during a drag gesture and a
 * controlled scale prop would fight the tween.
 */
export function pulse(node: Konva.Node | null, amount = 1.18): void {
  if (!node) return
  node.to({
    scaleX: amount,
    scaleY: amount,
    duration: 0.07,
    onFinish: () => {
      node.to({ scaleX: 1, scaleY: 1, duration: 0.09 })
    },
  })
}
