import { useEffect, useRef } from 'react'
import { mapPose } from './head-pose.ts'
import type { HeadCalibration, HeadPose } from './head-pose.ts'
import { CursorController, cursorConfigFor } from './cursor-controller.ts'
import './gaze-cursor.css'

const STICKY_MARGIN = 10
/** Small gaze movements inside a card are ignored so dwell can finish. */
const CARD_DEADZONE_PX = 20
/** Attribute applied to the element currently under the gaze. */
const GAZE_HOVER_ATTRIBUTE = 'data-gaze-hover'

/**
 * Tracks a smoothed gaze position from the calibrated head and eye pose and
 * hit-tests the page. It highlights the card or button under the gaze, reports
 * target changes, and fires an optional dwell callback once the gaze has
 * rested.
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
}) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onTargetChange)
  const dwellCallbackRef = useRef(onDwell)
  const dwellMsRef = useRef(dwellMs)
  const dwellEnabledRef = useRef(dwellEnabled)
  const dwellFilterRef = useRef(dwellFilter)

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

    const resolveHit = (
      x: number,
      y: number,
    ): { target: string | null; element: HTMLElement | null } => {
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
    // Release it so the next frame can resolve the new target cleanly.
    const releaseDeadzone = () => {
      deadzoneElement = null
    }
    window.addEventListener('scroll', releaseDeadzone, { passive: true })
    window.addEventListener('resize', releaseDeadzone)

    const tick = () => {
      const now = performance.now()
      const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
      lastTime = now

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
      } else {
        const point = controller.step(mapPose(pose, calibration), dt)
        const rawX = point.x * window.innerWidth
        const rawY = point.y * window.innerHeight
        let screenX = rawX
        let screenY = rawY

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
      window.removeEventListener('scroll', releaseDeadzone)
      window.removeEventListener('resize', releaseDeadzone)
      resetDwell()
      highlight(null)
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
