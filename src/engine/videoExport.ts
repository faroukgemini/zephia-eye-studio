import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer'
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer'
import type { Project, RenderState } from '../types'
import { evalClips, layoutClips, stateForAnimation } from './anim'
import { paintPreview } from './paintPreview'
import { PANEL } from './presets'

export type VideoFormat = 'mp4' | 'webm' | 'gif'
export type VideoScope = 'anim' | 'seq'

export class ExportCancelled extends Error {
  constructor() { super('Export cancelled') }
}

export interface VideoExportOpts {
  scope: VideoScope
  format: VideoFormat
  fps: 24 | 30 | 60
  faceW: number
  faceH: number
  /** null = transparent (WebM alpha, or GIF transparency) */
  background: string | null
  /** 0 = forever for GIF. Video repeats the cycle this many times; 0 or 1 exports one cycle. */
  loops: number
  ball: boolean
}

export interface VideoExportResult {
  blob: Blob
  filename: string
  format: VideoFormat
  width: number
  height: number
  fallback: boolean
}

export interface VideoHooks {
  onProgress: (done: number, total: number) => void
  aborted: () => boolean
}

export const even = (n: number) => Math.max(2, Math.round(Number(n) / 2) * 2)

export function nativeFaceSize(shape: 'pill' | 'round') {
  return shape === 'round' ? { w: 480, h: 480 } : { w: PANEL.pxW, h: PANEL.pxH }
}

export function sourceDuration(project: Project, scope: VideoScope) {
  if (scope === 'anim') {
    const anim = project.animations.find((a) => a.id === project.activeAnimId) ?? project.animations[0]
    return { seconds: Math.max(0.05, anim.duration), label: anim.name }
  }
  const seq = project.sequences.find((s) => s.id === project.activeSeqId) ?? project.sequences[0]
  return { seconds: Math.max(0.05, layoutClips(project, seq.clips).total || 0.05), label: seq.name }
}

export function outputSize(faceW: number, faceH: number, round: boolean, ball: boolean) {
  const w = even(faceW)
  const h = even(faceH)
  if (!ball) return { w, h }
  const lay = ballLayout(w, h, round)
  return { w: lay.ballW, h: lay.ballH }
}

export function webCodecsAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

function frameState(project: Project, scope: VideoScope, t: number): RenderState {
  if (scope === 'anim') {
    const anim = project.animations.find((a) => a.id === project.activeAnimId) ?? project.animations[0]
    return stateForAnimation(project, anim, t, true)
  }
  const seq = project.sequences.find((s) => s.id === project.activeSeqId) ?? project.sequences[0]
  return evalClips(project, seq.clips, t)
}

function ballLayout(faceW: number, faceH: number, round: boolean) {
  const pad = round ? 0.03 : 0.022
  const frac = round ? 0.46 : 0.72
  const visorW = faceW / (1 - 2 * pad)
  const visorH = faceH + visorW * pad * 2
  const ballW = even(visorW / frac)
  const ballH = even(ballW * (540 / 520))
  const cx = ballW * 0.5
  const cy = ballH * 0.463
  return {
    ballW, ballH,
    faceX: Math.round(cx - faceW / 2),
    faceY: Math.round(cy - faceH / 2),
    visorW, visorH, cx, cy,
  }
}

function screenPath(ctx: CanvasRenderingContext2D, w: number, h: number, shape: 'pill' | 'round') {
  ctx.beginPath()
  if (shape === 'round') {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
    return
  }
  const r = Math.min(w, h) / 2
  ctx.moveTo(r, 0)
  ctx.arcTo(w, 0, w, h, r)
  ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r)
  ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath()
}

/** Punch the visor shape out so corners match the rounded preview. */
function maskToScreen(ctx: CanvasRenderingContext2D, w: number, h: number, shape: 'pill' | 'round') {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = '#fff'
  screenPath(ctx, w, h, shape)
  ctx.fill()
  ctx.restore()
}

