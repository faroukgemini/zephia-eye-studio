import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useProject, useUI } from '../store'
import { seqClock } from '../engine/clock'
import { countKeys, layoutClips } from '../engine/anim'
import { uid } from '../engine/geometry'
import { fmtTime, useClockPlaying, useClockTime } from './AnimateTab'
import { Slider } from './Slider'
import { EMOTION_COLOR, type Clip, type Sequence } from '../types'

export function useActiveSeq() {
  return useProject((s) => s.project.sequences.find((q) => q.id === s.project.activeSeqId) ?? s.project.sequences[0])
}

export function SequenceTab() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const seq = useActiveSeq()
  const sel = useUI((s) => s.selClip)
  const setSel = useUI((s) => s.setSelClip)
  const setTab = useUI((s) => s.setTab)
  const flash = useUI((s) => s.flash)
  const t = useClockTime(seqClock)
  const playing = useClockPlaying(seqClock)
  const [zoom, setZoom] = useState(96)
  const [sort, setSort] = useState<{ k: 'name' | 'emotion' | 'len' | 'keys'; dir: 1 | -1 }>({ k: 'name', dir: 1 })
  const [drag, setDrag] = useState<{ id: string; dx: number; idx: number; moved: boolean } | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const lane = useRef<HTMLDivElement>(null)

  const { placed, total } = useMemo(() => layoutClips(project, seq.clips), [project, seq.clips])
  useEffect(() => { seqClock.setDuration(Math.max(0.1, total)) }, [total])
  useEffect(() => () => seqClock.stop(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); seqClock.toggle() }
      const s = useUI.getState().selClip
      if ((e.key === 'Delete' || e.key === 'Backspace') && s?.kind === 'clip') removeClip(s.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seq.id])

  const upd = (fn: (q: Sequence) => void) => update((d) => { fn(d.sequences.find((x) => x.id === seq.id)!) })
  const removeClip = (id: string) => { upd((q) => { q.clips = q.clips.filter((c) => c.id !== id) }); setSel(null) }
  const addClip = (animId: string, at?: number) => {
    const clip: Clip = { id: uid('clip'), animId, transition: { type: 'crossfade', dur: 0.5 } }
    upd((q) => { q.clips.splice(at ?? q.clips.length, 0, clip) })
    setSel({ kind: 'clip', id: clip.id })
  }
  const pad = 14
  const width = Math.max(total * zoom + pad * 2 + 60, 600)

  // ----- pointer reorder -----
  const startDrag = (e: React.PointerEvent, id: string, startX: number, len: number) => {
    const startClientX = e.clientX
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    const i0 = placed.findIndex((p) => p.clip.id === id)
    setSel({ kind: 'clip', id })
    const center0 = startX + (len * zoom) / 2
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX
      const c = center0 + dx
      let idx = 0
      placed.forEach((p, i) => { if (i !== i0 && p.start * zoom + pad + (p.len * zoom) / 2 < c) idx++ })
      setDrag({ id, dx, idx, moved: Math.abs(dx) > 4 })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const dx = ev.clientX - startClientX
      const c = center0 + dx
      let idx = 0
      placed.forEach((p, i) => { if (i !== i0 && p.start * zoom + pad + (p.len * zoom) / 2 < c) idx++ })
      setDrag(null)
      if (Math.abs(dx) > 4 && idx !== i0) {
        upd((q) => { const [m] = q.clips.splice(i0, 1); q.clips.splice(idx, 0, m) })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const idxFromX = (clientX: number) => {
    const r = lane.current!.getBoundingClientRect()
    const x = clientX - r.left
    let idx = 0
    placed.forEach((p) => { if (p.start * zoom + pad + (p.len * zoom) / 2 < x) idx++ })
    return idx
  }

  const rows = useMemo(() => {
    const r = project.animations.map((a) => ({ a, keys: countKeys(a) }))
    r.sort((x, y) => {
      const v = sort.k === 'name' ? x.a.name.localeCompare(y.a.name) : sort.k === 'emotion' ? x.a.emotion.localeCompare(y.a.emotion) || x.a.name.localeCompare(y.a.name) : sort.k === 'len' ? x.a.duration - y.a.duration : x.keys - y.keys
      return v * sort.dir
    })
    return r
  }, [project.animations, sort])
  const hdr = (k: typeof sort.k, label: string) => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))} className="sortable">{label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  )

  const selClip = sel?.kind === 'clip' ? placed.find((p) => p.clip.id === sel.id) : undefined
  const selTrans = sel?.kind === 'transition' ? placed.find((p) => p.clip.id === sel.id) : undefined
  const ticks: number[] = []
  for (let x = 0; x <= total + 1e-6; x += zoom < 60 ? 2 : 1) ticks.push(x)

  return (
    <div className="seq-tab" data-testid="sequence-tab">
      <div className="toolbar">
        <div className="grp">
          <select data-testid="seq-select" value={seq.id} onChange={(e) => update((d) => { d.activeSeqId = e.target.value })}>
            {project.sequences.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
          </select>
          <input className="name-in" value={seq.name} onChange={(e) => upd((q) => { q.name = e.target.value })} />
          <button className="btn sm" onClick={() => { const id = uid('seq'); update((d) => { d.sequences.push({ id, name: `Sequence ${d.sequences.length + 1}`, clips: [] }); d.activeSeqId = id }) }}>+ New</button>
          <button className="btn sm" onClick={() => { if (project.sequences.length > 1) update((d) => { d.sequences = d.sequences.filter((q) => q.id !== seq.id); d.activeSeqId = d.sequences[0].id }) }}>Delete</button>
        </div>
        <div className="grp tr">
          <button className="btn icon" onClick={() => seqClock.seek(0)}>⏮</button>
          <button className={'btn icon play' + (playing ? ' on' : '')} data-testid="seq-play" onClick={() => seqClock.toggle()}>{playing ? '❚❚' : '▶'}</button>
          <button className="btn icon" onClick={() => seqClock.stop(true)}>■</button>
          <label className="check sm"><input type="checkbox" checked={seqClock.loop} onChange={(e) => { seqClock.loop = e.target.checked; force() }} />Loop</label>
          <span className="timecode">{fmtTime(t)} <i>/ {fmtTime(total)}</i></span>
        </div>
        <div className="grp" style={{ width: 190 }}>
          <span className="lbl">Zoom</span>
          <Slider value={zoom} min={30} max={220} step={1} digits={0} onChange={setZoom} />
        </div>
        <div className="grp info">{seq.clips.length} clips · {total.toFixed(1)}s</div>
      </div>

      <div className="track-wrap" data-testid="track">
        <div className="track-scroll">
          <div className="track-inner" style={{ width }}>
            <div className="seq-ruler"
              onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); seqClock.stop(); seqClock.seek((e.clientX - r.left - pad) / zoom); (e.currentTarget as any)._d = true; e.currentTarget.setPointerCapture(e.pointerId) }}
              onPointerMove={(e) => { if ((e.currentTarget as any)._d) { const r = e.currentTarget.getBoundingClientRect(); seqClock.seek((e.clientX - r.left - pad) / zoom) } }}
              onPointerUp={(e) => { (e.currentTarget as any)._d = false }}
            >
              {ticks.map((x) => <span key={x} className="tick" style={{ left: x * zoom + pad }}>{x}s</span>)}
            </div>
            <div
              ref={lane} className="seq-lane"
              onDragOver={(e) => { if (e.dataTransfer.types.includes('text/zephia-anim')) { e.preventDefault(); setDropIdx(idxFromX(e.clientX)) } }}
              onDragLeave={() => setDropIdx(null)}
              onDrop={(e) => { const id = e.dataTransfer.getData('text/zephia-anim'); if (id) { e.preventDefault(); addClip(id, idxFromX(e.clientX)) } setDropIdx(null) }}
              onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null) }}
            >
              <div className="lane-tag">EYES</div>
              {seq.clips.length === 0 && <div className="empty-hint">Drag animations from the library below (or double-click a row) to build a sequence</div>}
              {placed.map((p, i) => {
                const left = p.start * zoom + pad
                const w = p.len * zoom
                const col = EMOTION_COLOR[p.anim.emotion]
                const isDrag = drag?.id === p.clip.id
                const isSel = sel?.kind === 'clip' && sel.id === p.clip.id
                return (
                  <div key={p.clip.id}>
                    <div
                      className={'clip' + (isSel ? ' sel' : '') + (isDrag ? ' dragging' : '')}
                      data-clip={p.anim.name}
                      style={{ left, width: w - 2, background: col, transform: isDrag ? `translateX(${drag!.dx}px)` : undefined }}
                      onPointerDown={(e) => startDrag(e, p.clip.id, left, p.len)}
                      onDoubleClick={() => { update((d) => { d.activeAnimId = p.anim.id }); setTab('animate') }}
                      title={`${p.anim.name} · ${p.anim.emotion} · ${p.len.toFixed(2)}s (double-click to edit)`}
                    >
                      <b>{p.anim.name}</b>
                      <span>{p.anim.emotion} · {p.len.toFixed(1)}s</span>
                      <div className="wave">{p.anim.tracks.y.keys.concat(p.anim.tracks.x.keys).slice(0, 12).map((k) => <i key={k.id} style={{ left: `${(k.t / p.anim.duration) * 100}%` }} />)}</div>
                    </div>
                    {i < placed.length - 1 && (
                      <>
                        {p.xf > 0 && <div className="xf-window" style={{ left: left + w - (p.xf * zoom) / 2, width: p.xf * zoom }} />}
                        <button
                          className={'tmark' + (p.clip.transition.type === 'crossfade' ? ' xf' : '') + (selTrans?.clip.id === p.clip.id ? ' sel' : '')}
                          data-transition={i}
                          style={{ left: left + w - 1 }}
                          title={p.clip.transition.type === 'crossfade' ? `Crossfade ${p.clip.transition.dur.toFixed(2)}s` : 'Cut'}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => setSel({ kind: 'transition', id: p.clip.id })}
                        >{p.clip.transition.type === 'crossfade' ? '⋈' : '|'}</button>
                      </>
                    )}
                  </div>
                )
              })}
              {drag?.moved && <div className="drop-line" style={{ left: (() => { const o = placed.filter((p) => p.clip.id !== drag.id); const x = drag.idx === 0 ? 0 : (o[drag.idx - 1].start + o[drag.idx - 1].len) * zoom; return x + pad - 2 })() }} />}
              {dropIdx !== null && <div className="drop-line" style={{ left: (dropIdx === 0 ? 0 : (placed[dropIdx - 1].start + placed[dropIdx - 1].len) * zoom) + pad - 2 }} />}
            </div>
            <div className="seq-playhead" data-testid="seq-playhead" style={{ left: t * zoom + pad }}><i /></div>
          </div>
        </div>
        <div className="inspector">
          {selClip ? (
            <>
              <span className="dot" style={{ background: EMOTION_COLOR[selClip.anim.emotion] }} />
              <b>{selClip.anim.name}</b><span className="mut">{selClip.anim.emotion} · {selClip.len.toFixed(2)}s · clip {placed.indexOf(selClip) + 1}</span>
              <span className="grow" />
              <button className="btn sm" onClick={() => addClip(selClip.anim.id, placed.indexOf(selClip) + 1)}>Duplicate</button>
              <button className="btn sm" onClick={() => { update((d) => { d.activeAnimId = selClip.anim.id }); setTab('animate') }}>Edit animation</button>
              <button className="btn sm danger" onClick={() => removeClip(selClip.clip.id)}>Remove</button>
            </>
          ) : selTrans ? (
            <>
              <span className="mut">Transition after</span><b>{selTrans.anim.name}</b>
              <select data-testid="trans-type" value={selTrans.clip.transition.type} onChange={(e) => upd((q) => { const c = q.clips.find((x) => x.id === selTrans.clip.id)!; c.transition.type = e.target.value as any; if (c.transition.type === 'crossfade' && c.transition.dur <= 0) c.transition.dur = 0.5 })}>
                <option value="crossfade">Crossfade (blend parameters)</option><option value="cut">Cut</option>
              </select>
              {selTrans.clip.transition.type === 'crossfade' && (
                <div style={{ width: 220 }}><Slider label="Duration" value={selTrans.clip.transition.dur} min={0.1} max={2} unit="s" onChange={(v) => upd((q) => { q.clips.find((x) => x.id === selTrans.clip.id)!.transition.dur = v })} /></div>
              )}
            </>
          ) : <span className="mut">Select a clip or a transition marker ⋈ · drag clips to reorder · drop animations from the library</span>}
        </div>
      </div>

      <div className="lib" data-testid="library">
        <div className="panel-bar"><span className="ttl">ANIMATION LIBRARY</span><span className="mut">{project.animations.length} animations · drag a row onto the track or double-click to append</span></div>
        <div className="lib-scroll">
          <table>
            <thead><tr>{hdr('name', 'Animation Name')}{hdr('emotion', 'Emotion Category')}{hdr('len', 'Length')}{hdr('keys', '# of Keyframes')}<th /></tr></thead>
            <tbody>
              {rows.map(({ a, keys }) => (
                <tr key={a.id} draggable data-anim={a.name}
                  className={project.activeAnimId === a.id ? 'active' : ''}
                  onDragStart={(e) => { e.dataTransfer.setData('text/zephia-anim', a.id); e.dataTransfer.effectAllowed = 'copy' }}
                  onClick={() => update((d) => { d.activeAnimId = a.id })}
                  onDoubleClick={() => addClip(a.id)}>
                  <td><span className="grip">⋮⋮</span>{a.name}</td>
                  <td><span className="dot" style={{ background: EMOTION_COLOR[a.emotion] }} />{a.emotion}</td>
                  <td>{a.duration.toFixed(1)}s <span className="mut">· {Math.round(a.duration * a.fps)}f</span></td>
                  <td>{keys}</td>
                  <td className="acts"><button className="link" onClick={(e) => { e.stopPropagation(); addClip(a.id); flash(`Added ${a.name}`) }}>+ add</button><button className="link" onClick={(e) => { e.stopPropagation(); update((d) => { d.activeAnimId = a.id }); setTab('animate') }}>edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
