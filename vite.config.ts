import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.*',
          dest: 'mediapipe/wasm',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.*',
          dest: 'mediapipe/wasm',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
})