function drawRobot(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  const sx = w / 520
  const sy = h / 540
  ctx.save()
  ctx.scale(sx, sy)
  const shadow = ctx.createRadialGradient(260, 506, 10, 260, 506, 200)
  shadow.addColorStop(0, 'rgba(0,0,0,0.28)')
  shadow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shadow
  ctx.beginPath()
  ctx.ellipse(260, 506, 200, 22, 0, 0, Math.PI * 2)
  ctx.fill()
  const base = ctx.createLinearGradient(0, 470, 0, 530)
  base.addColorStop(0, '#d8dcd5')
  base.addColorStop(1, '#a8aea5')
  ctx.fillStyle = base
  ctx.beginPath()
  ctx.moveTo(150, 470)
  ctx.quadraticCurveTo(260, 520, 370, 470)
  ctx.lineTo(350, 500)
  ctx.quadraticCurveTo(260, 530, 170, 500)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#cfd3cb'
  ctx.beginPath()
  ctx.ellipse(260, 468, 112, 20, 0, 0, Math.PI * 2)
  ctx.fill()
  const ring = ctx.createLinearGradient(150, 0, 370, 0)
  ring.addColorStop(0, '#c8ff3a')
  ring.addColorStop(1, '#7be0ff')
  ctx.strokeStyle = ring
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.ellipse(260, 462, 104, 14, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  const body = ctx.createRadialGradient(180, 140, 20, 260, 250, 280)
  body.addColorStop(0, '#ffffff')
  body.addColorStop(0.55, '#eceee9')
  body.addColorStop(1, '#bfc4bd')
  ctx.fillStyle = body
  ctx.strokeStyle = '#aab0a6'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(260, 250, 214, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(260, 250, 198, Math.PI, 0, true)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(260, 250, 190, Math.PI * 1.15, Math.PI * 1.85)
  ctx.stroke()
  ctx.fillStyle = '#dfe3da'
  ctx.strokeStyle = '#aab0a6'
  ctx.lineWidth = 1
  for (const x of [52, 468]) {
    ctx.beginPath()
    ctx.arc(x, 250, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.fillStyle = accent
    ctx.arc(x, 250, 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#dfe3da'
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath()
  ctx.roundRect(236, 426, 48, 6, 3)
  ctx.fill()
  ctx.restore()
}

function drawVisor(ctx: CanvasRenderingContext2D, lay: ReturnType<typeof ballLayout>, face: HTMLCanvasElement, round: boolean) {
  const padX = (lay.visorW - face.width) / 2
  const padY = (lay.visorH - face.height) / 2
  const x = lay.faceX - padX
  const y = lay.faceY - padY
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#05070a'
  screenPath(ctx, lay.visorW, lay.visorH, round ? 'round' : 'pill')
  ctx.fill()
  ctx.restore()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(face, lay.faceX, lay.faceY)
  ctx.save()
  ctx.translate(x, y)
  screenPath(ctx, lay.visorW, lay.visorH, round ? 'round' : 'pill')
  ctx.clip()
  const g = ctx.createLinearGradient(0, 0, lay.visorW, lay.visorH)
  g.addColorStop(0, 'rgba(255,255,255,0.22)')
  g.addColorStop(0.36, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, lay.visorW, lay.visorH * 0.55)
  ctx.restore()
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true, alpha: true })
  if (!ctx) throw new Error('2D canvas is not available')
  return { canvas: c, ctx }
}

function paintFace(ctx: CanvasRenderingContext2D, project: Project, state: RenderState, w: number, h: number, background: string | null) {
  paintPreview(ctx, project, state, w, h, 1, background)
  maskToScreen(ctx, w, h, project.screen.shape)
}

function composeFrame(
  out: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  face: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D },
  project: Project,
  state: RenderState,
  opts: VideoExportOpts,
  lay: ReturnType<typeof ballLayout> | null,
) {
  paintFace(face.ctx, project, state, opts.faceW, opts.faceH, opts.background)
  if (!opts.ball || !lay) {
    // Face-only renders straight into `face`. destination-over fills the rounded corners
    // without wiping the eyes (drawing the canvas onto itself would).
    if (opts.background) {
      face.ctx.save()
      face.ctx.globalCompositeOperation = 'destination-over'
      face.ctx.fillStyle = opts.background
      face.ctx.fillRect(0, 0, opts.faceW, opts.faceH)
      face.ctx.restore()
    }
    return
  }
  out.setTransform(1, 0, 0, 1, 0, 0)
  out.globalCompositeOperation = 'source-over'
  out.globalAlpha = 1
  out.clearRect(0, 0, outW, outH)
  if (opts.background) {
    out.fillStyle = opts.background
    out.fillRect(0, 0, outW, outH)
  }
  drawRobot(out, outW, outH, project.screen.color || '#d6ff3f')
  drawVisor(out, lay, face.canvas, project.screen.shape === 'round')
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0))

function safeName(s: string) {
  return (s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'zephia').slice(0, 80)
}

function bitrateFor(w: number, h: number, fps: number) {
  return Math.min(24_000_000, Math.max(900_000, Math.round(w * h * fps * 0.45)))
}

async function pickAvc(w: number, h: number, fps: number, bitrate: number): Promise<VideoEncoderConfig> {
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16)
  const codecs = mbs > 8192 || w > 1920 ? ['avc1.640033', 'avc1.640028', 'avc1.42001f'] : mbs > 3600 || w > 1280 ? ['avc1.640028', 'avc1.42001f', 'avc1.640033'] : ['avc1.42001f', 'avc1.640028']
  let last = ''
  for (const codec of codecs) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' }
    try {
      const r = await VideoEncoder.isConfigSupported(config)
      if (r.supported) return config
      last = codec
    } catch (e) { last = (e as Error).message }
  }
  throw new Error('H.264 encoder rejected ' + w + '×' + h + (last ? ' (' + last + ')' : ''))
}

