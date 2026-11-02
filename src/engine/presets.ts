import { DEFAULT_POSE, PARAMS, type Animation, type Easing, type Emotion, type Param, type Project, type Pt, type Sequence, type Shape } from '../types'
import { uid } from './geometry'

const P = (x: number, y: number): Pt => ({ x, y })

function ellipse(rx: number, ry: number, n = 8): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return P(+(Math.cos(a) * rx).toFixed(3), +(Math.sin(a) * ry).toFixed(3))
  })
}

function xShape(a = 0.85, k = 0.4): Pt[] {
  return [P(-a + k, -a), P(0, -k), P(a - k, -a), P(a, -a + k), P(k, 0), P(a, a - k), P(a - k, a), P(0, k), P(-a + k, a), P(-a, a - k), P(-k, 0), P(-a, -a + k)]
}

export const PRESET_SHAPES: Shape[] = [
  { id: 'shape_neutral', name: 'neutral', points: ellipse(0.62, 0.92), closed: true, smooth: true, stroke: 0, builtin: true },
  { id: 'shape_angry', name: 'angry slant', points: [P(-0.92, -0.85), P(0.92, -0.1), P(0.92, 0.35), P(0.55, 0.8), P(-0.5, 0.8), P(-0.92, 0.4)], closed: true, smooth: false, stroke: 0, builtin: true },
  { id: 'shape_happy', name: 'happy arc', points: [P(-0.8, 0.45), P(0, -0.45), P(0.8, 0.45)], closed: false, smooth: true, stroke: 0.3, builtin: true },
  { id: 'shape_xx', name: 'X X', points: xShape(), closed: true, smooth: false, stroke: 0, builtin: true },
  { id: 'shape_heart', name: 'heart', points: [P(0, 0.88), P(-0.55, 0.36), P(-0.93, -0.15), P(-0.82, -0.66), P(-0.42, -0.86), P(0, -0.5), P(0.42, -0.86), P(0.82, -0.66), P(0.93, -0.15), P(0.55, 0.36)], closed: true, smooth: true, stroke: 0, builtin: true },
  { id: 'shape_sleepy', name: 'sleepy line', points: [P(-0.85, 0.08), P(0, 0.2), P(0.85, 0.08)], closed: false, smooth: true, stroke: 0.17, builtin: true },
  { id: 'shape_sad', name: 'sad droop', points: [P(-0.92, -0.05), P(0.92, -0.85), P(0.92, 0.4), P(0.55, 0.8), P(-0.5, 0.8), P(-0.92, 0.4)], closed: true, smooth: false, stroke: 0, builtin: true },
  { id: 'shape_round', name: 'wide round', points: ellipse(0.85, 0.95, 10), closed: true, smooth: true, stroke: 0, builtin: true },
]

type KeyList = [number, number][]
function mk(
  name: string, emotion: Emotion, duration: number, shapeId: string | null, easing: Easing,
  t: Partial<Record<Param, KeyList>>,
): Animation {
  const tracks = {} as Animation['tracks']
  for (const p of PARAMS) {
    const keys = (t[p] ?? []).map(([tt, v]) => ({ id: uid('k'), t: tt, v }))
    tracks[p] = { enabled: keys.length > 0, keys }
  }
  return { id: 'anim_' + name, name, emotion, duration, fps: 24, easing, shapeId, tracks }
}

