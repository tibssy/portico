import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon, CameraIcon, LockIcon } from '../../components/Icons.tsx'
import { useMediaSession } from '../session/session-context.ts'
import { useHeadPose } from '../tracking/useHeadPose.ts'
import { fitCalibration, median, poseSpread } from '../tracking/head-pose.ts'
import type {
  CalibrationPoint,
  HeadCalibration,
  HeadPose,
} from '../tracking/head-pose.ts'
import { GazeCursor } from '../tracking/GazeCursor.tsx'
import { hasLiveTrack } from '../../lib/media.ts'
import './calibration.css'

type Stage = 'ready' | 'running' | 'tuning'

const TARGETS = [
  { x: 0.5, y: 0.5, label: 'centre' },
  { x: 0.2, y: 0.2, label: 'top left' },
  { x: 0.8, y: 0.2, label: 'top right' },
  { x: 0.2, y: 0.8, label: 'bottom left' },
  { x: 0.8, y: 0.8, label: 'bottom right' },
]

const SETTLE_MS = 650
const SAMPLE_MS = 900
const SAMPLE_INTERVAL_MS = 40
const MIN_SAMPLES = 8
const MIN_IRIS_SAMPLES = 4
/** About 2.9 degrees; a hold that moves more than this is retried. */
const MAX_POINT_SPREAD = 0.05
const MAX_POINT_RETRIES = 2

function SensorPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    element.srcObject = stream
    if (stream) void element.play().catch(() => {})

    return () => {
      element.srcObject = null
    }
  }, [stream])

  return (
    <div className="calibrate__camera" data-live={Boolean(stream)}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="Live camera preview"
      />
      <span className="calibrate__camera-badge">
        <span aria-hidden="true" />
        Live
      </span>
      <span className="calibrate__camera-hint">Head + eye sensor</span>
    </div>
  )
}

