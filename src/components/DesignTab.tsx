import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getProject, setScreenShape, useProject, useUI } from '../store'
import { Slider } from './Slider'
import { bakeCurve, buildPath, makeEyeTransform, uid } from '../engine/geometry'
import { importSvgShape } from '../engine/svgImport'
import { PANEL, PILL_RES, PRESET_SHAPES, ROUND_RES } from '../engine/presets'
import { applyPitch, cloneShape, defaultFill, DEFAULT_PITCH, GLYPH_LABEL, resolveFill, setAlphaThreshold } from '../engine/fill'
import { DOT_SHAPES, PARAMS, PARAM_META, type DotShape, type Pose, type Shape, type ShapeFill } from '../types'

function FillDefs({ id, fill }: { id: string; fill: ShapeFill }) {
  if (fill.kind === 'solid' && fill.feather <= 0.01) return null
  const stops = [...fill.stops].sort((a, b) => a.offset - b.offset)
  const cols = stops.map((s, i) => <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} stopOpacity={s.alpha} />)
  const a = (fill.angle * Math.PI) / 180
  return (
    <defs>
      {fill.kind === 'linear' && (
        <linearGradient id={id} x1={0.5 - Math.cos(a) / 2} y1={0.5 - Math.sin(a) / 2} x2={0.5 + Math.cos(a) / 2} y2={0.5 + Math.sin(a) / 2}>{cols}</linearGradient>
      )}
      {fill.kind === 'radial' && <radialGradient id={id} cx="50%" cy="50%" r="55%">{cols}</radialGradient>}
      {fill.feather > 0.01 && (
        <filter id={id + '-b'} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={0.02 + fill.feather * 0.14} />
        </filter>
      )}
    </defs>
  )
}

function shapePaint(shape: Shape, id: string): { paint: string; opacity: number; filter?: string; defs: ReactNode } {
  const fill = resolveFill(shape)
  const filter = fill.feather > 0.01 ? `url(#${id}-b)` : undefined
  if (fill.kind === 'solid') return { paint: fill.color, opacity: fill.alpha, filter, defs: <FillDefs id={id} fill={fill} /> }
  return { paint: `url(#${id})`, opacity: 1, filter, defs: <FillDefs id={id} fill={fill} /> }
}

