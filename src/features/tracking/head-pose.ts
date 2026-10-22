const RAD_TO_DEG = 180 / Math.PI

export interface HeadPose {
  /** Horizontal head rotation in radians. */
  yaw: number
  /** Vertical head rotation in radians. */
  pitch: number
  /** Head tilt in radians. */
  roll: number
  /** Raw eye-in-head rotation in radians. */
  eyeYaw: number
  /** Raw eye-in-head rotation in radians. */
  eyePitch: number
  /** How much the iris estimate contributes, from 0 to 1. */
  irisConfidence: number
}

export interface CalibrationPoint {
  targetX: number
  targetY: number
  yaw: number
  pitch: number
  /** Raw iris-derived eye angle at the calibration target. */
  eyeYaw: number
  eyePitch: number
  /** Iris availability while this target was sampled, from 0 to 1. */
  irisConfidence: number
}

export interface HeadCalibration {
  yawSlope: number
  yawOffset: number
  pitchSlope: number
  pitchOffset: number
  /** Horizontal gain around the screen centre. 1 = the calibrated range. */
  sensitivityX: number
  /** Vertical gain around the screen centre. 1 = the calibrated range. */
  sensitivityY: number
  /** Cursor filtering: 0 = snappy, 0.5 = default, 1 = steady. */
  cursorSmoothing: number
  /** 1 enables the iris yaw contribution after calibration; 0 disables it. */
  irisYawSign: number
  /** 1 enables the iris pitch contribution after calibration; 0 disables it. */
  irisPitchSign: number
  /** Eye angles at the centre target, removed so head-only fallback is neutral. */
  irisYawCenter: number
  irisPitchCenter: number
  /** Head-only fit used when the iris signal fades out. */
  headYawSlope: number
  headYawOffset: number
  headPitchSlope: number
  headPitchOffset: number
  rmseX: number
  rmseY: number
  createdAt: number
}

export interface ScreenPoint {
  x: number
  y: number
}

/** Fixed blend weight for the eye-in-head signal once it is calibrated. */
export const IRIS_GAZE_WEIGHT = 0.85

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function toDegrees(radians: number): number {
  return radians * RAD_TO_DEG
}

/**
 * MediaPipe returns a column-major 4x4 transform from the canonical face
 * model to camera space. Extract ZYX Euler angles after removing scale.
 *
 * Yaw is the horizontal turn, pitch is the nod, and roll is the head tilt.
 * Signs depend on the camera's handedness; calibration removes any offset.
 */
export function poseFromMatrix(data: ArrayLike<number>): HeadPose | null {
  if (data.length < 12) return null

  const m00 = data[0]
  const m10 = data[1]
  const m20 = data[2]

  const m01 = data[4]
  const m11 = data[5]
  const m21 = data[6]

  const m02 = data[8]
  const m12 = data[9]
  const m22 = data[10]

  const scaleX = Math.hypot(m00, m10, m20) || 1
  const scaleY = Math.hypot(m01, m11, m21) || 1
  const scaleZ = Math.hypot(m02, m12, m22) || 1

  const r00 = m00 / scaleX
  const r10 = m10 / scaleX
  const r20 = m20 / scaleX
  const r01 = m01 / scaleY
  const r11 = m11 / scaleY
  const r21 = m21 / scaleY
  const r22 = m22 / scaleZ

  const yaw = Math.asin(clamp(-r20, -1, 1))
  const cosYaw = Math.cos(yaw)
  const pitch =
    Math.abs(cosYaw) > 1e-6 ? Math.atan2(r21, r22) : 0
  const roll =
    Math.abs(cosYaw) > 1e-6
      ? Math.atan2(r10, r00)
      : Math.atan2(-r01, r11)

  return { yaw, pitch, roll, eyeYaw: 0, eyePitch: 0, irisConfidence: 0 }
}

interface LinearFit {
  slope: number
  offset: number
  rmse: number
}

