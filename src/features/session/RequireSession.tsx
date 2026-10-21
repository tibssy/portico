import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useMediaSession } from './session-context.ts'

/**
 * The shop is only reachable after a session has been established, either with
 * live media or deliberately without it. Gaze sessions also need a completed
 * calibration before they can enter.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { entered, mode, stream, calibration } = useMediaSession()
  const allowed = entered && (mode === 'browse' || stream !== null)

  if (!allowed) return <Navigate to="/" replace />
  if (mode === 'full' && !calibration) {
    return <Navigate to="/calibrate" replace />
  }

  return <>{children}</>
}
