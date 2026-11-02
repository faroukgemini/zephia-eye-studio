import type { Animation, Project } from '../types'
import { evalPlaced, layoutClips, stateForAnimation } from './anim'
import { getMask } from './geometry'
import { PANEL } from './presets'
import { rasterize, toHexRows } from './raster'

export interface ExportOpts { fps: number; threshold: number }

function header(project: Project, name: string, kind: string, fps: number, frameCount: number, durationMs: number, threshold: number) {
  const s = project.screen
  return {
    format: 'zephia.led-frames',
    version: 1,
    generator: 'Zephia Eye Studio',
    name, kind,
    matrix: {
      width: s.w, height: s.h, shape: s.shape,
      bitOrder: 'msb-left', rowEncoding: 'hex', charsPerRow: Math.ceil(s.w / 4), onThreshold: threshold,
      note: 'Each frame is `height` hex strings; each string packs `width` LEDs, leftmost LED = MSB of first nibble. LEDs outside the visor mask are 0.',
      panel: s.shape === 'pill'
        ? { pxWidth: PANEL.pxW, pxHeight: PANEL.pxH, activeAreaMm: [PANEL.mmW, PANEL.mmH], pxPerLed: [PANEL.pxW / s.w, PANEL.pxH / s.h] }
        : undefined,
    },
    fps, frameCount, durationMs,
    rig: { name: project.rig.name, mirror: project.rig.mirror },
  }
}

export function exportAnimationFrames(project: Project, anim: Animation, o: ExportOpts) {
  const n = Math.max(1, Math.round(anim.duration * o.fps))
  const frames: { i: number; t: number; rows: string[] }[] = []
  const buf = new Uint8Array(project.screen.w * project.screen.h)
  for (let i = 0; i < n; i++) {
    const t = Math.min(anim.duration, i / o.fps)
    rasterize(project, stateForAnimation(project, anim, t, false), buf)
    frames.push({ i, t: Math.round(t * 1000), rows: toHexRows(buf, project.screen.w, project.screen.h, o.threshold) })
  }
  return { ...header(project, anim.name, 'animation', o.fps, n, Math.round(anim.duration * 1000), o.threshold), emotion: anim.emotion, frames }
}

export function exportSequenceFrames(project: Project, seqId: string, o: ExportOpts) {
  const seq = project.sequences.find((s) => s.id === seqId) ?? project.sequences[0]
  const { placed, total } = layoutClips(project, seq.clips)
  const n = Math.max(1, Math.round(total * o.fps))
  const frames: { i: number; t: number; rows: string[] }[] = []
  const buf = new Uint8Array(project.screen.w * project.screen.h)
  for (let i = 0; i < n; i++) {
    const t = Math.min(total, i / o.fps)
    rasterize(project, evalPlaced(project, placed, total, t), buf)
    frames.push({ i, t: Math.round(t * 1000), rows: toHexRows(buf, project.screen.w, project.screen.h, o.threshold) })
  }
  return {
    ...header(project, seq.name, 'sequence', o.fps, n, Math.round(total * 1000), o.threshold),
    clips: placed.map((p) => ({ animation: p.anim.name, emotion: p.anim.emotion, startMs: Math.round(p.start * 1000), lengthMs: Math.round(p.len * 1000), transitionToNext: p.clip.transition })),
    frames,
  }
}

export function downloadJSON(name: string, data: unknown, pretty = false) {
  const blob = new Blob([JSON.stringify(data, null, pretty ? 2 : undefined)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
void getMask
