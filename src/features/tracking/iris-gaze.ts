import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export interface IrisGaze {
  /** Horizontal eye-in-head angle in radians. */
  eyeYaw: number
  /** Vertical eye-in-head angle in radians. */
  eyePitch: number
  /** How much to trust the eye angles, from 0 to 1. */
  confidence: number
}

/**
 * MediaPipe's 478-point face mesh adds an iris ring to each eye. The eye
 * corners and lids are used to express the iris position in eye-local
 * coordinates, so the result does not depend on face size or head roll.
 */
const LEFT_EYE_CORNERS = [33, 133] as const
const RIGHT_EYE_CORNERS = [362, 263] as const
const LEFT_EYE_LIDS = [159, 145] as const
const RIGHT_EYE_LIDS = [386, 374] as const
const LEFT_IRIS = [468, 469, 470, 471, 472] as const
const RIGHT_IRIS = [473, 474, 475, 476, 477] as const
const IRIS_LANDMARK_COUNT = 478

/** Approximate radians covered when the iris reaches an eye corner. */
const EYE_YAW_GAIN = 0.95
/** Iris travel is small vertically; scale it into a comparable eye angle. */
const EYE_PITCH_GAIN = 2.6
/** Closed or heavily occluded eyes are not useful for gaze estimation. */
const MIN_EYE_OPENNESS = 0.08
/** Ignore implausible iris positions rather than feeding an outlier forward. */
const MAX_IRIS_U = 0.2
const MAX_IRIS_V = 0.35

interface EyeSample {
  /** Iris position from the image-left corner (0) to the image-right (1). */
  u: number
  /** Iris position perpendicular to the eye line, normalised by eye width. */
  v: number
  /** Eye height divided by eye width. */
  openness: number
}

function meanPoint(
  landmarks: NormalizedLandmark[],
  indices: readonly number[],
): NormalizedLandmark | null {
  let x = 0
  let y = 0

  for (const index of indices) {
    const point = landmarks[index]
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null
    }
    x += point.x
    y += point.y
  }

  return { x: x / indices.length, y: y / indices.length, z: 0, visibility: 1 }
}

function sampleEye(
  landmarks: NormalizedLandmark[],
  corners: readonly [number, number],
  lids: readonly [number, number],
  irisIndices: readonly number[],
): EyeSample | null {
  const cornerA = landmarks[corners[0]]
  const cornerB = landmarks[corners[1]]
  const upper = landmarks[lids[0]]
  const lower = landmarks[lids[1]]
  const iris = meanPoint(landmarks, irisIndices)

  if (!cornerA || !cornerB || !upper || !lower || !iris) return null

  // Always orient the eye line from image-left to image-right. That keeps the
  // horizontal iris direction consistent between the two eyes.
  const start = cornerA.x <= cornerB.x ? cornerA : cornerB
  const end = cornerA.x <= cornerB.x ? cornerB : cornerA
  const dx = end.x - start.x
  const dy = end.y - start.y
  const width = Math.hypot(dx, dy)
  if (!Number.isFinite(width) || width < 1e-5) return null

  const openness =
    Math.hypot(upper.x - lower.x, upper.y - lower.y) / width
  if (!Number.isFinite(openness) || openness < MIN_EYE_OPENNESS) return null

  const u =
    ((iris.x - start.x) * dx + (iris.y - start.y) * dy) / (width * width)
  // Perpendicular to the eye line, positive downward in image coordinates.
  const nx = -dy / width
  const ny = dx / width
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  const v = ((iris.x - midX) * nx + (iris.y - midY) * ny) / width

  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    u < -MAX_IRIS_U ||
    u > 1 + MAX_IRIS_U ||
    v < -MAX_IRIS_V ||
    v > MAX_IRIS_V
  ) {
    return null
  }

  return { u, v, openness }
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * Convert the iris landmarks into a raw eye-in-head angle plus a confidence.
 * Returns null when the model has no iris landmarks or both eyes are closed.
 */
export function irisFromLandmarks(
  landmarks: NormalizedLandmark[] | undefined,
): IrisGaze | null {
  if (!landmarks || landmarks.length < IRIS_LANDMARK_COUNT) return null

  const left = sampleEye(
    landmarks,
    LEFT_EYE_CORNERS,
    LEFT_EYE_LIDS,
    LEFT_IRIS,
  )
  const right = sampleEye(
    landmarks,
    RIGHT_EYE_CORNERS,
    RIGHT_EYE_LIDS,
    RIGHT_IRIS,
  )
  const eyes = [left, right].filter((eye): eye is EyeSample => eye !== null)

  if (eyes.length === 0) return null

  const u = average(eyes.map((eye) => eye.u))
  const v = average(eyes.map((eye) => eye.v))
  const agreement =
    eyes.length === 2
      ? Math.abs(eyes[0].u - eyes[1].u) + Math.abs(eyes[0].v - eyes[1].v)
      : 0

  // One eye is still useful, but a large disagreement usually means a
  // reflection or an occluded eye. Fall back toward the head in that case.
  let confidence = eyes.length === 2 ? 1 : 0.55
  if (agreement > 0.45) confidence *= 0.55

  return {
    eyeYaw: (u - 0.5) * EYE_YAW_GAIN,
    eyePitch: v * EYE_PITCH_GAIN,
    confidence,
  }
}
