import type { FaceLandmarker, FaceLandmarkerOptions } from '@mediapipe/tasks-vision'

let landmarkerPromise: Promise<FaceLandmarker> | null = null

function assets() {
  const base = `${import.meta.env.BASE_URL}mediapipe`
  return {
    wasm: `${base}/wasm`,
    model: `${base}/face_landmarker.task`,
  }
}

async function createLandmarker(): Promise<FaceLandmarker> {
  // MediaPipe is only needed once tracking starts, so keep it out of the
  // landing and device-check bundles.
  const { FaceLandmarker: Landmarker, FilesetResolver } = await import(
    '@mediapipe/tasks-vision'
  )
  const { wasm, model } = assets()
  const fileset = await FilesetResolver.forVisionTasks(wasm)
  const options: FaceLandmarkerOptions = {
    baseOptions: {
      modelAssetPath: model,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }

  try {
    return await Landmarker.createFromOptions(fileset, options)
  } catch {
    // WebGL is not available in every browser or virtual machine. The CPU
    // delegate is slower but keeps head tracking working.
    return Landmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: {
        modelAssetPath: model,
        delegate: 'CPU',
      },
    })
  }
}

/** Load once and share the landmarker across calibration and the shop. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker().catch((error: unknown) => {
      landmarkerPromise = null
      throw error
    })
  }

  return landmarkerPromise
}
