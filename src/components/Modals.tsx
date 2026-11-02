import { useRef, useState } from 'react'
import { deleteNamed, getProject, listSaved, normalizeProject, saveNamed, useProject, useUI } from '../store'
import { makeDefaultProject } from '../engine/presets'
import { downloadJSON, exportAnimationFrames, exportSequenceFrames } from '../engine/exporter'
import { layoutClips } from '../engine/anim'
import { ExportCancelled, even, exportVideo, nativeFaceSize, outputSize, sourceDuration, type VideoFormat } from '../engine/videoExport'

function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function ExportModal() {
  const open = useUI((s) => s.exportOpen)
  const setOpen = useUI((s) => s.setExportOpen)
  const flash = useUI((s) => s.flash)
  const project = useProject((s) => s.project)
  const update = useProject((s) => s.update)
  const [kind, setKind] = useState<'json' | 'video'>('json')
  const [scope, setScope] = useState<'anim' | 'seq'>('anim')
  const [fps, setFps] = useState(30)
  const [thr, setThr] = useState(128)
  const [busy, setBusy] = useState(false)
  const [vFormat, setVFormat] = useState<VideoFormat>('mp4')
  const [vFps, setVFps] = useState<24 | 30 | 60>(30)
  const [resMode, setResMode] = useState<'1' | '2' | '4' | 'custom'>('1')
  const [cw, setCw] = useState(480)
  const [ch, setCh] = useState(128)
  const [bg, setBg] = useState('#000000')
  const [transparent, setTransparent] = useState(false)
  const [loops, setLoops] = useState(1)
  const [ball, setBall] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progText, setProgText] = useState('')
  const cancelRef = useRef(false)
  if (!open) return null
  const anim = project.animations.find((a) => a.id === project.activeAnimId) ?? project.animations[0]
  const seq = project.sequences.find((s) => s.id === project.activeSeqId) ?? project.sequences[0]
  const dur = scope === 'anim' ? anim.duration : layoutClips(project, seq.clips).total
  const frames = Math.max(1, Math.round(dur * fps))
  const bytes = frames * project.screen.h * (Math.ceil(project.screen.w / 4) + 3)
  const native = nativeFaceSize(project.screen.shape)
  const face = resMode === 'custom' ? { w: even(cw), h: even(ch) } : { w: native.w * Number(resMode), h: native.h * Number(resMode) }
  const videoOut = outputSize(face.w, face.h, project.screen.shape === 'round', ball)
  const src = sourceDuration(project, scope)
  const videoFrames = Math.max(1, Math.round(src.seconds * vFps)) * (vFormat === 'gif' ? 1 : Math.max(1, loops || 1))
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
  const runVideo = async () => {
    cancelRef.current = false
    setBusy(true)
    setProgress(0)
    setProgText('Starting…')
    try {
      const result = await exportVideo(getProject(), {
        scope, format: vFormat, fps: vFps, faceW: face.w, faceH: face.h,
        background: transparent ? null : bg, loops, ball,
      }, {
        aborted: () => cancelRef.current,
        onProgress: (done, total) => { setProgress(done / Math.max(1, total)); setProgText(`${done} / ${total} frames`) },
      })
      downloadBlob(result.filename, result.blob)
      flash(result.fallback ? `WebCodecs unavailable — saved ${result.filename}` : `Downloaded ${result.filename}`)
    } catch (e) {
      if (e instanceof ExportCancelled || cancelRef.current) flash('Export cancelled')
      else flash('Export failed: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (!busy && e.target === e.currentTarget) setOpen(false) }}>
      <div className="modal wide" data-testid="export-modal">
        <h3>Export</h3>
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={kind === 'json' ? 'on' : ''} onClick={() => !busy && setKind('json')}>JSON frames</button>
          <button className={kind === 'video' ? 'on' : ''} data-testid="export-kind-video" onClick={() => !busy && setKind('video')}>Video</button>
        </div>
        <div className="seg">
          <button className={scope === 'anim' ? 'on' : ''} onClick={() => !busy && setScope('anim')}>Animation</button>
          <button className={scope === 'seq' ? 'on' : ''} onClick={() => !busy && setScope('seq')}>Sequence</button>
        </div>
        <div className="field"><label>Source</label><b>{scope === 'anim' ? anim.name : seq.name}</b><span className="mut">{dur.toFixed(2)}s</span></div>
        {kind === 'json' ? (
          <>
            <p className="mut">Per-frame LED bitmaps (hex rows) plus per-LED brightness 0–255 — ready to stream to the Zephia {project.screen.w}×{project.screen.h} matrix.</p>
            <div className="field"><label>Frame rate</label>
              <select value={fps} onChange={(e) => setFps(+e.target.value)}>{[10, 12, 15, 24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select></div>
            <div className="field"><label>LED on-threshold</label>
              <input type="range" min={16} max={240} value={thr} onChange={(e) => setThr(+e.target.value)} /><span className="mut">{thr}/255</span></div>
            <div className="mut small">{frames} frames · ~{(bytes / 1024).toFixed(0)} KB · {project.screen.w}×{project.screen.h} · {Math.ceil(project.screen.w / 4)} hex chars/row, MSB = leftmost LED</div>
            <div className="modal-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" data-testid="export-go" disabled={busy} onClick={go}>{busy ? 'Rendering…' : 'Download JSON'}</button></div>
          </>
        ) : (
          <>
            <p className="mut">Offline frame-by-frame render of the current {project.render.preview === 'leds' ? 'LED overlay' : 'raw drawing'}. Same painter as the preview.</p>
            <div className="field"><label>Look</label>
              <div className="seg tiny">
                <button className={project.render.preview === 'drawing' ? 'on' : ''} onClick={() => update((d) => { d.render.preview = 'drawing' })}>Drawing</button>
                <button className={project.render.preview === 'leds' ? 'on' : ''} onClick={() => update((d) => { d.render.preview = 'leds' })}>LEDs</button>
              </div>
            </div>
            <div className="field"><label>Format</label>
              <div className="seg">
                {(['mp4', 'webm', 'gif'] as const).map((f) => (
                  <button key={f} data-testid={'fmt-' + f} className={vFormat === f ? 'on' : ''} onClick={() => { if (busy) return; setVFormat(f); if (f !== 'webm') setTransparent(false) }}>{f.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div className="field"><label>Resolution</label>
              <select data-testid="video-res" value={resMode} disabled={busy} onChange={(e) => { const v = e.target.value as typeof resMode; setResMode(v); if (v === 'custom') { setCw(native.w); setCh(native.h) } }}>
                <option value="1">Native {native.w}×{native.h}</option>
                <option value="2">2× {native.w * 2}×{native.h * 2}</option>
                <option value="4">4× {native.w * 4}×{native.h * 4}</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            {resMode === 'custom' && (
              <div className="custom-res" style={{ marginBottom: 8 }}>
                <input aria-label="Video width" type="number" min={16} max={3840} value={cw} disabled={busy} onChange={(e) => setCw(+e.target.value)} />
                <span>×</span>
                <input aria-label="Video height" type="number" min={16} max={3840} value={ch} disabled={busy} onChange={(e) => setCh(+e.target.value)} />
              </div>
            )}
            <div className="field"><label>Frame rate</label>
              <select data-testid="video-fps" value={vFps} disabled={busy} onChange={(e) => setVFps(+e.target.value as 24 | 30 | 60)}>{[24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
            </div>
            <div className="field"><label>Background</label>
              <input type="color" aria-label="Background colour" value={bg} disabled={busy || transparent} onChange={(e) => setBg(e.target.value)} />
              <label className="check sm"><input type="checkbox" data-testid="video-alpha" checked={transparent} disabled={busy} onChange={(e) => { const on = e.target.checked; setTransparent(on); if (on) setVFormat('webm') }} />Transparent</label>
            </div>
            <div className="mut small" style={{ marginTop: -4 }}>{transparent ? 'WebM with alpha. MP4 and GIF stay opaque.' : 'Flat colour behind the face. The preview’s black screen is the default.'}</div>
            <div className="field"><label>Loops</label>
              <input data-testid="video-loops" type="number" min={0} max={12} value={loops} disabled={busy} onChange={(e) => setLoops(Math.max(0, Math.min(12, Math.round(+e.target.value) || 0)))} />
              <span className="mut small">0 = forever on GIF. Video repeats the cycle; 0 exports one play.</span>
            </div>
            <div className="field"><label>Frame</label>
              <div className="seg">
                <button className={!ball ? 'on' : ''} data-testid="frame-face" disabled={busy} onClick={() => setBall(false)}>Face only</button>
                <button className={ball ? 'on' : ''} data-testid="frame-ball" disabled={busy} onClick={() => setBall(true)}>Ball + visor</button>
              </div>
            </div>
            <div className="mut small">{videoFrames} frames · {videoOut.w}×{videoOut.h}{ball ? ` · face ${face.w}×${face.h}` : ''} · {vFormat.toUpperCase()} · {project.render.preview === 'leds' ? 'LED overlay' : 'raw drawing'}</div>
            {busy && (
              <div className="export-progress" data-testid="export-progress">
                <div className="export-progress-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
                <span>{progText} · {Math.round(progress * 100)}%</span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn" data-testid="video-cancel" onClick={() => { if (busy) cancelRef.current = true; else setOpen(false) }}>{busy ? 'Cancel export' : 'Close'}</button>
              <button className="btn primary" data-testid="video-go" disabled={busy} onClick={runVideo}>{busy ? 'Rendering…' : 'Download video'}</button>
            </div>
          </>
        )}
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
