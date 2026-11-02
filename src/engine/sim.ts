import { getProject } from '../store'
import { Clock } from './clock'
import { evalClips } from './anim'
import { classify, MOOD_EMOTION, MOOD_SEQUENCE, pickReply, type Classification, type Mood } from './classifier'
import { uid } from './geometry'
import type { Clip, Emotion, RenderState } from '../types'

export interface LogLine { id: number; t: string; msg: string; kind: 'sys' | 'in' | 'ai' | 'ok' | 'warn' }

type Status = 'BOOTING' | 'IDLE' | 'THINKING' | 'SPEAKING'

/** Live simulator: plays local animation playlists on the Zephia ball face. */
class SimPlayer {
  clock = new Clock()
  clips: Clip[] = []
  status: Status = 'BOOTING'
  mood: Mood = 'neutral'
  moodLabel = 'BOOTING'
  emotion: Emotion = 'Waking'
  lastClass: Classification | null = null
  readingNo = 0
  speech = { text: '', shown: 0 }
  logs: LogLine[] = []
  private logId = 0
  private timers: number[] = []
  private subs = new Set<() => void>()
  version = 0
  consoleOpen = true
  // telemetry
  tel = { eye: 0, blink: 0, pupil: 0.5, intensity: 0, voice: 0 }
  battery = 87.4
  private prev = { x: 0, y: 0, blinkState: false }
  private blinkTimes: number[] = []
  private speakPhase = 0
  private lastNow = performance.now()

  constructor() {
    this.clock.loop = false
  }
  subscribe = (f: () => void) => { this.subs.add(f); return () => this.subs.delete(f) }
  getVersion = () => this.version
  private emit() { this.version++; this.subs.forEach((f) => f()) }

  log(msg: string, kind: LogLine['kind'] = 'sys') {
    const d = new Date()
    const t = d.toTimeString().slice(0, 8)
    this.logs.push({ id: ++this.logId, t, msg, kind })
    if (this.logs.length > 200) this.logs.shift()
    this.emit()
  }
  private later(ms: number, fn: () => void) { this.timers.push(window.setTimeout(fn, ms)) }
  private clearTimers() { this.timers.forEach(clearTimeout); this.timers = [] }

  private build(names: string[], xf = 0.35, loop = false) {
    const p = getProject()
    const clips: Clip[] = []
    names.forEach((n, i) => {
      const a = p.animations.find((x) => x.name === n)
      if (!a) return
      clips.push({ id: uid('c'), animId: a.id, transition: i < names.length - 1 ? { type: xf > 0 ? 'crossfade' : 'cut', dur: xf } : { type: 'cut', dur: 0 } })
    })
    this.clips = clips
    const total = clips.reduce((n, c) => n + (p.animations.find((a) => a.id === c.animId)?.duration ?? 0), 0)
    this.clock.loop = loop
    this.clock.setDuration(Math.max(0.1, total))
    this.clock.time = 0
    this.clock.stop()
    this.clock.onEnd = () => this.onEnd?.()
    this.clock.play()
  }
  private onEnd?: () => void

  idle() {
    this.status = 'IDLE'
    this.speech = { text: '', shown: 0 }
    const extra = ['look_around', 'curious_glance', 'bored_blink'][Math.floor(Math.random() * 3)]
    this.build(['idle_breathe', extra, 'idle_breathe'], 0.4, false)
    this.onEnd = () => this.idle()
    this.emit()
  }

  boot() {
    this.clearTimers()
    this.logs = []
    this.status = 'BOOTING'
    this.moodLabel = 'BOOTING'
    this.mood = 'neutral'
    this.emotion = 'Waking'
    const p = getProject()
    this.build(['waking_up'], 0, false)
    this.onEnd = () => { this.status = 'IDLE'; this.moodLabel = 'NEUTRAL'; this.emotion = 'Neutral'; this.log('Idle loop started · listening', 'ok'); this.idle() }
    const lines: [string, LogLine['kind']][] = [
      ['Zephia woke up', 'ok'],
      ['Eye 1 registered as Active', 'ok'],
      ['Eye 2 registered as Active', 'ok'],
      [`LED matrix ${p.screen.w}x${p.screen.h} initialised (${p.screen.shape} visor)`, 'sys'],
      [`Rig "${p.rig.name}" mapped · EYE-LEFT→master, EYE-RIGHT→master (mirror ${p.rig.mirror ? 'on' : 'off'})`, 'sys'],
      [`Loaded ${p.animations.length} animations, ${p.sequences.length} sequence(s)`, 'sys'],
      ['Playing waking_up', 'sys'],
    ]
    lines.forEach(([m, k], i) => this.later(i * 110, () => this.log(m, k)))
    this.emit()
  }

  reset() {
    this.clearTimers()
    this.lastClass = null
    this.readingNo = 0
    this.speech = { text: '', shown: 0 }
    this.boot()
    this.later(900, () => this.log('Reset complete', 'warn'))
  }

