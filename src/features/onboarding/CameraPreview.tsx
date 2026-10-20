import { useEffect, useRef } from 'react'

export function CameraPreview({
  stream,
  requesting,
  coarse,
}: {
  stream: MediaStream | null
  requesting: boolean
  coarse: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const live = Boolean(stream?.getVideoTracks().length)

  useEffect(() => {
    const element = videoRef.current
    if (!element) return

    element.srcObject = stream

    if (stream) {
      void element.play().catch(() => {})
    }

    return () => {
      element.srcObject = null
    }
  }, [stream])

  const placeholder = coarse
    ? 'Camera stays off on touch devices'
    : requesting
      ? 'Waiting for permission…'
      : stream
        ? 'No video track'
        : 'Camera preview'

  return (
    <div className="camera-frame" data-live={live}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
      />

      {!live && (
        <div className="camera-empty">
          <div className="camera-empty__rings" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p>{placeholder}</p>
        </div>
      )}

      {live && (
        <span className="live-badge">
          <span className="live-badge__dot" aria-hidden="true" />
          Live
        </span>
      )}

      <span className="camera-frame__hint">
        {coarse ? 'Voice only' : 'Head-pose sensor'}
      </span>
    </div>
  )
}
