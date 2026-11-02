import type { Pose, Pt, Rig, ScreenConfig, Shape } from '../types'

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9)

const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

/** Catmull-Rom -> cubic bezier SVG path (also used with Path2D on canvas). */
export function buildPath(pts: Pt[], closed: boolean, smooth: boolean): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}`
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`
  if (!smooth || n < 3) {
    for (let i = 1; i < n; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`
    return closed && n > 2 ? d + 'Z' : d
  }
  const get = (i: number) => {
    if (closed) return pts[((i % n) + n) % n]
    return pts[Math.max(0, Math.min(n - 1, i))]
  }
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2)
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6
    d += `C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2.x)} ${f(p2.y)}`
  }
  return closed ? d + 'Z' : d
}

export const bendY = (x: number, curve: number) => curve * 0.6 * (x * x - 0.33)

/** Layout of the two eyes on an LED matrix (all in LED-cell units). */
export interface EyeLayout {
  unit: number
  cy: number
  cxL: number
  cxR: number
}
export function eyeLayout(screen: ScreenConfig, rig: Rig): EyeLayout {
  const { w: W, h: H } = screen
  const round = screen.shape === 'round'
  const unit = (round ? W * 0.17 : Math.min(W / 4, H / 2) * 0.85) * rig.size
  const off = (round ? W * 0.22 : W * 0.25) * rig.spacing
  return { unit, cy: H / 2, cxL: W / 2 - off, cxR: W / 2 + off }
}

export type EyeSide = 'L' | 'R'

/** Transform one shape point into LED space for the given eye. */
export function makeEyeTransform(pose: Pose, rig: Rig, lay: EyeLayout, side: EyeSide) {
  const flip = side === 'R' && rig.mirror
  const ro = side === 'R' ? rig.rightOffset : { x: 0, y: 0, rot: 0 }
  const dirX = flip ? -1 : 1
  const rot = ((pose.rot * dirX + ro.rot) * Math.PI) / 180
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const sy = pose.scale * (1 + pose.squash) * (1 - Math.min(1, Math.max(0, pose.blink)) * 0.94)
  const sx = pose.scale / (1 + pose.squash)
  const cx = (side === 'L' ? lay.cxL : lay.cxR) + (pose.x * dirX + ro.x) * lay.unit
  const cy = lay.cy + (pose.y + ro.y) * lay.unit
  return {
    flip,
    sy, sx,
    pt: (p: Pt): Pt => {
      let x = p.x, y = p.y + bendY(p.x, pose.curve)
      if (flip) x = -x
      x *= sx; y *= sy
      return { x: cx + (x * cos - y * sin) * lay.unit, y: cy + (x * sin + y * cos) * lay.unit }
    },
    lineWidth: (stroke: number) => Math.max(0.6, stroke * lay.unit * pose.scale),
  }
}

/** Apply the curve slider permanently into a shape's anchor points. */
export function bakeCurve(shape: Shape, curve: number): Pt[] {
  return shape.points.map((p) => ({ x: p.x, y: Math.round((p.y + bendY(p.x, curve)) * 1000) / 1000 }))
}

export function insideMask(screen: ScreenConfig, x: number, y: number): boolean {
  const { w, h } = screen
  const cx = x + 0.5, cy = y + 0.5
  if (screen.shape === 'round') {
    const r = Math.min(w, h) / 2
    return (cx - w / 2) ** 2 + (cy - h / 2) ** 2 <= r * r
  }
  const r = h / 2
  if (cx < r) return (cx - r) ** 2 + (cy - r) ** 2 <= r * r
  if (cx > w - r) return (cx - (w - r)) ** 2 + (cy - r) ** 2 <= r * r
  return true
}

let maskCache: { key: string; mask: Uint8Array } | null = null
export function getMask(screen: ScreenConfig): Uint8Array {
  const key = `${screen.w}x${screen.h}${screen.shape}`
  if (maskCache?.key === key) return maskCache.mask
  const m = new Uint8Array(screen.w * screen.h)
  for (let y = 0; y < screen.h; y++) for (let x = 0; x < screen.w; x++) m[y * screen.w + x] = insideMask(screen, x, y) ? 1 : 0
  maskCache = { key, mask: m }
  return m
}
