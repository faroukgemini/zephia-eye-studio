import { useRef, useState } from 'react'
import { deleteNamed, getProject, listSaved, normalizeProject, saveNamed, useProject, useUI } from '../store'
import { makeDefaultProject } from '../engine/presets'
import { downloadJSON, exportAnimationFrames, exportSequenceFrames } from '../engine/exporter'
import { layoutClips } from '../engine/anim'

export function ExportModal() {
  const open = useUI((s) => s.exportOpen)
  const setOpen = useUI((s) => s.setExportOpen)
  const flash = useUI((s) => s.flash)
  const project = useProject((s) => s.project)
  const [scope, setScope] = useState<'anim' | 'seq'>('anim')
  const [fps, setFps] = useState(30)
  const [thr, setThr] = useState(128)
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const anim = project.animations.find((a) => a.id === project.activeAnimId) ?? project.animations[0]
  const seq = project.sequences.find((s) => s.id === project.activeSeqId) ?? project.sequences[0]
  const dur = scope === 'anim' ? anim.duration : layoutClips(project, seq.clips).total
  const frames = Math.max(1, Math.round(dur * fps))
  const bytes = frames * project.screen.h * (Math.ceil(project.screen.w / 4) + 3)
  const go = () => {
    setBusy(true)
    setTimeout(() => {
      try {
        const data = scope === 'anim' ? exportAnimationFrames(project, anim, { fps, threshold: thr }) : exportSequenceFrames(project, seq.id, { fps, threshold: thr })
        downloadJSON(`${scope === 'anim' ? anim.name : seq.name.replace(/\s+/g, '_')}.${project.screen.w}x${project.screen.h}.frames.json`, data)
        flash(`Exported ${frames} frames`)
        setOpen(false)
      } catch (e) { flash('Export failed: ' + (e as Error).message) }
      setBusy(false)
    }, 30)
  }
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="modal" data-testid="export-modal">
        <h3>Export LED frames</h3>
        <p className="mut">Per-frame LED bitmaps as arrays of hex rows — ready to stream to the Zephia {project.screen.w}×{project.screen.h} matrix.</p>
        <div className="seg">
          <button className={scope === 'anim' ? 'on' : ''} onClick={() => setScope('anim')}>Animation</button>
          <button className={scope === 'seq' ? 'on' : ''} onClick={() => setScope('seq')}>Sequence</button>
        </div>
        <div className="field"><label>Source</label><b>{scope === 'anim' ? anim.name : seq.name}</b><span className="mut">{dur.toFixed(2)}s</span></div>
        <div className="field"><label>Frame rate</label>
          <select value={fps} onChange={(e) => setFps(+e.target.value)}>{[10, 12, 15, 24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></div>
        <div className="field"><label>LED on-threshold</label>
          <input type="range" min={16} max={240} value={thr} onChange={(e) => setThr(+e.target.value)} /><span className="mut">{thr}/255</span></div>
        <div className="mut small">{frames} frames · ~{(bytes / 1024).toFixed(0)} KB · {project.screen.w}×{project.screen.h} · {Math.ceil(project.screen.w / 4)} hex chars/row, MSB = leftmost LED</div>
        <div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" data-testid="export-go" disabled={busy} onClick={go}>{busy ? 'Rendering…' : 'Download JSON'}</button></div>
      </div>
    </div>
  )
}

export function ProjectsModal() {
  const open = useUI((s) => s.projectsOpen)
  const setOpen = useUI((s) => s.setProjectsOpen)
  const flash = useUI((s) => s.flash)
  const replace = useProject((s) => s.replace)
  const project = useProject((s) => s.project)
  const [name, setName] = useState('')
  const [, bump] = useState(0)
  const file = useRef<HTMLInputElement>(null)
  if (!open) return null
  const saved = listSaved()
  const names = Object.keys(saved).sort((a, b) => saved[b].savedAt - saved[a].savedAt)
  const load = (p: any, msg: string) => { try { replace(normalizeProject(structuredClone(p))); flash(msg); setOpen(false) } catch (e) { flash((e as Error).message) } }
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="modal" data-testid="projects-modal">
        <h3>Projects</h3>
        <p className="mut">Everything is stored locally in this browser (localStorage). Changes autosave.</p>
        <div className="field"><input style={{ flex: 1 }} placeholder="Project name" value={name || project.name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" onClick={() => { saveNamed((name || project.name).trim() || 'Untitled', getProject()); bump((n) => n + 1); flash('Project saved') }}>Save</button></div>
        <div className="saved-list">
          {names.length === 0 && <div className="mut small">No saved projects yet.</div>}
          {names.map((n) => (
            <div key={n} className="saved-row"><b>{n}</b><span className="mut">{new Date(saved[n].savedAt).toLocaleString()}</span><span className="grow" />
              <button className="btn sm" onClick={() => load(saved[n].project, `Loaded ${n}`)}>Load</button>
              <button className="btn sm danger" onClick={() => { deleteNamed(n); bump((x) => x + 1) }}>Delete</button></div>
          ))}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <div className="grp">
            <button className="btn" onClick={() => { if (confirm('Start a new project with the default animation library?')) load(makeDefaultProject(), 'New project') }}>New</button>
            <button className="btn" onClick={() => file.current?.click()}>Import JSON</button>
            <button className="btn" data-testid="export-project" onClick={() => downloadJSON(`${project.name.replace(/\s+/g, '_') || 'zephia'}.zephia.json`, project, true)}>Export project JSON</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try { load(JSON.parse(await f.text()), `Imported ${f.name}`) } catch { flash('Could not read that file') }
            }} />
          </div>
          <button className="btn" onClick={() => setOpen(false)}>Close</button>
        </div>
      </div>
    </div>
  )
}
