# Portico

An experimental storefront you can browse with your head and voice.

- **Look** — head-pose estimation from the webcam brings a product to the centre of a curved carousel.
- **Speak** — an on-device speech model (Parakeet Redux) transcribes requests without uploading audio.
- **Discover** — a shop assistant appears when you linger, with the product you are looking at in context.

This is a prototype. The entrance is built; the carousel, calibration, and assistant are next.

## Status

| Piece | State |
| --- | --- |
| Landing page, routing, session guards | done |
| Camera + microphone permissions, device check, degraded modes | done |
| Head-pose capture and calibration | next |
| Curved carousel | planned |
| Voice assistant and Parakeet worker | planned |

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. Camera and microphone access requires HTTPS or `localhost`.

```sh
npm run build   # tsc -b && vite build
npm run lint    # oxlint
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page, capability detection, entry point |
| `/check` | Permission request, camera preview, mic meter, degraded entry |
| `/shop` | Guarded placeholder for the showroom |
| `*` | Not found |

## How entry works

1. The landing CTA calls `getUserMedia` directly inside the click, which keeps the browser's user-gesture requirement intact (important on iOS).
2. Desktop requests camera + microphone; touch devices request the microphone only.
3. `/check` shows the live preview and input level. Denials fall back to audio-only or pointer-only browsing, never a dead end.
4. `/shop` is guarded: it requires a live stream or an explicit pointer-only session.
5. Leaving the shop stops every track and increments a request generation, so a late permission grant cannot re-open the camera.

## Privacy

Video never leaves the browser. Head-pose estimation runs locally, frames are discarded after inference, and audio is buffered only while the assistant listens. The speech model is about 210 MB and is downloaded once, then cached.

## Notes

- Head tracking uses MediaPipe's facial transformation matrix (head orientation), not iris tracking. This is more robust and needs a five-point calibration rather than a gaze regression.
- The Parakeet Redux ONNX export ships a 344 MB 4-bit encoder. Re-exporting at 2 bits yields a 193 MB encoder with identical values. The speech phase will target the 2-bit build (~212 MB total) with the published 4-bit build as fallback.
- Speech model weights and the reference browser worker are CC BY 4.0. Attribution belongs in the about screen before release.

## Credits

Built with React, Vite, TypeScript, and React Router. Planned: MediaPipe Tasks Vision, ONNX Runtime Web, Parakeet Redux by Moondream (CC BY 4.0).
