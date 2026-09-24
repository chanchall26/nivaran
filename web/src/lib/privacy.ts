/**
 * Dignity-first photo handling, entirely on the device:
 *  1. downscale to 640 px (less identifying detail, small upload)
 *  2. detect faces (BlazeFace) AND people (EfficientDet "person"), because faces of
 *     people a few metres away are often too small for the face model
 *  3. heavily blur every face box and the head/upper-body part of every person box
 *  4. strip EXIF by re-encoding through a canvas
 * Only the blurred JPEG is ever sent anywhere.
 */
import { FaceDetector, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'

let detectors: Promise<{ face: FaceDetector; person: ObjectDetector }> | null = null

function loadDetectors() {
  detectors ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    const [face, person] = await Promise.all([
      FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.35,
      }),
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/efficientdet_lite0.tflite' },
        runningMode: 'IMAGE',
        categoryAllowlist: ['person'],
        scoreThreshold: 0.3,
        maxResults: 20,
      }),
    ])
    return { face, person }
  })()
  return detectors
}

export interface BlurResult {
  dataUrl: string
  faces: number
  people: number
  width: number
  height: number
}

async function toBitmap(file: Blob, maxSide: number) {
  const src = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height))
  const w = Math.round(src.width * scale)
  const h = Math.round(src.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(src, 0, 0, w, h)
  src.close()
  return canvas
}

function blurRect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const pad = Math.max(w, h) * 0.25
  const rx = Math.max(0, x - pad)
  const ry = Math.max(0, y - pad)
  const rw = Math.min(canvas.width - rx, w + 2 * pad)
  const rh = Math.min(canvas.height - ry, h + 2 * pad)
  if (rw <= 0 || rh <= 0) return
  // pixelate then blur: survives "unblur" tricks better than blur alone
  const tiny = document.createElement('canvas')
  tiny.width = Math.max(1, Math.round(rw / 14))
  tiny.height = Math.max(1, Math.round(rh / 14))
  tiny.getContext('2d')!.drawImage(canvas, rx, ry, rw, rh, 0, 0, tiny.width, tiny.height)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(rx, ry, rw, rh, Math.min(rw, rh) * 0.2)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.filter = 'blur(6px)'
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, rx - 8, ry - 8, rw + 16, rh + 16)
  ctx.restore()
}

export async function blurPeople(file: Blob, opts: { blurAll?: boolean } = {}): Promise<BlurResult> {
  const canvas = await toBitmap(file, 640)
  const ctx = canvas.getContext('2d')!
  let faces = 0
  let people = 0
  if (opts.blurAll) {
    blurRect(ctx, canvas, 0, 0, canvas.width, canvas.height)
  } else {
    try {
      const { face, person } = await loadDetectors()
      const fd = face.detect(canvas).detections
      const pd = person.detect(canvas).detections
      faces = fd.length
      people = pd.length
      for (const d of fd) {
        const b = d.boundingBox!
        blurRect(ctx, canvas, b.originX, b.originY, b.width, b.height)
      }
      for (const d of pd) {
        const b = d.boundingBox!
        // head and shoulders: top 40 % of the person box
        blurRect(ctx, canvas, b.originX, b.originY, b.width, b.height * 0.4)
      }
    } catch (e) {
      // if the models fail to load, fail safe: blur the whole picture
      console.warn('Face detection unavailable, blurring whole image', e)
      blurRect(ctx, canvas, 0, 0, canvas.width, canvas.height)
    }
  }
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.72),
    faces,
    people,
    width: canvas.width,
    height: canvas.height,
  }
}

/** Public map precision: ~110 m, enough to send help, not enough to find a person's bed. */
export const coarsen = (x: number) => Math.round(x * 1000) / 1000
