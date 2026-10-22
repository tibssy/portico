import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { loadFaceLandmarker } from './face-landmarker.ts'
import { poseFromMatrix } from './head-pose.ts'
import type { HeadPose } from './head-pose.ts'
import { irisFromLandmarks } from './iris-gaze.ts'
import type { IrisGaze } from './iris-gaze.ts'
import { hasLiveTrack } from '../../lib/media.ts'

const IRIS_HOLD_MS = 420
const IRIS_FULL_HOLD_MS = 140

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface HeadTracker {
  status: TrackerStatus
  error: string | null
  faceVisible: boolean
  poseRef: { current: HeadPose | null }
  retry: () => void
}

export function useHeadPose(
  stream: MediaStream | null,
  enabled: boolean,
): HeadTracker {
  const poseRef = useRef<HeadPose | null>(null)
  const visibleRef = useRef(false)
  const [status, setStatus] = useState<TrackerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [faceVisible, setFaceVisible] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const active = enabled && hasLiveTrack(stream, 'video')

  const retry = useCallback(() => {
    setAttempt((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!active || !stream) return

    let cancelled = false
    let landmarker: FaceLandmarker | null = null
    let video: HTMLVideoElement | null = null
    let frame = 0
    let lastVideoTime = -1
    let lastTimestamp = 0
    let lastSeenAt = 0
    let lastIris: (IrisGaze & { at: number }) | null = null

    const start = async () => {
      setStatus('loading')
      setError(null)
      setFaceVisible(false)

      try {
        landmarker = await loadFaceLandmarker()
        if (cancelled) return

        video = document.createElement('video')
        video.muted = true
        video.autoplay = true
        video.playsInline = true
        video.srcObject = stream
        video.style.cssText =
          'position:fixed;left:-10000px;top:0;width:16px;height:16px;opacity:0;pointer-events:none'
        document.body.appendChild(video)

        await video.play()
        if (cancelled) return

        setStatus('ready')

        const tick = () => {
          if (cancelled || !video || !landmarker) return

          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime
            const timestamp = Math.max(performance.now(), lastTimestamp + 1)
            lastTimestamp = timestamp

            try {
              const result = landmarker.detectForVideo(video, timestamp)
              const matrix = result.facialTransformationMatrixes?.[0]?.data
              const pose = matrix ? poseFromMatrix(matrix) : null
              const now = performance.now()
              const iris = pose
                ? irisFromLandmarks(result.faceLandmarks?.[0])
                : null
              const seen =
                Boolean(result.faceLandmarks?.length) && pose !== null

              if (seen && pose) {
                lastSeenAt = now
                let irisSample: IrisGaze | null = iris

                if (iris) {
                  lastIris = { ...iris, at: now }
                } else if (
                  lastIris &&
                  now - lastIris.at < IRIS_HOLD_MS
                ) {
                  // Keep full confidence briefly through a blink, then fade
                  // toward the head-only fit instead of snapping.
                  const age = now - lastIris.at
                  const fade =
                    1 -
                    Math.max(0, age - IRIS_FULL_HOLD_MS) /
                      (IRIS_HOLD_MS - IRIS_FULL_HOLD_MS)
                  irisSample = {
                    ...lastIris,
                    confidence: lastIris.confidence * Math.max(0, fade),
                  }
                } else {
                  lastIris = null
                }

                if (irisSample) {
                  pose.eyeYaw = irisSample.eyeYaw
                  pose.eyePitch = irisSample.eyePitch
                  pose.irisConfidence = irisSample.confidence
                }

                poseRef.current = pose

                if (!visibleRef.current) {
                  visibleRef.current = true
                  setFaceVisible(true)
                }
              } else if (now - lastSeenAt > 500) {
                // Keep the last pose through brief dropouts so the cursor and
                // the calibration sampler do not flicker.
                if (visibleRef.current) {
                  visibleRef.current = false
                  setFaceVisible(false)
                }
                poseRef.current = null
                lastIris = null
              }
            } catch {
              // A single bad frame should not tear down the tracker.
            }
          }

          frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)
      } catch (cause) {
        if (cancelled) return

        console.error('Gaze tracking failed', cause)
        setStatus('error')
        setError(
          cause instanceof Error
            ? cause.message
            : 'The gaze tracker could not start.',
        )
        setFaceVisible(false)
        poseRef.current = null
        visibleRef.current = false
        lastIris = null
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)

      if (video) {
        video.pause()
        video.srcObject = null
        video.remove()
      }

      poseRef.current = null
      visibleRef.current = false
      lastIris = null
    }
  }, [active, stream, attempt])

  return {
    status: active ? status : 'idle',
    error: active ? error : null,
    faceVisible: active ? faceVisible : false,
    poseRef,
    retry,
  }
}
