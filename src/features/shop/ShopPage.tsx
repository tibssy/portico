import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon } from '../../components/Icons.tsx'
import { useMediaSession } from '../session/session-context.ts'
import { useHeadPose } from '../tracking/useHeadPose.ts'
import { GazeCursor } from '../tracking/GazeCursor.tsx'
import './shop.css'

const SHOWROOM = [
  { name: 'Arc Lamp', price: '€240', tone: 'sand' },
  { name: 'Field Coat', price: '€380', tone: 'clay' },
  { name: 'Mono Vase', price: '€95', tone: 'moss' },
]

export function ShopPage() {
  const navigate = useNavigate()
  const { mode, stream, calibration, leave } = useMediaSession()
  const camera = Boolean(stream?.getVideoTracks().length)
  const microphone = Boolean(stream?.getAudioTracks().length)
  const gazeActive = mode === 'full' && camera && calibration !== null
  const tracker = useHeadPose(stream, gazeActive)
  const [gazed, setGazed] = useState<string | null>(null)

  const exit = () => {
    leave()
    navigate('/')
  }

  const recalibrate = () => {
    navigate('/calibrate')
  }

  const modeLabel =
    mode === 'browse'
      ? 'Pointer mode'
      : mode === 'voice'
        ? 'Voice mode'
        : 'Head-pose mode'

  const gazeMessage =
    tracker.status === 'error'
      ? 'Head tracking paused. Pointer browsing still works.'
      : tracker.status === 'loading'
        ? 'Starting head tracking…'
        : gazed
          ? 'Looking at'
          : 'Look at a product'

  return (
    <div className="shop">
      <header className="shop__bar">
        <Brand />
        <div className="shop__pills" aria-label="Session status">
          <span data-on={camera}>Camera</span>
          <span data-on={microphone}>Mic</span>
          <span data-on="true">{modeLabel}</span>
        </div>
        <div className="shop__actions">
          {gazeActive && (
            <button
              className="btn btn--text shop__recalibrate"
              type="button"
              onClick={recalibrate}
            >
              Recalibrate
            </button>
          )}
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={exit}
          >
            Leave shop
          </button>
        </div>
      </header>

      <main className="shop__stage" id="main">
        <p className="eyebrow">
          <span className="pulse-dot" aria-hidden="true" />
          Session live · showroom
        </p>

        <h1>
          You&apos;re <em>through the door.</em>
        </h1>

        <p className="shop__lede">
          {gazeActive
            ? 'Head tracking is live. Look at a product to bring it into focus — the curved carousel and voice assistant come next.'
            : 'The entrance works. Next come the curved carousel, voice, and on-device speech.'}
        </p>

        {gazeActive && (
          <p
            className="shop__gaze"
            data-tone={tracker.status === 'error' ? 'error' : undefined}
            aria-live="polite"
          >
            <span className="shop__gaze-dot" aria-hidden="true" />
            {tracker.status === 'error' ? (
              gazeMessage
            ) : gazed ? (
              <>
                {gazeMessage} <strong>{gazed}</strong>
              </>
            ) : (
              gazeMessage
            )}
          </p>
        )}

        <div className="showroom" aria-hidden="true">
          {SHOWROOM.map((product, index) => (
            <article
              className="showroom__card"
              key={product.name}
              data-gaze-card={product.name}
              data-gazed={gazed === product.name}
              style={{ '--i': index } as CSSProperties}
            >
              <div className="showroom__art" data-tone={product.tone}>
                <span />
              </div>
              <div className="showroom__meta">
                <span>{product.name}</span>
                <span>{product.price}</span>
              </div>
            </article>
          ))}
        </div>

        {gazeActive && calibration && tracker.status === 'ready' && (
          <GazeCursor
            poseRef={tracker.poseRef}
            calibration={calibration}
            onTargetChange={setGazed}
          />
        )}

        <p className="shop__note">
          {gazeActive
            ? 'Move your head to move the cursor · selection and voice arrive next'
            : 'Static preview · the carousel and voice assistant arrive in the next milestones.'}
        </p>

        <button
          className="btn btn--ghost btn--small shop__exit"
          type="button"
          onClick={exit}
        >
          Leave and switch off the camera
          <ArrowIcon />
        </button>
      </main>
    </div>
  )
}
