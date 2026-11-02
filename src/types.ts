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

export interface Shape {
  id: string
  name: string
  points: Pt[]
  closed: boolean
  smooth: boolean
  /** 0 = filled shape, >0 = stroked line of this width (shape units) */
  stroke: number
  builtin?: boolean
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
}

/** What the LED screen needs to draw one frame. */
export interface RenderState {
  pose: Pose
  layers: { shapeId: string; w: number }[]
}
