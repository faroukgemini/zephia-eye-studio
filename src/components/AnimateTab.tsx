import { useEffect, useReducer, useRef, useSyncExternalStore } from 'react'
import { getProject, useProject, useUI } from '../store'
import { animClock, type Clock } from '../engine/clock'
import { evalTrack } from '../engine/anim'
import { uid } from '../engine/geometry'
import { Slider } from './Slider'
import { EASINGS, EMOTIONS, PARAMS, PARAM_META, type Animation, type Easing, type Emotion, type Param } from '../types'

export function useClockTime(c: Clock) {
  return useSyncExternalStore(c.subscribe, () => c.time)
}
export function useClockPlaying(c: Clock) {
  return useSyncExternalStore(c.subscribe, () => c.playing)
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}

const snapT = (t: number, a: Animation) => Math.min(a.duration, Math.max(0, Math.round(t * a.fps) / a.fps))

export function useActiveAnim() {
  return useProject((s) => s.project.animations.find((a) => a.id === s.project.activeAnimId) ?? s.project.animations[0])
}

export function upsertKey(a: Animation, p: Param, t: number, v: number) {
  const tr = a.tracks[p]
  tr.enabled = true
  const hit = tr.keys.find((k) => Math.abs(k.t - t) < 0.5 / a.fps)
  if (hit) hit.v = v
  else {
    tr.keys.push({ id: uid('k'), t, v })
    tr.keys.sort((x, y) => x.t - y.t)
  }
}

function Lane({ anim, param }: { anim: Animation; param: Param }) {
  const update = useProject((s) => s.update)
  const selKey = useUI((s) => s.selKey)
  const setSelKey = useUI((s) => s.setSelKey)
  const ref = useRef<HTMLDivElement>(null)
  const tr = anim.tracks[param]
  const tOf = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return snapT(((clientX - r.left) / r.width) * anim.duration, anim)
  }
  const dragging = useRef<string | null>(null)
  return (
    <div
      ref={ref}
      className={'lane' + (tr.enabled ? '' : ' off')}
      data-lane={param}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('kf')) return
        const t = tOf(e.clientX)
        const cur = evalTrack({ ...anim, tracks: { ...anim.tracks, [param]: { ...tr, enabled: true } } }, param, t) ?? getProject().base[param]
        update((d) => { upsertKey(d.animations.find((x) => x.id === anim.id)!, param, t, cur) })
      }}
    >
      {tr.keys.length > 1 && tr.enabled && tr.keys.slice(0, -1).map((k, i) => {
        const n = tr.keys[i + 1]
        if (Math.abs(n.v - k.v) > 1e-6) return null
        return <div key={k.id + 'h'} className="hold" style={{ left: `${(k.t / anim.duration) * 100}%`, width: `${((n.t - k.t) / anim.duration) * 100}%` }} />
      })}
      {tr.keys.map((k) => (
        <div
          key={k.id}
          className={'kf' + (selKey?.id === k.id ? ' sel' : '')}
          data-kf={param}
          style={{ left: `${(k.t / anim.duration) * 100}%` }}
          title={`${PARAM_META[param].label}  t=${k.t.toFixed(2)}s  v=${k.v.toFixed(2)}`}
          onPointerDown={(e) => {
            e.stopPropagation()
            ;(e.target as Element).setPointerCapture(e.pointerId)
            dragging.current = k.id
            setSelKey({ param, id: k.id })
          }}
          onPointerMove={(e) => {
            if (dragging.current !== k.id) return
            const t = tOf(e.clientX)
            update((d) => {
              const tr2 = d.animations.find((x) => x.id === anim.id)!.tracks[param]
              const kk = tr2.keys.find((x) => x.id === k.id)!
              kk.t = t
            })
          }}
          onPointerUp={() => {
            dragging.current = null
            update((d) => { d.animations.find((x) => x.id === anim.id)!.tracks[param].keys.sort((a, b) => a.t - b.t) })
          }}
          onDoubleClick={(e) => { e.stopPropagation(); update((d) => { const t2 = d.animations.find((x) => x.id === anim.id)!.tracks[param]; t2.keys = t2.keys.filter((x) => x.id !== k.id) }); setSelKey(null) }}
          onContextMenu={(e) => { e.preventDefault(); update((d) => { const t2 = d.animations.find((x) => x.id === anim.id)!.tracks[param]; t2.keys = t2.keys.filter((x) => x.id !== k.id) }); setSelKey(null) }}
        />
      ))}
    </div>
  )
}

