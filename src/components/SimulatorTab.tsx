import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useProject } from '../store'
import { sim } from '../engine/sim'
import { onFrame } from '../engine/clock'
import { LedScreen } from './LedScreen'
import { EMOTION_COLOR } from '../types'

const SAMPLES = ['I love you so much, you make me happy!', 'Why are you so slow? This is so annoying.', 'Wow, what is that? I did not expect this!', 'I feel lonely and sad today…', 'Good night, I am so tired.']

function Bar({ label, v, unit, color, testId }: { label: string; v: number; unit?: string; color?: string; testId?: string }) {
  return (
    <div className="sbar" data-testid={testId}>
      <div className="sbar-h"><span>{label}</span><b>{unit ?? Math.round(v * 100) + '%'}</b></div>
      <div className="sbar-t"><i style={{ width: `${Math.max(1, Math.min(100, v * 100))}%`, background: color }} /></div>
    </div>
  )
}

export function SimulatorTab() {
  useSyncExternalStore(sim.subscribe, sim.getVersion)
  const screen = useProject((s) => s.project.screen)
  const preview = useProject((s) => s.project.render.preview)
  const update = useProject((s) => s.update)
  const [text, setText] = useState('')
  const [, setTick] = useState(0)
  const wave = useRef<HTMLCanvasElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const hist = useRef<number[]>(new Array(160).fill(0))
  const phase = useRef(0)

  // boot once per page session; keep running when switching tabs
  useEffect(() => {
    if (sim.status === 'BOOTING' && sim.logs.length === 0) sim.boot()
    else if (!sim.clock.playing && sim.clips.length === 0) sim.boot()
    sim.startedAt = performance.now()
    const id = window.setInterval(() => setTick((n) => n + 1), 100)
    const off = onFrame((dt) => {
      const c = wave.current
      if (!c) return
      const ctx = c.getContext('2d')!
      const W = c.width, H = c.height
      phase.current += dt * 22
      const h = hist.current
      h.push(sim.tel.voice * Math.sin(phase.current) + 0.15 * sim.tel.voice * Math.sin(phase.current * 2.7))
      h.shift()
      ctx.clearRect(0, 0, W, H)
      ctx.strokeStyle = 'rgba(20,24,30,.08)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke()
      ctx.strokeStyle = sim.status === 'SPEAKING' ? '#ff6bb0' : '#6aa600'
      ctx.lineWidth = 2; ctx.lineJoin = 'round'
      ctx.beginPath()
      h.forEach((v, i) => { const x = (i / (h.length - 1)) * W, y = H / 2 - v * (H * 0.46); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) })
      ctx.stroke()
    })
    return () => { clearInterval(id); off() }
  }, [])

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [sim.logs.length, sim.consoleOpen])

  const busy = sim.status === 'THINKING'
  const label = sim.moodLabel
  const col = sim.status === 'THINKING' ? EMOTION_COLOR.Thinking : sim.status === 'BOOTING' ? EMOTION_COLOR.Waking : EMOTION_COLOR[sim.emotion]
  const tel = sim.tel
  const cpu = sim.status === 'THINKING' ? 0.62 + 0.12 * Math.sin(performance.now() / 180) : sim.status === 'SPEAKING' ? 0.44 + 0.06 * Math.sin(performance.now() / 140) : 0.14 + tel.eye * 0.25
  const mem = 0.38 + sim.logs.length * 0.0008 + 0.01 * Math.sin(performance.now() / 2400)
  const round = screen.shape === 'round'
  const aspect = screen.w / screen.h

  return (
    <div className="sim" data-testid="simulator-tab">
      <div className="sim-stage">
        <div className="sim-top">
          <div><div className="eyebrow">ZEPHIA · COMPANION ROBOT</div><h2>Simulator</h2></div>
          <div className="sim-tags"><span className="tag">LED {screen.w}×{screen.h}</span><span className="tag">{round ? 'round' : 'pill'} visor</span><button className="tag" data-testid="sim-preview" onClick={() => update((d) => { d.render.preview = d.render.preview === 'leds' ? 'drawing' : 'leds' })}>{preview === 'leds' ? 'LED overlay' : 'Raw drawing'}</button><span className="tag live"><i />LIVE</span></div>
        </div>

        <div className="ball-area">
          <div className="speech" data-testid="speech" style={{ opacity: sim.speech.text ? 1 : 0 }}>
            <span>{sim.speechShown}</span>{sim.status === 'SPEAKING' && <i className="caret" />}
          </div>
          <div className="ball-wrap">
            <svg className="ball-svg" viewBox="0 0 520 540" aria-hidden>
              <defs>
                <radialGradient id="bg1" cx="36%" cy="28%" r="80%"><stop offset="0" stopColor="#ffffff" /><stop offset=".55" stopColor="#eceee9" /><stop offset="1" stopColor="#bfc4bd" /></radialGradient>
                <radialGradient id="sh1" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
                <linearGradient id="base1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d8dcd5" /><stop offset="1" stopColor="#a8aea5" /></linearGradient>
                <linearGradient id="ring" x1="0" x2="1"><stop offset="0" stopColor="#c8ff3a" /><stop offset="1" stopColor="#7be0ff" /></linearGradient>
              </defs>
              <ellipse cx="260" cy="506" rx="200" ry="22" fill="url(#sh1)" />
              <path d="M150 470 Q260 520 370 470 L350 500 Q260 530 170 500 Z" fill="url(#base1)" />
              <ellipse cx="260" cy="468" rx="112" ry="20" fill="#cfd3cb" />
              <ellipse cx="260" cy="462" rx="104" ry="14" fill="none" stroke="url(#ring)" strokeWidth="3" opacity=".9" />
              <g className="ball-body">
                <circle cx="260" cy="250" r="214" fill="url(#bg1)" stroke="#aab0a6" strokeWidth="1.5" />
                <path d="M62 250 A198 198 0 0 0 458 250" fill="none" stroke="#000" strokeOpacity=".07" strokeWidth="2" />
                <path d="M100 160 A190 190 0 0 1 420 160" fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth="6" strokeLinecap="round" />
                <circle cx="52" cy="250" r="9" fill="#dfe3da" stroke="#aab0a6" /><circle cx="468" cy="250" r="9" fill="#dfe3da" stroke="#aab0a6" />
                <circle cx="52" cy="250" r="3.5" fill={col} /><circle cx="468" cy="250" r="3.5" fill={col} />
                <rect x="236" y="426" width="48" height="6" rx="3" fill="#000" fillOpacity=".12" />
              </g>
            </svg>
            <div className={'visor' + (round ? ' round' : '')} style={{ aspectRatio: round ? '1' : `${aspect}`, width: round ? '46%' : '72%' }}>
              <LedScreen getState={sim.getRenderState} bezel={false} />
              <div className="glass" />
            </div>
          </div>
        </div>

        <div className="sim-input">
          <input
            data-testid="sim-input" value={text} placeholder="Start typing something..."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) sim.generateAI(text) }}
          />
          <button className="btn dark" data-testid="simulate" disabled={busy} onClick={() => sim.simulate(text)}>Simulate</button>
          <button className="btn" data-testid="reset" onClick={() => { setText(''); sim.reset() }}>Reset</button>
          <button className={'btn' + (sim.consoleOpen ? ' on' : '')} data-testid="log-toggle" onClick={() => { sim.consoleOpen = !sim.consoleOpen; sim.log(sim.consoleOpen ? 'Log console opened' : 'Log console closed') }}>Log Console</button>
          <button className="btn accent" data-testid="generate" disabled={busy} onClick={() => sim.generateAI(text)}>✦ Generate AI Response</button>
        </div>
        <div className="sim-samples">Try: {SAMPLES.map((s) => <button key={s} className="chip" onClick={() => setText(s)}>{s.length > 30 ? s.slice(0, 28) + '…' : s}</button>)}</div>
      </div>

      <aside className="sim-side">
        <section className="card mood" data-testid="mood-card" style={{ ['--mc' as any]: col }}>
          <div className="eyebrow">MOOD STATUS {sim.readingNo > 0 && <span>· READING #{String(sim.readingNo).padStart(3, '0')}</span>}</div>
          <div className="mood-main" data-testid="mood-status"><i className={busy ? 'pulse' : ''} />{label}</div>
          <div className="mood-sub">
            {sim.status === 'THINKING' ? 'Analysing the message…' : sim.lastClass ? `${Math.round(sim.lastClass.confidence * 100)}% confidence${sim.lastClass.hits.length ? ' · ' + sim.lastClass.hits.slice(0, 3).join(', ') : ''} · face: ${sim.emotion}` : `Face expression: ${sim.emotion}`}
          </div>
        </section>

        <section className="card state" data-testid="state-panel">
          <div className="card-h"><span>STATE</span><span className="mut">{sim.status}</span></div>
          <Bar label="Battery" v={sim.battery / 100} unit={sim.battery.toFixed(1) + '%'} color="#6aa600" />
          <Bar label="CPU" v={cpu} color="#2f80ed" />
          <Bar label="Memory" v={mem} color="#8e5bd8" />
          <div className="card-h sub"><span>LIVE TELEMETRY</span></div>
          <Bar label="Eye_movement" v={tel.eye} testId="tel-eye" />
          <Bar label="Blink_rate" v={tel.blink} unit={Math.round(tel.blink * 30) + '/min'} />
          <Bar label="Pupil_dilation" v={tel.pupil} />
          <Bar label="Expression_intensity" v={tel.intensity} />
          <Bar label="Voice_modulation" v={tel.voice} color="#ff6bb0" />
          <canvas ref={wave} className="wave-cv" width={520} height={64} />
        </section>

        {sim.consoleOpen && (
          <section className="card console" data-testid="console">
            <div className="card-h"><span>LOG CONSOLE</span><button className="link" onClick={() => { sim.logs = []; sim.log('Console cleared') }}>clear</button></div>
            <div className="log" ref={logRef}>
              {sim.logs.map((l) => <div key={l.id} className={'ll ' + l.kind}><time>{l.t}</time><span>{l.msg}</span></div>)}
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}
