import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useMediaSession } from './session-context.ts'

/**
 * The shop is only reachable after a session has been established, either with
 * live media or deliberately without it.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { entered, mode, stream } = useMediaSession()
  const allowed = entered && (mode === 'browse' || stream !== null)

  if (!allowed) return <Navigate to="/" replace />

  return <>{children}</>
}
