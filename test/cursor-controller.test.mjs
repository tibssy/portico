import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CursorController,
  DEFAULT_CURSOR_CONFIG,
  cursorConfigFor,
} from '../src/features/tracking/cursor-controller.ts'

test('cursorConfigFor clamps the slider and keeps the middle responsive', () => {
  const middle = cursorConfigFor(0.5)
  assert.equal(
    middle.x.inputTimeConstant,
    DEFAULT_CURSOR_CONFIG.x.inputTimeConstant,
  )
  assert.equal(middle.x.speedAdaptive, 2.75)

  const snappy = cursorConfigFor(-2)
  const steady = cursorConfigFor(2)
  assert.ok(snappy.x.inputTimeConstant < middle.x.inputTimeConstant)
  assert.ok(steady.x.inputTimeConstant > middle.x.inputTimeConstant)
  assert.ok(steady.x.deadband > snappy.x.deadband)

  const fallback = cursorConfigFor(Number.NaN)
  assert.equal(fallback.x.inputTimeConstant, middle.x.inputTimeConstant)
})

test('CursorController seeds at the target and follows it smoothly', () => {
  const cursor = new CursorController(DEFAULT_CURSOR_CONFIG)

  assert.deepEqual(cursor.step({ x: 0.8, y: 0.2 }, 0.016), {
    x: 0.8,
    y: 0.2,
  })

  const firstMove = cursor.step({ x: 0.9, y: 0.1 }, 0.016)
  assert.ok(firstMove.x > 0.8 && firstMove.x < 0.9)
  assert.ok(firstMove.y > 0.1 && firstMove.y < 0.2)

  for (let index = 0; index < 300; index += 1) {
    cursor.step({ x: 0.9, y: 0.1 }, 0.016)
  }

  const settled = cursor.step({ x: 0.9, y: 0.1 }, 0.016)
  assert.ok(Math.abs(settled.x - 0.9) < 0.01)
  assert.ok(Math.abs(settled.y - 0.1) < 0.01)
})

test('CursorController clamps inputs and resets to the centre', () => {
  const cursor = new CursorController()

  assert.deepEqual(cursor.step({ x: 2, y: -1 }, 0.016), { x: 1, y: 0 })
  cursor.reset()

  const afterReset = cursor.step({ x: 0.5, y: 0.5 }, 0.016)
  assert.deepEqual(afterReset, { x: 0.5, y: 0.5 })
})
