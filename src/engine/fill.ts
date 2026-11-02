import { DOT_SHAPES, type AlphaMap, type DotShape, type GradientStop, type Project, type RenderConfig, type ScreenConfig, type Shape, type ShapeFill } from '../types'

export const GLYPH_LABEL: Record<DotShape, string> = {
  circle: 'Circle', square: 'Square', x: 'X', plus: 'Plus', ring: 'Ring', diamond: 'Diamond',
}

/** Default pitch (mm) that lands on the 120×32 pill matrix across the 95×25 mm panel. */
export const DEFAULT_PITCH = 95 / 120

const PANEL_MM = { w: 95, h: 25 }

export const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

export function hex6(input: unknown, fallback = '#ffffff'): string {
  if (typeof input !== 'string') return fallback
  const m = input.trim().match(/^#?([0-9a-fA-F]{6})$/)
  return m ? '#' + m[1].toLowerCase() : fallback
}

export function defaultFill(): ShapeFill {
  return {
    kind: 'solid',
    color: '#ffffff',
    alpha: 1,
    angle: 0,
    feather: 0,
    stops: [
      { offset: 0, color: '#ffffff', alpha: 1 },
      { offset: 1, color: '#9eeaff', alpha: 0.15 },
    ],
  }
}

export function defaultRender(): RenderConfig {
  return {
    preview: 'leds',
    alpha: {
      mode: 'dim',
      low: 0.12,
      mid: 0.4,
      high: 0.72,
      threshold: 0.5,
      lowShape: 'plus',
      midShape: 'ring',
      highShape: 'circle',
    },
    grid: {
      mode: 'count',
      pitchMm: DEFAULT_PITCH,
      dotSize: 1,
      onShape: 'circle',
      showOff: true,
      offColor: '#1e2024',
    },
  }
}

export function resolveFill(shape: Partial<Shape> | null | undefined): ShapeFill {
  const d = defaultFill()
  const f = shape?.fill
  if (!f) return d
  const stopsIn = Array.isArray(f.stops) && f.stops.length >= 2 ? f.stops : d.stops
  const stops: GradientStop[] = stopsIn.map((s) => ({
    offset: clamp01(s?.offset ?? 0),
    color: hex6(s?.color),
    alpha: clamp01(s?.alpha ?? 1),
  }))
  return {
    kind: f.kind === 'linear' || f.kind === 'radial' ? f.kind : 'solid',
    color: hex6(f.color, d.color),
    alpha: clamp01(f.alpha ?? 1),
    angle: Number.isFinite(f.angle) ? ((f.angle % 360) + 360) % 360 : 0,
    feather: clamp01(f.feather ?? 0),
    stops,
  }
}

export function cloneFill(f: ShapeFill): ShapeFill {
  return { ...f, stops: f.stops.map((s) => ({ ...s })) }
}

/** Plain copy safe to push into an Immer draft (draft proxies are not structured-cloneable). */
export function cloneShape(src: Shape): Shape {
  return {
    id: src.id,
    name: src.name,
    points: src.points.map((p) => ({ x: p.x, y: p.y })),
    closed: src.closed,
    smooth: src.smooth,
    stroke: src.stroke,
    builtin: src.builtin,
    fill: cloneFill(resolveFill(src)),
  }
}

const isGlyph = (v: unknown): v is DotShape => DOT_SHAPES.includes(v as DotShape)

export function normalizeShape(raw: any): Shape {
  return {
    id: String(raw?.id ?? 'shape'),
    name: String(raw?.name ?? 'shape'),
    points: Array.isArray(raw?.points)
      ? raw.points.filter((p: any) => p && Number.isFinite(+p.x) && Number.isFinite(+p.y)).map((p: any) => ({ x: +p.x, y: +p.y }))
      : [],
    closed: raw?.closed !== false,
    smooth: !!raw?.smooth,
    stroke: Math.max(0, Number(raw?.stroke) || 0),
    builtin: raw?.builtin === true,
    fill: resolveFill(raw),
  }
}

export function normalizeRender(raw: any): RenderConfig {
  const d = defaultRender()
  const a = raw?.alpha && typeof raw.alpha === 'object' ? raw.alpha : {}
  const g = raw?.grid && typeof raw.grid === 'object' ? raw.grid : {}
  const mode = a.mode === 'shape' || a.mode === 'threshold' || a.mode === 'both' || a.mode === 'dim' ? a.mode : d.alpha.mode
  let low = clamp01(a.low ?? d.alpha.low)
  let mid = clamp01(a.mid ?? d.alpha.mid)
  let high = clamp01(a.high ?? d.alpha.high)
  if (mid < low) mid = low
  if (high < mid) high = mid
  return {
    preview: raw?.preview === 'drawing' ? 'drawing' : 'leds',
    alpha: {
      mode,
      low, mid, high,
      threshold: clamp01(a.threshold ?? d.alpha.threshold),
      lowShape: isGlyph(a.lowShape) ? a.lowShape : d.alpha.lowShape,
      midShape: isGlyph(a.midShape) ? a.midShape : d.alpha.midShape,
      highShape: isGlyph(a.highShape) ? a.highShape : d.alpha.highShape,
    },
    grid: {
      mode: g.mode === 'pitch' ? 'pitch' : 'count',
      pitchMm: Math.min(8, Math.max(0.16, Number(g.pitchMm) || d.grid.pitchMm)),
      dotSize: Math.min(1.5, Math.max(0.2, Number(g.dotSize) || d.grid.dotSize)),
      onShape: isGlyph(g.onShape) ? g.onShape : d.grid.onShape,
      showOff: g.showOff !== false,
      offColor: hex6(g.offColor, d.grid.offColor),
    },
  }
}

export function pitchToGrid(shape: ScreenConfig['shape'], pitchMm: number): { w: number; h: number } {
  const pitch = Math.min(8, Math.max(0.16, pitchMm))
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(n)))
  if (shape === 'round') {
    const n = clamp(PANEL_MM.h / pitch, 8, 256)
    return { w: n, h: n }
  }
  return { w: clamp(PANEL_MM.w / pitch, 8, 512), h: clamp(PANEL_MM.h / pitch, 8, 256) }
}

