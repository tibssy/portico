import { useEffect, useLayoutEffect, useRef } from 'react'
import { mapPose } from './head-pose.ts'
import type { HeadCalibration, HeadPose } from './head-pose.ts'
import { CursorController, cursorConfigFor } from './cursor-controller.ts'
import { expandedGazeActionAt } from './gaze-target.ts'
import {
  centeredScrollTop,
  clippedAmount,
  edgeScrollBand,
  scrollIntensity,
} from './gaze-scroll.ts'
import type { ScrollDirection } from './gaze-scroll.ts'
import './gaze-cursor.css'

const STICKY_MARGIN = 10
/** Small gaze movements inside a card are ignored so dwell can finish. */
const CARD_DEADZONE_PX = 20
/** Attribute applied to the element currently under the gaze. */
const GAZE_HOVER_ATTRIBUTE = 'data-gaze-hover'

/** Wait briefly in a band before moving the page. */
const SCROLL_ENGAGE_MS = 160
/** Slow page speed at the outer edge of a scroll band, in px/s. */
const SCROLL_MAX_SPEED = 480
/** Ignore the bands briefly after a wheel or manual scroll. */
const MANUAL_SCROLL_BLOCK_MS = 350
/** Time to ease a clipped card's row to the middle of the viewport. */
const REVEAL_MS = 420
/** A card must stay focused briefly before its row is centred. */
const REVEAL_FOCUS_MS = 200
/** The gaze must rest inside this radius before centring starts. */
const REVEAL_STILL_RADIUS = 28
/** Do not repeatedly centre the same card while the gaze flickers. */
const REVEAL_COOLDOWN_MS = 600
/** Ignore sub-pixel clipping; centre anything meaningfully cut off. */
const REVEAL_MIN_CLIP_PX = 6
/** Scroll events inside this window belong to our own reveal or band step. */
const PROGRAMMATIC_SCROLL_GRACE_MS = 120

/**
 * Tracks a smoothed gaze position from the calibrated head and eye pose and
 * hit-tests the page. It highlights the card or button under the gaze, reports
 * target changes, and fires an optional dwell callback once the gaze has
 * rested. In the shop it can also scroll from the top and bottom bands and
 * ease a clipped focused card into the middle of the viewport.
 */
