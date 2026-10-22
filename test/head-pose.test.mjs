import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fitCalibration,
  interquartileRange,
  mapPose,
  median,
  poseFromMatrix,
  poseSpread,
} from '../src/features/tracking/head-pose.ts'

test('median handles empty, odd, and even samples', () => {
  assert.equal(median([]), 0)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
})

test('interquartileRange ignores outliers and survives tiny samples', () => {
  assert.equal(interquartileRange([0, 1, 2, 3, 4]), 2)
  assert.equal(interquartileRange([0, 0, 0, 0, 100]), 0)
  assert.equal(interquartileRange([7]), 0)
  assert.equal(interquartileRange([]), 0)
})

test('poseSpread measures movement rather than a single bad frame', () => {
  const still = [
    { yaw: 0, pitch: 0 },
    { yaw: 0.001, pitch: -0.001 },
    { yaw: -0.001, pitch: 0.002 },
    { yaw: 0.0005, pitch: -0.0005 },
    { yaw: 0.002, pitch: 0.001 },
  ]
  assert.ok(poseSpread(still) < 0.01)

  const moving = still.map((sample, index) => ({
    yaw: sample.yaw + index * 0.04,
    pitch: sample.pitch,
  }))
  assert.ok(poseSpread(moving) > 0.05)
  assert.equal(poseSpread(still.slice(0, 3)), Number.POSITIVE_INFINITY)
})

test('poseFromMatrix extracts neutral angles from an identity matrix', () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const pose = poseFromMatrix(identity)
  assert.ok(pose)
  assert.ok(Math.abs(pose.yaw) < 1e-12)
  assert.ok(Math.abs(pose.pitch) < 1e-12)
  assert.ok(Math.abs(pose.roll) < 1e-12)
  assert.equal(pose.eyeYaw, 0)
  assert.equal(pose.eyePitch, 0)
  assert.equal(pose.irisConfidence, 0)
  assert.equal(poseFromMatrix([1, 0, 0]), null)
})

test('fitCalibration recovers a simple head-only mapping', () => {
  const targets = [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.2],
    [0.2, 0.8],
    [0.8, 0.8],
  ]
  const points = targets.map(([targetX, targetY]) => ({
    targetX,
    targetY,
    yaw: (targetX - 0.5) / 2,
    pitch: (targetY - 0.5) / 2.5,
    eyeYaw: 0,
    eyePitch: 0,
    irisConfidence: 0,
  }))

  const calibration = fitCalibration(points)
  assert.ok(calibration)
  assert.ok(Math.abs(calibration.yawSlope - 2) < 1e-9)
  assert.ok(Math.abs(calibration.yawOffset - 0.5) < 1e-9)
  assert.ok(Math.abs(calibration.pitchSlope - 2.5) < 1e-9)
  assert.ok(Math.abs(calibration.pitchOffset - 0.5) < 1e-9)
  assert.ok(calibration.rmseX < 1e-9)
  assert.ok(calibration.rmseY < 1e-9)

  const mapped = mapPose(
    { yaw: 0.15, pitch: -0.1, roll: 0, eyeYaw: 0, eyePitch: 0, irisConfidence: 0 },
    calibration,
  )
  assert.ok(Math.abs(mapped.x - 0.8) < 1e-9)
  assert.ok(Math.abs(mapped.y - 0.25) < 1e-9)
})

test('fitCalibration rejects too few points or too little movement', () => {
  const point = {
    targetX: 0.5,
    targetY: 0.5,
    yaw: 0,
    pitch: 0,
    eyeYaw: 0,
    eyePitch: 0,
    irisConfidence: 0,
  }

  assert.equal(fitCalibration([point]), null)
  assert.equal(fitCalibration(Array.from({ length: 5 }, () => point)), null)
})
