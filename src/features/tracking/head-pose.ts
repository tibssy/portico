const RAD_TO_DEG = 180 / Math.PI

export interface HeadPose {
  /** Horizontal head rotation in radians. */
  yaw: number
  /** Vertical head rotation in radians. */
  pitch: number
  /** Head tilt in radians. */
  roll: number
}

export interface CalibrationPoint {
  targetX: number
  targetY: number
  yaw: number
  pitch: number
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
  rmseX: number
  rmseY: number
  createdAt: number
}

export interface ScreenPoint {
  x: number
  y: number
}

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

  return { yaw, pitch, roll }
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

/**
 * Fit screen coordinates from five (or more) target/pose pairs. A linear fit
 * per axis is enough for head orientation and tolerates asymmetric ranges.
 * Returns null when the movement or the fit is too weak to be useful.
 */
export function fitCalibration(
  points: CalibrationPoint[],
): HeadCalibration | null {
  if (points.length < 5) return null

  const xFit = linearFit(
    points.map((point) => point.yaw),
    points.map((point) => point.targetX),
  )
  const yFit = linearFit(
    points.map((point) => point.pitch),
    points.map((point) => point.targetY),
  )

  if (!xFit || !yFit) return null

  const yawSpan =
    Math.max(...points.map((point) => point.yaw)) -
    Math.min(...points.map((point) => point.yaw))
  const pitchSpan =
    Math.max(...points.map((point) => point.pitch)) -
    Math.min(...points.map((point) => point.pitch))

  // Roughly 4.5 degrees of yaw and 3.5 degrees of pitch. Less than that is
  // usually sensor jitter, and the mapping would be unstable.
  if (yawSpan < 0.08 || pitchSpan < 0.06) return null
  if (xFit.rmse > 0.16 || yFit.rmse > 0.16) return null

  return {
    yawSlope: xFit.slope,
    yawOffset: xFit.offset,
    pitchSlope: yFit.slope,
    pitchOffset: yFit.offset,
    sensitivityX: 1,
    sensitivityY: 1,
    cursorSmoothing: 0.5,
    rmseX: xFit.rmse,
    rmseY: yFit.rmse,
    createdAt: Date.now(),
  }
}

export function mapPose(
  pose: HeadPose,
  calibration: HeadCalibration,
): ScreenPoint {
  // The fit maps the calibrated head range to the full viewport. Sensitivity
  // scales that motion around the centre, so a lower value means the visitor
  // turns a little further to reach the edges.
  const rawX = pose.yaw * calibration.yawSlope + calibration.yawOffset
  const rawY = pose.pitch * calibration.pitchSlope + calibration.pitchOffset

  return {
    x: clamp01(0.5 + (rawX - 0.5) * calibration.sensitivityX),
    y: clamp01(0.5 + (rawY - 0.5) * calibration.sensitivityY),
  }
}
