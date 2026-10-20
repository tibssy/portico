import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

/**
 * GitHub Pages has no SPA rewrite. Serving the app shell as 404.html lets a
 * deep link such as /portico/shop boot the router instead of stopping at a
 * bare 404.
 */
function spaFallback(): Plugin {
  let outDir = ''

  return {
    name: 'portico-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

function normalizeBase(value: string): string {
  const trimmed = value.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

// GitHub Pages project sites live under /<repository>/. The workflow sets
// BASE_PATH; a normal local build stays at the origin root.
const base = normalizeBase(process.env.BASE_PATH ?? '/')

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    spaFallback(),
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
