export interface Capabilities {
  /** getUserMedia is available and the page is in a secure context. */
  media: boolean
  /** Camera is useful on this device (touch devices get voice only). */
  camera: boolean
  microphone: boolean
  webgpu: boolean
  /** Head-pose navigation is a desktop interaction. */
  headTracking: boolean
  speechRecognition: boolean
  touchMode: boolean
}

type GpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: () => Promise<unknown | null>
  }
}

/**
 * Touch-first devices, including narrow windows, skip camera access and head
 * tracking. The viewport check also covers emulators that report a fine pointer.
 */
export function isTouchMode(): boolean {
  if (typeof window === 'undefined') return false

  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 720px)').matches
  )
}

export async function detectWebGpu(): Promise<boolean> {
  const gpu = (navigator as GpuNavigator).gpu
  if (!gpu) return false

  try {
    const adapter = await gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

export function hasSpeechRecognition(): boolean {
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
}

export async function detectCapabilities(): Promise<Capabilities> {
  const secure = window.isSecureContext
  const media = Boolean(navigator.mediaDevices?.getUserMedia) && secure
  const touchMode = isTouchMode()
  const webgpu = await detectWebGpu()

  return {
    media,
    camera: media && !touchMode,
    microphone: media,
    webgpu,
    headTracking: media && !touchMode,
    speechRecognition: hasSpeechRecognition(),
    touchMode,
  }
}
