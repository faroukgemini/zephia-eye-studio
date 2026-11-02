import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getProject, useProject } from '../store'
import { onFrame } from '../engine/clock'
import { paintDrawing, renderFrame } from '../engine/raster'
import { getMask } from '../engine/geometry'
import { ledLook } from '../engine/fill'
import type { DotShape, Project, RenderState } from '../types'

const hexRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface Props {
  getState: () => RenderState
  /** max box the screen may occupy (defaults to parent size) */
  className?: string
  overlay?: ReactNode
  bezel?: boolean
  dim?: number
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

function frameKey(project: Project, state: RenderState, dim: number) {
  const p = state.pose
  let g = 0
  for (const s of project.shapes) {
    g = (g + s.points.length + (s.closed ? 1 : 0) + (s.smooth ? 2 : 0) + Math.round(s.stroke * 100)) | 0
    for (const pt of s.points) g = (Math.imul(g, 33) + Math.round(pt.x * 1000) + Math.round(pt.y * 997)) | 0
    const f = s.fill
    if (f) {
      g = (g + Math.round(f.alpha * 100) + Math.round(f.feather * 80) + Math.round(f.angle) + f.kind.charCodeAt(0) + f.color.charCodeAt(1)) | 0
      for (const st of f.stops ?? []) g = (g + Math.round(st.offset * 100) + Math.round(st.alpha * 50) + (st.color?.charCodeAt(2) ?? 0)) | 0
    }
  }
  const r = project.render
  const a = r.alpha
  const grid = r.grid
  return [
    state.layers.map((l) => l.shapeId + l.w.toFixed(3)).join(','),
    p.x.toFixed(3), p.y.toFixed(3), p.rot.toFixed(2), p.scale.toFixed(3), p.squash.toFixed(3), p.blink.toFixed(3), p.curve.toFixed(3),
    dim, r.preview, a.mode, a.low, a.mid, a.high, a.threshold, a.lowShape, a.midShape, a.highShape,
    grid.mode, grid.pitchMm, grid.dotSize, grid.onShape, grid.showOff ? 1 : 0, grid.offColor,
    project.screen.w, project.screen.h, project.screen.shape, project.screen.color,
    project.rig.shapeId, project.rig.mirror ? 1 : 0, project.rig.spacing, project.rig.size,
    project.rig.rightOffset.x, project.rig.rightOffset.y, project.rig.rightOffset.rot,
    g,
  ].join('|')
}

/** LED matrix: vector drawing sampled onto a dot grid (or shown raw). */
export function LedScreen({ getState, className = '', overlay, bezel = true, dim = 1 }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const cvs = useRef<HTMLCanvasElement>(null)
  const screen = useProject((s) => s.project.screen)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const getRef = useRef(getState)
  getRef.current = getState

  useLayoutEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const aspect = screen.w / screen.h
  let dw = box.w, dh = box.w / aspect
  if (dh > box.h) { dh = box.h; dw = box.h * aspect }
  dw = Math.floor(dw); dh = Math.floor(dh)

  useEffect(() => {
    const canvas = cvs.current
    if (!canvas || dw < 8 || dh < 8) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(dw * dpr)
    canvas.height = Math.round(dh * dpr)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const sprites = new Map<string, HTMLCanvasElement>()
    const circleSprite = (color: string) => {
      let s = sprites.get(color)
      if (s) return s
      s = makeCircleSprite(color)
      sprites.set(color, s)
      if (sprites.size > 80) sprites.delete(sprites.keys().next().value!)
      return s
    }
    let lastSig = ''
    const stop = onFrame(() => {
      const proj = getProject()
      const st = getRef.current()
      const sig = frameKey(proj, st, dim)
      if (sig === lastSig) return
      lastSig = sig
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (proj.render.preview === 'drawing') {
        ctx.imageSmoothingEnabled = true
        paintDrawing(ctx, proj, st, canvas.width, canvas.height)
        return
      }
      const W = proj.screen.w
      const H = proj.screen.h
      const frame = renderFrame(proj, st)
      const pitch = canvas.width / W
      const mask = getMask(proj.screen)
      const grid = proj.render.grid
      ctx.imageSmoothingEnabled = pitch >= 3.5
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (pitch < 3.5) {
        const img = ctx.createImageData(W, H)
        const d = img.data
        const [or, og, ob] = hexRgb(grid.offColor)
        for (let i = 0; i < W * H; i++) {
          if (!mask[i]) continue
          const look = ledLook(frame.rgba[i * 4 + 3], proj.render)
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
        const t = document.createElement('canvas')
        t.width = W; t.height = H
        t.getContext('2d')!.putImageData(img, 0, 0)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(t, 0, 0, canvas.width, canvas.height)
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
          const look = ledLook(frame.rgba[i * 4 + 3], proj.render)
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
    })
    return stop
  }, [dw, dh, screen, dim])

  return (
    <div ref={wrap} className={'screen-wrap ' + className}>
      <div
        className={'screen ' + (screen.shape === 'round' ? 'round' : 'pill') + (bezel ? ' bezel' : '')}
        style={{ width: dw, height: dh }}
      >
        <canvas ref={cvs} style={{ width: dw, height: dh }} />
        {overlay}
      </div>
    </div>
  )
}
