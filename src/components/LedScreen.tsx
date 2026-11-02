import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { getProject, useProject } from '../store'
import { onFrame } from '../engine/clock'
import { paintPreview } from '../engine/paintPreview'
import type { Project, RenderState } from '../types'

interface Props {
  getState: () => RenderState
  /** max box the screen may occupy (defaults to parent size) */
  className?: string
  overlay?: ReactNode
  bezel?: boolean
  dim?: number
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
    let lastSig = ''
    const stop = onFrame(() => {
      const proj = getProject()
      const st = getRef.current()
      const sig = frameKey(proj, st, dim)
      if (sig === lastSig) return
      lastSig = sig
      paintPreview(ctx, proj, st, canvas.width, canvas.height, dim, '#000')
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
