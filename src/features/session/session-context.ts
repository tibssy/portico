import { createContext, useContext } from 'react'

export type MediaMode = 'full' | 'voice' | 'browse'
export type MediaPhase = 'idle' | 'requesting' | 'ready' | 'error'
export type MediaErrorCode =
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure'
  | 'unsupported'
  | 'unknown'

export interface MediaError {
  code: MediaErrorCode
  title: string
  detail: string
  canRetry: boolean
}

export interface MediaSessionValue {
  phase: MediaPhase
  mode: MediaMode
  stream: MediaStream | null
  error: MediaError | null
  /** True once the visitor has entered the shop this session. */
  entered: boolean
  request: (options?: { video?: boolean }) => Promise<void>
  requestAudioOnly: () => Promise<void>
  continueWithoutMedia: () => void
  markEntered: () => void
  leave: () => void
}

export const MediaSessionContext = createContext<MediaSessionValue | null>(null)

export function useMediaSession(): MediaSessionValue {
  const value = useContext(MediaSessionContext)

  if (!value) {
    throw new Error('useMediaSession must be used inside MediaSessionProvider')
  }

  return value
}