export function AnimateTab() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const anim = useActiveAnim()
  const t = useClockTime(animClock)
  const playing = useClockPlaying(animClock)
  const selKey = useUI((s) => s.selKey)
  const setSelKey = useUI((s) => s.setSelKey)
  const showPath = useUI((s) => s.showPath)
  const setShowPath = useUI((s) => s.setShowPath)
  const flash = useUI((s) => s.flash)
  const ruler = useRef<HTMLDivElement>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)

  useEffect(() => { animClock.setDuration(anim.duration) }, [anim.id, anim.duration])
  useEffect(() => () => animClock.stop(), [])
  useEffect(() => { animClock.seek(0); setSelKey(null) }, [anim.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); animClock.toggle() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && useUI.getState().selKey) deleteSelKey()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anim.id])

  const upd = (fn: (a: Animation) => void) => update((d) => { fn(d.animations.find((x) => x.id === anim.id)!) })
  const deleteSelKey = () => {
    const sk = useUI.getState().selKey
    if (!sk) return
    upd((a) => { const tr = a.tracks[sk.param as Param]; tr.keys = tr.keys.filter((k) => k.id !== sk.id) })
    setSelKey(null)
  }
  const curTime = () => Math.round(animClock.time * anim.fps) / anim.fps
  const valueOf = (p: Param) => evalTrack(anim, p, t) ?? project.base[p]

  const setParam = (p: Param, v: number) => {
    if (anim.tracks[p].enabled) upd((a) => upsertKey(a, p, curTime(), v))
    else update((d) => { d.base[p] = v })
  }
  const addKeyAll = () => {
    let n = 0
    upd((a) => { for (const p of PARAMS) if (a.tracks[p].enabled) { upsertKey(a, p, curTime(), evalTrack(a, p, curTime()) ?? project.base[p]); n++ } })
    if (!n) flash('Enable at least one row first')
  }
  const scrub = (clientX: number) => {
    const r = ruler.current!.getBoundingClientRect()
    animClock.seek(((clientX - r.left) / r.width) * anim.duration)
  }
  const frames = Math.round(anim.duration * anim.fps)

  const newAnim = () => {
    const id = uid('anim')
    update((d) => {
      const tracks = {} as Animation['tracks']
      for (const p of PARAMS) tracks[p] = { enabled: false, keys: [] }
      d.animations.push({ id, name: `new_animation_${d.animations.length + 1}`, emotion: 'Neutral', duration: 2, fps: 24, easing: 'ease-in-out', shapeId: null, tracks })
      d.activeAnimId = id
    })
  }
  const dupAnim = () => {
    const id = uid('anim')
    const src = project.animations.find((x) => x.id === anim.id)
    if (!src) return
    const c = structuredClone(src)
    c.id = id
    c.name += '_copy'
    for (const p of PARAMS) c.tracks[p].keys.forEach((k) => (k.id = uid('k')))
    update((d) => { d.animations.push(c); d.activeAnimId = id })
  }
  const delAnim = () => {
    if (project.animations.length <= 1) return flash('Keep at least one animation')
    update((d) => {
      d.animations = d.animations.filter((x) => x.id !== anim.id)
      d.sequences.forEach((s) => { s.clips = s.clips.filter((c) => c.animId !== anim.id) })
      d.activeAnimId = d.animations[0].id
    })
  }

  const ticks: number[] = []
  const step = anim.duration > 8 ? 1 : anim.duration > 3 ? 0.5 : 0.25
  for (let x = 0; x <= anim.duration + 1e-6; x += step) ticks.push(+x.toFixed(3))

  return (
    <div className="animate-tab" data-testid="animate-tab">
      <div className="toolbar">
        <div className="grp">
          <select data-testid="anim-select" value={anim.id} onChange={(e) => update((d) => { d.activeAnimId = e.target.value })}>
            {project.animations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button className="btn sm" onClick={newAnim}>+ New</button>
          <button className="btn sm" onClick={dupAnim}>Duplicate</button>
          <button className="btn sm" onClick={delAnim}>Delete</button>
        </div>
        <div className="grp">
          <input className="name-in" value={anim.name} onChange={(e) => upd((a) => { a.name = e.target.value.replace(/\s+/g, '_') })} />
          <select value={anim.emotion} onChange={(e) => upd((a) => { a.emotion = e.target.value as Emotion })}>{EMOTIONS.map((x) => <option key={x}>{x}</option>)}</select>
          <select title="Shape used by this animation" value={anim.shapeId ?? ''} onChange={(e) => upd((a) => { a.shapeId = e.target.value || null })}>
            <option value="">shape: rig default</option>
            {project.shapes.map((s) => <option key={s.id} value={s.id}>shape: {s.name}</option>)}
          </select>
        </div>
        <div className="grp tr">
          <button className="btn icon" title="Rewind" onClick={() => animClock.seek(0)}>⏮</button>
          <button className={'btn icon play' + (playing ? ' on' : '')} data-testid="play" title="Play / pause (Space)" onClick={() => animClock.toggle()}>{playing ? '❚❚' : '▶'}</button>
          <button className="btn icon" title="Stop" onClick={() => animClock.stop(true)}>■</button>
          <label className="check sm"><input type="checkbox" checked={animClock.loop} onChange={(e) => { animClock.loop = e.target.checked; force() }} />Loop</label>
          <span className="timecode" data-testid="timecode">{fmtTime(t)} <i>f{Math.round(t * anim.fps)}</i></span>
        </div>
        <div className="grp">
          <label className="mini-f">Duration<input type="number" step={0.1} min={0.1} max={60} value={anim.duration} onChange={(e) => { const v = Math.max(0.1, Math.min(60, +e.target.value || 0.1)); upd((a) => { a.duration = v; for (const p of PARAMS) a.tracks[p].keys.forEach((k) => { k.t = Math.min(k.t, v) }) }) }} /><i>s</i></label>
          <label className="mini-f">FPS<input type="number" min={1} max={120} value={anim.fps} onChange={(e) => upd((a) => { a.fps = Math.max(1, Math.min(120, Math.round(+e.target.value) || 24)) })} /></label>
          <label className="mini-f">Length<input type="number" min={1} value={frames} onChange={(e) => { const f = Math.max(1, Math.round(+e.target.value) || 1); upd((a) => { a.duration = +(f / a.fps).toFixed(3) }) }} /><i>fr</i></label>
          <label className="mini-f">Easing
            <select data-testid="easing" value={anim.easing} onChange={(e) => upd((a) => { a.easing = e.target.value as Easing })}>{EASINGS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
        </div>
        <div className="grp">
          <button className="btn sm primary" data-testid="add-key" onClick={addKeyAll}>◆ Add key</button>
          <button className="btn sm" disabled={!selKey} onClick={deleteSelKey}>Delete key</button>
          <label className="check sm"><input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} />Motion path</label>
        </div>
      </div>

      <div className="timeline" data-testid="timeline">
        <div className="tl-grid">
        <div className="tl-head">
          <div className="tl-label head"><span>PARAMETER</span></div>
          <div className="ruler" ref={ruler}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); animClock.stop(); scrub(e.clientX); (e.currentTarget as any)._d = true }}
            onPointerMove={(e) => { if ((e.currentTarget as any)._d) scrub(e.clientX) }}
            onPointerUp={(e) => { (e.currentTarget as any)._d = false }}
          >
            {ticks.map((x) => <span key={x} className="tick" style={{ left: `${(x / anim.duration) * 100}%` }}>{Number.isInteger(x) || step < 1 ? x.toFixed(step < 1 ? 2 : 0).replace(/\.?0+$/, '') || '0' : ''}s</span>)}
          </div>
        </div>
        <div className="tl-body">
          {PARAMS.map((p) => {
            const m = PARAM_META[p]
            const en = anim.tracks[p].enabled
            return (
              <div className="tl-row" key={p}>
                <div className="tl-label">
                  <input type="checkbox" data-testid={'cb-' + p} checked={en} title="Animate this parameter"
                    onChange={(e) => {
                      const on = e.target.checked
                      upd((a) => {
                        a.tracks[p].enabled = on
                        if (on && a.tracks[p].keys.length === 0) upsertKey(a, p, curTime(), project.base[p])
                      })
                    }} />
                  <span className={'pname' + (en ? '' : ' dim')}>{p === 'blink' ? 'Blinking' : m.label}</span>
                  <div className="mini-slider"><Slider testId={'tl-sl-' + p} value={valueOf(p)} min={m.min} max={m.max} step={m.step} defaultValue={m.def} onChange={(v) => setParam(p, v)} /></div>
                </div>
                <Lane anim={anim} param={p} />
              </div>
            )
          })}
        </div>
          <div className="playhead-layer">
            <div className="playhead" data-testid="playhead" style={{ left: `${(t / anim.duration) * 100}%` }}><i /></div>
          </div>
        </div>
        <div className="tl-foot">
          Double-click a lane to add a ◆ keyframe · drag to retime · double-click / right-click / Delete to remove · move a slider on an enabled row to key it at the playhead
        </div>
      </div>
    </div>
  )
}
