import { useEffect, useRef } from 'react'
import { hasLiveTrack } from '../../lib/media.ts'

export function MicMeter({ stream }: { stream: MediaStream | null }) {
  const barRef = useRef<HTMLSpanElement>(null)
  const active = hasLiveTrack(stream, 'audio')

  useEffect(() => {
    if (!stream || !active) return

    const context = new AudioContext({ latencyHint: 'interactive' })
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.72
    source.connect(analyser)

    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    let level = 0

    const tick = () => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0

      for (let index = 0; index < samples.length; index += 1) {
        const value = (samples[index] - 128) / 128
        sum += value * value
      }

      const rms = Math.sqrt(sum / samples.length)
      level = Math.max(rms, level * 0.86)
      const percent = Math.min(100, Math.round(level * 340))
      barRef.current?.style.setProperty('--level', `${percent}%`)

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    void context.resume().catch(() => {})

    return () => {
      cancelAnimationFrame(frame)
      source.disconnect()
      analyser.disconnect()
      void context.close().catch(() => {})
    }
  }, [stream, active])

  return (
    <div className="mic-meter" data-active={active}>
      <span className="mic-meter__track">
        <span ref={barRef} className="mic-meter__bar" />
      </span>
      <span className="mic-meter__label">{active ? 'Input' : 'No input'}</span>
    </div>
  )
}
