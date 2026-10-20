import { useEffect, useState } from 'react'
import { detectCapabilities } from './capabilities.ts'
import type { Capabilities } from './capabilities.ts'

/** Probes device support once per mount. Never prompts for permission. */
export function useCapabilities(): Capabilities | null {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)

  useEffect(() => {
    let alive = true

    void detectCapabilities().then((result) => {
      if (alive) setCapabilities(result)
    })

    return () => {
      alive = false
    }
  }, [])

  return capabilities
}
