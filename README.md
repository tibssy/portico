# Portico

An experimental storefront you can browse with your head and voice.

**Live:** [tibssy.github.io/portico](https://tibssy.github.io/portico/)

- **Look** — head-pose estimation from the webcam highlights the card or button under your gaze. A per-tile deadzone holds the highlight steady once it lands.
- **Speak** — an on-device speech model (Parakeet Redux) transcribes requests without uploading audio.
- **Discover** — a shop assistant appears when you linger, with the product you are looking at in context.

This is a prototype. The entrance, five-point calibration, and gaze-driven product grid are built; the assistant is next.

## Status

| Piece | State |
| --- | --- |
| Landing page, routing, session guards | done |
| Camera + microphone permissions, device check, degraded modes | done |
| Head-pose capture, five-point calibration, sensitivity and noise damping | done |
| Gaze highlighting, per-tile deadzone, dwell selection, and inline product details | done |
| Responsive five-to-two-column product grid | done |
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

## Deploy

Pushing to `main` builds and deploys the app to GitHub Pages via `.github/workflows/deploy.yml`. The workflow sets `BASE_PATH=/<repository>/`; local builds stay at the origin root. The build also writes a `404.html` app shell so deep links such as `/portico/shop` boot the router instead of returning a bare 404.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page, capability detection, entry point |
| `/check` | Permission request, camera preview, mic meter, degraded entry |
| `/calibrate` | Five-point head-pose calibration, per-axis sensitivity, and noise damping (camera sessions only) |
| `/shop` | Guarded product grid with gaze highlighting, dwell selection, and an inline expanded card |
| `*` | Not found |

## How entry works

1. The landing CTA calls `getUserMedia` directly inside the click, which keeps the browser's user-gesture requirement intact (important on iOS).
2. Desktop requests camera + microphone; touch devices request the microphone only.
3. `/check` shows the live preview and input level. Denials fall back to audio-only or pointer-only browsing, never a dead end.
4. Camera sessions continue to `/calibrate`: five dots are sampled one at a time, and a linear fit per axis maps head yaw and pitch onto the viewport. A weak or noisy fit is rejected and can be retried. The tuning stage exposes per-axis sensitivity sliders and a noise-damping slider with a live cursor, so a visitor can tune reach and jitter before entering.
5. `/shop` is guarded: it requires a live stream (calibrated for camera sessions) or an explicit pointer-only session. The calibrated pose highlights the card or button under the gaze over a 15-piece grid; no floating cursor is drawn. Each card acts as a deadzone: small head movements while the gaze is on a tile are ignored, and a deliberate move releases it. A progress edge indicator fades in at the bottom center of the focused tile and sweeps clockwise over a 1.8-second hold. Holding on a tile expands it into a wider inline detail card; the rest of the grid is inactive while the card is open, and looking away closes it.
6. Leaving the shop stops every track, clears the calibration, and increments a request generation, so a late permission grant cannot re-open the camera.

## Privacy

Video never leaves the browser. Head-pose estimation runs locally, frames are discarded after inference, and audio is buffered only while the assistant listens. The speech model is about 210 MB and is downloaded once, then cached.

## Notes

- Head tracking uses MediaPipe's facial transformation matrix (head orientation), not iris tracking. This is more robust and needs a five-point calibration rather than a gaze regression. `poseFromMatrix` extracts scale-normalised yaw, pitch, and roll; `fitCalibration` fits screen `x` from yaw and screen `y` from pitch, rejecting fits with too little movement or too much error. Sensitivity is a multiplier around the screen centre applied in `mapPose`.
- The grid uses five columns on large screens, then four, three, and two as space tightens. Cards lift and scale on pointer hover, and scale with a glow under gaze. Selecting a card opens an inline card around 60vw × 80vh on desktop (and nearly the full canvas on smaller screens), with the art, description, price, and spec inside. A dwell edge indicator sweeps around the focused card before it opens, and the rest of the grid is disabled until the expanded card closes. The shop is fully usable with click, touch, and keyboard: arrow keys move focus through the grid, Enter opens a piece, and Esc closes the expanded card.
- Gaze tracking uses a speed-adaptive PID filter. Noise damping raises the resting filter and deadband, but a deliberate head movement shortens the input filter so the gaze does not feel laggy. On a product tile, a 20 px deadzone holds the highlight still while the raw gaze stays on that tile; moving beyond the tile releases it. The calibration screen keeps its live cursor for tuning; the shop only highlights targets.
- The face model is self-hosted at `public/mediapipe/face_landmarker.task` (MediaPipe Face Landmarker, Apache 2.0). The WASM runtime is copied from `node_modules/@mediapipe/tasks-vision/wasm` at dev and build time by `vite-plugin-static-copy`, so production stays self-contained.
- The Parakeet Redux ONNX export ships a 344 MB 4-bit encoder. Re-exporting at 2 bits yields a 193 MB encoder with identical values. The speech phase will target the 2-bit build (~212 MB total) with the published 4-bit build as fallback.
- Speech model weights and the reference browser worker are CC BY 4.0. Attribution belongs in the about screen before release.

## Credits

Built with React, Vite, TypeScript, and React Router. Head tracking uses MediaPipe Tasks Vision (Apache 2.0). Planned: ONNX Runtime Web and Parakeet Redux by Moondream (CC BY 4.0).
