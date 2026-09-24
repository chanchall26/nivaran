// Self-host MediaPipe's wasm so face blurring works without a CDN at demo time.
import { cpSync, mkdirSync } from 'node:fs'
const from = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url)
const to = new URL('../public/mediapipe/wasm/', import.meta.url)
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log('mediapipe wasm copied')
