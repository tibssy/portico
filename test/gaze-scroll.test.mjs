import test from 'node:test'
import assert from 'node:assert/strict'
import {
  centeredScrollTop,
  clippedAmount,
  edgeScrollBand,
  scrollIntensity,
} from '../src/features/tracking/gaze-scroll.ts'

const VIEWPORT = 900
const TOP_OFFSET = 72
const ZONE = (VIEWPORT - TOP_OFFSET) * 0.1

test('edgeScrollBand finds the top and bottom bands below the header', () => {
  assert.deepEqual(edgeScrollBand(TOP_OFFSET, VIEWPORT, TOP_OFFSET), {
    direction: 'up',
    depth: 1,
  })

  const upperMiddle = edgeScrollBand(
    TOP_OFFSET + ZONE / 2,
    VIEWPORT,
    TOP_OFFSET,
  )
  assert.equal(upperMiddle?.direction, 'up')
  assert.ok(Math.abs(upperMiddle.depth - 0.5) < 1e-9)

  assert.equal(edgeScrollBand(450, VIEWPORT, TOP_OFFSET), null)

  const lowerMiddle = edgeScrollBand(
    VIEWPORT - ZONE / 2,
    VIEWPORT,
    TOP_OFFSET,
  )
  assert.equal(lowerMiddle?.direction, 'down')
  assert.ok(Math.abs(lowerMiddle.depth - 0.5) < 1e-9)

  const bottom = edgeScrollBand(VIEWPORT, VIEWPORT, TOP_OFFSET)
  assert.equal(bottom?.direction, 'down')
  assert.ok(Math.abs(bottom.depth - 1) < 1e-9)
})

test('edgeScrollBand keeps a usable minimum height on short viewports', () => {
  const band = edgeScrollBand(TOP_OFFSET + 12, 200, TOP_OFFSET)
  assert.equal(band?.direction, 'up')
  assert.ok(Math.abs(band.depth - 0.5) < 1e-9)
})

test('scrollIntensity clamps and eases the raw band depth', () => {
  assert.equal(scrollIntensity(-0.5), 0)
  assert.equal(scrollIntensity(0), 0)
  assert.equal(scrollIntensity(0.5), 0.5)
  assert.equal(scrollIntensity(1), 1)
  assert.equal(scrollIntensity(1.5), 1)
})

test('clippedAmount counts the worst obscured edge', () => {
  assert.equal(clippedAmount({ top: 80, bottom: 300 }, VIEWPORT, TOP_OFFSET), 0)
  assert.equal(clippedAmount({ top: 50, bottom: 300 }, VIEWPORT, TOP_OFFSET), 22)
  assert.equal(
    clippedAmount({ top: 200, bottom: 950 }, VIEWPORT, TOP_OFFSET),
    50,
  )
})

test('centeredScrollTop centers a card and clamps to the page', () => {
  const centered = centeredScrollTop(
    { top: 400, height: 200 },
    VIEWPORT,
    100,
    TOP_OFFSET,
    2000,
  )
  assert.equal(centered, 114)

  assert.equal(
    centeredScrollTop({ top: 0, height: 100 }, VIEWPORT, 0, TOP_OFFSET, 2000),
    0,
  )
  assert.equal(
    centeredScrollTop(
      { top: 2000, height: 100 },
      VIEWPORT,
      0,
      TOP_OFFSET,
      500,
    ),
    500,
  )
})