async function pickVp9(w: number, h: number, fps: number, bitrate: number, alpha: boolean): Promise<VideoEncoderConfig> {
  const codecs = alpha ? ['vp09.00.10.08', 'vp8'] : ['vp09.00.10.08', 'vp8']
  for (const codec of codecs) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality' }
    if (alpha) config.alpha = 'keep'
    try {
      const r = await VideoEncoder.isConfigSupported(config)
      if (r.supported) return config
    } catch { /* try the next codec */ }
  }
  if (alpha) throw new Error('This browser cannot encode WebM with transparency. Choose a background colour instead.')
  throw new Error('No VP8/VP9 encoder for ' + w + '×' + h)
}

async function encodeWebCodecs(
  canvas: HTMLCanvasElement,
  draw: (i: number) => void,
  count: number,
  fps: number,
  kind: 'mp4' | 'webm',
  alpha: boolean,
  hooks: VideoHooks,
): Promise<Blob> {
  const { width: w, height: h } = canvas
  if (w > 4096 || h > 4096) throw new Error(`Output ${w}×${h} is too large. Use a smaller resolution.`)
  const bitrate = bitrateFor(w, h, fps)
  const config = kind === 'mp4' ? await pickAvc(w, h, fps, bitrate) : await pickVp9(w, h, fps, bitrate, alpha)
  if (kind === 'mp4') {
    const target = new Mp4Target()
    const muxer = new Mp4Muxer({ target, fastStart: 'in-memory', firstTimestampBehavior: 'strict', video: { codec: 'avc', width: w, height: h, frameRate: fps } })
    return runEncoder(canvas, draw, count, fps, config, (chunk, meta) => muxer.addVideoChunk(chunk, meta), () => { muxer.finalize(); return new Blob([target.buffer], { type: 'video/mp4' }) }, hooks)
  }
  const target = new WebmTarget()
  const muxer = new WebmMuxer({
    target,
    firstTimestampBehavior: 'strict',
    video: { codec: config.codec.startsWith('vp8') ? 'V_VP8' : 'V_VP9', width: w, height: h, frameRate: fps, alpha },
  })
  return runEncoder(canvas, draw, count, fps, config, (chunk, meta) => muxer.addVideoChunk(chunk, meta), () => { muxer.finalize(); return new Blob([target.buffer], { type: 'video/webm' }) }, hooks)
}

async function runEncoder(
  canvas: HTMLCanvasElement,
  draw: (i: number) => void,
  count: number,
  fps: number,
  config: VideoEncoderConfig,
  push: (chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void,
  finish: () => Blob,
  hooks: VideoHooks,
): Promise<Blob> {
  let encError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => push(chunk, meta),
    error: (e) => { encError = e instanceof Error ? e : new Error(String(e)) },
  })
  encoder.configure(config)
  const dur = Math.round(1_000_000 / fps)
  try {
    for (let i = 0; i < count; i++) {
      if (hooks.aborted()) throw new ExportCancelled()
      if (encError) throw encError
      draw(i)
      const ts = Math.round(i * 1_000_000 / fps)
      const frame = new VideoFrame(canvas, { timestamp: ts, duration: dur })
      encoder.encode(frame, { keyFrame: i % fps === 0 })
      frame.close()
      hooks.onProgress(i + 1, count)
      while (encoder.encodeQueueSize > 6) {
        if (hooks.aborted()) throw new ExportCancelled()
        await yieldToUi()
      }
      if ((i & 1) === 1) await yieldToUi()
    }
    await encoder.flush()
    if (encError) throw encError
    if (hooks.aborted()) throw new ExportCancelled()
    return finish()
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}

