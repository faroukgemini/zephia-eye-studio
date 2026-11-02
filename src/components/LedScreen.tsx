import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useProject, getProject } from '../store'
import { onFrame } from '../engine/clock'
import { rasterize } from '../engine/raster'
import { getMask } from '../engine/geometry'
import type { RenderState } from '../types'

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

/** LED matrix renderer: vector eyes -> LED grid -> canvas dots. */
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
    const ctx = canvas.getContext('2d')!
    const W = screen.w, H = screen.h
    const pitch = (dw * dpr) / W
    const [cr, cg, cb] = hexRgb(screen.color)
    const mask = getMask(screen)
    const dots = pitch >= 4
    // static layer with unlit LEDs
    const bg = document.createElement('canvas')
    bg.width = canvas.width; bg.height = canvas.height
    const bctx = bg.getContext('2d')!
    bctx.fillStyle = '#000'; bctx.fillRect(0, 0, bg.width, bg.height)
    // sprite for lit LED
    const sr = Math.ceil(pitch)
    const sprite = document.createElement('canvas')
    sprite.width = sprite.height = sr * 2
    const sctx = sprite.getContext('2d')!
    if (dots) {
      const g = sctx.createRadialGradient(sr, sr, 0, sr, sr, sr)
      g.addColorStop(0, `rgba(255,255,255,1)`)
      g.addColorStop(0.3, `rgba(${cr},${cg},${cb},1)`)
      g.addColorStop(0.42, `rgba(${cr},${cg},${cb},0.95)`)
      g.addColorStop(0.5, `rgba(${cr},${cg},${cb},0)`)
      sctx.fillStyle = g
      sctx.fillRect(0, 0, sr * 2, sr * 2)
      const off = document.createElement('canvas')
      off.width = off.height = sr * 2
      const octx = off.getContext('2d')!
      octx.fillStyle = 'rgb(30,32,36)'
      octx.beginPath(); octx.arc(sr, sr, pitch * 0.34, 0, Math.PI * 2); octx.fill()
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) bctx.drawImage(off, (x + 0.5) * pitch - sr, (y + 0.5) * pitch - sr)
    } else {
      const id = bctx.createImageData(W, H)
      for (let i = 0; i < W * H; i++) { const v = mask[i] ? 18 : 0; id.data[i * 4] = v; id.data[i * 4 + 1] = v + 1; id.data[i * 4 + 2] = v + 2; id.data[i * 4 + 3] = 255 }
      const t = document.createElement('canvas'); t.width = W; t.height = H
      t.getContext('2d')!.putImageData(id, 0, 0)
      bctx.imageSmoothingEnabled = false
      bctx.drawImage(t, 0, 0, bg.width, bg.height)
    }
    const small = document.createElement('canvas'); small.width = W; small.height = H
    const sm = small.getContext('2d')!
    const img = sm.createImageData(W, H)
    const buf = new Uint8Array(W * H)
    let lastSig = ''
    let lastProj: unknown = null
    const stop = onFrame(() => {
      const proj = getProject()
      const st = getRef.current()
      const p = st.pose
      const sig = `${st.layers.map((l) => l.shapeId + l.w.toFixed(3)).join(',')}|${p.x.toFixed(4)},${p.y.toFixed(4)},${p.rot.toFixed(3)},${p.scale.toFixed(4)},${p.squash.toFixed(4)},${p.blink.toFixed(4)},${p.curve.toFixed(3)}|${dim}`
      if (sig === lastSig && (proj as any) === (lastProj as any)) return
      lastSig = sig; lastProj = proj
      rasterize(proj, st, buf)
      ctx.globalAlpha = 1
      ctx.drawImage(bg, 0, 0)
      if (dots) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const b = buf[y * W + x]
            if (b < 6) continue
            ctx.globalAlpha = (b / 255) * dim
            ctx.drawImage(sprite, (x + 0.5) * pitch - sr, (y + 0.5) * pitch - sr)
          }
        }
        ctx.globalAlpha = 1
      } else {
        const d = img.data
        for (let i = 0; i < W * H; i++) {
          const b = (buf[i] / 255) * dim
          d[i * 4] = cr * b; d[i * 4 + 1] = cg * b; d[i * 4 + 2] = cb * b; d[i * 4 + 3] = buf[i] > 5 ? 255 : 0
        }
        sm.putImageData(img, 0, 0)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(small, 0, 0, canvas.width, canvas.height)
      }
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
