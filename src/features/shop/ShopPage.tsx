import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand.tsx'
import { ArrowIcon } from '../../components/Icons.tsx'
import { useMediaSession } from '../session/session-context.ts'
import { useHeadPose } from '../tracking/useHeadPose.ts'
import { GazeCursor } from '../tracking/GazeCursor.tsx'
import './shop.css'

type Tone = 'sand' | 'clay' | 'moss' | 'dusk' | 'steel'

interface Product {
  name: string
  price: string
  tone: Tone
  spec: string
  description: string
}

const PRODUCTS: Product[] = [
  {
    name: 'Arc Lamp',
    price: '€240',
    tone: 'sand',
    spec: 'Blackened steel · 48 cm',
    description:
      'A paper-thin shade on a blackened steel stem. Warm, low light for a reading corner.',
  },
  {
    name: 'Field Coat',
    price: '€380',
    tone: 'clay',
    spec: 'Waxed cotton · Made in Porto',
    description:
      'Waxed cotton with a corduroy collar. Cut roomy enough to layer over a knit.',
  },
  {
    name: 'Mono Vase',
    price: '€95',
    tone: 'moss',
    spec: 'Hand-thrown stoneware · 26 cm',
    description:
      'Hand-thrown stoneware in a matte moss glaze. No two are quite alike.',
  },
  {
    name: 'Fold Stool',
    price: '€210',
    tone: 'dusk',
    spec: 'Solid ash · 44 cm',
    description:
      'A single folded plane of ash on a slim steel frame. Stackable when the room changes.',
  },
  {
    name: 'Ridge Bowl',
    price: '€120',
    tone: 'steel',
    spec: 'Pressed glass · 32 cm',
    description:
      'Pressed glass with a ridged edge. Catches whatever light is nearby.',
  },
  {
    name: 'Column Speaker',
    price: '€420',
    tone: 'sand',
    spec: 'Ash cabinet · 32 cm',
    description:
      'A compact speaker in an ash cabinet. Warm sound for a shelf, with a grille that disappears into the grain.',
  },
  {
    name: 'Linen Throw',
    price: '€120',
    tone: 'clay',
    spec: 'Washed linen · 130 × 190 cm',
    description:
      'A heavyweight throw with an open weave. Washed twice so it drapes from the first use.',
  },
  {
    name: 'Pebble Tray',
    price: '€58',
    tone: 'moss',
    spec: 'Cast stone · 24 cm',
    description:
      'A shallow catch-all cast in warm grey stone. For keys, rings, and the odd small stone.',
  },
  {
    name: 'Halo Mirror',
    price: '€290',
    tone: 'dusk',
    spec: 'Powder-coated steel · 52 cm',
    description:
      'A thin steel ring with a deep-set mirror. Mounts flush and catches the room at an angle.',
  },
  {
    name: 'Cane Chair',
    price: '€340',
    tone: 'steel',
    spec: 'Oak and cane · 78 cm',
    description:
      'A light oak frame with a hand-woven cane seat. Built for a desk or a corner that needs a chair.',
  },
  {
    name: 'Cork Stool',
    price: '€150',
    tone: 'sand',
    spec: 'Pressed cork · 38 cm',
    description:
      'Dense cork pressed into a soft-edged stool. Warm underfoot and light enough to move.',
  },
  {
    name: 'Grid Clock',
    price: '€85',
    tone: 'clay',
    spec: 'Powder-coated aluminium · 28 cm',
    description:
      'A square clock with a quiet sweep movement. The grid lines double as the hour marks.',
  },
  {
    name: 'Ripple Glass',
    price: '€32',
    tone: 'moss',
    spec: 'Mouth-blown glass · 250 ml',
    description:
      'A small tumbler with a rippled wall. Each one is blown and slightly different.',
  },
  {
    name: 'Slope Shelf',
    price: '€260',
    tone: 'dusk',
    spec: 'Blackened steel · 90 cm',
    description:
      'A single shelf with a shallow lip. Holds books, records, or a small collection.',
  },
  {
    name: 'Stone Lamp',
    price: '€180',
    tone: 'steel',
    spec: 'Travertine and brass · 36 cm',
    description:
      'A block of travertine with a brass stem. A low pool of light for a bedside table.',
  },
]