export function presetAnimations(): Animation[] {
  return [
    mk('idle_breathe', 'Neutral', 4, 'shape_neutral', 'ease-in-out', {
      scale: [[0, 1], [2, 1.05], [4, 1]],
      y: [[0, 0], [2, -0.04], [4, 0]],
      blink: [[3.2, 0], [3.35, 1], [3.55, 0]],
    }),
    mk('look_around', 'Curious', 4, 'shape_neutral', 'ease-in-out', {
      x: [[0, 0], [0.8, -0.55], [1.5, -0.55], [2.4, 0.55], [3.1, 0.55], [4, 0]],
      y: [[0, 0], [0.8, -0.08], [2.4, -0.05], [4, 0]],
      rot: [[0, 0], [0.8, -4], [2.4, 4], [4, 0]],
      blink: [[1.6, 0], [1.72, 1], [1.88, 0]],
    }),
    mk('curious_glance', 'Curious', 2.4, 'shape_neutral', 'ease-out', {
      x: [[0, 0], [0.5, 0.5], [1.5, 0.5], [2.4, 0]],
      y: [[0, 0], [0.5, -0.16], [1.5, -0.16], [2.4, 0]],
      rot: [[0, 0], [0.5, 7], [1.5, 7], [2.4, 0]],
      scale: [[0, 1], [0.5, 1.15], [1.5, 1.15], [2.4, 1]],
    }),
    mk('happy_squint', 'Happy', 2.4, 'shape_happy', 'ease-in-out', {
      y: [[0, 0], [0.4, -0.1], [0.8, 0.05], [1.2, -0.1], [1.6, 0.05], [2.4, 0]],
      scale: [[0, 0.9], [0.4, 1.1], [1.2, 1.1], [2.4, 1]],
      squash: [[0, 0], [0.4, 0.15], [1.2, 0.15], [2.4, 0]],
    }),
    mk('sad_droop', 'Sad', 3.2, 'shape_sad', 'ease-in-out', {
      y: [[0, 0], [1.2, 0.28], [3.2, 0.28]],
      rot: [[0, 0], [1.2, -5], [3.2, -5]],
      scale: [[0, 1], [1.2, 0.9], [3.2, 0.9]],
      blink: [[0, 0], [1.2, 0.3], [2.2, 0.3], [2.6, 0.85], [3.2, 0.3]],
    }),
    mk('angry_glare', 'Angry', 2.2, 'shape_angry', 'ease-out', {
      scale: [[0, 1], [0.3, 1.18], [2.2, 1.12]],
      squash: [[0, 0], [0.3, 0.25], [2.2, 0.2]],
      y: [[0, 0], [0.3, 0.06], [2.2, 0.06]],
      x: [[0, 0], [0.55, -0.04], [0.65, 0.04], [0.75, -0.04], [0.85, 0.04], [1, 0]],
    }),
    mk('surprised_widening', 'Surprised', 2, 'shape_round', 'ease-out', {
      scale: [[0, 0.55], [0.25, 1.45], [0.7, 1.3], [2, 1.05]],
      blink: [[0, 0.9], [0.2, 0]],
      y: [[0, 0.08], [0.25, -0.1], [2, 0]],
      squash: [[0, 0], [0.25, -0.1], [0.7, 0]],
    }),
    mk('bored_blink', 'Bored', 3.6, 'shape_neutral', 'ease-in-out', {
      blink: [[0, 0], [0.3, 0.5], [1.5, 0.5], [1.7, 1], [1.95, 0.5], [3.6, 0.5]],
      y: [[0, 0], [0.3, 0.1], [3.6, 0.1]],
      x: [[0, 0], [1, 0], [2.6, 0.35], [3.6, 0.35]],
    }),
    mk('sleeping_eyes', 'Sleeping', 4, 'shape_sleepy', 'ease-in-out', {
      y: [[0, 0.05], [2, 0.14], [4, 0.05]],
      scale: [[0, 1], [2, 0.95], [4, 1]],
    }),
    mk('waking_up', 'Waking', 3, 'shape_neutral', 'ease-in-out', {
      blink: [[0, 1], [0.5, 0.75], [0.85, 1], [1.3, 0.4], [1.6, 0.9], [2.2, 0]],
      scale: [[0, 0.9], [2.2, 1.12], [3, 1]],
      y: [[0, 0.15], [2.2, -0.05], [3, 0]],
    }),
    mk('thinking_hmm', 'Thinking', 2.8, 'shape_neutral', 'ease-in-out', {
      x: [[0, 0], [0.5, 0.45], [1.8, 0.45], [2.8, 0.2]],
      y: [[0, 0], [0.5, -0.35], [1.8, -0.3], [2.8, -0.1]],
      rot: [[0, 0], [0.5, 9], [1.8, 9], [2.8, 3]],
      squash: [[0, 0], [0.5, -0.1], [2.8, -0.05]],
      blink: [[1.3, 0], [1.42, 1], [1.58, 0]],
    }),
    mk('talking', 'Talking', 2, 'shape_neutral', 'ease-in-out', {
      y: [[0, 0.03], [0.25, -0.11], [0.5, 0.03], [0.75, -0.11], [1, 0.03], [1.25, -0.11], [1.5, 0.03], [1.75, -0.08], [2, 0.03]],
      squash: [[0, -0.04], [0.25, 0.1], [0.5, -0.04], [0.75, 0.1], [1, -0.04], [1.25, 0.1], [1.5, -0.04], [1.75, 0.07], [2, -0.04]],
      scale: [[0, 1], [1, 1.04], [2, 1]],
      blink: [[1.3, 0], [1.4, 1], [1.55, 0]],
    }),
    mk('loving_heart', 'Happy', 2.8, 'shape_heart', 'ease-in-out', {
      scale: [[0, 0.85], [0.35, 1.18], [0.7, 0.95], [1.05, 1.22], [1.4, 0.95], [2.1, 1.1], [2.8, 1]],
      y: [[0, 0.04], [0.35, -0.04], [2.8, 0]],
    }),
  ]
}