export function applyPitch(d: Project) {
  const pitch = Math.min(8, Math.max(0.16, d.render.grid.pitchMm || DEFAULT_PITCH))
  d.render.grid.pitchMm = Math.round(pitch * 1000) / 1000
  const g = pitchToGrid(d.screen.shape, d.render.grid.pitchMm)
  d.screen.w = g.w
  d.screen.h = g.h
}

/** Dragging any threshold keeps low ≤ mid ≤ high, and the handle being moved wins. */
export function setAlphaThreshold(a: AlphaMap, key: 'low' | 'mid' | 'high', v: number) {
  const n = clamp01(v)
  a[key] = n
  if (key === 'low') {
    if (a.mid < n) a.mid = n
    if (a.high < a.mid) a.high = a.mid
  } else if (key === 'high') {
    if (a.mid > n) a.mid = n
    if (a.low > a.mid) a.low = a.mid
  } else {
    if (n < a.low) a.low = n
    if (n > a.high) a.high = n
  }
}

export interface LedLook {
  glyph: DotShape
  /** 0..1 multiplied onto the sampled colour */
  opacity: number
  /** scales the lit dot */
  scale: number
}

/** How one LED presents the sampled alpha (0–255). Null = unlit. */
export function ledLook(alphaByte: number, render: RenderConfig): LedLook | null {
  const a = clamp01(alphaByte / 255)
  const m = render.alpha
  if (m.mode === 'threshold') {
    if (a < m.threshold) return null
    return { glyph: render.grid.onShape, opacity: 1, scale: 1 }
  }
  if (m.mode === 'dim') {
    if (a < 0.025) return null
    return { glyph: render.grid.onShape, opacity: a, scale: 1 }
  }
  if (a < m.low) return null
  const opacity = m.mode === 'both' ? a : 1
  if (a >= m.high) return { glyph: m.highShape, opacity, scale: 1 }
  if (a >= m.mid) return { glyph: m.midShape, opacity, scale: 0.74 }
  return { glyph: m.lowShape, opacity, scale: 0.48 }
}

/** Brightness byte written into frame exports (0–255), after alpha mapping. */
export function ledBrightness(alphaByte: number, map: AlphaMap): number {
  const a = clamp01(alphaByte / 255)
  if (map.mode === 'threshold') return a >= map.threshold ? 255 : 0
  if ((map.mode === 'shape' || map.mode === 'both') && a < map.low) return 0
  return Math.round(clamp01(alphaByte / 255) * 255)
}
