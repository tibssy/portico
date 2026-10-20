import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useMediaSession } from '../session/session-context.ts'

/**
 * Calibration needs a live camera. Sessions that deliberately use a pointer
 * belong in the shop, and sessions without a camera go back to the device
 * check (or home when they have been shut down).
 */
export function RequireCamera({ children }: { children: ReactNode }) {
  const { mode, stream, phase, entered } = useMediaSession()

  if (mode === 'browse') {
    return <Navigate to={entered ? '/shop' : '/'} replace />
  }

  const live = mode === 'full' && Boolean(stream?.getVideoTracks().length)
  if (live) return <>{children}</>

  return <Navigate to={phase === 'idle' ? '/' : '/check'} replace />
}
