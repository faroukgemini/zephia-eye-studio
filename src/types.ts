export const PARAMS = ['x', 'y', 'rot', 'scale', 'squash', 'blink'] as const
export type Param = (typeof PARAMS)[number]

export const PARAM_META: Record<Param, { label: string; min: number; max: number; step: number; def: number; unit: string }> = {
  x: { label: 'X', min: -1, max: 1, step: 0.01, def: 0, unit: '' },
  y: { label: 'Y', min: -1, max: 1, step: 0.01, def: 0, unit: '' },
  rot: { label: 'Rotation', min: -90, max: 90, step: 0.5, def: 0, unit: '°' },
  scale: { label: 'Scale', min: 0.2, max: 2, step: 0.01, def: 1, unit: '' },
  squash: { label: 'Squash/Stretch', min: -0.8, max: 0.8, step: 0.01, def: 0, unit: '' },
  blink: { label: 'Blinking', min: 0, max: 1, step: 0.01, def: 0, unit: '' },
}

export interface Pose {
  x: number
  y: number
  rot: number
  scale: number
  squash: number
  blink: number
  curve: number
}

export const DEFAULT_POSE: Pose = { x: 0, y: 0, rot: 0, scale: 1, squash: 0, blink: 0, curve: 0 }

/** The 11 expression / emotion categories. */
export const EMOTIONS = [
  'Neutral',
  'Curious',
  'Happy',
  'Sad',
  'Angry',
  'Surprised',
  'Bored',
  'Sleeping',
  'Waking',
  'Thinking',
  'Talking',
] as const
export type Emotion = (typeof EMOTIONS)[number]

export const EMOTION_COLOR: Record<Emotion, string> = {
  Neutral: '#8b97ab',
  Curious: '#38bdf8',
  Happy: '#ffd23f',
  Sad: '#6d7dff',
  Angry: '#ff5252',
  Surprised: '#ff9442',
  Bored: '#b08d57',
  Sleeping: '#a07bff',
  Waking: '#4ade80',
  Thinking: '#2dd4bf',
  Talking: '#ff6bb0',
}

export type Easing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export const EASINGS: Easing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out']

export interface Pt {
  x: number
  y: number
}

export const DOT_SHAPES = ['circle', 'square', 'x', 'plus', 'ring', 'diamond'] as const
export type DotShape = (typeof DOT_SHAPES)[number]

export interface GradientStop {
  /** 0..1 along the gradient */
  offset: number
  color: string
  /** 0..1 */
  alpha: number
}

/** Solid colour or gradient painted into the vector drawing, with its own alpha. */
export interface ShapeFill {
  kind: 'solid' | 'linear' | 'radial'
  color: string
  /** 0..1, solid fills */
  alpha: number
  /** Degrees. 0 = left → right, 90 = top → bottom. */
  angle: number
  stops: GradientStop[]
  /** 0..1 soft edge */
  feather: number
}

export type AlphaMode = 'dim' | 'shape' | 'threshold' | 'both'

/** How the drawing's alpha is sampled onto each LED. */
export interface AlphaMap {
  mode: AlphaMode
  /** below this the LED is off (shape / both) */
  low: number
  /** low..mid → low glyph, mid..high → mid glyph, ≥ high → full glyph */
  mid: number
  high: number
  /** on/off cut for threshold mode, 0..1 */
  threshold: number
  lowShape: DotShape
  midShape: DotShape
  highShape: DotShape
}

export interface LedGrid {
  /** count = screen.w × screen.h; pitch = derive columns/rows from pitchMm */
  mode: 'count' | 'pitch'
  /** centre-to-centre spacing in millimetres */
  pitchMm: number
  /** 1 = the original LED sprite scale */
  dotSize: number
  onShape: DotShape
  showOff: boolean
  offColor: string
}

export interface RenderConfig {
  /** leds = dot grid overlay; drawing = the raw vector */
  preview: 'leds' | 'drawing'
  alpha: AlphaMap
  grid: LedGrid
}

export interface Shape {
  id: string
  name: string
  points: Pt[]
  closed: boolean
  smooth: boolean
  /** 0 = filled shape, >0 = stroked line of this width (shape units) */
  stroke: number
  builtin?: boolean
  fill?: ShapeFill
}

export interface Keyframe {
  id: string
  t: number
  v: number
}
export interface Track {
  enabled: boolean
  keys: Keyframe[]
}

export interface Animation {
  id: string
  name: string
  emotion: Emotion
  duration: number
  fps: number
  easing: Easing
  shapeId: string | null
  tracks: Record<Param, Track>
}

export type TransitionType = 'cut' | 'crossfade'
export interface Clip {
  id: string
  animId: string
  /** transition into the NEXT clip */
  transition: { type: TransitionType; dur: number }
}
export interface Sequence {
  id: string
  name: string
  clips: Clip[]
}

export interface ScreenConfig {
  w: number
  h: number
  shape: 'pill' | 'round'
  color: string
}

export interface Rig {
  name: string
  shapeId: string
  mirror: boolean
  spacing: number
  size: number
  rightOffset: { x: number; y: number; rot: number }
}

export interface Project {
  version: 1
  name: string
  screen: ScreenConfig
  rig: Rig
  shapes: Shape[]
  base: Pose
  animations: Animation[]
  sequences: Sequence[]
  activeAnimId: string
  activeSeqId: string
  render: RenderConfig
}

/** What the LED screen needs to draw one frame. */
export interface RenderState {
  pose: Pose
  layers: { shapeId: string; w: number }[]
}
