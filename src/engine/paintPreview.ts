import type { DotShape, Project, RenderState } from '../types'
import { ledLook } from './fill'
import { getMask } from './geometry'
import { drawEyeLayers, paintDrawing, renderFrame } from './raster'

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function qByte(n: number) {
  if (n >= 252) return 255
  if (n <= 3) return 0
  return Math.round(n / 8) * 8
}

function drawGlyph(ctx: CanvasRenderingContext2D, shape: DotShape, x: number, y: number, r: number) {
  ctx.beginPath()
  if (shape === 'square') {
    ctx.rect(x - r, y - r, r * 2, r * 2)
    ctx.fill()
    return
  }
  if (shape === 'diamond') {
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
    ctx.closePath()
    ctx.fill()
    return
  }
  if (shape === 'ring') {
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.arc(x, y, Math.max(0.6, r * 0.55), 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    return
  }
  if (shape === 'x' || shape === 'plus') {
    ctx.strokeStyle = ctx.fillStyle
    ctx.lineWidth = Math.max(1.4, r * 0.55)
    ctx.lineCap = 'round'
    const d = r * (shape === 'plus' ? 0.92 : 0.78)
    ctx.beginPath()
    if (shape === 'x') {
      ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d)
      ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d)
    } else {
      ctx.moveTo(x - d, y); ctx.lineTo(x + d, y)
      ctx.moveTo(x, y - d); ctx.lineTo(x, y + d)
    }
    ctx.stroke()
    return
  }
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function makeCircleSprite(color: string) {
  const S = 96
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const r = S / 2
  const [cr, cg, cb] = color.match(/\d+/g)!.map(Number)
  const fall = g.createRadialGradient(r, r, 0, r, r, r)
  fall.addColorStop(0, 'rgba(255,255,255,1)')
  fall.addColorStop(0.3, `rgba(${cr},${cg},${cb},1)`)
  fall.addColorStop(0.42, `rgba(${cr},${cg},${cb},0.95)`)
  fall.addColorStop(0.5, `rgba(${cr},${cg},${cb},0)`)
  fall.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
  g.fillStyle = fall
  g.fillRect(0, 0, S, S)
  return c
}

const sprites = new Map<string, HTMLCanvasElement>()
function circleSprite(color: string) {
  let s = sprites.get(color)
  if (s) return s
  s = makeCircleSprite(color)
  sprites.set(color, s)
  if (sprites.size > 80) sprites.delete(sprites.keys().next().value!)
  return s
}

let pixelCanvas: HTMLCanvasElement | null = null

function tintCanvas(ctx: CanvasRenderingContext2D, color: string, w: number, h: number) {
  const tint = color.toLowerCase()
  if (tint === '#ffffff' || tint === '#fff') return
  const [tr, tg, tb] = hexRgb(color)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * tr / 255
    d[i + 1] = d[i + 1] * tg / 255
    d[i + 2] = d[i + 2] * tb / 255
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Draw one frame the same way the on-screen preview does.
 * `background` null leaves the canvas transparent (used for WebM alpha). `#000` matches the live preview.
 */
export function paintPreview(
  ctx: CanvasRenderingContext2D,
  project: Project,
  state: RenderState,
  width: number,
  height: number,
  dim = 1,
  background: string | null = '#000',
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const black = !background || background.toLowerCase() === '#000' || background.toLowerCase() === '#000000'
  if (project.render.preview === 'drawing') {
    ctx.imageSmoothingEnabled = true
    if (background && black) {
      paintDrawing(ctx, project, state, width, height)
      return
    }
    ctx.clearRect(0, 0, width, height)
    drawEyeLayers(ctx, project, state, width / Math.max(1, project.screen.w))
    tintCanvas(ctx, project.screen.color, width, height)
    return
  }
  const W = project.screen.w
  const H = project.screen.h
  const frame = renderFrame(project, state)
  const pitch = width / W
  const mask = getMask(project.screen)
  const grid = project.render.grid
  ctx.imageSmoothingEnabled = pitch >= 3.5
  if (background == null) ctx.clearRect(0, 0, width, height)
  else { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height) }
  if (pitch < 3.5) {
    const img = ctx.createImageData(W, H)
    const d = img.data
    const [or, og, ob] = hexRgb(grid.offColor)
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) continue
      const look = ledLook(frame.rgba[i * 4 + 3], project.render)
      const o = i * 4
      if (!look) {
        if (grid.showOff) { d[o] = or; d[o + 1] = og; d[o + 2] = ob; d[o + 3] = 255 }
        continue
      }
      const k = look.opacity * dim
      d[o] = frame.rgba[o] * k
      d[o + 1] = frame.rgba[o + 1] * k
      d[o + 2] = frame.rgba[o + 2] * k
      d[o + 3] = 255
    }
    if (!pixelCanvas) pixelCanvas = document.createElement('canvas')
    if (pixelCanvas.width !== W || pixelCanvas.height !== H) { pixelCanvas.width = W; pixelCanvas.height = H }
    pixelCanvas.getContext('2d')!.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(pixelCanvas, 0, 0, width, height)
    return
  }
  if (grid.showOff) {
    const offR = pitch * 0.34 * Math.min(1.15, grid.dotSize)
    ctx.fillStyle = grid.offColor
    ctx.beginPath()
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue
      const cx = (x + 0.5) * pitch
      const cy = (y + 0.5) * pitch
      ctx.moveTo(cx + offR, cy)
      ctx.arc(cx, cy, offR, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!mask[i]) continue
      const look = ledLook(frame.rgba[i * 4 + 3], project.render)
      if (!look) continue
      const cr = qByte(frame.rgba[i * 4])
      const cg = qByte(frame.rgba[i * 4 + 1])
      const cb = qByte(frame.rgba[i * 4 + 2])
      const color = `rgb(${cr},${cg},${cb})`
      const cx = (x + 0.5) * pitch
      const cy = (y + 0.5) * pitch
      ctx.globalAlpha = Math.max(0, Math.min(1, look.opacity * dim))
      if (look.glyph === 'circle') {
        const sprite = circleSprite(color)
        const dest = pitch * 2 * grid.dotSize * look.scale
        ctx.drawImage(sprite, cx - dest / 2, cy - dest / 2, dest, dest)
      } else {
        ctx.fillStyle = color
        ctx.strokeStyle = color
        drawGlyph(ctx, look.glyph, cx, cy, pitch * 0.4 * grid.dotSize * look.scale)
      }
    }
  }
  ctx.globalAlpha = 1
}
