import { create } from 'zustand'
import { produce } from 'immer'
import type { Project } from './types'
import { makeDefaultProject, PILL_RES, ROUND_RES } from './engine/presets'

const LS_AUTOSAVE = 'zephia-eye-studio:autosave:v1'
const LS_PROJECTS = 'zephia-eye-studio:projects:v1'

export function normalizeProject(raw: any): Project {
  const def = makeDefaultProject()
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.animations) || !Array.isArray(raw.shapes) || !raw.screen || !raw.rig)
    throw new Error('Not a Zephia Eye Studio project file')
  const p: Project = { ...def, ...raw, base: { ...def.base, ...raw.base }, screen: { ...def.screen, ...raw.screen }, rig: { ...def.rig, ...raw.rig } }
  if (!p.sequences?.length) p.sequences = def.sequences
  if (!p.animations.find((a) => a.id === p.activeAnimId)) p.activeAnimId = p.animations[0]?.id ?? ''
  if (!p.sequences.find((s) => s.id === p.activeSeqId)) p.activeSeqId = p.sequences[0].id
  if (!p.shapes.find((s) => s.id === p.rig.shapeId)) p.rig.shapeId = p.shapes[0].id
  return p
}

function load(): Project {
  try {
    const s = localStorage.getItem(LS_AUTOSAVE)
    if (s) return normalizeProject(JSON.parse(s))
  } catch (e) {
    console.warn('Could not restore autosave', e)
  }
  return makeDefaultProject()
}

interface ProjectStore {
  project: Project
  update: (fn: (d: Project) => void) => void
  replace: (p: Project) => void
}
export const useProject = create<ProjectStore>((set) => ({
  project: load(),
  update: (fn) => set((s) => ({ project: produce(s.project, fn) })),
  replace: (p) => set({ project: p }),
}))
export const getProject = () => useProject.getState().project

let saveTimer: number | undefined
useProject.subscribe((s) => {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(LS_AUTOSAVE, JSON.stringify(s.project)) } catch (e) { console.warn('autosave failed', e) }
  }, 250)
})

/* ---- named saved projects (localStorage) ---- */
export function listSaved(): Record<string, { savedAt: number; project: Project }> {
  try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || '{}') } catch { return {} }
}
export function saveNamed(name: string, project: Project) {
  const all = listSaved()
  all[name] = { savedAt: Date.now(), project: { ...project, name } }
  localStorage.setItem(LS_PROJECTS, JSON.stringify(all))
}
export function deleteNamed(name: string) {
  const all = listSaved()
  delete all[name]
  localStorage.setItem(LS_PROJECTS, JSON.stringify(all))
}

export function setResolution(d: Project, w: number, h: number) {
  d.screen.w = w
  d.screen.h = h
}
export function setScreenShape(d: Project, shape: 'pill' | 'round') {
  d.screen.shape = shape
  const list = shape === 'round' ? ROUND_RES : PILL_RES
  if (!list.some((r) => r.w === d.screen.w && r.h === d.screen.h)) setResolution(d, list[0].w, list[0].h)
}

/* ---------------- UI store ---------------- */
export type TabId = 'design' | 'animate' | 'sequence' | 'simulator'
interface UIStore {
  tab: TabId
  setTab: (t: TabId) => void
  objectTab: 'object' | 'rigging'
  setObjectTab: (t: 'object' | 'rigging') => void
  selKey: { param: string; id: string } | null
  setSelKey: (k: { param: string; id: string } | null) => void
  selClip: { kind: 'clip' | 'transition'; id: string } | null
  setSelClip: (k: UIStore['selClip']) => void
  showPath: boolean
  setShowPath: (b: boolean) => void
  exportOpen: boolean
  setExportOpen: (b: boolean) => void
  projectsOpen: boolean
  setProjectsOpen: (b: boolean) => void
  toast: string | null
  flash: (m: string) => void
}
export const useUI = create<UIStore>((set) => ({
  tab: 'design',
  setTab: (tab) => set({ tab }),
  objectTab: 'object',
  setObjectTab: (objectTab) => set({ objectTab }),
  selKey: null,
  setSelKey: (selKey) => set({ selKey }),
  selClip: null,
  setSelClip: (selClip) => set({ selClip }),
  showPath: true,
  setShowPath: (showPath) => set({ showPath }),
  exportOpen: false,
  setExportOpen: (exportOpen) => set({ exportOpen }),
  projectsOpen: false,
  setProjectsOpen: (projectsOpen) => set({ projectsOpen }),
  toast: null,
  flash: (m) => {
    set({ toast: m })
    window.setTimeout(() => useUI.setState((s) => (s.toast === m ? { toast: null } : s)), 2400)
  },
}))
