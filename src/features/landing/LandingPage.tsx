import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Brand } from '../../components/Brand.tsx'
import {
  ArrowIcon,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  MicIcon,
  SparkIcon,
} from '../../components/Icons.tsx'
import { useMediaSession } from '../session/session-context.ts'
import { useCapabilities } from '../../lib/useCapabilities.ts'
import { isTouchMode } from '../../lib/capabilities.ts'
import './landing.css'

const PRODUCTS = [
  { name: 'Arc Lamp', price: '€240', tone: 'sand' },
  { name: 'Field Coat', price: '€380', tone: 'clay' },
  { name: 'Mono Vase', price: '€95', tone: 'moss' },
  { name: 'Studio Chair', price: '€520', tone: 'steel' },
  { name: 'Wool Throw', price: '€140', tone: 'plum' },
]

const KEYWORDS = [
  'Look',
  'Speak',
  'Discover',
  'On-device',
  'No recording',
  'Head tracking',
  'Voice',
]

type ChipState = 'checking' | 'yes' | 'no'

function CapabilityChip({
  label,
  value,
  state,
  detail,
}: {
  label: string
  value: string
  state: ChipState
  detail: string
}) {
  return (
    <span
      className="capability"
      data-state={state}
      title={detail}
      aria-label={`${label}: ${detail}`}
    >
      <span className="capability__dot" aria-hidden="true" />
      <span className="capability__label">{label}</span>
      <span className="capability__value">{value}</span>
    </span>
  )
}