  private think(done: () => void) {
    this.clearTimers()
    this.status = 'THINKING'
    this.moodLabel = 'THINKING'
    this.emotion = 'Thinking'
    this.speech = { text: '', shown: 0 }
    this.build(['thinking_hmm'], 0, false)
    this.onEnd = undefined
    this.log('State → THINKING', 'sys')
    this.emit()
    this.later(1250, done)
  }

  private settle(c: Classification) {
    this.mood = c.mood
    this.moodLabel = c.mood.toUpperCase()
    this.emotion = MOOD_EMOTION[c.mood]
    this.lastClass = c
    this.readingNo++
    this.log(`Classifier → ${c.mood.toUpperCase()} (${Math.round(c.confidence * 100)}%)${c.hits.length ? ' · keywords: ' + c.hits.join(', ') : ' · no keywords, default'}`, 'ok')
  }

  simulate(text: string) {
    const input = text.trim() || '(empty input)'
    this.log(`Input received: "${input}"`, 'in')
    this.think(() => {
      const c = classify(text)
      this.settle(c)
      const seqNames = MOOD_SEQUENCE[c.mood]
      this.status = 'IDLE'
      this.log(`Playing sequence: ${seqNames.join(' → ')}`, 'sys')
      this.build(seqNames, 0.35, false)
      this.onEnd = () => { this.log('Sequence finished', 'sys'); this.idle() }
      this.emit()
    })
  }

  generateAI(text: string) {
    const input = text.trim() || '(empty input)'
    this.log(`Input received: "${input}"`, 'in')
    this.log('Generating AI response (local keyword model, no network)…', 'sys')
    this.think(() => {
      const c = classify(text)
      this.settle(c)
      const reply = pickReply(c.mood)
      this.log(`Response: "${reply}"`, 'ai')
      this.status = 'SPEAKING'
      this.emotion = 'Talking'
      this.speech = { text: reply, shown: 0 }
      const dur = Math.max(2, reply.length / 15)
      const n = Math.max(1, Math.round(dur / 2))
      this.build(Array(n).fill('talking'), 0, false)
      this.log('Playing talking ×' + n, 'sys')
      this.onEnd = () => {
        this.speech = { text: reply, shown: reply.length }
        this.emotion = MOOD_EMOTION[c.mood]
        this.status = 'IDLE'
        const seqNames = MOOD_SEQUENCE[c.mood]
        this.log(`Playing mood sequence: ${seqNames.join(' → ')}`, 'sys')
        this.build(seqNames, 0.35, false)
        this.onEnd = () => { this.log('Sequence finished', 'sys'); this.idle() }
        this.emit()
      }
      this.emit()
    })
  }

  /** called every frame by the face renderer */
  getRenderState = (): RenderState => {
    const p = getProject()
    const st = evalClips(p, this.clips, this.clock.time)
    const now = performance.now()
    const dt = Math.max(0.001, (now - this.lastNow) / 1000)
    this.lastNow = now
    const pose = st.pose
    const vel = Math.hypot(pose.x - this.prev.x, pose.y - this.prev.y) / dt
    this.tel.eye += (Math.min(1, vel * 0.9) - this.tel.eye) * Math.min(1, dt * 6)
    const closed = pose.blink > 0.6
    if (closed && !this.prev.blinkState) this.blinkTimes.push(now)
    this.prev.blinkState = closed
    this.blinkTimes = this.blinkTimes.filter((t) => now - t < 60000)
    const perMin = this.blinkTimes.length * (60000 / Math.min(60000, Math.max(8000, now - this.startedAt)))
    this.tel.blink += (Math.min(1, perMin / 30) - this.tel.blink) * Math.min(1, dt * 2)
    this.tel.pupil += (Math.min(1, Math.max(0, (pose.scale - 0.5) / 1.2)) - this.tel.pupil) * Math.min(1, dt * 5)
    const inten = Math.min(1, Math.abs(pose.scale - 1) * 1.6 + Math.abs(pose.rot) / 25 + Math.abs(pose.squash) + Math.abs(pose.y) * 1.2 + (this.emotion === 'Neutral' ? 0 : 0.15))
    this.tel.intensity += (inten - this.tel.intensity) * Math.min(1, dt * 5)
    this.speakPhase += dt * 11
    const target = this.status === 'SPEAKING' ? 0.55 + 0.4 * Math.abs(Math.sin(this.speakPhase) * Math.sin(this.speakPhase * 0.37 + 1)) : 0.04 + 0.03 * Math.sin(this.speakPhase * 0.3)
    this.tel.voice += (target - this.tel.voice) * Math.min(1, dt * 12)
    this.prev.x = pose.x; this.prev.y = pose.y
    this.battery = Math.max(5, this.battery - dt * 0.004)
    if (this.status === 'SPEAKING' && this.speech.shown < this.speech.text.length) {
      this.speech.shown = Math.min(this.speech.text.length, this.speech.shown + dt * 17)
    }
    return st
  }
  startedAt = performance.now()
  get speechShown() { return this.speech.text.slice(0, Math.floor(this.speech.shown)) }
}

export const sim = new SimPlayer()
