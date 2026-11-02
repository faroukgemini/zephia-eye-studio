import { DEFAULT_POSE, PARAMS, PARAM_META, type Animation, type Clip, type Easing, type Param, type Pose, type Project, type RenderState } from '../types'

export const ease = (e: Easing, t: number) => {
  t = Math.min(1, Math.max(0, t))
  switch (e) {
    case 'ease-in': return t * t * t
    case 'ease-out': return 1 - (1 - t) ** 3
    case 'ease-in-out': return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    default: return t
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Value of one track at time t (undefined if the track is off / empty). */
export function evalTrack(anim: Animation, p: Param, t: number): number | undefined {
  const tr = anim.tracks[p]
  if (!tr.enabled || tr.keys.length === 0) return undefined
  const k = tr.keys
  if (t <= k[0].t) return k[0].v
  const last = k[k.length - 1]
  if (t >= last.t) return last.v
  for (let i = 0; i < k.length - 1; i++) {
    if (t >= k[i].t && t <= k[i + 1].t) {
      const span = k[i + 1].t - k[i].t
      const f = span <= 1e-6 ? 1 : (t - k[i].t) / span
      return lerp(k[i].v, k[i + 1].v, ease(anim.easing, f))
    }
  }
  return last.v
}

export function evalAnimation(anim: Animation, t: number, base: Pose = DEFAULT_POSE): Pose {
  const pose = { ...base }
  for (const p of PARAMS) {
    const v = evalTrack(anim, p, t)
    if (v !== undefined) pose[p] = v
  }
  return pose
}

export const countKeys = (a: Animation) => PARAMS.reduce((n, p) => n + (a.tracks[p].enabled ? a.tracks[p].keys.length : 0), 0)

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), rot: lerp(a.rot, b.rot, t),
    scale: lerp(a.scale, b.scale, t), squash: lerp(a.squash, b.squash, t),
    blink: lerp(a.blink, b.blink, t), curve: lerp(a.curve, b.curve, t),
  }
}

export function clampPose(p: Pose): Pose {
  const o = { ...p }
  for (const k of PARAMS) o[k] = Math.min(PARAM_META[k].max, Math.max(PARAM_META[k].min, o[k]))
  return o
}

export function stateForAnimation(project: Project, anim: Animation, t: number, useBase = true): RenderState {
  return {
    pose: evalAnimation(anim, t, useBase ? project.base : { ...DEFAULT_POSE, curve: project.base.curve }),
    layers: [{ shapeId: anim.shapeId ?? project.rig.shapeId, w: 1 }],
  }
}

export interface Placed {
  clip: Clip
  anim: Animation
  start: number
  len: number
  /** crossfade window (centred on the boundary with the next clip) */
  xf: number
}

export function layoutClips(project: Project, clips: Clip[]): { placed: Placed[]; total: number } {
  const placed: Placed[] = []
  let t = 0
  clips.forEach((clip, i) => {
    const anim = project.animations.find((a) => a.id === clip.animId)
    if (!anim) return
    const len = anim.duration
    const next = project.animations.find((a) => a.id === clips[i + 1]?.animId)
    let xf = 0
    if (next && clip.transition.type === 'crossfade') xf = Math.min(clip.transition.dur, len, next.duration)
    placed.push({ clip, anim, start: t, len, xf })
    t += len
  })
  return { placed, total: t }
}

/** Evaluate a laid-out sequence at time T, crossfading parameters across transitions. */
export function evalPlaced(project: Project, placed: Placed[], total: number, T: number): RenderState {
  const base = { ...DEFAULT_POSE, curve: project.base.curve }
  if (placed.length === 0) return { pose: base, layers: [{ shapeId: project.rig.shapeId, w: 1 }] }
  T = Math.min(Math.max(0, T), Math.max(0, total - 1e-6))
  let i = placed.findIndex((p) => T >= p.start && T < p.start + p.len)
  if (i < 0) i = placed.length - 1
  const cur = placed[i]
  const shapeOf = (a: Animation) => a.shapeId ?? project.rig.shapeId
  let pose = evalAnimation(cur.anim, T - cur.start, base)
  let layers = [{ shapeId: shapeOf(cur.anim), w: 1 }]
  // blending into next clip (first half of window sits before boundary)
  const end = cur.start + cur.len
  const nxt = placed[i + 1]
  if (nxt && cur.xf > 0 && T > end - cur.xf / 2) {
    const w = ease('ease-in-out', (T - (end - cur.xf / 2)) / cur.xf)
    const pb = evalAnimation(nxt.anim, 0, base)
    pose = lerpPose(pose, pb, w)
    layers = mixLayers(layers, shapeOf(nxt.anim), w)
  }
  // blending from previous clip (second half of window after boundary)
  const prv = placed[i - 1]
  if (prv && prv.xf > 0 && T < cur.start + prv.xf / 2) {
    const w = 1 - ease('ease-in-out', (T - (cur.start - prv.xf / 2)) / prv.xf)
    const pa = evalAnimation(prv.anim, prv.len, base)
    pose = lerpPose(pose, pa, w)
    layers = mixLayers([{ shapeId: shapeOf(cur.anim), w: 1 }], shapeOf(prv.anim), w)
  }
  return { pose, layers }
}

function mixLayers(a: { shapeId: string; w: number }[], other: string, w: number) {
  if (a[0].shapeId === other) return a
  return [{ shapeId: a[0].shapeId, w: 1 - w }, { shapeId: other, w }]
}

export function evalClips(project: Project, clips: Clip[], T: number): RenderState {
  const { placed, total } = layoutClips(project, clips)
  return evalPlaced(project, placed, total, T)
}
