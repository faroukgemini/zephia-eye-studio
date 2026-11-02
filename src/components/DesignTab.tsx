import { useRef, useState } from 'react'
import { getProject, setScreenShape, useProject, useUI } from '../store'
import { Slider } from './Slider'
import { bakeCurve, buildPath, makeEyeTransform, uid } from '../engine/geometry'
import { importSvgShape } from '../engine/svgImport'
import { PANEL, PILL_RES, PRESET_SHAPES, ROUND_RES } from '../engine/presets'
import { PARAMS, PARAM_META, type Pose, type Shape } from '../types'

export function ShapeThumb({ shape, size = 52 }: { shape: Shape; size?: number }) {
  const d = buildPath(shape.points, shape.closed, shape.smooth)
  return (
    <svg width={size} height={size} viewBox="-1.15 -1.15 2.3 2.3">
      <path d={d} fill={shape.stroke > 0 ? 'none' : '#f4f4f4'} stroke={shape.stroke > 0 ? '#f4f4f4' : 'none'} strokeWidth={shape.stroke} strokeLinecap="round" strokeLinejoin="round" />
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
  const { base, rig } = project
  const shape = project.shapes.find((s) => s.id === rig.shapeId)!

  const openSvg = async (f: File | undefined) => {
    if (!f) return
    try {
      const sh = importSvgShape(await f.text(), f.name)
      update((d) => { d.shapes.push(sh); d.rig.shapeId = sh.id })
      flash(`Imported “${sh.name}” (${sh.points.length} anchors)`)
    } catch (e: any) { flash('SVG import failed: ' + e.message) }
  }
  const saveAsNew = () => {
    const n = project.shapes.filter((s) => !s.builtin).length + 1
    const id = uid('shape')
    update((d) => {
      const cur = d.shapes.find((s) => s.id === d.rig.shapeId)!
      d.shapes.push({ ...structuredClone(cur), points: bakeCurve(cur, d.base.curve), id, name: `custom ${n}`, builtin: false })
      d.base.curve = 0
      d.rig.shapeId = id
    })
    flash(`Saved as new shape “custom ${n}”`)
  }

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
            <button className="btn primary" onClick={saveAsNew}>Save as new shape</button>
            <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => { openSvg(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className="meta-line">shape · <b>{shape.name}</b> · {shape.points.length} anchors · {shape.stroke > 0 ? 'stroke' : 'fill'}</div>
          <h4>TRANSFORM <button className="link" onClick={() => update((d) => { Object.assign(d.base, { x: 0, y: 0, rot: 0, scale: 1, squash: 0, curve: 0, blink: 0 }) })}>reset</button></h4>
          <PoseSliders pose={base} onChange={(k, v) => update((d) => { d.base[k] = v })} />
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
        <path d={ghost} className="ghost" fill="none" strokeWidth={shape.stroke > 0 ? shape.stroke : 0.012} strokeLinecap="round" strokeLinejoin="round" />
        <path d={path} className="shape" fill={shape.stroke > 0 ? 'none' : 'rgba(255,255,255,0.14)'} stroke={shape.stroke > 0 ? 'rgba(255,255,255,0.22)' : 'none'} strokeWidth={shape.stroke} strokeLinecap="round" strokeLinejoin="round" />
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
    if (w >= 8 && w <= 512 && h >= 8 && h <= 256) update((d) => { d.screen.w = w; d.screen.h = h })
    else flash('Custom size must be 8–512 × 8–256')
    setCw(''); setCh('')
  }
  const resetPresets = () => update((d) => {
    for (const p of PRESET_SHAPES) {
      const i = d.shapes.findIndex((s) => s.id === p.id)
      if (i >= 0) d.shapes[i] = structuredClone(p); else d.shapes.push(structuredClone(p))
    }
  })
  return (
    <section className="panel side-panel" data-testid="screen-panel">
      <div className="panel-bar"><span className="ttl">SCREEN</span></div>
      <div className="seg">
        <button className={sc.shape === 'pill' ? 'on' : ''} onClick={() => update((d) => setScreenShape(d, 'pill'))}>Pill visor</button>
        <button className={sc.shape === 'round' ? 'on' : ''} data-testid="round-btn" onClick={() => update((d) => setScreenShape(d, 'round'))}>Round</button>
      </div>
      <label className="field"><span>Matrix resolution</span>
        <select data-testid="res-select" value={known ? `${sc.w}x${sc.h}` : 'custom'} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); if (w) update((d) => { d.screen.w = w; d.screen.h = h }) }}>
          {list.map((r) => <option key={r.label} value={`${r.w}x${r.h}`}>{r.label}</option>)}
          {!known && <option value="custom">{sc.w}×{sc.h} custom</option>}
        </select>
      </label>
      <div className="custom-res">
        <input placeholder={String(sc.w)} value={cw} onChange={(e) => setCw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCustom()} />
        <span>×</span>
        <input placeholder={String(sc.h)} value={ch} onChange={(e) => setCh(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCustom()} />
        <button className="btn sm" onClick={applyCustom}>Set</button>
      </div>
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
          <button key={s.id} className={'shape-card' + (project.rig.shapeId === s.id ? ' on' : '')} onClick={() => update((d) => { d.rig.shapeId = s.id })} title={s.name}>
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

export function DesignTab() {
  return (
    <div className="design-grid">
      <PropertiesPanel />
      <VectorCanvas />
      <ShapesScreenPanel />
    </div>
  )
}
