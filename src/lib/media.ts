/**
 * `getVideoTracks()` and `getAudioTracks()` keep ended tracks in the stream.
 * UI that asks whether a sensor is available should look at `readyState`
 * instead of the array length.
 */
export function hasLiveTrack(
  stream: MediaStream | null,
  kind: 'audio' | 'video',
): boolean {
  return Boolean(
    stream
      ?.getTracks()
      .some((track) => track.kind === kind && track.readyState === 'live'),
  )
}
