import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AddWorkInput, AuditRecord, ChannelId, StageRecord, TrackingMode, WorkItem, WorkStage, WorkdayRecord } from '../types/work'

interface State {
  schemaVersion: 5
  works: WorkItem[]
  workdays: WorkdayRecord[]
  audits: AuditRecord[]
  counters: Record<ChannelId, number>
  addWork: (input: AddWorkInput) => void
  startStage: (workId: string, stage: WorkStage, lead: string, helpers: string[]) => void
  completeStage: (workId: string, stage: WorkStage) => void
  pauseStage: (workId: string, stage: WorkStage) => void
  resumeStage: (workId: string, stage: WorkStage) => void
  suspendWork: (workId: string) => void
  resumeWork: (workId: string) => void
  endWorkday: () => void
  cancelWork: (workId: string) => void
  deleteWork: (workId: string) => void
  resetAll: () => void
}

export const workers = ['韋', 'NIKI', '豪豪', '阿拉蕾', '小田']
export const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮', preorder: '預購', myship: '賣貨便', 'boss-note': '老闆記事本', ojisan: '歐吉桑', ichibansan: '一番桑', 'inventory-system': '庫存系統', other: '其他',
}
const initialCounters: Record<ChannelId, number> = { shopee: 0, preorder: 0, myship: 0, 'boss-note': 0, ojisan: 0, ichibansan: 0, 'inventory-system': 0, other: 0 }
const uid = () => crypto.randomUUID()
const iso = () => new Date().toISOString()
export const dayKey = (date = new Date()) => date.toLocaleDateString('sv-SE')
const makeStage = (stage: WorkStage): StageRecord => ({ stage, status: stage === 'waiting-logistics' ? 'not-started' : 'not-started', leadWorker: '', helpers: [], trackingMode: 'manual', sessions: [] })
const stagesFor = (channelId: ChannelId, delivery: WorkItem['deliveryType']) => {
  if (channelId === 'inventory-system') return [makeStage('system-use')]
  return delivery === 'home-delivery'
    ? [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('waiting-logistics'), makeStage('moving-hallway')]
    : [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('waiting-logistics'), makeStage('shipping')]
}
const close = (stage: StageRecord, at: string) => ({ ...stage, sessions: stage.sessions.map(s => s.endedAt ? s : { ...s, endedAt: at }) })
const derive = (w: WorkItem): WorkItem => {
  if (w.cancelledAt) return { ...w, status: 'cancelled' }
  if (w.status === 'suspended') return w
  const last = w.stages.at(-1)
  if (last && (last.status === 'completed' || last.status === 'skipped')) return { ...w, status: 'completed', completedAt: w.completedAt ?? last.completedAt }
  if (w.stages.some(s => s.stage === 'waiting-logistics' && s.status === 'waiting')) return { ...w, status: 'waiting' }
  return { ...w, status: 'active', completedAt: undefined }
}
const audit = (workId: string, action: string, detail: string): AuditRecord => ({ id: uid(), workId, happenedAt: iso(), action, detail })
const modeFor = (lead: string): TrackingMode => lead === '韋' ? 'automatic' : 'manual'