function linearFit(xs: number[], ys: number[]): LinearFit | null {
  const count = xs.length
  if (count < 3 || ys.length !== count) return null

  let sumX = 0
  let sumY = 0

  for (let index = 0; index < count; index += 1) {
    sumX += xs[index]
    sumY += ys[index]
  }

  const meanX = sumX / count
  const meanY = sumY / count

  let numerator = 0
  let denominator = 0

  for (let index = 0; index < count; index += 1) {
    const deltaX = xs[index] - meanX
    numerator += deltaX * (ys[index] - meanY)
    denominator += deltaX * deltaX
  }

  if (denominator < 1e-10) return null

  const slope = numerator / denominator
  const offset = meanY - slope * meanX

  let squaredError = 0

  for (let index = 0; index < count; index += 1) {
    const error = ys[index] - (slope * xs[index] + offset)
    squaredError += error * error
  }

  return {
    slope,
    offset,
    rmse: Math.sqrt(squaredError / count),
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0

  const position = (sorted.length - 1) * fraction
  const lower = Math.floor(position)
  const upper = sorted[lower + 1]

  if (upper === undefined) return sorted[lower]
  return sorted[lower] + (upper - sorted[lower]) * (position - lower)
}

/** Interquartile range; ignores a few bad frames better than min/max. */
export function interquartileRange(values: number[]): number {
  if (values.length < 2) return 0

  const sorted = [...values].sort((a, b) => a - b)
  return quantile(sorted, 0.75) - quantile(sorted, 0.25)
}

/**
 * Largest per-axis spread while a calibration point is held. A few outlier
 * frames are ignored, so this measures whether the head was still moving
 * rather than whether the detector produced one bad frame.
 */
export function poseSpread(
  samples: Array<Pick<HeadPose, 'yaw' | 'pitch'>>,
): number {
  if (samples.length < 4) return Number.POSITIVE_INFINITY

  return Math.max(
    interquartileRange(samples.map((sample) => sample.yaw)),
    interquartileRange(samples.map((sample) => sample.pitch)),
  )
}

function span(values: number[]): number {
  return Math.max(...values) - Math.min(...values)
}

/**
 * Fit screen coordinates from five (or more) target/pose pairs. The head and
 * eye signals share one linear axis. MediaPipe's head-pose axes and the
 * eye-local iris axes have the same orientation, so a positive eye angle adds
 * to a positive head angle; an axis is enabled only when the eyes moved enough
 * to contribute and when it does not make the fit worse. Returns null when the
 * movement or the fit is too weak to be useful.
 */
export function fitCalibration(
  points: CalibrationPoint[],
): HeadCalibration | null {
  if (points.length < 5) return null

  const headYaw = points.map((point) => point.yaw)
  const headPitch = points.map((point) => point.pitch)
  const targetsX = points.map((point) => point.targetX)
  const targetsY = points.map((point) => point.targetY)

  // Use the centre target as the neutral eye position. Removing this offset
  // means a missing iris does not shift the cursor away from the head-only
  // position, and the large natural bias of the vertical iris signal is not
  // mistaken for looking far up or down.
  const centrePoint = points.reduce((best, point) => {
    const distance =
      (point.targetX - 0.5) ** 2 + (point.targetY - 0.5) ** 2
    const bestDistance =
      (best.targetX - 0.5) ** 2 + (best.targetY - 0.5) ** 2
    return distance < bestDistance ? point : best
  })
  const validIris = points.filter((point) => point.irisConfidence > 0)
  const irisYawCenter =
    centrePoint.irisConfidence > 0
      ? centrePoint.eyeYaw
      : median(validIris.map((point) => point.eyeYaw))
  const irisPitchCenter =
    centrePoint.irisConfidence > 0
      ? centrePoint.eyePitch
      : median(validIris.map((point) => point.eyePitch))

  const eyeYaw = points.map(
    (point) =>
      (point.eyeYaw - irisYawCenter) * point.irisConfidence,
  )
  const eyePitch = points.map(
    (point) =>
      (point.eyePitch - irisPitchCenter) * point.irisConfidence,
  )

  const headXFit = linearFit(headYaw, targetsX)
  const headYFit = linearFit(headPitch, targetsY)
  if (!headXFit || !headYFit) return null

  const yawSpan = span(headYaw)
  const pitchSpan = span(headPitch)

  // Roughly 4.5 degrees of yaw and 3.5 degrees of pitch. Less than that is
  // usually sensor jitter, and the mapping would be unstable.
  if (yawSpan < 0.08 || pitchSpan < 0.06) return null

  // The landmark axes are already aligned: iris movement to image-right and
  // head yaw to image-right both increase, and looking up decreases both
  // pitch angles. Only enable an axis once the eyes actually moved enough for
  // the contribution to be meaningful.
  let irisYawSign = span(eyeYaw) > 0.02 ? 1 : 0
  let irisPitchSign = span(eyePitch) > 0.02 ? 1 : 0

  const fitWithIris = () => {
    const combinedYaw = points.map(
      (point, index) =>
        point.yaw +
        eyeYaw[index] * irisYawSign * IRIS_GAZE_WEIGHT,
    )
    const combinedPitch = points.map(
      (point, index) =>
        point.pitch +
        eyePitch[index] * irisPitchSign * IRIS_GAZE_WEIGHT,
    )

    return {
      yaw: span(combinedYaw),
      pitch: span(combinedPitch),
      x: linearFit(combinedYaw, targetsX),
      y: linearFit(combinedPitch, targetsY),
    }
  }

  let combined = fitWithIris()
  if (!combined.x || !combined.y) return null

  // Do not let noisy iris landmarks degrade an already-good head fit.
  if (combined.x.rmse > headXFit.rmse + 0.02) {
    irisYawSign = 0
    combined = fitWithIris()
    if (!combined.x || !combined.y) return null
  }
  if (combined.y.rmse > headYFit.rmse + 0.02) {
    irisPitchSign = 0
    combined = fitWithIris()
  }

  if (!combined.x || !combined.y) return null
  if (combined.yaw < 0.08 || combined.pitch < 0.06) return null
  if (combined.x.rmse > 0.16 || combined.y.rmse > 0.16) return null

  return {
    yawSlope: combined.x.slope,
    yawOffset: combined.x.offset,
    pitchSlope: combined.y.slope,
    pitchOffset: combined.y.offset,
    sensitivityX: 1,
    sensitivityY: 1,
    cursorSmoothing: 0.5,
    irisYawSign,
    irisPitchSign,
    irisYawCenter,
    irisPitchCenter,
    headYawSlope: headXFit.slope,
    headYawOffset: headXFit.offset,
    headPitchSlope: headYFit.slope,
    headPitchOffset: headYFit.offset,
    rmseX: combined.x.rmse,
    rmseY: combined.y.rmse,
    createdAt: Date.now(),
  }
}

export function mapPose(
  pose: HeadPose,
  calibration: HeadCalibration,
): ScreenPoint {
  // The fit maps the calibrated head and eye range to the full viewport.
  // Sensitivity scales that motion around the centre, so a lower value means
  // the visitor turns or glances a little further to reach the edges.
  const irisConfidence = clamp01(pose.irisConfidence)
  const eyeYaw =
    calibration.irisYawSign !== 0
      ? (pose.eyeYaw - calibration.irisYawCenter) *
        calibration.irisYawSign *
        IRIS_GAZE_WEIGHT
      : 0
  const eyePitch =
    calibration.irisPitchSign !== 0
      ? (pose.eyePitch - calibration.irisPitchCenter) *
        calibration.irisPitchSign *
        IRIS_GAZE_WEIGHT
      : 0
  const hybridX =
    (pose.yaw + eyeYaw) * calibration.yawSlope + calibration.yawOffset
  const hybridY =
    (pose.pitch + eyePitch) * calibration.pitchSlope +
    calibration.pitchOffset
  const headX =
    pose.yaw * calibration.headYawSlope + calibration.headYawOffset
  const headY =
    pose.pitch * calibration.headPitchSlope + calibration.headPitchOffset
  // Fade between the head-only fit and the blended fit as iris confidence
  // changes, so a blink or a missing iris never strands the cursor.
  const rawX = hybridX * irisConfidence + headX * (1 - irisConfidence)
  const rawY = hybridY * irisConfidence + headY * (1 - irisConfidence)

  return {
    x: clamp01(0.5 + (rawX - 0.5) * calibration.sensitivityX),
    y: clamp01(0.5 + (rawY - 0.5) * calibration.sensitivityY),
  }
}
