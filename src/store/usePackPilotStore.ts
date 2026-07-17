import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AddWorkInput, AuditRecord, ChannelId, InboundSession, StageRecord, StageTimeInput, TrackingMode, WorkItem, WorkStage, WorkdayRecord } from '../types/work'

interface State {
  schemaVersion: 7
  works: WorkItem[]
  inboundSessions: InboundSession[]
  workdays: WorkdayRecord[]
  audits: AuditRecord[]
  counters: Record<ChannelId, number>
  addWork: (input: AddWorkInput) => void
  startStage: (workId: string, stage: WorkStage, lead: string, helpers: string[]) => void
  completeStage: (workId: string, stage: WorkStage) => void
  pauseStage: (workId: string, stage: WorkStage) => void
  resumeStage: (workId: string, stage: WorkStage) => void
  updateStageTime: (workId: string, stage: WorkStage, input: StageTimeInput) => void
  suspendWork: (workId: string) => void
  resumeWork: (workId: string) => void
  startInbound: () => void
  completeInbound: () => void
  endWorkday: () => void
  cancelWork: (workId: string) => void
  deleteWork: (workId: string) => void
  resetAll: () => void
}

export const workers = ['韋', 'NIKI', '豪豪', '阿拉蕾', '小田', '其他']
export const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮', preorder: '預購', myship: '賣貨便', 'boss-note': '老闆記事本', ojisan: '歐吉桑', ichibansan: '一番桑', 'inventory-system': '庫存系統', other: '其他',
}
const initialCounters: Record<ChannelId, number> = { shopee: 0, preorder: 0, myship: 0, 'boss-note': 0, ojisan: 0, ichibansan: 0, 'inventory-system': 0, other: 0 }
const uid = () => crypto.randomUUID()
const iso = () => new Date().toISOString()
export const dayKey = (date = new Date()) => date.toLocaleDateString('sv-SE')
const makeStage = (stage: WorkStage): StageRecord => ({ stage, status: 'not-started', leadWorker: '', helpers: [], trackingMode: 'manual', sessions: [] })
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
  const finalStage = w.stages.find(s => ['shipping', 'moving-hallway', 'system-use'].includes(s.stage))
  if (finalStage && (finalStage.status === 'completed' || finalStage.status === 'skipped')) return { ...w, status: 'completed', completedAt: w.completedAt ?? finalStage.completedAt ?? w.updatedAt }
  if (w.stages.some(s => s.stage === 'waiting-logistics' && s.status === 'waiting')) return { ...w, status: 'waiting' }
  return { ...w, status: 'active', completedAt: undefined }
}
const audit = (workId: string, action: string, detail: string): AuditRecord => ({ id: uid(), workId, happenedAt: iso(), action, detail })
const modeFor = (lead: string): TrackingMode => lead === '韋' ? 'automatic' : 'manual'
const completeWithTransitions = (w: WorkItem, stageName: WorkStage, at: string, replacement?: StageRecord) => {
  let stages = w.stages.map(s => s.stage !== stageName ? s : replacement ?? { ...close(s, at), status: 'completed' as const, completedAt: at })
  if (stageName === 'packing') stages = stages.map(s => s.stage === 'waiting-logistics' ? { ...s, status: 'waiting' as const, sessions: [{ id: uid(), startedAt: at, source: 'manual' as const }] } : s)
  const isFinal = stageName === 'shipping' || stageName === 'moving-hallway' || stageName === 'system-use'
  return derive({ ...w, updatedAt: at, completedAt: isFinal ? at : w.completedAt, stages })
}
const jobCodeFor = (date: string, works: WorkItem[]) => {
  const n = works.filter(w => w.originWorkday === date).length + 1
  return `PP-${date.replaceAll('-', '')}-${String(n).padStart(3, '0')}`
}

