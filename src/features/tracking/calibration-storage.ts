import type { HeadCalibration } from './head-pose.ts'

const STORAGE_KEY = 'portico:gaze-calibration'
const STORAGE_VERSION = 1

const NUMBER_FIELDS: ReadonlyArray<keyof HeadCalibration> = [
  'yawSlope',
  'yawOffset',
  'pitchSlope',
  'pitchOffset',
  'sensitivityX',
  'sensitivityY',
  'cursorSmoothing',
  'irisYawSign',
  'irisPitchSign',
  'irisYawCenter',
  'irisPitchCenter',
  'headYawSlope',
  'headYawOffset',
  'headPitchSlope',
  'headPitchOffset',
  'rmseX',
  'rmseY',
  'createdAt',
]

export interface CalibrationStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPlausibleCalibration(value: unknown): value is HeadCalibration {
  if (!isRecord(value)) return false
  if (!NUMBER_FIELDS.every((field) => isFiniteNumber(value[field]))) {
    return false
  }

  const calibration = value as unknown as HeadCalibration
  return (
    Math.abs(calibration.yawSlope) > 1e-6 &&
    Math.abs(calibration.pitchSlope) > 1e-6 &&
    Math.abs(calibration.headYawSlope) > 1e-6 &&
    Math.abs(calibration.headPitchSlope) > 1e-6 &&
    calibration.sensitivityX >= 0.1 &&
    calibration.sensitivityX <= 3 &&
    calibration.sensitivityY >= 0.1 &&
    calibration.sensitivityY <= 3 &&
    calibration.cursorSmoothing >= 0 &&
    calibration.cursorSmoothing <= 1 &&
    (calibration.irisYawSign === 0 || calibration.irisYawSign === 1) &&
    (calibration.irisPitchSign === 0 || calibration.irisPitchSign === 1) &&
    calibration.rmseX >= 0 &&
    calibration.rmseY >= 0 &&
    calibration.createdAt > 0
  )
}

/** Parse and validate a calibration written by a previous visit. */
export function parseStoredCalibration(
  raw: string | null,
): HeadCalibration | null {
  if (!raw) return null

  try {
    const stored: unknown = JSON.parse(raw)
    if (!isRecord(stored) || stored.version !== STORAGE_VERSION) return null
    if (!isPlausibleCalibration(stored.calibration)) return null
    return stored.calibration
  } catch {
    return null
  }
}

function browserStorage(): CalibrationStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadCalibration(
  storage: CalibrationStorage | null = browserStorage(),
): HeadCalibration | null {
  if (!storage) return null

  try {
    return parseStoredCalibration(storage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveCalibration(
  calibration: HeadCalibration,
  storage: CalibrationStorage | null = browserStorage(),
): void {
  if (!storage) return

  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, calibration }),
    )
  } catch {
    // Private browsing and full quotas can make storage unavailable. Gaze
    // still works for this session; only the next visit has to recalibrate.
  }
}
