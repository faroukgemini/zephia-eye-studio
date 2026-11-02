import type { Project, RenderState } from '../types'
import { buildPath, eyeLayout, getMask, makeEyeTransform, type EyeSide } from './geometry'

let cv: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

function getCtx(w: number, h: number) {
  if (!cv) {
    cv = document.createElement('canvas')
    ctx = cv.getContext('2d', { willReadFrequently: true })
  }
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  return ctx!
}

/** Rasterise the vector eyes into an LED brightness buffer (0..255 per cell). */
export function rasterize(project: Project, state: RenderState, out?: Uint8Array): Uint8Array {
  const { w, h } = project.screen
  const c = getCtx(w, h)
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  c.fillStyle = '#000'
  c.fillRect(0, 0, w, h)
  c.globalCompositeOperation = 'lighter'
  c.fillStyle = '#fff'
  c.strokeStyle = '#fff'
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const lay = eyeLayout(project.screen, project.rig)
  for (const layer of state.layers) {
    const shape = project.shapes.find((s) => s.id === layer.shapeId) ?? project.shapes[0]
    if (!shape || layer.w <= 0.001) continue
    c.globalAlpha = Math.min(1, layer.w)
    for (const side of ['L', 'R'] as EyeSide[]) {
      const tf = makeEyeTransform(state.pose, project.rig, lay, side)
      const pts = shape.points.map(tf.pt)
      const path = new Path2D(buildPath(pts, shape.closed, shape.smooth))
      if (shape.stroke > 0) {
        c.lineWidth = tf.lineWidth(shape.stroke)
        c.stroke(path)
      } else {
        c.fill(path)
        if (!shape.closed) {
          /* open filled shapes are implicitly closed by fill */
        }
      }
    }
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  const data = c.getImageData(0, 0, w, h).data
  const buf = out && out.length === w * h ? out : new Uint8Array(w * h)
  const mask = getMask(project.screen)
  for (let i = 0; i < buf.length; i++) buf[i] = mask[i] ? data[i * 4] : 0
  return buf
}

/** Binary bitmap as hex rows (MSB = leftmost LED). */
export function toHexRows(buf: Uint8Array, w: number, h: number, threshold = 128, applyMask?: Uint8Array): string[] {
  const rows: string[] = []
  const chars = Math.ceil(w / 4)
  for (let y = 0; y < h; y++) {
    let hex = ''
    for (let nib = 0; nib < chars; nib++) {
      let v = 0
      for (let b = 0; b < 4; b++) {
        const x = nib * 4 + b
        const on = x < w && buf[y * w + x] >= threshold && (!applyMask || applyMask[y * w + x]) ? 1 : 0
        v = (v << 1) | on
      }
      hex += v.toString(16)
    }
    rows.push(hex)
  }
  return rows
}
