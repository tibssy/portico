export interface GazeHit {
  target: string | null
  element: HTMLElement | null
}

/**
 * Resolve a gaze-only expanded target. Controls opt in with
 * `data-gaze-expand="<px>"` alongside `data-gaze-action`; the extra area is
 * used by gaze hit-testing only, so pointer clicks keep the real element box.
 *
 * Returns null target when no expanded control is under the point, letting the
 * caller fall back to a normal `elementFromPoint` check.
 */
export function expandedGazeActionAt(
  x: number,
  y: number,
  root: ParentNode = document,
): GazeHit {
  let nearest: {
    target: string
    element: HTMLElement
    distance: number
  } | null = null

  for (const control of root.querySelectorAll<HTMLElement>(
    '[data-gaze-expand]',
  )) {
    const action = control.dataset.gazeAction
    const amount = Number(control.dataset.gazeExpand)
    if (!action || !Number.isFinite(amount) || amount <= 0) continue

    const rect = control.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue

    const inside =
      x >= rect.left - amount &&
      x <= rect.right + amount &&
      y >= rect.top - amount &&
      y <= rect.bottom + amount
    if (!inside) continue

    // If two expanded targets overlap, prefer the one whose centre is closer.
    const distance = Math.hypot(
      x - (rect.left + rect.width / 2),
      y - (rect.top + rect.height / 2),
    )
    if (!nearest || distance < nearest.distance) {
      nearest = { target: `action:${action}`, element: control, distance }
    }
  }

  return nearest
    ? { target: nearest.target, element: nearest.element }
    : { target: null, element: null }
}