export function GazeCursor({
  poseRef,
  calibration,
  active = true,
  showCursor = false,
  onTargetChange,
  dwellMs = 0,
  dwellEnabled = true,
  dwellFilter,
  onDwell,
  scrollEnabled = false,
  scrollHeaderOffset = 0,
  onScrollChange,
}: {
  poseRef: { current: HeadPose | null }
  calibration: HeadCalibration
  active?: boolean
  /** Draw the calibration cursor. The shop uses target highlights instead. */
  showCursor?: boolean
  onTargetChange?: (target: string | null) => void
  /** Hold time in milliseconds before onDwell fires. Zero disables dwell. */
  dwellMs?: number
  /** Pause dwell while the layout is moving. */
  dwellEnabled?: boolean
  /** Return false to keep a target from starting a dwell. */
  dwellFilter?: (target: string) => boolean
  onDwell?: (target: string) => void
  /** Enable edge scrolling and centring for clipped cards. */
  scrollEnabled?: boolean
  /** Sticky header height; the top band starts below it. */
  scrollHeaderOffset?: number
  /** Direction of the active scroll band, or null when it is idle. */
  onScrollChange?: (direction: ScrollDirection | null) => void
}) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onTargetChange)
  const dwellCallbackRef = useRef(onDwell)
  const dwellMsRef = useRef(dwellMs)
  const dwellEnabledRef = useRef(dwellEnabled)
  const dwellFilterRef = useRef(dwellFilter)
  const scrollEnabledRef = useRef(scrollEnabled)
  const scrollOffsetRef = useRef(scrollHeaderOffset)
  const scrollCallbackRef = useRef(onScrollChange)

  useEffect(() => {
    callbackRef.current = onTargetChange
  }, [onTargetChange])

  useEffect(() => {
    dwellCallbackRef.current = onDwell
  }, [onDwell])

  useEffect(() => {
    dwellMsRef.current = dwellMs
  }, [dwellMs])

  useEffect(() => {
    dwellEnabledRef.current = dwellEnabled
  }, [dwellEnabled])

  useEffect(() => {
    dwellFilterRef.current = dwellFilter
  }, [dwellFilter])

  useLayoutEffect(() => {
    scrollEnabledRef.current = scrollEnabled
  }, [scrollEnabled])

  useLayoutEffect(() => {
    scrollOffsetRef.current = scrollHeaderOffset
  }, [scrollHeaderOffset])

  useEffect(() => {
    scrollCallbackRef.current = onScrollChange
  }, [onScrollChange])

  useEffect(() => {
    if (!active) return

    const cursor = showCursor ? cursorRef.current : null
    if (showCursor && !cursor) return

    const controller = new CursorController(
      cursorConfigFor(calibration.cursorSmoothing),
    )
    let frame = 0
    let lastTime = 0
    let lastTarget: string | null = null
    let stickyTarget: string | null = null
    let stickyElement: HTMLElement | null = null
    let deadzoneElement: HTMLElement | null = null
    let highlightedElement: HTMLElement | null = null
    let deadzoneX = 0
    let deadzoneY = 0
    let dwellTarget: string | null = null
    let dwellStartedAt = 0
    let dwellFired = false
    let lastScrollDirection: ScrollDirection | null = null
    let scrollBandDirection: ScrollDirection | null = null
    let scrollBandSince = 0
    let scrollVelocity = 0
    let scrollBlockedUntil = 0
    let programmaticScrollAt = 0
    let lastFocusTarget: string | null = null
    let focusStartedAt = 0
    let focusAnchorX = 0
    let focusAnchorY = 0
    let focusEvaluated = false
    let lastRevealAt = 0
    let reveal: {
      from: number
      to: number
      startedAt: number
      duration: number
      target: string
      element: HTMLElement
    } | null = null

    const report = (target: string | null) => {
      if (target === lastTarget) return
      lastTarget = target
      callbackRef.current?.(target)
    }

    const highlight = (element: HTMLElement | null) => {
      if (highlightedElement === element) return

      if (highlightedElement?.isConnected) {
        highlightedElement.removeAttribute(GAZE_HOVER_ATTRIBUTE)
      }
      highlightedElement = element
      element?.setAttribute(GAZE_HOVER_ATTRIBUTE, 'true')
    }

    const resetDwell = () => {
      dwellTarget = null
      dwellStartedAt = 0
      dwellFired = false
    }

    const notifyScroll = (direction: ScrollDirection | null) => {
      if (direction === lastScrollDirection) return
      lastScrollDirection = direction
      scrollCallbackRef.current?.(direction)
    }

    const stopScroll = () => {
      scrollBandDirection = null
      scrollBandSince = 0
      scrollVelocity = 0
      notifyScroll(null)
    }

    const blockManualScroll = () => {
      scrollBlockedUntil = performance.now() + MANUAL_SCROLL_BLOCK_MS
      reveal = null
      scrollBandDirection = null
      scrollBandSince = 0
      scrollVelocity = 0
      resetDwell()
    }

    const startReveal = (
      element: HTMLElement,
      target: string,
      now: number,
    ): boolean => {
      const rect = element.getBoundingClientRect()
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      )
      const to = centeredScrollTop(
        rect,
        window.innerHeight,
        window.scrollY,
        scrollOffsetRef.current,
        maxScroll,
      )

      if (Math.abs(to - window.scrollY) < 2) return false

      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches

      reveal = {
        from: window.scrollY,
        to,
        startedAt: now,
        duration: reduced ? 0 : REVEAL_MS,
        target,
        element,
      }
      lastRevealAt = now
      scrollBandDirection = null
      scrollBandSince = 0
      scrollVelocity = 0
      notifyScroll(null)
      resetDwell()
      stickyTarget = target
      stickyElement = element
      deadzoneElement = null
      // Keep the tile highlighted, but clear the dwell prompt while the row
      // moves so the CSS sweep pauses with the internal dwell timer.
      report(null)
      highlight(element)
      return true
    }

    const advanceReveal = (now: number) => {
      if (!reveal) return

      const progress =
        reveal.duration === 0
          ? 1
          : Math.min(1, (now - reveal.startedAt) / reveal.duration)
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2
      const top = reveal.from + (reveal.to - reveal.from) * eased

      programmaticScrollAt = performance.now()
      window.scrollTo({ top, behavior: 'instant' })

      if (progress >= 1) {
        reveal = null
        scrollBandSince = 0
        lastRevealAt = now
      }
    }

    const resolveHit = (
      x: number,
      y: number,
    ): { target: string | null; element: HTMLElement | null } => {
      // Gaze-only slop: a control can advertise a larger invisible target
      // without changing its pointer hit area. Pick the nearest one when
      // several overlap.
      const expanded = expandedGazeActionAt(x, y)
      if (expanded.target) return expanded

      const hit = document.elementFromPoint(x, y)
      if (!hit) return { target: null, element: null }

      const action = hit.closest<HTMLElement>('[data-gaze-action]')
      if (action) {
        const name = action.dataset.gazeAction
        return {
          target: name ? `action:${name}` : null,
          element: action,
        }
      }

      const panel = hit.closest<HTMLElement>('[data-gaze-panel]')
      if (panel) return { target: 'panel', element: panel }

      const card = hit.closest<HTMLElement>('[data-gaze-card]')
      return {
        target: card?.dataset.gazeCard ?? null,
        element: card ?? null,
      }
    }

    // A page scroll or resize moves the cards under the deadzone anchor.
    // Release it so the next frame can resolve the new target cleanly. A scroll
    // we did not start ourselves is manual navigation, so it also pauses gaze
    // scrolling and centring for a short moment.
    const handleScroll = () => {
      deadzoneElement = null

      if (
        performance.now() - programmaticScrollAt >
        PROGRAMMATIC_SCROLL_GRACE_MS
      ) {
        blockManualScroll()
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    // Wheel scrolling wins for a short moment so the two inputs do not fight.
    const handleWheel = () => {
      blockManualScroll()
    }
    window.addEventListener('wheel', handleWheel, { passive: true })

    const tick = () => {
      const now = performance.now()
      const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
      lastTime = now

      if (!scrollEnabledRef.current) {
        reveal = null
        stopScroll()
      }

      const pose = poseRef.current

      if (!pose) {
        controller.reset()
        resetDwell()
        report(null)
        highlight(null)
        if (cursor) cursor.dataset.visible = 'false'
        stickyTarget = null
        stickyElement = null
        deadzoneElement = null
        lastFocusTarget = null
        focusStartedAt = 0
        focusAnchorX = 0
        focusAnchorY = 0
        focusEvaluated = false
        reveal = null
        stopScroll()
      } else {
        const point = controller.step(mapPose(pose, calibration), dt)
        const rawX = point.x * window.innerWidth
        const rawY = point.y * window.innerHeight
        let screenX = rawX
        let screenY = rawY

        if (reveal) {
          advanceReveal(now)

          if (reveal) {
            report(null)
            highlight(reveal.element)
            resetDwell()
            notifyScroll(null)
            frame = requestAnimationFrame(tick)
            return
          }
        }

        // The top and bottom bands are scroll-only. Actions keep priority so
        // the header and footer controls still work from inside a band.
        const band = scrollEnabledRef.current
          ? edgeScrollBand(
              rawY,
              window.innerHeight,
              scrollOffsetRef.current,
            )
          : null
        const bandHit = band ? resolveHit(rawX, rawY) : null
        const actionInBand = Boolean(
          bandHit?.target?.startsWith('action:'),
        )

        if (band && !actionInBand) {
          notifyScroll(band.direction)
          report(null)
          highlight(null)
          resetDwell()
          stickyTarget = null
          stickyElement = null
          deadzoneElement = null
          lastFocusTarget = null
          focusStartedAt = 0
          focusAnchorX = 0
          focusAnchorY = 0
          focusEvaluated = false

          if (scrollBandDirection !== band.direction) {
            scrollBandDirection = band.direction
            scrollBandSince = now
            scrollVelocity = 0
          }

          if (
            now - scrollBandSince >= SCROLL_ENGAGE_MS &&
            now >= scrollBlockedUntil
          ) {
            const sign = band.direction === 'up' ? -1 : 1
            const targetSpeed =
              sign * SCROLL_MAX_SPEED * scrollIntensity(band.depth)
            scrollVelocity +=
              (targetSpeed - scrollVelocity) * Math.min(1, dt * 10)
            programmaticScrollAt = performance.now()
            window.scrollBy({
              top: scrollVelocity * dt,
              behavior: 'instant',
            })
          } else {
            scrollVelocity = 0
          }

          if (cursor) {
            cursor.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`
            cursor.dataset.visible = 'true'
          }

          frame = requestAnimationFrame(tick)
          return
        }

        if (scrollBandDirection !== null) {
          scrollBandDirection = null
          scrollBandSince = 0
          scrollVelocity = 0
        }
        notifyScroll(null)

        // A card behaves like a sticky target. Small movements while the gaze
        // is already inside it are discarded; a deliberate move beyond the
        // deadzone repositions the cursor within the card.
        if (deadzoneElement?.isConnected) {
          const rect = deadzoneElement.getBoundingClientRect()
          const inside =
            rawX >= rect.left - STICKY_MARGIN &&
            rawX <= rect.right + STICKY_MARGIN &&
            rawY >= rect.top - STICKY_MARGIN &&
            rawY <= rect.bottom + STICKY_MARGIN

          if (inside) {
            if (
              Math.hypot(rawX - deadzoneX, rawY - deadzoneY) >
              CARD_DEADZONE_PX
            ) {
              deadzoneX = Math.min(
                rect.right - 1,
                Math.max(rect.left + 1, rawX),
              )
              deadzoneY = Math.min(
                rect.bottom - 1,
                Math.max(rect.top + 1, rawY),
              )
            }
            screenX = deadzoneX
            screenY = deadzoneY
          } else {
            deadzoneElement = null
          }
        }

        if (!deadzoneElement) {
          const hit = document.elementFromPoint(rawX, rawY)
          const card = hit?.closest<HTMLElement>('[data-gaze-card]')
          if (card) {
            deadzoneElement = card
            deadzoneX = rawX
            deadzoneY = rawY
          }
        }

        if (cursor) {
          cursor.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`
          cursor.dataset.visible = 'true'
        }

        if (callbackRef.current || dwellCallbackRef.current) {
          const hit = resolveHit(screenX, screenY)
          let target = hit.target
          const isControl =
            target === 'panel' ||
            (target !== null && target.startsWith('action:'))

          if (isControl || !stickyTarget || !stickyElement?.isConnected) {
            stickyTarget = target
            stickyElement = hit.element
          } else {
            const rect = stickyElement.getBoundingClientRect()
            const inside =
              screenX >= rect.left - STICKY_MARGIN &&
              screenX <= rect.right + STICKY_MARGIN &&
              screenY >= rect.top - STICKY_MARGIN &&
              screenY <= rect.bottom + STICKY_MARGIN

            if (inside) {
              target = stickyTarget
            } else {
              stickyTarget = target
              stickyElement = hit.element
            }
          }

          report(target)
          highlight(
            target !== null && target !== 'panel' ? stickyElement : null,
          )

          // If a new card is clipped, ease its row into the middle instead of
          // leaving the visitor to chase a half-visible tile.
          const isCardTarget =
            target !== null &&
            target !== 'panel' &&
            !target.startsWith('action:')

          if (target !== lastFocusTarget) {
            lastFocusTarget = target
            focusStartedAt = now
            focusAnchorX = rawX
            focusAnchorY = rawY
            focusEvaluated = false
          }

          if (
            !focusEvaluated &&
            Math.hypot(rawX - focusAnchorX, rawY - focusAnchorY) >
              REVEAL_STILL_RADIUS
          ) {
            focusStartedAt = now
            focusAnchorX = rawX
            focusAnchorY = rawY
          }

          if (
            scrollEnabledRef.current &&
            target !== null &&
            isCardTarget &&
            !focusEvaluated &&
            now - focusStartedAt >= REVEAL_FOCUS_MS
          ) {
            focusEvaluated = true

            if (
              now >= scrollBlockedUntil &&
              now - lastRevealAt > REVEAL_COOLDOWN_MS &&
              stickyElement?.hasAttribute('data-gaze-card')
            ) {
              const rect = stickyElement.getBoundingClientRect()
              const hidden = clippedAmount(
                rect,
                window.innerHeight,
                scrollOffsetRef.current,
              )

              if (
                hidden > Math.max(REVEAL_MIN_CLIP_PX, rect.height * 0.05) &&
                startReveal(stickyElement, target, now)
              ) {
                frame = requestAnimationFrame(tick)
                return
              }
            }
          }

          const hold = dwellMsRef.current
          const canDwell =
            dwellEnabledRef.current &&
            hold > 0 &&
            Boolean(dwellCallbackRef.current) &&
            target !== null &&
            target !== 'panel' &&
            (dwellFilterRef.current?.(target) ?? true)

          if (!canDwell) {
            if (dwellTarget !== null || dwellFired) {
              resetDwell()
            }
          } else {
            if (target !== dwellTarget) {
              dwellTarget = target
              dwellStartedAt = now
              dwellFired = false
            }

            if (!dwellFired && now - dwellStartedAt >= hold) {
              dwellFired = true
              if (target !== null) dwellCallbackRef.current?.(target)
            }
          }
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      window.removeEventListener('wheel', handleWheel)
      resetDwell()
      highlight(null)
      notifyScroll(null)
      if (cursor) cursor.dataset.visible = 'false'
    }
  }, [active, calibration, poseRef, showCursor])

  if (!showCursor) return null

  return (
    <div
      ref={cursorRef}
      className="gaze-cursor"
      data-visible="false"
      aria-hidden="true"
    >
      <span className="gaze-cursor__ring" />
      <span className="gaze-cursor__dot" />
    </div>
  )
}
