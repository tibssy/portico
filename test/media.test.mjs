import test from 'node:test'
import assert from 'node:assert/strict'
import { hasLiveTrack } from '../src/lib/media.ts'

function fakeStream(tracks) {
  return { getTracks: () => tracks }
}

test('hasLiveTrack ignores ended tracks and missing streams', () => {
  assert.equal(hasLiveTrack(null, 'video'), false)
  assert.equal(hasLiveTrack(fakeStream([]), 'video'), false)

  const endedVideo = { kind: 'video', readyState: 'ended' }
  assert.equal(hasLiveTrack(fakeStream([endedVideo]), 'video'), false)

  const liveVideo = { kind: 'video', readyState: 'live' }
  assert.equal(hasLiveTrack(fakeStream([endedVideo, liveVideo]), 'video'), true)

  // A live camera does not make the microphone look connected.
  assert.equal(hasLiveTrack(fakeStream([liveVideo]), 'audio'), false)
})