export function CalibratePage() {
  const navigate = useNavigate()
  const {
    stream,
    setCalibration,
    markEntered,
    continueWithoutMedia,
    leave,
  } = useMediaSession()
  const tracker = useHeadPose(stream, hasLiveTrack(stream, 'video'))

  const [stage, setStage] = useState<Stage>('ready')
  const [targetIndex, setTargetIndex] = useState(0)
  const [collecting, setCollecting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<HeadCalibration | null>(null)
  const [sensitivityX, setSensitivityX] = useState(100)
  const [sensitivityY, setSensitivityY] = useState(100)
  const [cursorSmoothing, setCursorSmoothing] = useState(50)
  const [runId, setRunId] = useState(0)
  const pointsRef = useRef<CalibrationPoint[]>([])
  const samplesRef = useRef<HeadPose[]>([])
  const pointAttemptsRef = useRef(0)

  const tuned = useMemo<HeadCalibration | null>(
    () =>
      result
        ? {
            ...result,
            sensitivityX: sensitivityX / 100,
            sensitivityY: sensitivityY / 100,
            cursorSmoothing: cursorSmoothing / 100,
          }
        : null,
    [result, sensitivityX, sensitivityY, cursorSmoothing],
  )

  const target = TARGETS[targetIndex]
  const canStart = tracker.status === 'ready' && tracker.faceVisible
  const sensorLoading = tracker.status === 'loading'
  const sensorError = tracker.status === 'error'

  useEffect(() => {
    if (stage !== 'running' || !tracker.faceVisible) return

    let cancelled = false
    let settleTimer = 0
    let finishTimer = 0
    let sampler = 0

    samplesRef.current = []

    settleTimer = window.setTimeout(() => {
      if (cancelled) return

      setCollecting(true)

      sampler = window.setInterval(() => {
        const pose = tracker.poseRef.current
        if (pose) samplesRef.current.push(pose)
      }, SAMPLE_INTERVAL_MS)

      finishTimer = window.setTimeout(() => {
        window.clearInterval(sampler)
        if (cancelled) return

        setCollecting(false)
        const samples = samplesRef.current

        if (samples.length < MIN_SAMPLES) {
          setNotice('Hold a little longer. Repeating this point…')
          setRunId((value) => value + 1)
          return
        }

        if (poseSpread(samples) > MAX_POINT_SPREAD) {
          pointAttemptsRef.current += 1

          if (pointAttemptsRef.current <= MAX_POINT_RETRIES) {
            setNotice('That point moved too much. Hold steadier — retrying it…')
            setRunId((value) => value + 1)
            return
          }

          // Repeating the same point forever is worse than asking for a clean
          // run. The per-point medians can look plausible even when the head
          // was moving, so do not build a calibration from this sample set.
          pointsRef.current = []
          samplesRef.current = []
          pointAttemptsRef.current = 0
          setTargetIndex(0)
          setStage('ready')
          setNotice(
            'The camera saw too much movement. Restart calibration, keep your head relaxed, and look toward each dot without rushing.',
          )
          return
        }

        pointAttemptsRef.current = 0

        const nextPoint: CalibrationPoint = {
          targetX: TARGETS[targetIndex].x,
          targetY: TARGETS[targetIndex].y,
          yaw: median(samples.map((pose) => pose.yaw)),
          pitch: median(samples.map((pose) => pose.pitch)),
          eyeYaw: 0,
          eyePitch: 0,
          irisConfidence: 0,
        }
        const irisSamples = samples.filter(
          (pose) => pose.irisConfidence >= 0.35,
        )
        if (irisSamples.length >= MIN_IRIS_SAMPLES) {
          nextPoint.eyeYaw = median(
            irisSamples.map((pose) => pose.eyeYaw),
          )
          nextPoint.eyePitch = median(
            irisSamples.map((pose) => pose.eyePitch),
          )
          nextPoint.irisConfidence = median(
            irisSamples.map((pose) => pose.irisConfidence),
          )
        }
        const nextPoints = [...pointsRef.current, nextPoint]
        pointsRef.current = nextPoints
        setNotice(null)

        if (targetIndex < TARGETS.length - 1) {
          setTargetIndex((value) => value + 1)
          return
        }

        const calibration = fitCalibration(nextPoints)

        if (!calibration) {
          pointsRef.current = []
          setTargetIndex(0)
          setStage('ready')
          setNotice(
            'The fit was too noisy. Try once more, look toward each dot, and let your head follow naturally.',
          )
          return
        }

        setResult(calibration)
        setSensitivityX(100)
        setSensitivityY(100)
        setCursorSmoothing(50)
        setStage('tuning')
      }, SAMPLE_MS)
    }, SETTLE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(settleTimer)
      window.clearTimeout(finishTimer)
      window.clearInterval(sampler)
      setCollecting(false)
    }
  }, [
    stage,
    targetIndex,
    tracker.faceVisible,
    tracker.poseRef,
    runId,
  ])

  // Keep the session calibration in step with the tuning sliders so a
  // browser-back into the shop cannot use the untuned mapping.
  useEffect(() => {
    if (stage !== 'tuning' || !tuned) return
    setCalibration(tuned)
  }, [stage, tuned, setCalibration])

  const begin = () => {
    pointsRef.current = []
    samplesRef.current = []
    pointAttemptsRef.current = 0
    setTargetIndex(0)
    setCollecting(false)
    setNotice(null)
    setResult(null)
    setSensitivityX(100)
    setSensitivityY(100)
    setCursorSmoothing(50)
    setRunId((value) => value + 1)
    setStage('running')
  }

  const cancel = () => {
    pointsRef.current = []
    samplesRef.current = []
    pointAttemptsRef.current = 0
    setTargetIndex(0)
    setCollecting(false)
    setStage('ready')
    setNotice('Calibration cancelled. Start again when you are ready.')
  }

  const enterShop = () => {
    if (tuned) setCalibration(tuned)
    markEntered()
    navigate('/shop')
  }

  const resetTuning = () => {
    setSensitivityX(100)
    setSensitivityY(100)
    setCursorSmoothing(50)
  }

  const usePointer = () => {
    continueWithoutMedia()
    navigate('/shop')
  }

  const exit = () => {
    leave()
    navigate('/')
  }

  const fitError = result
    ? Math.max(result.rmseX, result.rmseY)
    : null
  const fitLabel =
    fitError === null
      ? null
      : fitError < 0.06
        ? 'Excellent'
        : fitError < 0.11
          ? 'Good'
          : 'Fair'

  return (
    <div className="calibrate">
      <header className="calibrate__bar">
        <Brand />
        <div className="calibrate__bar-right">
          <span className="calibrate__step">Setup · 02 / 02</span>
          <button className="btn btn--text" type="button" onClick={exit}>
            Leave
          </button>
        </div>
      </header>

      <main className="calibrate__stage" id="main">
        <div className="calibrate__grid" aria-hidden="true" />

        {stage === 'running' && (
          <>
            <div className="calibrate__hud">
              <p className="eyebrow">
                <span className="pulse-dot" aria-hidden="true" />
                Point {targetIndex + 1} of {TARGETS.length} · {target.label}
              </p>
              <p>
                {collecting && tracker.faceVisible
                  ? 'Hold your gaze — sampling head and eye position.'
                  : 'Look toward the dot and let your head follow naturally.'}
              </p>

              {!tracker.faceVisible && (
                <p className="calibrate__banner" role="status">
                  Face lost. Move back into the frame — the dot will wait.
                </p>
              )}

              {tracker.faceVisible && notice && (
                <p className="calibrate__banner" role="status">
                  {notice}
                </p>
              )}

              <button
                className="btn btn--text calibrate__cancel"
                type="button"
                onClick={cancel}
              >
                Cancel calibration
              </button>
            </div>

            <div
              className="calibrate__target"
              data-collecting={collecting && tracker.faceVisible}
              style={{
                left: `${target.x * 100}%`,
                top: `${target.y * 100}%`,
              }}
              key={`${targetIndex}-${runId}`}
              aria-hidden="true"
            >
              <span className="calibrate__target-progress" />
              <span className="calibrate__target-core" />
              <span className="calibrate__target-label">{target.label}</span>
            </div>
          </>
        )}

        {stage === 'ready' && (
          <section className="calibrate__panel">
            <p className="eyebrow">
              <span className="pulse-dot" aria-hidden="true" />
              Setup · five-point calibration
            </p>

            <h1>
              {sensorError ? (
                <>
                  The sensor <em>didn&apos;t start.</em>
                </>
              ) : sensorLoading ? (
                <>
                  Waking up the <em>sensor.</em>
                </>
              ) : !tracker.faceVisible ? (
                <>
                  Find your face <em>in the frame.</em>
                </>
              ) : (
                <>
                  Teach Portico <em>where you look.</em>
                </>
              )}
            </h1>

            <p className="calibrate__lede">
              {sensorError
                ? 'The camera is live, but the face model could not load. Retry the sensor, or continue with a pointer.'
                : sensorLoading
                  ? 'The gaze tracker loads once and stays on this device. This can take a few seconds on the first visit.'
                  : !tracker.faceVisible
                    ? 'Sit a comfortable distance from the camera. The calibration starts once your face is visible.'
                    : 'Five dots appear, one at a time. Look toward each dot and let your head follow naturally; you do not need to turn far. Keep your shoulders relaxed and stay in the frame.'}
            </p>

            <div className="calibrate__preview">
              <SensorPreview stream={stream} />
              <div className="calibrate__readout">
                <span
                  className="calibrate__chip"
                  data-tone={
                    sensorError
                      ? 'error'
                      : sensorLoading
                        ? 'busy'
                        : tracker.faceVisible
                          ? 'ready'
                          : 'muted'
                  }
                  title={tracker.error ?? undefined}
                >
                  <span aria-hidden="true" />
                  {sensorError
                    ? 'Sensor unavailable'
                    : sensorLoading
                      ? 'Starting sensor'
                      : tracker.faceVisible
                        ? 'Face detected'
                        : 'No face yet'}
                </span>
                <span className="calibrate__chip calibrate__chip--info">
                  <LockIcon className="icon" />
                  Local only
                </span>
              </div>
            </div>

            {notice && (
              <p className="calibrate__notice" role="status">
                {notice}
              </p>
            )}

            <div className="calibrate__actions">
              {sensorError ? (
                <button
                  className="btn btn--signal btn--block"
                  type="button"
                  onClick={tracker.retry}
                >
                  Try the tracker again
                  <ArrowIcon />
                </button>
              ) : (
                <button
                  className="btn btn--signal btn--block"
                  type="button"
                  onClick={begin}
                  disabled={!canStart}
                >
                  {sensorLoading
                    ? 'Loading gaze tracker…'
                    : !tracker.faceVisible
                      ? 'Waiting for your face'
                      : 'Start five-point calibration'}
                  {!sensorLoading && tracker.faceVisible && <ArrowIcon />}
                </button>
              )}

              <button
                className="btn btn--ghost btn--block"
                type="button"
                onClick={usePointer}
              >
                Use pointer mode instead
              </button>
            </div>

            <p className="calibrate__fine">
              <CameraIcon className="icon" />
              Frames are read in memory and never recorded or uploaded.
            </p>
          </section>
        )}

        {stage === 'tuning' && tuned && (
          <>
            <GazeCursor
              poseRef={tracker.poseRef}
              calibration={tuned}
              showCursor
            />

            <section className="calibrate__panel calibrate__panel--result calibrate__panel--tuning">
              <p className="eyebrow">
                <span className="pulse-dot" aria-hidden="true" />
                Five points · cursor feel
              </p>

              <h1>
                Set the <em>feel.</em>
              </h1>

              <p className="calibrate__lede">
                Move your head and eyes to test the cursor. Sensitivity sets
                how far a head turn or glance reaches. Noise damping filters
                small tracker jitter while quick movements stay responsive.
              </p>

              <div className="calibrate__sensitivity">
                <div className="calibrate__sensitivity-head">
                  <span>Cursor feel</span>
                  <button
                    className="calibrate__reset"
                    type="button"
                    onClick={resetTuning}
                    disabled={
                      sensitivityX === 100 &&
                      sensitivityY === 100 &&
                      cursorSmoothing === 50
                    }
                  >
                    Reset
                  </button>
                </div>

                <label className="calibrate__slider">
                  <span className="calibrate__slider-label">
                    <span>Horizontal</span>
                    <strong>{sensitivityX}%</strong>
                  </span>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    step="5"
                    value={sensitivityX}
                    onChange={(event) =>
                      setSensitivityX(Number(event.target.value))
                    }
                  />
                </label>

                <label className="calibrate__slider">
                  <span className="calibrate__slider-label">
                    <span>Vertical</span>
                    <strong>{sensitivityY}%</strong>
                  </span>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    step="5"
                    value={sensitivityY}
                    onChange={(event) =>
                      setSensitivityY(Number(event.target.value))
                    }
                  />
                </label>

                <label className="calibrate__slider">
                  <span className="calibrate__slider-label">
                    <span>Noise damping</span>
                    <strong>{cursorSmoothing}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={cursorSmoothing}
                    onChange={(event) =>
                      setCursorSmoothing(Number(event.target.value))
                    }
                  />
                  <span className="calibrate__slider-scale">
                    <span>Snappy</span>
                    <span>Steady</span>
                  </span>
                </label>

                <p className="calibrate__slider-hint">
                  Try each corner of the screen. Raise damping if the cursor
                  shivers while you hold still; quick movements stay
                  responsive.
                </p>
              </div>

              {fitLabel && (
                <div className="calibrate__quality">
                  <span>Fit quality</span>
                  <strong>{fitLabel}</strong>
                </div>
              )}

              <div className="calibrate__actions">
                <button
                  className="btn btn--signal btn--block"
                  type="button"
                  onClick={enterShop}
                >
                  Enter the shop
                  <ArrowIcon />
                </button>
                <button
                  className="btn btn--ghost btn--block"
                  type="button"
                  onClick={begin}
                >
                  Recalibrate
                </button>
                <button
                  className="btn btn--text"
                  type="button"
                  onClick={usePointer}
                >
                  Use pointer mode instead
                </button>
              </div>

              <p className="calibrate__fine">
                <CameraIcon className="icon" />
                The camera stays on for head and eye tracking in the shop.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