export const usePackPilotStore = create<State>()(persist((set, get) => ({
  schemaVersion: 7, works: [], inboundSessions: [], workdays: [{ date: dayKey() }], audits: [], counters: initialCounters,
  addWork: (input) => {
    const state = get(); const at = iso(); const date = dayKey(); const sequence = (state.counters[input.channelId] ?? 0) + 1
    const delivery = input.channelId === 'inventory-system' ? 'internal' : input.channelId === 'myship' ? 'convenience-store' : input.deliveryType
    const stages = stagesFor(input.channelId, delivery); const first = stages[0]; const mode = modeFor(input.leadWorker)
    first.status = mode === 'automatic' ? 'working' : 'paused'
    first.leadWorker = input.leadWorker
    first.helpers = input.channelId === 'inventory-system' ? [] : input.helpers.filter(h => h !== input.leadWorker)
    first.trackingMode = mode
    first.sessions = mode === 'automatic' ? [{ id: uid(), startedAt: at, source: mode }] : []
    const base = channelNames[input.channelId]
    const work: WorkItem = { id: uid(), jobCode: jobCodeFor(date, state.works), channelId: input.channelId, displayName: sequence === 1 ? base : `${base}（${sequence}）`, sequence, deliveryType: delivery, orderCount: Math.max(0, Math.floor(input.orderCount)), note: input.note.trim(), createdAt: at, updatedAt: at, status: 'active', originWorkday: date, currentWorkday: date, stages, suspensions: [] }
    const detail = mode === 'automatic' ? `${work.displayName}，主要：${input.leadWorker}，自動開始` : `${work.displayName}，主要：${input.leadWorker}，等待手動補登時間`
    set({ works: [work, ...state.works], counters: { ...state.counters, [input.channelId]: sequence }, workdays: state.workdays.some(d => d.date === date) ? state.workdays : [{ date }, ...state.workdays], audits: [audit(work.id, '建立工作', detail), ...state.audits] })
  },
  startStage: (workId, stageName, lead, helpers) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId) return w; const at = iso(); const mode = modeFor(lead)
    return derive({ ...w, status: 'active', updatedAt: at, currentWorkday: dayKey(), stages: w.stages.map(s => {
      if ((stageName === 'shipping' || stageName === 'moving-hallway') && s.stage === 'waiting-logistics' && s.status === 'waiting') return { ...close(s, at), status: 'completed' as const, completedAt: at }
      if (s.stage !== stageName) return s
      return { ...s, status: mode === 'automatic' ? 'working' : 'paused', leadWorker: lead, helpers: stageName === 'sorting' ? [] : helpers.filter(h => h !== lead), trackingMode: mode, sessions: mode === 'automatic' ? [...s.sessions, { id: uid(), startedAt: at, source: mode }] : s.sessions }
    }) })
  }), audits: [audit(workId, '開始階段', `${stageName}（${modeFor(state.works.find(w=>w.id===workId)?.stages.find(s=>s.stage===stageName)?.leadWorker ?? '') === 'automatic' ? '自動' : '手動'}）`), ...state.audits] })),
  completeStage: (workId, stageName) => set(state => ({ works: state.works.map(w => w.id !== workId ? w : completeWithTransitions(w, stageName, iso())), audits: [audit(workId, '完成階段', stageName), ...state.audits] })),
  pauseStage: (workId, stageName) => set(state => ({ works: state.works.map(w => w.id !== workId ? w : derive({ ...w, updatedAt: iso(), stages: w.stages.map(s => s.stage !== stageName ? s : { ...close(s, iso()), status: 'paused' }) })), audits: [audit(workId, '暫停階段', stageName), ...state.audits] })),
  resumeStage: (workId, stageName) => {
    const w = get().works.find(x => x.id === workId); const s = w?.stages.find(x => x.stage === stageName); if (!w || !s) return
    get().startStage(workId, stageName, s.leadWorker || '韋', s.helpers)
  },
  updateStageTime: (workId, stageName, input) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId) return w
    const start = new Date(input.startedAt); const end = new Date(input.endedAt)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return w
    const at = end.toISOString()
    const replacement: StageRecord = { ...(w.stages.find(s => s.stage === stageName) as StageRecord), leadWorker: input.leadWorker, helpers: stageName === 'sorting' ? [] : input.helpers.filter(h => h !== input.leadWorker), trackingMode: 'manual', sessions: [{ id: uid(), startedAt: start.toISOString(), endedAt: at, source: 'manual' }], status: input.markCompleted ? 'completed' : 'paused', completedAt: input.markCompleted ? at : undefined }
    if (input.markCompleted) return completeWithTransitions(w, stageName, at, replacement)
    return derive({ ...w, updatedAt: iso(), stages: w.stages.map(s => s.stage === stageName ? replacement : s) })
  }), audits: [audit(workId, '調整工作時間', `${stageName}：${input.startedAt} ～ ${input.endedAt}${input.markCompleted ? '，標記完成' : ''}`), ...state.audits] })),
  suspendWork: (workId) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId || ['completed','cancelled','suspended'].includes(w.status)) return w
    const at = iso(); return { ...w, status: 'suspended' as const, updatedAt: at, stages: w.stages.map(s => s.status === 'working' ? { ...close(s, at), status: 'paused' as const } : s), suspensions: [...w.suspensions, { id: uid(), startedAt: at, fromWorkday: dayKey() }] }
  }), audits: [audit(workId, '擱置工作', '等待下一個工作日接續；擱置時間不計入效率'), ...state.audits] })),
  resumeWork: (workId) => set(state => ({ works: state.works.map(w => {
    if (w.id !== workId || w.status !== 'suspended') return w
    const at = iso(); return derive({ ...w, status: 'active', updatedAt: at, currentWorkday: dayKey(), suspensions: w.suspensions.map((s, i) => i === w.suspensions.length - 1 && !s.resumedAt ? { ...s, resumedAt: at, toWorkday: dayKey() } : s) })
  }), audits: [audit(workId, '接續工作', `接續至 ${dayKey()}`), ...state.audits] })),
  startInbound: () => {
    const state = get()
    if (state.inboundSessions.some(s => !s.endedAt)) return
    const at = iso()
    const pausedWorkIds: string[] = []
    const works = state.works.map(w => {
      let changed = false
      const stages = w.stages.map(s => {
        if (s.status === 'working' && s.leadWorker === '韋') { changed = true; return { ...close(s, at), status: 'paused' as const }
        }
        return s
      })
      if (changed) pausedWorkIds.push(w.id)
      return changed ? derive({ ...w, updatedAt: at, stages }) : w
    })
    const session: InboundSession = { id: uid(), startedAt: at, worker: '韋' }
    const pauseAudits = pausedWorkIds.map(id => audit(id, '暫停階段', '開始處理到貨，同一位執行者的自動計時已暫停'))
    set({ works, inboundSessions: [session, ...state.inboundSessions], audits: [audit('inbound', '開始處理到貨', '韋'), ...pauseAudits, ...state.audits] })
  },
  completeInbound: () => {
    const state = get(); const at = iso()
    if (!state.inboundSessions.some(s => !s.endedAt)) return
    set({ inboundSessions: state.inboundSessions.map(s => !s.endedAt ? { ...s, endedAt: at } : s), audits: [audit('inbound', '完成處理到貨', '本次到貨工時計時結束'), ...state.audits] })
  },
  endWorkday: () => {
    const state = get(); const at = iso(); const date = dayKey()
    set({ inboundSessions: state.inboundSessions.map(s => !s.endedAt ? { ...s, endedAt: at } : s), works: state.works.map(w => {
      if (w.currentWorkday !== date || ['completed','cancelled','suspended'].includes(w.status)) return w
      return { ...w, status: 'suspended' as const, updatedAt: at, stages: w.stages.map(s => s.status === 'working' ? { ...close(s, at), status: 'paused' as const } : s), suspensions: [...w.suspensions, { id: uid(), startedAt: at, fromWorkday: date }] }
    }), workdays: state.workdays.some(d => d.date === date) ? state.workdays.map(d => d.date === date ? { ...d, closedAt: at } : d) : [{ date, closedAt: at }, ...state.workdays], audits: [audit('workday', '結束工作日', date), ...state.audits] })
  },
  cancelWork: (workId) => set(state => ({ works: state.works.map(w => w.id === workId ? { ...w, cancelledAt: iso(), status: 'cancelled' } : w), audits: [audit(workId, '取消工作', '標記為取消／異常'), ...state.audits] })),
  deleteWork: (workId) => set(state => ({ works: state.works.filter(w => w.id !== workId), audits: state.audits.filter(a => a.workId !== workId) })),
  resetAll: () => set({ works: [], inboundSessions: [], workdays: [{ date: dayKey() }], audits: [], counters: initialCounters }),
}), {
  name: 'packpilot-data-v5-trial', version: 7, storage: createJSONStorage(() => localStorage),
  migrate: (persisted: unknown) => {
    const old = persisted as Partial<State>
    return { ...old, schemaVersion: 7, inboundSessions: old.inboundSessions ?? [], works: (old.works ?? []).map((w, i) => ({ ...w, jobCode: w.jobCode ?? `PP-${w.originWorkday.replaceAll('-', '')}-${String(i + 1).padStart(3, '0')}` })) } as State
  },
  partialize: s => ({ schemaVersion: s.schemaVersion, works: s.works, inboundSessions: s.inboundSessions, workdays: s.workdays, audits: s.audits, counters: s.counters }),
}))
