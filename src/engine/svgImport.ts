import type { Pt, Shape } from '../types'
import { defaultFill } from './fill'
import { uid } from './geometry'

/** Parse an SVG file's first drawable element into a normalised anchor-point shape. */
export function importSvgShape(text: string, fileName: string, samples = 28): Shape {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG file')
  const src = doc.querySelector('path, polygon, polyline, circle, ellipse, rect')
  if (!src) throw new Error('No path/polygon/circle/rect found in SVG')
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden')
  const el = document.importNode(src, true) as SVGGeometryElement
  svg.appendChild(el)
  document.body.appendChild(svg)
  try {
    const tag = el.tagName.toLowerCase()
    const d = tag === 'path' ? (el.getAttribute('d') ?? '') : ''
    const closed = tag !== 'polyline' && tag !== 'path' ? true : /z\s*$/i.test(d.trim())
    const len = el.getTotalLength()
    if (!len) throw new Error('Shape has zero length')
    const pts: Pt[] = []
    const n = closed ? samples : samples + 1
    for (let i = 0; i < n; i++) {
      const p = el.getPointAtLength((i / (closed ? n : n - 1)) * len)
      pts.push({ x: p.x, y: p.y })
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const sc = 2 / Math.max(maxX - minX, maxY - minY, 1e-6) * 0.92
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    return {
      id: uid('shape'),
      name: fileName.replace(/\.svg$/i, '') || 'svg shape',
      points: pts.map((p) => ({ x: +((p.x - cx) * sc).toFixed(3), y: +((p.y - cy) * sc).toFixed(3) })),
      closed, smooth: true, stroke: closed ? 0 : 0.25,
      fill: defaultFill(),
    }
  } finally {
    svg.remove()
  }
}
