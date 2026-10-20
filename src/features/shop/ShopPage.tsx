import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon } from '../../components/Icons.tsx'
import { useMediaSession } from '../session/session-context.ts'
import './shop.css'

const SHOWROOM = [
  { name: 'Arc Lamp', price: '€240', tone: 'sand' },
  { name: 'Field Coat', price: '€380', tone: 'clay' },
  { name: 'Mono Vase', price: '€95', tone: 'moss' },
]

export function ShopPage() {
  const navigate = useNavigate()
  const { mode, stream, leave } = useMediaSession()
  const camera = Boolean(stream?.getVideoTracks().length)
  const microphone = Boolean(stream?.getAudioTracks().length)

  const exit = () => {
    leave()
    navigate('/')
  }

  const modeLabel =
    mode === 'browse'
      ? 'Pointer mode'
      : mode === 'voice'
        ? 'Voice mode'
        : 'Head-pose mode'

  return (
    <div className="shop">
      <header className="shop__bar">
        <Brand />
        <div className="shop__pills" aria-label="Session status">
          <span data-on={camera}>Camera</span>
          <span data-on={microphone}>Mic</span>
          <span>{modeLabel}</span>
        </div>
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={exit}
        >
          Leave shop
        </button>
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
          The entrance works. Next come the curved carousel and five-point
          calibration, then the assistant and on-device speech.
        </p>

        <div className="showroom" aria-hidden="true">
          {SHOWROOM.map((product, index) => (
            <article
              className="showroom__card"
              key={product.name}
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

        <p className="shop__note">
          Static preview · the carousel and voice assistant arrive in the next
          milestones.
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
