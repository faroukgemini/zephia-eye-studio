import { useMemo } from 'react'
import { useProject, useUI, getProject, type TabId } from './store'
import { LedScreen } from './components/LedScreen'
import { DesignTab } from './components/DesignTab'
import { AnimateTab, useClockTime, useActiveAnim } from './components/AnimateTab'
import { SequenceTab } from './components/SequenceTab'
import { SimulatorTab } from './components/SimulatorTab'
import { ExportModal, ProjectsModal } from './components/Modals'
import { animClock, seqClock } from './engine/clock'
import { evalClips, evalAnimation, stateForAnimation } from './engine/anim'
import { eyeLayout, makeEyeTransform } from './engine/geometry'
import { DEFAULT_POSE, type RenderState } from './types'

const TABS: { id: TabId; label: string }[] = [
  { id: 'design', label: 'DESIGN' },
  { id: 'animate', label: 'ANIMATE' },
  { id: 'sequence', label: 'SEQUENCE' },
  { id: 'simulator', label: 'SIMULATOR' },
]

function MotionPath() {
  const project = useProject((s) => s.project)
  const anim = useActiveAnim()
  const t = useClockTime(animClock)
  const W = project.screen.w, H = project.screen.h
  const lay = eyeLayout(project.screen, project.rig)
  const data = useMemo(() => {
    const N = 90
    const L: [number, number][] = [], R: [number, number][] = []
    for (let i = 0; i <= N; i++) {
      const pose = evalAnimation(anim, (i / N) * anim.duration, project.base)
      L.push(makeEyeTransform(pose, project.rig, lay, 'L').pt({ x: 0, y: 0 }) as any)
      R.push(makeEyeTransform(pose, project.rig, lay, 'R').pt({ x: 0, y: 0 }) as any)
    }
    const keyTimes = new Set<number>()
    for (const p of ['x', 'y'] as const) if (anim.tracks[p].enabled) anim.tracks[p].keys.forEach((k) => keyTimes.add(k.t))
    const mk = (side: 'L' | 'R') => [...keyTimes].map((kt) => makeEyeTransform(evalAnimation(anim, kt, project.base), project.rig, lay, side).pt({ x: 0, y: 0 }) as any as [number, number])
    return { L, R, KL: mk('L'), KR: mk('R') }
  }, [anim, project.base, project.rig, project.screen])
  const pt = (a: any): [number, number] => (Array.isArray(a) ? [a[0], a[1]] : [a.x, a.y])
  const d = (arr: any[]) => arr.map((p, i) => { const [x, y] = pt(p); return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) }).join(' ')
  const cur = (side: 'L' | 'R') => pt(makeEyeTransform(evalAnimation(anim, t, project.base), project.rig, lay, side).pt({ x: 0, y: 0 }))
  const cl = cur('L'), cr = cur('R')
  return (
    <svg className="path-ov" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="motion-path">
      {[data.L, data.R].map((arr, i) => <path key={i} d={d(arr)} fill="none" stroke="#ffd23f" strokeWidth={Math.max(0.35, W / 220)} strokeDasharray={`${W / 90} ${W / 120}`} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.6 }} opacity={0.95} />)}
      {[...data.KL, ...data.KR].map((p, i) => { const [x, y] = pt(p); return <rect key={i} x={x - W / 150} y={y - W / 150} width={W / 75} height={W / 75} fill="#ffd23f" transform={`rotate(45 ${x} ${y})`} /> })}
      {[cl, cr].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={W / 90} fill="#fff" stroke="#ffd23f" style={{ strokeWidth: 1.5 }} vectorEffect="non-scaling-stroke" />)}
    </svg>
  )
}

function TopPreview() {
  const tab = useUI((s) => s.tab)
  const showPath = useUI((s) => s.showPath)
  const screen = useProject((s) => s.project.screen)
  const preview = useProject((s) => s.project.render.preview)
  const update = useProject((s) => s.update)
  const getState = useMemo(() => {
    if (tab === 'animate') return (): RenderState => {
      const p = getProject()
      const a = p.animations.find((x) => x.id === p.activeAnimId) ?? p.animations[0]
      return stateForAnimation(p, a, animClock.time, true)
    }
    if (tab === 'sequence') return (): RenderState => {
      const p = getProject()
      const q = p.sequences.find((x) => x.id === p.activeSeqId) ?? p.sequences[0]
      return evalClips(p, q.clips, seqClock.time)
    }
    return (): RenderState => { const p = getProject(); return { pose: p.base ?? DEFAULT_POSE, layers: [{ shapeId: p.rig.shapeId, w: 1 }] } }
  }, [tab])
  return (
    <section className="preview" data-testid="preview">
      <div className="pv-tags">
        <span>LEFT EYE</span>
        <div className="pv-mid">
          <span className="mid">{screen.w} × {screen.h} LED · {screen.shape === 'round' ? 'round' : 'pill'} screen{screen.shape === 'pill' ? ' · 480×128 px · 95×25 mm' : ''}</span>
          <div className="seg tiny">
            <button className={preview === 'drawing' ? 'on' : ''} onClick={() => update((d) => { d.render.preview = 'drawing' })}>Drawing</button>
            <button className={preview === 'leds' ? 'on' : ''} onClick={() => update((d) => { d.render.preview = 'leds' })}>LEDs</button>
          </div>
        </div>
        <span>RIGHT EYE</span>
      </div>
      <LedScreen getState={getState} overlay={tab === 'animate' && showPath ? <MotionPath /> : undefined} />
    </section>
  )
}

export function App() {
  const tab = useUI((s) => s.tab)
  const setTab = useUI((s) => s.setTab)
  const toast = useUI((s) => s.toast)
  const setExportOpen = useUI((s) => s.setExportOpen)
  const setProjectsOpen = useUI((s) => s.setProjectsOpen)
  const name = useProject((s) => s.project.name)
  const update = useProject((s) => s.update)
  const sim = tab === 'simulator'
  return (
    <div className={'app' + (sim ? ' light' : '')}>
      <header className="topbar">
        <div className="brand"><svg width="30" height="30" viewBox="0 0 30 30"><rect x="1" y="7" width="28" height="16" rx="8" fill="#0b0d10" stroke="#d6ff3f" strokeWidth="1.5" /><circle cx="10" cy="15" r="3" fill="#d6ff3f" /><circle cx="20" cy="15" r="3" fill="#d6ff3f" /></svg><div><b>ZEPHIA</b><span>EYE STUDIO</span></div></div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => <button key={t.id} role="tab" data-testid={'tab-' + t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>
        <div className="top-r">
          <input className="proj-name" value={name} onChange={(e) => update((d) => { d.name = e.target.value })} aria-label="Project name" />
          <button className="btn" data-testid="projects-btn" onClick={() => setProjectsOpen(true)}>Projects</button>
          <button className="btn primary" data-testid="export-btn" onClick={() => setExportOpen(true)}>Export ⇩</button>
        </div>
      </header>
      {!sim && <TopPreview />}
      <main className="content">
        {tab === 'design' && <DesignTab />}
        {tab === 'animate' && <AnimateTab />}
        {tab === 'sequence' && <SequenceTab />}
        {tab === 'simulator' && <SimulatorTab />}
      </main>
      <ExportModal /><ProjectsModal />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
