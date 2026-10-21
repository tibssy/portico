import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon, CameraIcon, MicIcon } from '../../components/Icons.tsx'
import { isTouchMode } from '../../lib/capabilities.ts'
import { useMediaSession } from '../session/session-context.ts'
import { CameraPreview } from './CameraPreview.tsx'
import { MicMeter } from './MicMeter.tsx'
import './device-check.css'

type Tone = 'ready' | 'muted' | 'error' | 'busy'

function StatusRow({
  label,
  value,
  tone,
  children,
}: {
  label: string
  value: string
  tone: Tone
  children?: ReactNode
}) {
  return (
    <div className="status-row">
      <div className="status-row__head">
        <span className="status-row__label">{label}</span>
        <span className="status-row__value" data-tone={tone}>
          <span className="status-row__dot" aria-hidden="true" />
          {value}
        </span>
      </div>
      {children}
    </div>
  )
}

export function DeviceCheckPage() {
  const navigate = useNavigate()
  const {
    phase,
    stream,
    error,
    calibration,
    request,
    requestAudioOnly,
    continueWithoutMedia,
    markEntered,
    leave,
  } = useMediaSession()

  const coarse = isTouchMode()
  const requesting = phase === 'requesting'
  const hasVideo = Boolean(stream?.getVideoTracks().length)
  const hasAudio = Boolean(stream?.getAudioTracks().length)
  const calibrated = calibration !== null
  const needsCalibration = !coarse && hasVideo && !calibrated
  const denied = error?.code === 'denied'
  const canRetry = !error || error.canRetry

  const exit = () => {
    leave()
    navigate('/')
  }

  const enable = () => {
    void (coarse ? requestAudioOnly() : request())
  }

  const enter = () => {
    if (needsCalibration) {
      navigate('/calibrate')
      return
    }

    markEntered()
    navigate('/shop')
  }

  const browse = () => {
    continueWithoutMedia()
    navigate('/shop')
  }

  const cameraValue = coarse
    ? 'Skipped'
    : hasVideo
      ? 'Live'
      : denied
        ? 'Blocked'
        : requesting
          ? 'Waiting'
          : 'Not connected'

  const cameraTone: Tone = coarse
    ? 'muted'
    : hasVideo
      ? 'ready'
      : denied
        ? 'error'
        : requesting
          ? 'busy'
          : 'muted'

  const micValue = hasAudio
    ? 'Listening'
    : denied
      ? 'Blocked'
      : requesting
        ? 'Waiting'
        : 'Not connected'

  const micTone: Tone = hasAudio
    ? 'ready'
    : denied
      ? 'error'
      : requesting
        ? 'busy'
        : 'muted'

  return (
    <div className="check">
      <header className="check__bar">
        <Brand />
        <div className="check__bar-right">
          <span className="step-badge">Setup · 01 / 02</span>
          <button className="btn btn--text" type="button" onClick={exit}>
            Leave
          </button>
        </div>
      </header>

      <main className="check__grid" id="main">
        <section className="preview-panel" aria-label="Camera preview">
          <CameraPreview
            stream={stream}
            requesting={requesting}
            coarse={coarse}
          />
        </section>

        <section className="check__panel">
          <div className="check__intro">
            <p className="eyebrow">
              <span className="pulse-dot" aria-hidden="true" />
              Setup · step one
            </p>
            <h1>
              Let&apos;s check the <em>senses.</em>
            </h1>
            <p className="check__lede">
              {coarse
                ? 'Portico will ask for the microphone only. On a phone the shop is voice- and touch-driven — no camera needed.'
                : 'Portico uses the camera to follow the direction of your head and eyes and the microphone to hear what you ask. Both stay on this device.'}
            </p>
          </div>

          <div className="status-card" aria-live="polite">
            <StatusRow label="Camera" value={cameraValue} tone={cameraTone}>
              {!coarse && !hasVideo && (
                <p className="status-row__note">
                  {denied
                    ? 'Allow the camera from the address bar, then try again.'
                    : 'Used for head and eye tracking. Frames are never stored.'}
                </p>
              )}
            </StatusRow>

            <StatusRow label="Microphone" value={micValue} tone={micTone}>
              <MicMeter stream={stream} />
              {!hasAudio && (
                <p className="status-row__note">
                  {denied
                    ? 'Allow the microphone from the address bar, then try again.'
                    : 'Only buffered while the assistant is listening.'}
                </p>
              )}
            </StatusRow>

            <StatusRow
              label="Gaze tracking"
              value={
                coarse
                  ? 'Touch mode'
                  : hasVideo
                    ? calibrated
                      ? 'Calibrated'
                      : 'Calibration next'
                    : 'Camera off'
              }
              tone={calibrated ? 'ready' : 'muted'}
            >
              <p className="status-row__note">
                {coarse
                  ? 'Swipe and voice replace gaze tracking on small screens.'
                  : calibrated
                    ? 'Five-point calibration is complete. You can recalibrate from the shop.'
                    : hasVideo
                      ? 'A five-point calibration comes next, right after this step.'
                      : 'Gaze tracking needs the camera.'}
              </p>
            </StatusRow>

            <StatusRow
              label="Speech model"
              value="On first use"
              tone="muted"
            >
              <p className="status-row__note">
                Parakeet Redux, about 210&nbsp;MB, cached after the first
                download.
              </p>
            </StatusRow>
          </div>

          {error && (
            <section className="error-card" role="alert">
              <p className="error-card__title">{error.title}</p>
              <p className="error-card__detail">{error.detail}</p>
            </section>
          )}

          <div className="check__actions">
            {phase === 'ready' && !error ? (
              <>
                <button
                  className="btn btn--signal btn--block"
                  type="button"
                  onClick={enter}
                >
                  {needsCalibration
                    ? 'Calibrate gaze tracking'
                    : 'Enter the shop'}
                  <ArrowIcon />
                </button>

                {hasVideo && (
                  <button
                    className="btn btn--ghost btn--block"
                    type="button"
                    onClick={() => void requestAudioOnly()}
                  >
                    <MicIcon />
                    Continue with microphone only
                  </button>
                )}

                <button
                  className="btn btn--text"
                  type="button"
                  onClick={browse}
                >
                  Browse without devices
                </button>
              </>
            ) : (
              <>
                {canRetry && (
                  <button
                    className="btn btn--signal btn--block"
                    type="button"
                    onClick={enable}
                    disabled={requesting}
                  >
                    {requesting
                      ? 'Waiting for permission…'
                      : error
                        ? 'Try again'
                        : coarse
                          ? 'Enable microphone'
                          : 'Enable camera + microphone'}
                    {!requesting && <ArrowIcon />}
                  </button>
                )}

                {!coarse && error && canRetry && (
                  <button
                    className="btn btn--ghost btn--block"
                    type="button"
                    onClick={() => void requestAudioOnly()}
                  >
                    <MicIcon />
                    Use microphone only
                  </button>
                )}

                <button
                  className="btn btn--text"
                  type="button"
                  onClick={browse}
                >
                  Browse without devices
                </button>
              </>
            )}
          </div>

          <p className="check__fine">
            <CameraIcon className="icon" />
            Nothing is recorded or uploaded. Leaving the shop switches the
            camera light off immediately.
          </p>
        </section>
      </main>
    </div>
  )
}
