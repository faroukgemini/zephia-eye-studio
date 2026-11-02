/** One shared requestAnimationFrame ticker + small playback clocks. */
type Fn = (dt: number, now: number) => void
const fns = new Set<Fn>()
let raf = 0
let last = 0
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  fns.forEach((f) => f(dt, now))
  raf = fns.size ? requestAnimationFrame(loop) : 0
}
export function onFrame(fn: Fn): () => void {
  fns.add(fn)
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
  return () => {
    fns.delete(fn)
  }
}

export class Clock {
  time = 0
  playing = false
  loop = true
  duration = 1
  speed = 1
  private subs = new Set<() => void>()
  private off: (() => void) | null = null
  onEnd?: () => void

  subscribe = (fn: () => void) => {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }
  private emit() {
    this.subs.forEach((f) => f())
  }
  play() {
    if (this.playing) return
    if (!this.loop && this.time >= this.duration - 1e-3) this.time = 0
    this.playing = true
    this.off = onFrame((dt) => {
      this.time += dt * this.speed
      if (this.time >= this.duration) {
        if (this.loop) this.time = this.duration > 0 ? this.time % this.duration : 0
        else {
          this.time = this.duration
          this.stop(false)
          this.onEnd?.()
        }
      }
      this.emit()
    })
    this.emit()
  }
  stop(rewind = false) {
    this.playing = false
    this.off?.()
    this.off = null
    if (rewind) this.time = 0
    this.emit()
  }
  toggle() {
    this.playing ? this.stop() : this.play()
  }
  seek(t: number) {
    this.time = Math.min(this.duration, Math.max(0, t))
    this.emit()
  }
  setDuration(d: number) {
    this.duration = Math.max(0.01, d)
    if (this.time > this.duration) this.time = this.duration
  }
}

export const animClock = new Clock()
export const seqClock = new Clock()
