export type ScrollDirection = 'up' | 'down'

export interface ScrollBand {
  direction: ScrollDirection
  /** 0 at the inner edge of the band, 1 at the screen edge. */
  depth: number
}

/** Share of the usable viewport used by each edge scroll band. */
const ZONE_RATIO = 0.1
const MIN_ZONE_PX = 24

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Return the scroll band under a viewport y coordinate. The top band starts
 * below the sticky header, so header actions keep their normal hit area.
 */
export function edgeScrollBand(
  y: number,
  viewportHeight: number,
  topOffset: number,
  zoneRatio = ZONE_RATIO,
): ScrollBand | null {
  const usable = Math.max(0, viewportHeight - topOffset)
  const zone = Math.max(MIN_ZONE_PX, usable * zoneRatio)

  if (y >= topOffset && y <= topOffset + zone) {
    return {
      direction: 'up',
      depth: clamp01(1 - (y - topOffset) / zone),
    }
  }

  const bottomStart = viewportHeight - zone
  if (y >= bottomStart && y <= viewportHeight) {
    return {
      direction: 'down',
      depth: clamp01((y - bottomStart) / zone),
    }
  }

  return null
}

/** Ease the raw depth so scrolling starts gently at the band edge. */
export function scrollIntensity(depth: number): number {
  const value = clamp01(depth)
  return value * value * (3 - 2 * value)
}

/** How many pixels of a card sit behind the header or below the viewport. */
export function clippedAmount(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  topOffset: number,
): number {
  return Math.max(topOffset - rect.top, rect.bottom - viewportHeight, 0)
}

/** Scroll position that puts a card, and therefore its row, in the middle. */
export function centeredScrollTop(
  rect: { top: number; height: number },
  viewportHeight: number,
  scrollY: number,
  topOffset: number,
  maxScroll: number,
): number {
  const center = topOffset + (viewportHeight - topOffset) / 2
  const next = scrollY + rect.top + rect.height / 2 - center
  return Math.min(maxScroll, Math.max(0, next))
}