export function defaultSequence(anims: Animation[]): Sequence {
  const order = ['waking_up', 'look_around', 'happy_squint', 'curious_glance', 'talking', 'sad_droop', 'surprised_widening', 'bored_blink', 'sleeping_eyes']
  return {
    id: 'seq_main',
    name: 'Morning routine',
    clips: order
      .filter((n) => anims.some((a) => a.name === n))
      .map((n, i) => ({
        id: uid('clip'),
        animId: 'anim_' + n,
        transition: i % 4 === 3 ? { type: 'cut' as const, dur: 0 } : { type: 'crossfade' as const, dur: 0.5 },
      })),
  }
}

/** Zephia face panel: 480x128 px (3.75:1), 95x25 mm active area, behind a pill visor. LED grid = 4x4 physical px per LED. */
export const PANEL = { pxW: 480, pxH: 128, mmW: 95, mmH: 25 }

export const PILL_RES = [
  { w: 120, h: 32, label: '120×32 · ¼ panel (default)' },
  { w: 240, h: 64, label: '240×64 · ½ panel' },
  { w: 480, h: 128, label: '480×128 · native panel' },
  { w: 60, h: 16, label: '60×16 · ⅛ panel' },
  { w: 64, h: 32, label: '64×32 · classic 2:1' },
  { w: 32, h: 16, label: '32×16 · classic 2:1' },
]
export const ROUND_RES = [
  { w: 32, h: 32, label: '32×32' },
  { w: 48, h: 48, label: '48×48' },
  { w: 64, h: 64, label: '64×64' },
  { w: 128, h: 128, label: '128×128' },
]

export function makeDefaultProject(): Project {
  const animations = presetAnimations()
  const seq = defaultSequence(animations)
  return {
    version: 1,
    name: 'Zephia · default face',
    screen: { w: 120, h: 32, shape: 'pill', color: '#ffffff' },
    rig: { name: 'zephia_rig', shapeId: 'shape_neutral', mirror: true, spacing: 1, size: 1, rightOffset: { x: 0, y: 0, rot: 0 } },
    shapes: PRESET_SHAPES.map((s) => structuredClone(s)),
    base: { ...DEFAULT_POSE },
    animations,
    sequences: [seq],
    activeAnimId: 'anim_look_around',
    activeSeqId: seq.id,
  }
}
