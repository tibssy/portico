import { useEffect, useRef } from 'react'
import { mapPose } from './head-pose.ts'
import type { HeadCalibration, HeadPose } from './head-pose.ts'
import { CursorController } from './cursor-controller.ts'
import './gaze-cursor.css'

/**
 * Draws a smoothed cursor from the calibrated head pose. When a target
 * callback is supplied it also hit-tests the page and reports the product
 * under the cursor.
 */
export function GazeCursor({
  poseRef,
  calibration,
  active = true,
  onTargetChange,
}: {
  poseRef: { current: HeadPose | null }
  calibration: HeadCalibration
  active?: boolean
  onTargetChange?: (target: string | null) => void
}) {
  const cursorRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onTargetChange)

  useEffect(() => {
    callbackRef.current = onTargetChange
  }, [onTargetChange])

  useEffect(() => {
    if (!active) return

    const cursor = cursorRef.current
    if (!cursor) return

    const controller = new CursorController()
    let frame = 0
    let lastTime = 0
    let lastTarget: string | null = null

    const report = (target: string | null) => {
      if (target === lastTarget) return
      lastTarget = target
      callbackRef.current?.(target)
    }

    const tick = () => {
      const now = performance.now()
      const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000
      lastTime = now

      const pose = poseRef.current

      if (!pose) {
        controller.reset()
        cursor.dataset.visible = 'false'
        report(null)
      } else {
        const target = mapPose(pose, calibration)
        const point = controller.step(target, dt)
        const screenX = point.x * window.innerWidth
        const screenY = point.y * window.innerHeight

        cursor.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`
        cursor.dataset.visible = 'true'

        if (callbackRef.current) {
          const element = document.elementFromPoint(screenX, screenY)
          const card = element?.closest<HTMLElement>('[data-gaze-card]')
          report(card?.dataset.gazeCard ?? null)
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      cursor.dataset.visible = 'false'
    }
  }, [active, calibration, poseRef])

  if (!active) return null

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