export function ShapeThumb({ shape, size = 52 }: { shape: Shape; size?: number }) {
  const d = buildPath(shape.points, shape.closed, shape.smooth)
  const id = 'sg-' + shape.id.replace(/[^a-zA-Z0-9_-]/g, '')
  const p = shapePaint(shape, id)
  return (
    <svg width={size} height={size} viewBox="-1.15 -1.15 2.3 2.3">
      {p.defs}
      <path d={d} fill={shape.stroke > 0 ? 'none' : p.paint} fillOpacity={shape.stroke > 0 ? 0 : p.opacity} stroke={shape.stroke > 0 ? p.paint : 'none'} strokeOpacity={p.opacity} strokeWidth={shape.stroke} filter={p.filter} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PoseSliders({ pose, onChange, disabledParams = [] }: { pose: Pose; onChange: (k: keyof Pose, v: number) => void; disabledParams?: string[] }) {
  return (
    <div className="sliders">
      {PARAMS.filter((p) => p !== 'blink').map((p) => {
        const m = PARAM_META[p]
        return <Slider key={p} testId={'sl-' + p} label={m.label} value={pose[p]} min={m.min} max={m.max} step={m.step} unit={m.unit} defaultValue={m.def} disabled={disabledParams.includes(p)} onChange={(v) => onChange(p, v)} />
      })}
      <Slider testId="sl-curve" label="Curve" value={pose.curve} min={-1} max={1} step={0.01} defaultValue={0} onChange={(v) => onChange('curve', v)} />
      <Slider testId="sl-blink" label="Blink" value={pose.blink} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => onChange('blink', v)} />
    </div>
  )
}

function PropertiesPanel() {
  const objectTab = useUI((s) => s.objectTab)
  const setObjectTab = useUI((s) => s.setObjectTab)
  const flash = useUI((s) => s.flash)
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const file = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const focusName = useRef(false)
  const { base, rig } = project
  const shape = project.shapes.find((s) => s.id === rig.shapeId)!
  useEffect(() => {
    if (!focusName.current) return
    focusName.current = false
    nameRef.current?.focus()
    nameRef.current?.select()
  })

  const openSvg = async (f: File | undefined) => {
    if (!f) return
    try {
      const sh = importSvgShape(await f.text(), f.name)
      update((d) => { d.shapes.push(sh); d.rig.shapeId = sh.id })
      flash(`Imported “${sh.name}” (${sh.points.length} anchors)`)
    } catch (e: any) { flash('SVG import failed: ' + e.message) }
  }
  const saveAsNew = () => {
    const cur = project.shapes.find((s) => s.id === rig.shapeId)
    if (!cur) { flash('No shape to save'); return }
    // Clone the committed shape. structuredClone() throws on the Immer draft inside update(), so the click used to fail silently.
    const n = project.shapes.filter((s) => !s.builtin).length + 1
    const id = uid('shape')
    const name = `custom ${n}`
    const copy = cloneShape(cur)
    copy.id = id
    copy.name = name
    copy.builtin = false
    copy.points = bakeCurve(cur, base.curve)
    update((d) => {
      d.shapes.push(copy)
      d.base.curve = 0
      d.rig.shapeId = id
    })
    focusName.current = true
    flash(`Saved “${name}” — selected in Shapes`)
  }
  const patchFill = (fn: (f: ShapeFill) => void) => update((d) => {
    const s = d.shapes.find((x) => x.id === shape.id)
    if (!s) return
    if (!s.fill) s.fill = defaultFill()
    fn(s.fill)
  })

  return (
    <section className="panel props" data-testid="props-panel">
      <div className="tabs-mini">
        <button className={objectTab === 'object' ? 'on' : ''} onClick={() => setObjectTab('object')}>OBJECT</button>
        <button className={objectTab === 'rigging' ? 'on' : ''} onClick={() => setObjectTab('rigging')}>RIGGING</button>
        <span className="grow" />
        <span className="chip">{rig.name}</span>
      </div>
      <div className="obj-head">
        <b>ZEPHIA</b> <span>(EYE-LEFT)</span>
        <em>{rig.mirror ? 'EYE-RIGHT mirrors' : 'EYE-RIGHT follows'}</em>
      </div>
      {objectTab === 'object' ? (
        <>
          <div className="btn-row">
            <button className="btn" onClick={() => file.current?.click()}>Open SVG</button>
            <button className="btn primary" data-testid="save-shape" onClick={saveAsNew}>Save as new shape</button>
            <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { openSvg(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="meta-line">shape · {shape.points.length} anchors · {shape.stroke > 0 ? 'stroke' : 'fill'}</div>
          <label className="field shape-name-field"><span>Name</span>
            <input ref={nameRef} data-testid="shape-name" value={shape.name} onChange={(e) => update((d) => { const s = d.shapes.find((x) => x.id === shape.id); if (s) s.name = e.target.value })} />
          </label>
          <h4>TRANSFORM <button className="link" onClick={() => update((d) => { Object.assign(d.base, { x: 0, y: 0, rot: 0, scale: 1, squash: 0, curve: 0, blink: 0 }) })}>reset</button></h4>
          <PoseSliders pose={base} onChange={(k, v) => update((d) => { d.base[k] = v })} />
          <FillEditor shape={shape} patch={patchFill} />
        </>
      ) : (
        <div className="rigging" data-testid="rigging">
          <label className="field"><span>Rig name</span><input value={rig.name} onChange={(e) => update((d) => { d.rig.name = e.target.value })} /></label>
          <h4>MAPPING</h4>
          <div className="map-table">
            <div><b>EYE-LEFT</b><i>→</i><span>{rig.name}.master</span><em>direct</em></div>
            <div><b>EYE-RIGHT</b><i>→</i><span>{rig.name}.master</span><em>{rig.mirror ? 'mirrored' : 'copy'}</em></div>
          </div>
          <label className="check"><input type="checkbox" checked={rig.mirror} onChange={(e) => update((d) => { d.rig.mirror = e.target.checked })} /> Mirror right eye (flip shape, X and rotation)</label>
          <Slider label="Eye spacing" value={rig.spacing} min={0.4} max={1.6} onChange={(v) => update((d) => { d.rig.spacing = v })} defaultValue={1} />
          <Slider label="Eye size" value={rig.size} min={0.4} max={1.5} onChange={(v) => update((d) => { d.rig.size = v })} defaultValue={1} />
          <h4>RIGHT EYE OFFSET</h4>
          <Slider label="X offset" value={rig.rightOffset.x} min={-0.5} max={0.5} onChange={(v) => update((d) => { d.rig.rightOffset.x = v })} defaultValue={0} />
          <Slider label="Y offset" value={rig.rightOffset.y} min={-0.5} max={0.5} onChange={(v) => update((d) => { d.rig.rightOffset.y = v })} defaultValue={0} />
          <Slider label="Rot offset" value={rig.rightOffset.rot} min={-45} max={45} step={0.5} unit="°" onChange={(v) => update((d) => { d.rig.rightOffset.rot = v })} defaultValue={0} />
        </div>
      )}
    </section>
  )
}

function VectorCanvas() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const svg = useRef<SVGSVGElement>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [snap, setSnap] = useState(false)
  const drag = useRef<number | null>(null)
  const shape = project.shapes.find((s) => s.id === project.rig.shapeId)!
  const idx = project.shapes.indexOf(shape)

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const m = svg.current!.getScreenCTM()!.inverse()
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m)
    let x = p.x, y = p.y
    if (snap) { x = Math.round(x / 0.05) * 0.05; y = Math.round(y / 0.05) * 0.05 }
    return { x: Math.max(-1.45, Math.min(1.45, +x.toFixed(3))), y: Math.max(-1.45, Math.min(1.45, +y.toFixed(3))) }
  }
  const addPoint = (e: React.MouseEvent) => {
    const p = toLocal(e)
    update((d) => {
      const pts = d.shapes[idx].points
      let best = pts.length - 1, bd = Infinity
      const segs = d.shapes[idx].closed ? pts.length : pts.length - 1
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        const dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        const dist = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y)
        if (dist < bd) { bd = dist; best = i }
      }
      pts.splice(best + 1, 0, p)
      setSel(best + 1)
    })
  }
  const delPoint = (i: number) => {
    if (shape.points.length <= 2) return
    update((d) => { d.shapes[idx].points.splice(i, 1) })
    setSel(null)
  }
  const ghostTf = makeEyeTransform(project.base, project.rig, { unit: 1, cy: 0, cxL: 0, cxR: 0 }, 'L')
  const ghost = buildPath(shape.points.map(ghostTf.pt), shape.closed, shape.smooth)
  const path = buildPath(shape.points, shape.closed, shape.smooth)
  const paintId = 'vec-' + shape.id.replace(/[^a-zA-Z0-9_-]/g, '')
  const paint = shapePaint(shape, paintId)
  const lines: number[] = []
  for (let v = -1.5; v <= 1.5001; v += 0.125) lines.push(+v.toFixed(3))

  return (
    <section className="panel canvas-panel" data-testid="vector-panel">
      <div className="panel-bar">
        <span className="ttl">VECTOR CANVAS</span>
        <label className="check sm"><input type="checkbox" checked={shape.closed} onChange={(e) => update((d) => { d.shapes[idx].closed = e.target.checked })} />Closed</label>
        <label className="check sm"><input type="checkbox" checked={shape.smooth} onChange={(e) => update((d) => { d.shapes[idx].smooth = e.target.checked })} />Smooth</label>
        <label className="check sm"><input type="checkbox" checked={shape.stroke > 0} onChange={(e) => update((d) => { d.shapes[idx].stroke = e.target.checked ? 0.25 : 0 })} />Stroke</label>
        {shape.stroke > 0 && <div style={{ width: 130 }}><Slider value={shape.stroke} min={0.04} max={0.8} onChange={(v) => update((d) => { d.shapes[idx].stroke = v })} /></div>}
        <label className="check sm"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Snap</label>
        <span className="grow" />
        <span className="hint">drag anchors · double-click to add · right-click/Del to remove</span>
      </div>
      <svg
        ref={svg} className="vcanvas" viewBox="-1.5 -1.5 3 3" tabIndex={0}
        onPointerMove={(e) => { if (drag.current !== null) { const p = toLocal(e); update((d) => { d.shapes[idx].points[drag.current!] = p }) } }}
        onPointerUp={() => { drag.current = null }}
        onDoubleClick={addPoint}
        onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) delPoint(sel) }}
        onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null) }}
      >
        <g className="grid">
          {lines.map((v) => (
            <g key={v}>
              <line x1={v} y1={-1.5} x2={v} y2={1.5} className={Math.abs(v * 2 - Math.round(v * 2)) < 1e-6 ? 'maj' : ''} />
              <line x1={-1.5} y1={v} x2={1.5} y2={v} className={Math.abs(v * 2 - Math.round(v * 2)) < 1e-6 ? 'maj' : ''} />
            </g>
          ))}
        </g>
        <line x1={0} y1={-1.5} x2={0} y2={1.5} className="axis" /><line x1={-1.5} y1={0} x2={1.5} y2={0} className="axis" />
        <rect x={-1} y={-1} width={2} height={2} className="eyebox" />
        {paint.defs}
        <path d={ghost} className="ghost" fill="none" strokeWidth={shape.stroke > 0 ? shape.stroke : 0.012} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} className="shape" fill={shape.stroke > 0 ? 'none' : paint.paint} fillOpacity={shape.stroke > 0 ? 0 : Math.min(0.55, paint.opacity)} stroke={shape.stroke > 0 ? paint.paint : 'none'} strokeOpacity={Math.min(0.85, paint.opacity)} strokeWidth={shape.stroke} filter={paint.filter} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} className="outline" fill="none" />
        {shape.points.map((p, i) => (
          <circle
            key={i} cx={p.x} cy={p.y} r={sel === i ? 0.055 : 0.045} className={'anchor' + (sel === i ? ' sel' : '')} data-anchor={i}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = i; setSel(i); svg.current?.focus(); if (e.altKey) delPoint(i) }}
            onContextMenu={(e) => { e.preventDefault(); delPoint(i) }}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ))}
      </svg>
      <RenderBar />
    </section>
  )
}

