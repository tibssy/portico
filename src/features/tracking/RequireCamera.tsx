import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useMediaSession } from '../session/session-context.ts'
import { hasLiveTrack } from '../../lib/media.ts'

/**
 * Calibration needs a live camera. Sessions that deliberately use a pointer
 * belong in the shop, and sessions without a camera go back to the device
 * check (or home when they have been shut down).
 */
export function RequireCamera({ children }: { children: ReactNode }) {
  const { mode, stream, phase, entered, cameraStopped } = useMediaSession()

  if (mode === 'browse') {
    // A deliberate pointer session belongs in the shop (or home); a camera
    // that died during calibration should land on the device check so the
    // visitor can reconnect without starting over from the landing page.
    const destination = entered ? '/shop' : cameraStopped ? '/check' : '/'
    return <Navigate to={destination} replace />
  }

  const live = mode === 'full' && hasLiveTrack(stream, 'video')
  if (live) return <>{children}</>

  return <Navigate to={phase === 'idle' ? '/' : '/check'} replace />
}