function GazeStage() {
  return (
    <div className="gaze-stage" aria-hidden="true">
      <div className="gaze-stage__halo" />
      <div className="gaze-ring">
        {PRODUCTS.map((product, index) => (
          <article
            className="gaze-card"
            key={product.name}
            style={{ '--i': index - 2 } as CSSProperties}
          >
            <div className="gaze-card__art" data-tone={product.tone}>
              <span className="gaze-card__shape" />
            </div>
            <div className="gaze-card__meta">
              <span>{product.name}</span>
              <span>{product.price}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="reticle">
        <span className="reticle__dot" />
      </div>
      <p className="gaze-stage__caption">
        Gaze preview <span>·</span> the real carousel starts inside
      </p>
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const { phase, request, requestAudioOnly, leave } = useMediaSession()
  const capabilities = useCapabilities()
  const touch = capabilities?.touchMode ?? isTouchMode()

  // Returning to the landing page (including with the browser back button)
  // should always switch the camera and microphone off.
  useEffect(() => {
    leave()
  }, [leave])

  const enter = () => {
    if (phase === 'requesting') return
    if (phase === 'ready') {
      navigate('/check')
      return
    }

    if (touch) void requestAudioOnly()
    else void request()

    navigate('/check')
  }

  const chip = (
    label: string,
    ready: boolean,
    valueReady: string,
    valueMissing: string,
    detail: string,
  ) => ({
    label,
    value: capabilities === null ? '…' : ready ? valueReady : valueMissing,
    state: (capabilities === null ? 'checking' : ready ? 'yes' : 'no') as ChipState,
    detail,
  })

  const chips = [
    chip(
      'Camera',
      Boolean(capabilities?.camera),
      'Ready',
      'Off',
      capabilities?.camera
        ? 'A camera is available for head tracking.'
        : 'No camera is available, or this is a touch device.',
    ),
    chip(
      'Mic',
      Boolean(capabilities?.microphone),
      'Ready',
      'Off',
      capabilities?.microphone
        ? 'A microphone is available for voice requests.'
        : 'No microphone is available in this browser.',
    ),
    chip(
      'Speech',
      Boolean(capabilities?.webgpu),
      'WebGPU',
      'CPU',
      capabilities?.webgpu
        ? 'WebGPU can accelerate the on-device speech model.'
        : 'Speech will fall back to CPU inference.',
    ),
    chip(
      'Head tracking',
      Boolean(capabilities?.headTracking),
      'Desktop',
      'Touch',
      capabilities?.headTracking
        ? 'Head-pose navigation is available on this device.'
        : 'Touch devices browse with swipe and voice.',
    ),
  ]

  return (
    <div className="landing">
      <header className="site-header">
        <div className="shell site-header__inner">
          <Brand />
          <nav className="site-header__nav" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <button className="btn btn--small btn--ghost" type="button" onClick={enter}>
            Enter
            <ArrowIcon className="btn__arrow" />
          </button>
        </div>
      </header>

      <main id="main">
        <section className="hero shell">
          <div className="hero__copy">
            <p className="eyebrow">
              <span className="pulse-dot" aria-hidden="true" />
              Experimental storefront · 001
            </p>
            <h1>
              Browse with a <em>glance</em>.
              <br />
              Ask out loud.
            </h1>
            <p className="hero__lede">
              Portico is a shop that follows your attention. Turn your head
              toward something you like and it comes to the centre. Say what
              you are looking for and the shop answers.
            </p>

            <div className="hero__actions">
              <button
                className="btn btn--signal"
                type="button"
                onClick={enter}
                disabled={phase === 'requesting'}
              >
                {phase === 'requesting' ? 'Opening…' : 'Enter the shop'}
                <ArrowIcon className="btn__arrow" />
              </button>
              <a className="btn btn--ghost" href="#how">
                How it works
              </a>
            </div>

            <p className="hero__note">
              {touch ? (
                <>
                  <MicIcon className="icon" />
                  Microphone only on this device. Head tracking is
                  desktop-only.
                </>
              ) : (
                <>
                  <CameraIcon className="icon" />
                  <MicIcon className="icon" />
                  Asks for camera + microphone. Nothing is recorded.
                </>
              )}
            </p>

            <div className="capabilities" aria-label="Device capabilities">
              {chips.map((item) => (
                <CapabilityChip key={item.label} {...item} />
              ))}
            </div>
          </div>

          <GazeStage />
        </section>

        <section className="keywords" aria-label="Portico in seven words">
          <div className="keywords__track">
            {[0, 1].map((copy) => (
              <div
                className="keywords__group"
                key={copy}
                aria-hidden={copy === 1 ? 'true' : undefined}
              >
                {KEYWORDS.map((word) => (
                  <span className="keywords__item" key={word}>
                    {word}
                    <span className="keywords__dot" aria-hidden="true">
                      ✳
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="how shell" id="how">
          <div className="section-heading">
            <p className="eyebrow">How it works</p>
            <h2>
              Three senses, <em>one storefront.</em>
            </h2>
            <p>
              The camera reads where your head is pointing. Frames are
              discarded as soon as they are read. Voice stays local.
            </p>
          </div>

          <div className="steps">
            <article className="step">
              <div className="step__top">
                <span className="step__num">01</span>
                <EyeIcon className="step__icon" />
              </div>
              <h3>Look</h3>
              <p>
                Turn toward a product and the curved carousel brings it to the
                centre. No cursor, no scrolling, no clicking through grids.
              </p>
              <span className="step__tag">Head-pose tracking</span>
            </article>
            <article className="step">
              <div className="step__top">
                <span className="step__num">02</span>
                <MicIcon className="step__icon" />
              </div>
              <h3>Speak</h3>
              <p>
                Tell the assistant what you are after. Speech runs on-device
                with Parakeet Redux after a one-time model download.
              </p>
              <span className="step__tag">On-device speech</span>
            </article>
            <article className="step">
              <div className="step__top">
                <span className="step__num">03</span>
                <SparkIcon className="step__icon" />
              </div>
              <h3>Discover</h3>
              <p>
                An assistant appears when you linger, with the product you are
                looking at already in context. Browse, ask, move on.
              </p>
              <span className="step__tag">Nothing leaves the browser</span>
            </article>
          </div>
        </section>

        <section className="privacy shell" id="privacy">
          <div className="privacy__statement">
            <p className="eyebrow">Privacy</p>
            <blockquote>
              The camera is a sensor, <em>not a shutter.</em>
            </blockquote>
          </div>
          <div className="privacy__body">
            <p>
              Video never leaves your browser. Head-pose estimation happens
              locally, frame by frame, and the frames are discarded as soon as
              they are read. No accounts, no recordings, no uploads.
            </p>
            <ul className="check-list">
              <li>
                <CheckIcon className="check-list__icon" />
                Camera frames are processed in memory only.
              </li>
              <li>
                <CheckIcon className="check-list__icon" />
                Audio is buffered only while the assistant is listening.
              </li>
              <li>
                <CheckIcon className="check-list__icon" />
                Leaving the shop switches the camera light off immediately.
              </li>
            </ul>
            <p className="privacy__fine">
              The speech model is about 210&nbsp;MB. It downloads once, on
              first use, and is cached in your browser. Until then, setup only
              asks for device access.
            </p>
          </div>
        </section>

        <section className="closing">
          <div className="shell closing__inner">
            <p className="eyebrow">Ready when you are</p>
            <h2>
              The door is <em>open.</em>
            </h2>
            <button
              className="btn btn--signal btn--large"
              type="button"
              onClick={enter}
              disabled={phase === 'requesting'}
            >
              Enter the shop
              <ArrowIcon className="btn__arrow" />
            </button>
            <p className="closing__note">
              Desktop asks for camera and microphone. Mobile asks for the
              microphone only.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell site-footer__inner">
          <Brand />
          <p>An experiment in gaze and voice. Built with React, Vite, MediaPipe.</p>
          <p className="site-footer__fine">
            Speech model: Parakeet Redux · CC BY 4.0 · Head tracking:
            MediaPipe · Apache 2.0
          </p>
        </div>
      </footer>
    </div>
  )
}