function ShapesScreenPanel() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const flash = useUI((s) => s.flash)
  const sc = project.screen
  const list = sc.shape === 'round' ? ROUND_RES : PILL_RES
  const known = list.find((r) => r.w === sc.w && r.h === sc.h)
  const [cw, setCw] = useState<string>('')
  const [ch, setCh] = useState<string>('')
  const applyCustom = () => {
    const w = Math.round(+cw), h = Math.round(+ch)
    if (w >= 8 && w <= 512 && h >= 8 && h <= 256) update((d) => { d.screen.w = w; d.screen.h = h; d.render.grid.mode = 'count' })
    else flash('Custom size must be 8–512 × 8–256')
    setCw(''); setCh('')
  }
  const resetPresets = () => update((d) => {
    for (const p of PRESET_SHAPES) {
      const next = cloneShape({ ...p, fill: defaultFill() })
      const i = d.shapes.findIndex((s) => s.id === p.id)
      if (i >= 0) d.shapes[i] = next
      else d.shapes.push(next)
    }
  })
  const grid = project.render.grid
  const selId = project.rig.shapeId
  useEffect(() => {
    document.querySelector(`[data-shape-id="${CSS.escape(selId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selId])
  return (
    <section className="panel side-panel" data-testid="screen-panel">
      <div className="panel-bar"><span className="ttl">SCREEN</span></div>
      <div className="seg">
        <button className={sc.shape === 'pill' ? 'on' : ''} onClick={() => update((d) => setScreenShape(d, 'pill'))}>Pill visor</button>
        <button className={sc.shape === 'round' ? 'on' : ''} data-testid="round-btn" onClick={() => update((d) => setScreenShape(d, 'round'))}>Round</button>
      </div>
      <label className="field"><span>Matrix resolution</span>
        <select data-testid="res-select" value={known ? `${sc.w}x${sc.h}` : 'custom'} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); if (w) update((d) => { d.screen.w = w; d.screen.h = h; d.render.grid.mode = 'count' }) }}>
          {list.map((r) => <option key={r.label} value={`${r.w}x${r.h}`}>{r.label}</option>)}
          {!known && <option value="custom">{sc.w}×{sc.h} custom</option>}
        </select>
      </label>
      <div className="custom-res">
        <input aria-label="Columns" placeholder={String(sc.w)} value={cw} onChange={(e) => setCw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCustom()} />
        <span>×</span>
        <input aria-label="Rows" placeholder={String(sc.h)} value={ch} onChange={(e) => setCh(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCustom()} />
        <button className="btn sm" onClick={applyCustom}>Set</button>
      </div>
      <h4>GRID</h4>
      <div className="seg">
        <button className={grid.mode === 'count' ? 'on' : ''} onClick={() => update((d) => { d.render.grid.mode = 'count' })}>Columns × rows</button>
        <button className={grid.mode === 'pitch' ? 'on' : ''} data-testid="pitch-mode" onClick={() => update((d) => { d.render.grid.mode = 'pitch'; applyPitch(d) })}>Auto from pitch</button>
      </div>
      <Slider label="Pitch" value={grid.pitchMm} min={0.18} max={4} step={0.01} unit="mm" digits={2} defaultValue={DEFAULT_PITCH} onChange={(v) => update((d) => { d.render.grid.pitchMm = v; d.render.grid.mode = 'pitch'; applyPitch(d) })} />
      <div className="meta-line small">{grid.mode === 'pitch' ? <>Pitch sets the matrix · now {sc.w}×{sc.h}</> : <>Matrix size sets the columns and rows · pitch {grid.pitchMm.toFixed(2)} mm is ready when you switch to auto</>}</div>
      <div className="meta-line small">
        {sc.shape === 'pill'
          ? <>Panel {PANEL.pxW}×{PANEL.pxH} px (3.75:1) · {PANEL.mmW}×{PANEL.mmH} mm active · {(PANEL.pxW / sc.w).toFixed(PANEL.pxW % sc.w ? 2 : 0)}×{(PANEL.pxH / sc.h).toFixed(PANEL.pxH % sc.h ? 2 : 0)} px per LED</>
          : <>Round panel · {sc.w}×{sc.h} LEDs · {Math.round((Math.PI / 4) * sc.w * sc.h)} lit-capable</>}
      </div>
      <div className="swatches">
        {['#ffffff', '#9eeaff', '#d6ff3f', '#ffb347', '#ff7ab8'].map((c) => (
          <button key={c} className={sc.color === c ? 'on' : ''} style={{ background: c }} title={c} onClick={() => update((d) => { d.screen.color = c })} />
        ))}
        <span>LED colour</span>
      </div>
      <div className="panel-bar" style={{ marginTop: 10 }}>
        <span className="ttl">SHAPES</span><span className="grow" />
        <button className="link" onClick={resetPresets}>reset presets</button>
      </div>
      <div className="shape-grid" data-testid="shape-grid">
        {project.shapes.map((s) => (
          <button key={s.id} data-shape-id={s.id} className={'shape-card' + (project.rig.shapeId === s.id ? ' on' : '')} onClick={() => update((d) => { d.rig.shapeId = s.id })} title={s.name}>
            <ShapeThumb shape={s} />
            <span>{s.name}</span>
            {!s.builtin && (
              <i className="del" title="delete shape" onClick={(e) => { e.stopPropagation(); if (getProject().shapes.length > 1) update((d) => { d.shapes = d.shapes.filter((x) => x.id !== s.id); if (d.rig.shapeId === s.id) d.rig.shapeId = d.shapes[0].id; d.animations.forEach((a) => { if (a.shapeId === s.id) a.shapeId = null }) }) }}>×</i>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

function GlyphSelect({ value, onChange, testId }: { value: DotShape; onChange: (v: DotShape) => void; testId?: string }) {
  return (
    <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as DotShape)}>
      {DOT_SHAPES.map((s) => <option key={s} value={s}>{GLYPH_LABEL[s]}</option>)}
    </select>
  )
}

function FillEditor({ shape, patch }: { shape: Shape; patch: (fn: (f: ShapeFill) => void) => void }) {
  const fill = resolveFill(shape)
  const addStop = () => patch((f) => {
    if (f.stops.length >= 6) return
    const sorted = [...f.stops].sort((a, b) => a.offset - b.offset)
    let gap = 0, at = 0.5
    for (let i = 0; i < sorted.length - 1; i++) {
      const g = sorted[i + 1].offset - sorted[i].offset
      if (g > gap) { gap = g; at = (sorted[i].offset + sorted[i + 1].offset) / 2 }
    }
    f.stops.push({ offset: +at.toFixed(3), color: '#ffffff', alpha: 1 })
  })
  return (
    <div data-testid="fill-editor">
      <h4>FILL</h4>
      <div className="seg">
        {(['solid', 'linear', 'radial'] as const).map((k) => (
          <button key={k} data-testid={'fill-' + k} className={fill.kind === k ? 'on' : ''} onClick={() => patch((f) => { f.kind = k })}>{k === 'solid' ? 'Solid' : k === 'linear' ? 'Linear' : 'Radial'}</button>
        ))}
      </div>
      {fill.kind === 'solid' ? (
        <>
          <div className="color-line"><span>Colour</span><input type="color" aria-label="Fill colour" value={fill.color} onChange={(e) => patch((f) => { f.color = e.target.value })} /><code>{fill.color}</code></div>
          <Slider label="Alpha" value={fill.alpha} min={0} max={1} defaultValue={1} onChange={(v) => patch((f) => { f.alpha = v })} />
        </>
      ) : (
        <>
          {fill.kind === 'linear' && <Slider label="Angle" value={fill.angle} min={0} max={360} step={1} digits={0} unit="°" defaultValue={0} onChange={(v) => patch((f) => { f.angle = v })} />}
          {fill.stops.map((s, i) => (
            <div className="stop" key={i}>
              <input type="color" aria-label={`Stop ${i + 1} colour`} value={s.color} onChange={(e) => patch((f) => { f.stops[i].color = e.target.value })} />
              <div className="stop-sliders">
                <Slider label="At" value={s.offset} min={0} max={1} onChange={(v) => patch((f) => { f.stops[i].offset = v })} />
                <Slider label="Alpha" value={s.alpha} min={0} max={1} onChange={(v) => patch((f) => { f.stops[i].alpha = v })} />
              </div>
              <button className="link" title="Remove stop" disabled={fill.stops.length <= 2} onClick={() => patch((f) => { if (f.stops.length > 2) f.stops.splice(i, 1) })}>×</button>
            </div>
          ))}
          <button className="btn sm" data-testid="add-stop" disabled={fill.stops.length >= 6} onClick={addStop}>+ Stop</button>
        </>
      )}
      <Slider label="Feather" value={fill.feather} min={0} max={1} defaultValue={0} onChange={(v) => patch((f) => { f.feather = v })} />
    </div>
  )
}

function RenderBar() {
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const r = project.render
  const a = r.alpha
  const g = r.grid
  return (
    <div className="render-bar" data-testid="render-bar">
      <div className="seg tiny" data-testid="preview-toggle">
        <button className={r.preview === 'drawing' ? 'on' : ''} data-testid="preview-drawing" onClick={() => update((d) => { d.render.preview = 'drawing' })}>Drawing</button>
        <button className={r.preview === 'leds' ? 'on' : ''} data-testid="preview-leds" onClick={() => update((d) => { d.render.preview = 'leds' })}>LEDs</button>
      </div>
      <div className="alpha-grid" role="group" aria-label="Alpha mapping">
        <button data-testid="alpha-dim" className={a.mode === 'dim' ? 'on' : ''} onClick={() => update((d) => { d.render.alpha.mode = 'dim' })}>Dim</button>
        <button data-testid="alpha-shape" className={a.mode === 'shape' ? 'on' : ''} onClick={() => update((d) => { d.render.alpha.mode = 'shape' })}>Shape</button>
        <button data-testid="alpha-threshold" className={a.mode === 'threshold' ? 'on' : ''} onClick={() => update((d) => { d.render.alpha.mode = 'threshold' })}>On/off</button>
        <button data-testid="alpha-both" className={a.mode === 'both' ? 'on' : ''} title="Glyph from alpha, brightness from alpha" onClick={() => update((d) => { d.render.alpha.mode = 'both' })}>Shape + dim</button>
      </div>
      {a.mode === 'threshold' && (
        <div className="bar-slider"><Slider label="Cut" value={a.threshold} min={0} max={1} defaultValue={0.5} onChange={(v) => update((d) => { d.render.alpha.threshold = v })} /></div>
      )}
      {(a.mode === 'shape' || a.mode === 'both') && (
        <>
          <div className="bar-slider"><Slider label="Low" value={a.low} min={0} max={1} onChange={(v) => update((d) => setAlphaThreshold(d.render.alpha, 'low', v))} /></div>
          <div className="bar-slider"><Slider label="Mid" value={a.mid} min={0} max={1} onChange={(v) => update((d) => setAlphaThreshold(d.render.alpha, 'mid', v))} /></div>
          <div className="bar-slider"><Slider label="Full" value={a.high} min={0} max={1} onChange={(v) => update((d) => setAlphaThreshold(d.render.alpha, 'high', v))} /></div>
          <label className="glyph-row"><span>Low</span><GlyphSelect value={a.lowShape} onChange={(v) => update((d) => { d.render.alpha.lowShape = v })} /></label>
          <label className="glyph-row"><span>Mid</span><GlyphSelect value={a.midShape} onChange={(v) => update((d) => { d.render.alpha.midShape = v })} /></label>
          <label className="glyph-row"><span>Full</span><GlyphSelect value={a.highShape} onChange={(v) => update((d) => { d.render.alpha.highShape = v })} /></label>
        </>
      )}
      {(a.mode === 'dim' || a.mode === 'threshold') && (
        <label className="glyph-row"><span>On</span><GlyphSelect testId="on-shape" value={g.onShape} onChange={(v) => update((d) => { d.render.grid.onShape = v })} /></label>
      )}
      <div className="bar-slider"><Slider label="Dot size" value={g.dotSize} min={0.25} max={1.4} step={0.01} defaultValue={1} onChange={(v) => update((d) => { d.render.grid.dotSize = v })} /></div>
      <label className="check sm"><input type="checkbox" checked={g.showOff} onChange={(e) => update((d) => { d.render.grid.showOff = e.target.checked })} />Unlit LEDs</label>
      {g.showOff && <input type="color" aria-label="Unlit LED colour" value={g.offColor} onChange={(e) => update((d) => { d.render.grid.offColor = e.target.value })} />}
    </div>
  )
}

export function DesignTab() {
  return (
    <div className="design-grid">
      <PropertiesPanel />
      <VectorCanvas />
      <ShapesScreenPanel />
    </div>
  )
}