export const usePackPilotStore = create<State>()(persist((set, get) => ({
  schemaVersion: 5, works: [], workdays: [{ date: dayKey() }], audits: [], counters: initialCounters,
  addWork: (input) => {
    const state = get(); const at = iso(); const date = dayKey(); const sequence = (state.counters[input.channelId] ?? 0) + 1
    const delivery = input.channelId === 'inventory-system' ? 'internal' : input.channelId === 'myship' ? 'convenience-store' : input.deliveryType
    const stages = stagesFor(input.channelId, delivery); const first = stages[0]
    first.status = 'working'; first.leadWorker = input.leadWorker; first.helpers = input.channelId === 'inventory-system' ? [] : input.helpers; first.trackingMode = modeFor(input.leadWorker); first.sessions = [{ id: uid(), startedAt: at, source: first.trackingMode }]
    const base = channelNames[input.channelId]
    const work: WorkItem = { id: uid(), channelId: input.channelId, displayName: sequence === 1 ? base : `${base}（${sequence}）`, sequence, deliveryType: delivery, orderCount: Math.max(0, Math.floor(input.orderCount)), note: input.note.trim(), createdAt: at, updatedAt: at, status: 'active', originWorkday: date, currentWorkday: date, stages, suspensions: [] }
    set({ works: [work, ...state.works], counters: { ...state.counters, [input.channelId]: sequence }, workdays: state.workdays.some(d => d.date === date) ? state.workdays : [{ date }, ...state.workdays], audits: [audit(work.id, '建立工作', `${work.displayName}，主要：${input.leadWorker}`), ...state.audits] })
  },
  startStage: (workId, stageName, lead, helpers) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId) return w; const at = iso()
    return derive({ ...w, status: 'active', updatedAt: at, currentWorkday: dayKey(), stages: w.stages.map(s => {
      if ((stageName === 'shipping' || stageName === 'moving-hallway') && s.stage === 'waiting-logistics' && s.status === 'waiting') return { ...close(s, at), status: 'completed' as const, completedAt: at }
      if (s.stage !== stageName) return s
      return { ...s, status: 'working', leadWorker: lead, helpers: stageName === 'sorting' ? [] : helpers.filter(h => h !== lead), trackingMode: modeFor(lead), sessions: [...s.sessions, { id: uid(), startedAt: at, source: modeFor(lead) }] }
    }) })
  }), audits: [audit(workId, '開始階段', stageName), ...state.audits] })),
  completeStage: (workId, stageName) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId) return w; const at = iso(); let stages = w.stages.map(s => s.stage !== stageName ? s : { ...close(s, at), status: 'completed' as const, completedAt: at })
    if (stageName === 'packing') stages = stages.map(s => s.stage === 'waiting-logistics' ? { ...s, status: 'waiting' as const, sessions: [{ id: uid(), startedAt: at, source: 'manual' as const }] } : s)
    if (stageName === 'shipping' || stageName === 'moving-hallway' || stageName === 'system-use') return derive({ ...w, updatedAt: at, completedAt: at, stages })
    return derive({ ...w, updatedAt: at, stages })
  }), audits: [audit(workId, '完成階段', stageName), ...state.audits] })),
  pauseStage: (workId, stageName) => set(state => ({ works: state.works.map(w => w.id !== workId ? w : derive({ ...w, updatedAt: iso(), stages: w.stages.map(s => s.stage !== stageName ? s : { ...close(s, iso()), status: 'paused' }) })), audits: [audit(workId, '暫停階段', stageName), ...state.audits] })),
  resumeStage: (workId, stageName) => {
    const w = get().works.find(x => x.id === workId); const s = w?.stages.find(x => x.stage === stageName); if (!w || !s) return
    get().startStage(workId, stageName, s.leadWorker || '韋', s.helpers)
  },
  suspendWork: (workId) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId || ['completed','cancelled','suspended'].includes(w.status)) return w
    const at = iso(); return { ...w, status: 'suspended' as const, updatedAt: at, stages: w.stages.map(s => s.status === 'working' ? { ...close(s, at), status: 'paused' as const } : s), suspensions: [...w.suspensions, { id: uid(), startedAt: at, fromWorkday: dayKey() }] }
  }), audits: [audit(workId, '擱置工作', '等待下一個工作日接續'), ...state.audits] })),
  resumeWork: (workId) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId || w.status !== 'suspended') return w
    const at = iso(); return derive({ ...w, status: 'active', updatedAt: at, currentWorkday: dayKey(), suspensions: w.suspensions.map((s, i) => i === w.suspensions.length - 1 && !s.resumedAt ? { ...s, resumedAt: at, toWorkday: dayKey() } : s) })
  }), audits: [audit(workId, '接續工作', `接續至 ${dayKey()}`), ...state.audits] })),
  endWorkday: () => {
    const state = get(); const at = iso(); const date = dayKey()
    set({ works: state.works.map(w => {
      if (w.currentWorkday !== date || ['completed','cancelled','suspended'].includes(w.status)) return w
      return { ...w, status: 'suspended' as const, updatedAt: at, stages: w.stages.map(s => s.status === 'working' ? { ...close(s, at), status: 'paused' as const } : s), suspensions: [...w.suspensions, { id: uid(), startedAt: at, fromWorkday: date }] }
    }), workdays: state.workdays.some(d => d.date === date) ? state.workdays.map(d => d.date === date ? { ...d, closedAt: at } : d) : [{ date, closedAt: at }, ...state.workdays], audits: [audit('workday', '結束工作日', date), ...state.audits] })
  },
  cancelWork: (workId) => set(state => ({ works: state.works.map(w => w.id === workId ? { ...w, cancelledAt: iso(), status: 'cancelled' } : w) })),
  deleteWork: (workId) => set(state => ({ works: state.works.filter(w => w.id !== workId), audits: state.audits.filter(a => a.workId !== workId) })),
  resetAll: () => set({ works: [], workdays: [{ date: dayKey() }], audits: [], counters: initialCounters }),
}), { name: 'packpilot-data-v5-trial', version: 5, storage: createJSONStorage(() => localStorage), partialize: s => ({ schemaVersion: s.schemaVersion, works: s.works, workdays: s.workdays, audits: s.audits, counters: s.counters }) }))