const DWELL_MS = 1800
const LOOK_AWAY_MS = 1500
const PANEL_ARM_MS = 1000
const DWELL_CLOSE_PAUSE_MS = 700

const ACTION_LABELS: Record<string, string> = {
  close: 'close the piece',
  recalibrate: 'recalibrate the camera',
  leave: 'leave the showroom',
}

export function ShopPage() {
  const navigate = useNavigate()
  const { mode, stream, calibration, leave } = useMediaSession()
  const camera = Boolean(stream?.getVideoTracks().length)
  const microphone = Boolean(stream?.getAudioTracks().length)
  const gazeActive = mode === 'full' && camera && calibration !== null
  const tracker = useHeadPose(stream, gazeActive)
  const [gazeTarget, setGazeTarget] = useState<string | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [panelArmed, setPanelArmed] = useState(false)
  const [dwellPaused, setDwellPaused] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const dwellPauseTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)

  const selectedIndex = selected
    ? PRODUCTS.findIndex((product) => product.name === selected.name)
    : -1
  const gazeTracking = gazeActive && tracker.status === 'ready'
  const activeGazeTarget = gazeTracking ? gazeTarget : null
  const gazedName = PRODUCTS.some(
    (product) => product.name === activeGazeTarget,
  )
    ? activeGazeTarget
    : null
  const gazeAction = activeGazeTarget?.startsWith('action:')
    ? activeGazeTarget.slice(7)
    : null
  const actionLabel = gazeAction ? (ACTION_LABELS[gazeAction] ?? 'select') : null

  const dwellFilter = useCallback(
    (target: string) => !selected || target.startsWith('action:'),
    [selected],
  )

  const exit = useCallback(() => {
    leave()
    navigate('/')
  }, [leave, navigate])

  const recalibrate = useCallback(() => {
    navigate('/calibrate')
  }, [navigate])

  const modeLabel =
    mode === 'browse'
      ? 'Pointer mode'
      : mode === 'voice'
        ? 'Voice mode'
        : 'Head-pose mode'

  const selectProduct = useCallback(
    (product: Product) => {
      if (selected?.name === product.name && !isClosing) return

      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      if (dwellPauseTimer.current !== null) {
        window.clearTimeout(dwellPauseTimer.current)
        dwellPauseTimer.current = null
      }

      setDwellPaused(false)
      setIsClosing(false)
      setSelected(product)
      setPanelArmed(false)
    },
    [selected, isClosing],
  )

  const finalizeClose = useCallback(() => {
    const name = selected?.name
    setSelected(null)
    setIsClosing(false)
    setPanelArmed(false)

    if (dwellPauseTimer.current !== null) {
      window.clearTimeout(dwellPauseTimer.current)
    }
    setDwellPaused(true)
    dwellPauseTimer.current = window.setTimeout(() => {
      dwellPauseTimer.current = null
      setDwellPaused(false)
    }, DWELL_CLOSE_PAUSE_MS)

    if (name) {
      window.requestAnimationFrame(() => {
        cardRefs.current[name]?.focus({ preventScroll: true })
      })
    }
  }, [selected])

  const closePanel = useCallback(() => {
    if (!selected || isClosing) return

    setIsClosing(true)
    setDwellPaused(true)

    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
    }
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      finalizeClose()
    }, 220)
  }, [selected, isClosing, finalizeClose])

  const handleDwell = useCallback(
    (target: string) => {
      if (target === 'action:close') {
        closePanel()
        return
      }

      if (target === 'action:recalibrate') {
        recalibrate()
        return
      }

      if (target === 'action:leave') {
        exit()
        return
      }

      const product = PRODUCTS.find((item) => item.name === target)
      if (product) selectProduct(product)
    },
    [closePanel, exit, recalibrate, selectProduct],
  )

  const handleGazeTarget = useCallback(
    (target: string | null) => {
      setGazeTarget(target)
      if (!isClosing && selected && target === 'panel') setPanelArmed(true)
    },
    [selected, isClosing],
  )

  useEffect(() => {
    if (selected && !isClosing) {
      closeRef.current?.focus({ preventScroll: true })
    }
  }, [selected, isClosing])

  useEffect(() => {
    if (!selected || isClosing) return

    // Give a newly opened card a moment before a glance away can close it.
    const timer = window.setTimeout(() => setPanelArmed(true), PANEL_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [selected, isClosing])

  useEffect(() => {
    if (
      !selected ||
      isClosing ||
      !gazeActive ||
      tracker.status !== 'ready' ||
      !panelArmed ||
      activeGazeTarget !== null
    ) {
      return
    }

    const timer = window.setTimeout(closePanel, LOOK_AWAY_MS)
    return () => window.clearTimeout(timer)
  }, [
    selected,
    isClosing,
    gazeActive,
    tracker.status,
    panelArmed,
    activeGazeTarget,
    closePanel,
  ])

  useEffect(() => {
    return () => {
      if (dwellPauseTimer.current !== null) {
        window.clearTimeout(dwellPauseTimer.current)
      }
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selected) {
        event.preventDefault()
        if (!isClosing) closePanel()
        return
      }

      if (!(event.target instanceof HTMLElement)) return
      const card = event.target.closest<HTMLElement>('[data-gaze-card]')
      if (!card || !gridRef.current) return

      const name = card.dataset.gazeCard
      const index = PRODUCTS.findIndex((product) => product.name === name)
      if (index < 0) return

      const columns = Math.max(
        1,
        getComputedStyle(gridRef.current).gridTemplateColumns.split(' ').length,
      )
      let next = index

      if (event.key === 'ArrowLeft') next = index - 1
      else if (event.key === 'ArrowRight') next = index + 1
      else if (event.key === 'ArrowUp') next = index - columns
      else if (event.key === 'ArrowDown') next = index + columns
      else return

      event.preventDefault()
      if (next < 0 || next >= PRODUCTS.length) return
      cardRefs.current[PRODUCTS[next].name]?.focus()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePanel, selected, isClosing])

  return (
    <div
      className="shop"
      data-expanded={selected ? 'open' : 'closed'}
      data-gaze={gazeTracking ? 'true' : 'false'}
      style={{ '--dwell-ms': `${DWELL_MS}ms` } as CSSProperties}
    >
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
              data-gaze-action="recalibrate"
              onClick={recalibrate}
            >
              Recalibrate
            </button>
          )}
          <button
            className="btn btn--ghost btn--small"
            type="button"
            data-gaze-action="leave"
            onClick={exit}
          >
            Leave shop
          </button>
        </div>
      </header>

      <main className="shop__stage" id="main">
        <div className="shop__intro">
          <p className="eyebrow">
            <span className="pulse-dot" aria-hidden="true" />
            Session live · showroom
          </p>

          <h1>
            You&apos;re <em>through the door.</em>
          </h1>

          <p className="shop__lede">
            {gazeActive
              ? 'The whole room, laid out at once. Look at a piece and hold for a moment; the tile holds steady while you dwell, so small head movements do not shake the selection.'
              : 'The whole room, laid out at once. Click any piece to open its details. Calibrate the camera to browse with your head.'}
          </p>

          {gazeActive && (
            <p
              className="shop__gaze"
              data-tone={tracker.status === 'error' ? 'error' : undefined}
              aria-live="polite"
            >
              <span className="shop__gaze-dot" aria-hidden="true" />
              {tracker.status === 'error' ? (
                'Head tracking paused. Pointer browsing still works.'
              ) : tracker.status === 'loading' ? (
                'Starting head tracking…'
              ) : !tracker.faceVisible ? (
                'Face not detected · line up with the camera'
              ) : actionLabel ? (
                <>
                  Hold gaze to <strong>{actionLabel}</strong>
                </>
              ) : selected && activeGazeTarget === 'panel' ? (
                'Reading details · look away to close'
              ) : selected ? (
                'Piece open · look away to close'
              ) : gazedName ? (
                <>
                  Hold to open <strong>{gazedName}</strong>
                </>
              ) : (
                'Look at a piece · hold to open'
              )}
            </p>
          )}
        </div>

        <ul
          className="showroom"
          ref={gridRef}
          aria-label="Showroom pieces"
          aria-hidden={selected ? true : undefined}
        >
          {PRODUCTS.map((product) => {
            const dwelling =
              !selected &&
              !dwellPaused &&
              activeGazeTarget === product.name

            return (
              <li className="showroom__item" key={product.name}>
                <button
                  className="showroom__card"
                  type="button"
                  ref={(node) => {
                    cardRefs.current[product.name] = node
                  }}
                  data-gaze-card={selected ? undefined : product.name}
                  data-selected={selected?.name === product.name}
                  data-dwelling={dwelling ? 'true' : undefined}
                  tabIndex={selected ? -1 : undefined}
                  aria-expanded={selected?.name === product.name}
                  aria-controls={
                    selected?.name === product.name
                      ? 'product-details'
                      : undefined
                  }
                  aria-label={`${product.name}, ${product.price}`}
                  onClick={() => selectProduct(product)}
                >
                  <span className="showroom__art" data-tone={product.tone}>
                    <span aria-hidden="true" />
                  </span>
                  <span className="showroom__meta">
                    <span>{product.name}</span>
                    <span>{product.price}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {gazeActive && calibration && tracker.status === 'ready' && (
          <GazeCursor
            poseRef={tracker.poseRef}
            calibration={calibration}
            onTargetChange={handleGazeTarget}
            dwellMs={DWELL_MS}
            dwellEnabled={!dwellPaused}
            dwellFilter={dwellFilter}
            onDwell={handleDwell}
          />
        )}

        <div className="shop__footer">
          <p className="shop__note">
            {gazeActive
              ? 'Look at a piece and hold · look away to close · Esc also closes'
              : 'Select a piece · arrow keys move focus · Esc closes the details'}
          </p>

          <button
            className="btn btn--ghost btn--small shop__exit"
            type="button"
            data-gaze-action="leave"
            onClick={exit}
          >
            {camera ? 'Leave and switch off the camera' : 'Leave the showroom'}
            <ArrowIcon />
          </button>
        </div>
      </main>

      {selected && (
        <div className="product-expanded-layer">
          <article
            className="product-expanded"
            id="product-details"
            data-gaze-panel="true"
            data-closing={isClosing ? 'true' : undefined}
            aria-labelledby="product-expanded-title"
          >
            <button
              className="product-expanded__close"
              ref={closeRef}
              type="button"
              data-gaze-action="close"
              onClick={closePanel}
              aria-label="Close product details"
            >
              ×
            </button>

            <div
              className="showroom__art product-expanded__art"
              data-tone={selected.tone}
            >
              <span aria-hidden="true" />
            </div>

            <div className="product-expanded__body">
              <p className="eyebrow">
                Piece {String(selectedIndex + 1).padStart(2, '0')} · showroom
              </p>

              <h2 id="product-expanded-title">{selected.name}</h2>
              <p className="product-expanded__price">{selected.price}</p>
              <p className="product-expanded__copy">{selected.description}</p>
              <p className="product-expanded__spec">{selected.spec}</p>

              <p className="product-expanded__hint">
                {gazeActive
                  ? 'Look away or use the close control to return to the showroom.'
                  : 'Use the close control or Esc to return to the showroom.'}
              </p>
            </div>
          </article>
        </div>
      )}
    </div>
  )
}
