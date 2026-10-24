import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadCalibration,
  parseStoredCalibration,
  saveCalibration,
} from '../src/features/tracking/calibration-storage.ts'

const CALIBRATION = {
  yawSlope: 1.5,
  yawOffset: 0.5,
  pitchSlope: -1.2,
  pitchOffset: 0.45,
  sensitivityX: 1,
  sensitivityY: 1,
  cursorSmoothing: 0.5,
  irisYawSign: 1,
  irisPitchSign: 0,
  irisYawCenter: 0.01,
  irisPitchCenter: -0.02,
  headYawSlope: 1.4,
  headYawOffset: 0.5,
  headPitchSlope: -1.1,
  headPitchOffset: 0.45,
  rmseX: 0.04,
  rmseY: 0.05,
  createdAt: 123456789,
}

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

test('calibration storage round-trips a valid mapping', () => {
  const storage = memoryStorage()
  saveCalibration(CALIBRATION, storage)
  assert.deepEqual(loadCalibration(storage), CALIBRATION)
})

test('parseStoredCalibration rejects missing, stale, or implausible data', () => {
  assert.equal(parseStoredCalibration(null), null)
  assert.equal(parseStoredCalibration('not json'), null)
  assert.equal(
    parseStoredCalibration(
      JSON.stringify({ version: 2, calibration: CALIBRATION }),
    ),
    null,
  )
  assert.equal(
    parseStoredCalibration(
      JSON.stringify({
        version: 1,
        calibration: { ...CALIBRATION, yawSlope: 0 },
      }),
    ),
    null,
  )
  assert.equal(
    parseStoredCalibration(
      JSON.stringify({
        version: 1,
        calibration: { ...CALIBRATION, sensitivityX: 0 },
      }),
    ),
    null,
  )
  assert.equal(
    parseStoredCalibration(
      JSON.stringify({ version: 1, calibration: { ...CALIBRATION, rmseY: -1 } }),
    ),
    null,
  )
  assert.equal(
    parseStoredCalibration(
      JSON.stringify({ version: 1, calibration: { ...CALIBRATION, irisYawSign: 2 } }),
    ),
    null,
  )
})

test('storage failures do not break gaze for the current session', () => {
  const unavailable = {
    getItem() {
      throw new Error('storage blocked')
    },
    setItem() {
      throw new Error('storage blocked')
    },
  }

  assert.doesNotThrow(() => saveCalibration(CALIBRATION, unavailable))
  assert.equal(loadCalibration(unavailable), null)
})
