import type { Project, RenderState, ShapeFill } from '../types'
import { ledBrightness, resolveFill } from './fill'
import { buildPath, eyeLayout, getMask, makeEyeTransform, type EyeSide } from './geometry'

const SS = 4

let cv: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let rgbaBuf = new Uint8ClampedArray(0)
let brightBuf = new Uint8Array(0)

function getCtx(w: number, h: number): CanvasRenderingContext2D {
  if (!cv || !ctx) {
    cv = document.createElement('canvas')
    ctx = cv.getContext('2d', { willReadFrequently: true })
  }
  if (!ctx || !cv) throw new Error('2D canvas is not available')
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  return ctx
}

export function cssRgba(color: string, alpha: number) {
  const n = parseInt(color.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', ''), 16)
  if (!Number.isFinite(n)) return [255, 255, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

function addStops(g: CanvasGradient, stops: ShapeFill['stops']) {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset)
  let last = -0.0001
  for (const s of sorted) {
    let o = Math.max(0, Math.min(1, s.offset))
    if (o <= last) o = Math.min(1, last + 0.0001)
    last = o
    g.addColorStop(o, cssRgba(s.color, s.alpha))
  }
}

function makeStyle(
  c: CanvasRenderingContext2D,
  fill: ShapeFill,
  box: BBox,
  ends: { x0: number; y0: number; x1: number; y1: number } | null,
): string | CanvasGradient {
  if (fill.kind === 'solid') return cssRgba(fill.color, fill.alpha)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const rx = Math.max(0.75, (box.maxX - box.minX) / 2)
  const ry = Math.max(0.75, (box.maxY - box.minY) / 2)
  let g: CanvasGradient
  if (fill.kind === 'radial') g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  else if (ends) g = c.createLinearGradient(ends.x0, ends.y0, ends.x1, ends.y1)
  else {
    const rad = (fill.angle * Math.PI) / 180
    const L = Math.abs(rx * Math.cos(rad)) + Math.abs(ry * Math.sin(rad))
    g = c.createLinearGradient(cx - Math.cos(rad) * L, cy - Math.sin(rad) * L, cx + Math.cos(rad) * L, cy + Math.sin(rad) * L)
  }
  addStops(g, fill.stops)
  return g
}

/** Paint both eyes into a transparent context. `scale` is pixels per LED cell. */
export function drawEyeLayers(c: CanvasRenderingContext2D, project: Project, state: RenderState, scale: number) {
  const lay = eyeLayout(project.screen, project.rig)
  c.globalCompositeOperation = 'source-over'
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.filter = 'none'
  c.globalAlpha = 1
  for (const layer of state.layers) {
    const shape = project.shapes.find((s) => s.id === layer.shapeId) ?? project.shapes[0]
    if (!shape || layer.w <= 0.001 || shape.points.length < 2) continue
    const fill = resolveFill(shape)
    for (const side of ['L', 'R'] as EyeSide[]) {
      const tf = makeEyeTransform(state.pose, project.rig, lay, side)
      const pts = shape.points.map(tf.pt).map((p) => ({ x: p.x * scale, y: p.y * scale }))
      const path = new Path2D(buildPath(pts, shape.closed, shape.smooth))
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of pts) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      const lw = Math.max(0.6, shape.stroke * lay.unit * state.pose.scale) * scale
      let lminX = Infinity, lminY = Infinity, lmaxX = -Infinity, lmaxY = -Infinity
      for (const p of shape.points) {
        if (p.x < lminX) lminX = p.x
        if (p.y < lminY) lminY = p.y
        if (p.x > lmaxX) lmaxX = p.x
        if (p.y > lmaxY) lmaxY = p.y
      }
      const lcx = (lminX + lmaxX) / 2, lcy = (lminY + lmaxY) / 2
      const lrx = Math.max(0.05, (lmaxX - lminX) / 2), lry = Math.max(0.05, (lmaxY - lminY) / 2)
      const rad = (fill.angle * Math.PI) / 180
      const L = Math.abs(lrx * Math.cos(rad)) + Math.abs(lry * Math.sin(rad))
      const g0 = tf.pt({ x: lcx - Math.cos(rad) * L, y: lcy - Math.sin(rad) * L })
      const g1 = tf.pt({ x: lcx + Math.cos(rad) * L, y: lcy + Math.sin(rad) * L })
      c.save()
      c.globalAlpha = Math.min(1, layer.w)
      if (fill.feather > 0.004) c.filter = `blur(${Math.max(0.35, fill.feather * lay.unit * scale * 0.5).toFixed(2)}px)`
      const style = makeStyle(c, fill, { minX, minY, maxX, maxY }, { x0: g0.x * scale, y0: g0.y * scale, x1: g1.x * scale, y1: g1.y * scale })
      if (shape.stroke > 0) {
        c.strokeStyle = style
        c.lineWidth = lw
        c.stroke(path)
      } else {
        c.fillStyle = style
        c.fill(path)
      }
      c.restore()
    }
  }
  c.filter = 'none'
  c.globalAlpha = 1
}

export interface FrameRaster {
  w: number
  h: number
  /** Straight RGBA per LED, screen-tint applied, visor mask applied. Alpha is coverage 0–255. */
  rgba: Uint8ClampedArray
  /** 0–255 after alpha mapping. */
  brightness: Uint8Array
}

/**
 * Draw the vector eyes (colour + alpha + feather) and sample one RGBA value per LED.
 * Returned buffers are reused on the next call — read them before rendering again.
 */
export function renderFrame(project: Project, state: RenderState, brightnessOut?: Uint8Array): FrameRaster {
  const { w, h } = project.screen
  const sw = Math.max(1, w * SS)
  const sh = Math.max(1, h * SS)
  const c = getCtx(sw, sh)
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.filter = 'none'
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  c.clearRect(0, 0, sw, sh)
  drawEyeLayers(c, project, state, SS)
  const data = c.getImageData(0, 0, sw, sh).data
  const n = w * h
  if (rgbaBuf.length !== n * 4) rgbaBuf = new Uint8ClampedArray(n * 4)
  else rgbaBuf.fill(0)
  if (!(brightnessOut && brightnessOut.length === n)) {
    if (brightBuf.length !== n) brightBuf = new Uint8Array(n)
  }
  const brightness = brightnessOut && brightnessOut.length === n ? brightnessOut : brightBuf
  brightness.fill(0)
  const mask = getMask(project.screen)
  const tint = hexRgb(project.screen.color)
  const map = project.render.alpha
  const ss = SS
  const area = ss * ss
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      let r = 0, g = 0, b = 0, a = 0
      const x0 = x * ss
      const y0 = y * ss
      for (let sy = 0; sy < ss; sy++) {
        let p = ((y0 + sy) * sw + x0) * 4
        for (let sx = 0; sx < ss; sx++, p += 4) {
          const pa = data[p + 3]
          a += pa
          r += data[p] * pa
          g += data[p + 1] * pa
          b += data[p + 2] * pa
        }
      }
      const A = a / area
      const R = a > 0 ? (r / a) * tint[0] / 255 : 0
      const G = a > 0 ? (g / a) * tint[1] / 255 : 0
      const B = a > 0 ? (b / a) * tint[2] / 255 : 0
      const o = i * 4
      rgbaBuf[o] = R
      rgbaBuf[o + 1] = G
      rgbaBuf[o + 2] = B
      rgbaBuf[o + 3] = A
      brightness[i] = ledBrightness(A, map)
    }
  }
  return { w, h, rgba: rgbaBuf, brightness }
}

/** Rasterise to the brightness buffer used by the frame exporter. */
export function rasterize(project: Project, state: RenderState, out?: Uint8Array): Uint8Array {
  return renderFrame(project, state, out).brightness
}

/** Raw vector drawing, composited on black and tinted by the LED colour. */
export function paintDrawing(ctx: CanvasRenderingContext2D, project: Project, state: RenderState, destW: number, destH: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, destW, destH)
  const scale = destW / Math.max(1, project.screen.w)
  drawEyeLayers(ctx, project, state, scale)
  const tint = project.screen.color.toLowerCase()
  if (tint !== '#ffffff' && tint !== '#fff') {
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = project.screen.color
    ctx.fillRect(0, 0, destW, destH)
    ctx.globalCompositeOperation = 'source-over'
  }
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