async function recordMediaRecorder(canvas: HTMLCanvasElement, draw: (i: number) => void, count: number, fps: number, hooks: VideoHooks) {
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: bitrateFor(canvas.width, canvas.height, fps) } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve, reject) => {
    rec.addEventListener('stop', () => resolve())
    rec.addEventListener('error', () => reject(new Error('MediaRecorder failed')))
  })
  rec.start(200)
  const step = 1000 / fps
  for (let i = 0; i < count; i++) {
    if (hooks.aborted()) { rec.stop(); await stopped; throw new ExportCancelled() }
    draw(i)
    track.requestFrame()
    hooks.onProgress(i + 1, count)
    await new Promise((r) => setTimeout(r, step))
  }
  rec.stop()
  await stopped
  return new Blob(chunks, { type: 'video/webm' })
}

async function encodeGif(canvas: HTMLCanvasElement, draw: (i: number) => void, count: number, fps: number, loops: number, transparent: boolean, hooks: VideoHooks) {
  const gif = GIFEncoder()
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const format = transparent ? 'rgba4444' : 'rgb565'
  const repeat = loops <= 0 ? 0 : loops === 1 ? -1 : loops - 1
  const delay = Math.round(1000 / fps)
  for (let i = 0; i < count; i++) {
    if (hooks.aborted()) throw new ExportCancelled()
    draw(i)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const palette = quantize(data, 256, transparent ? { format, oneBitAlpha: 16, clearAlpha: true } : { format })
    const index = applyPalette(data, palette, format)
    let transparentIndex: number | undefined
    if (transparent) {
      const found = palette.findIndex((c) => (c[3] ?? 255) === 0)
      transparentIndex = found >= 0 ? found : undefined
    }
    gif.writeFrame(index, canvas.width, canvas.height, {
      palette,
      delay,
      repeat: i === 0 ? repeat : undefined,
      transparent: transparentIndex != null,
      transparentIndex,
    })
    hooks.onProgress(i + 1, count)
    await yieldToUi()
  }
  gif.finish()
  const bytes = gif.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: 'image/gif' })
}

/**
 * Render the active animation or sequence offline, one frame per tick, using the same painter as the preview.
 * MP4 uses WebCodecs + mp4-muxer. WebM uses WebCodecs + webm-muxer (alpha when requested).
 * If WebCodecs is missing, MP4 and WebM fall back to a paced MediaRecorder WebM.
 */
export async function exportVideo(project: Project, opts: VideoExportOpts, hooks: VideoHooks): Promise<VideoExportResult> {
  const src = sourceDuration(project, opts.scope)
  const faceW = even(opts.faceW)
  const faceH = even(opts.faceH)
  const round = project.screen.shape === 'round'
  const size = outputSize(faceW, faceH, round, opts.ball)
  const lay = opts.ball ? ballLayout(faceW, faceH, round) : null
  const cycle = Math.max(1, Math.round(src.seconds * opts.fps))
  const repeats = opts.format === 'gif' ? 1 : Math.max(1, opts.loops || 1)
  const total = cycle * repeats
  const transparent = opts.background == null
  if (transparent && opts.format === 'mp4') throw new Error('MP4 cannot store transparency. Choose WebM.')
  const fixed: VideoExportOpts = { ...opts, faceW, faceH }
  const face = makeCanvas(faceW, faceH)
  const out = (!opts.ball) ? face : makeCanvas(size.w, size.h)
  const drawIndex = (index: number) => {
    const i = index % cycle
    const t = Math.min(src.seconds, i / opts.fps)
    composeFrame(out.ctx, size.w, size.h, face, project, frameState(project, opts.scope, t), fixed, lay)
  }
  const base = safeName(src.label)
  let format: VideoFormat = opts.format
  let fallback = false
  let blob: Blob
  const codecs = webCodecsAvailable()
  if (format === 'gif') {
    if (transparent) throw new Error('Transparent output is WebM with alpha only.')
    blob = await encodeGif(out.canvas, drawIndex, total, opts.fps, opts.loops, false, hooks)
  } else if (!codecs) {
    if (transparent) throw new Error('Transparent WebM needs WebCodecs, which this browser does not provide.')
    format = 'webm'
    fallback = opts.format === 'mp4'
    blob = await recordMediaRecorder(out.canvas, drawIndex, total, opts.fps, hooks)
  } else if (format === 'mp4') {
    blob = await encodeWebCodecs(out.canvas, drawIndex, total, opts.fps, 'mp4', false, hooks)
  } else {
    blob = await encodeWebCodecs(out.canvas, drawIndex, total, opts.fps, 'webm', transparent, hooks)
  }
  return {
    blob,
    filename: `${base}.${size.w}x${size.h}.${opts.fps}fps.${format === 'gif' ? 'gif' : format}`,
    format,
    width: size.w,
    height: size.h,
    fallback,
  }
}
