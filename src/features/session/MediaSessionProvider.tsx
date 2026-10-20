import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MediaSessionContext } from './session-context.ts'
import type {
  MediaError,
  MediaMode,
  MediaPhase,
  MediaSessionValue,
} from './session-context.ts'
import type { HeadCalibration } from '../tracking/head-pose.ts'

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 960 },
  height: { ideal: 540 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

function toMediaError(error: unknown, requestedVideo: boolean): MediaError {
  // DOMException is not reliably `instanceof Error` across browsers, so read
  // the name structurally instead of relying on the prototype chain.
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : ''
  const devices = requestedVideo ? 'camera and microphone' : 'microphone'

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        code: 'denied',
        title: 'Access was blocked',
        detail: `The browser blocked the ${devices}. Allow access from the camera and microphone icons in the address bar, then try again.`,
        canRetry: true,
      }
    case 'NotSupportedError':
      return {
        code: 'unsupported',
        title: 'Media capture is unavailable',
        detail: `This browser could not start the ${devices}. Try a current version of Chrome, Edge, Firefox, or Safari, or browse without devices.`,
        canRetry: false,
      }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return {
        code: 'not-found',
        title: requestedVideo ? 'No camera found' : 'No microphone found',
        detail: `We could not find a ${requestedVideo ? 'camera or microphone' : 'microphone'} on this device. You can still browse with a mouse and keyboard.`,
        canRetry: true,
      }
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: 'in-use',
        title: 'The device is busy',
        detail: `Another app or browser tab is using the ${devices}. Close it and try again, or continue without it.`,
        canRetry: true,
      }
    case 'OverconstrainedError':
      return {
        code: 'unknown',
        title: 'The device refused the request',
        detail: `Your ${devices} does not support the requested settings. Try again, or continue without it.`,
        canRetry: true,
      }
    default:
      return {
        code: 'unknown',
        title: 'Something went wrong',
        detail: `We could not start the ${devices}. Check your browser settings and try again.`,
        canRetry: true,
      }
  }
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function MediaSessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<MediaPhase>('idle')
  const [mode, setMode] = useState<MediaMode>('full')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<MediaError | null>(null)
  const [entered, setEntered] = useState(false)
  const [calibration, setCalibrationState] =
    useState<HeadCalibration | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const inFlight = useRef(false)
  const requestId = useRef(0)

  const request = useCallback(
    async (options: { video?: boolean } = {}) => {
      if (inFlight.current) return

      if (!window.isSecureContext) {
        setError({
          code: 'insecure',
          title: 'A secure page is required',
          detail:
            'Camera and microphone access only works over HTTPS or on localhost. Load this page from a secure origin and try again.',
          canRetry: false,
        })
        setPhase('error')
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          code: 'unsupported',
          title: 'This browser cannot open the camera',
          detail:
            'getUserMedia is not available here. You can still browse the shop with a mouse and keyboard.',
          canRetry: false,
        })
        setPhase('error')
        return
      }

      const wantsVideo = options.video ?? true
      const id = requestId.current + 1
      requestId.current = id
      inFlight.current = true
      setError(null)
      setPhase('requesting')

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: wantsVideo ? VIDEO_CONSTRAINTS : false,
        })

        if (id !== requestId.current) {
          stopTracks(nextStream)
          return
        }

        stopTracks(streamRef.current)
        streamRef.current = nextStream
        setStream(nextStream)
        setMode(wantsVideo ? 'full' : 'voice')
        setCalibrationState(null)
        setPhase('ready')
      } catch (cause) {
        if (id !== requestId.current) return

        // A retry replaces the previous stream. If the new request fails, do
        // not leave an older camera stream running behind an error screen.
        stopTracks(streamRef.current)
        streamRef.current = null
        setStream(null)
        setError(toMediaError(cause, wantsVideo))
        setPhase('error')
      } finally {
        inFlight.current = false
      }
    },
    [],
  )

  const requestAudioOnly = useCallback(
    () => request({ video: false }),
    [request],
  )

  const continueWithoutMedia = useCallback(() => {
    requestId.current += 1
    stopTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setError(null)
    setCalibrationState(null)
    setMode('browse')
    setPhase('ready')
    setEntered(true)
  }, [])

  const markEntered = useCallback(() => {
    setEntered(true)
  }, [])

  const setCalibration = useCallback((next: HeadCalibration) => {
    setCalibrationState(next)
  }, [])

  const leave = useCallback(() => {
    requestId.current += 1
    stopTracks(streamRef.current)
    streamRef.current = null
    setStream(null)
    setError(null)
    setCalibrationState(null)
    setPhase('idle')
    setMode('full')
    setEntered(false)
  }, [])

  useEffect(() => {
    const release = () => stopTracks(streamRef.current)

    window.addEventListener('pagehide', release)

    return () => {
      window.removeEventListener('pagehide', release)
      release()
    }
  }, [])

  const value = useMemo<MediaSessionValue>(
    () => ({
      phase,
      mode,
      stream,
      error,
      entered,
      calibration,
      request,
      requestAudioOnly,
      continueWithoutMedia,
      markEntered,
      setCalibration,
      leave,
    }),
    [
      phase,
      mode,
      stream,
      error,
      entered,
      calibration,
      request,
      requestAudioOnly,
      continueWithoutMedia,
      markEntered,
      setCalibration,
      leave,
    ],
  )

  return (
    <MediaSessionContext.Provider value={value}>
      {children}
    </MediaSessionContext.Provider>
  )
}
