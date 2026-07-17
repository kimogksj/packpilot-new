import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  AddWorkInput,
  AuditRecord,
  ChannelId,
  InterruptionReason,
  InterruptionRecord,
  StageRecord,
  TrackingMode,
  UpdateWorkInput,
  WorkItem,
  WorkStage,
} from '../types/work'

interface PackPilotState {
  schemaVersion: 4
  works: WorkItem[]
  interruptions: InterruptionRecord[]
  audits: AuditRecord[]
  channelCounters: Record<ChannelId, number>
  addWork: (input: AddWorkInput) => void
  startStage: (workId: string, stage: WorkStage, workerName: string, mode: TrackingMode, happenedAt?: string) => void
  completeStage: (workId: string, stage: WorkStage, happenedAt?: string) => void
  pauseStage: (workId: string, stage: WorkStage, reason: InterruptionReason, note: string) => void
  resumeStage: (workId: string, stage: WorkStage) => void
  editStage: (workId: string, stage: WorkStage, workerName: string, mode: TrackingMode, startedAt?: string, endedAt?: string) => void
  skipStage: (workId: string, stage: WorkStage) => void
  updateWork: (workId: string, input: UpdateWorkInput) => void
  cancelWork: (workId: string) => void
  restoreWork: (workId: string) => void
  deleteWork: (workId: string) => void
  duplicateWork: (workId: string) => void
  resetAll: () => void
}

export const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮', preorder: '預購', myship: '賣貨便', 'boss-note': '老闆記事本',
  ojisan: '歐吉桑', ichibansan: '一番桑', 'inventory-system': '庫存系統', other: '其他',
}

export const stageOrder: WorkStage[] = ['picking', 'sorting', 'packing', 'ready-to-ship', 'shipping']

const initialCounters: Record<ChannelId, number> = {
  shopee: 0, preorder: 0, myship: 0, 'boss-note': 0, ojisan: 0, ichibansan: 0,
  'inventory-system': 0, other: 0,
}

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID()
const safeTime = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : now()
const audit = (workId: string, action: string, detail: string): AuditRecord => ({ id: uid(), workId, happenedAt: now(), action, detail })

const makeStage = (stage: WorkStage): StageRecord => ({
  stage, status: 'not-started', workerName: '', trackingMode: 'manual', sessions: [],
})

const stagesFor = (channelId: ChannelId, deliveryType: WorkItem['deliveryType']): StageRecord[] => {
  if (channelId === 'inventory-system') return [makeStage('system-use')]
  return deliveryType === 'home-delivery'
    ? [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('ready-for-hallway'), makeStage('moving-hallway')]
    : [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('ready-to-ship'), makeStage('shipping')]
}

const closeStage = (stage: StageRecord, endedAt: string): StageRecord => ({
  ...stage,
  sessions: stage.sessions.map((session) => session.endedAt ? session : { ...session, endedAt }),
})

const deriveWork = (work: WorkItem): WorkItem => {
  if (work.cancelledAt) return { ...work, status: 'cancelled' }
  const allDone = work.stages.every((stage) => stage.status === 'completed' || stage.status === 'skipped')
  if (allDone) {
    const latest = work.stages.map((s) => s.completedAt).filter(Boolean).sort().at(-1) ?? work.updatedAt
    return { ...work, status: 'completed', completedAt: work.completedAt ?? latest }
  }
  const coreDone = work.stages.filter((s) => ['picking', 'sorting', 'packing'].includes(s.stage)).every((s) => s.status === 'completed' || s.status === 'skipped')
  const anyActive = work.stages.some((s) => s.status === 'working' || s.status === 'paused')
  return { ...work, status: coreDone && !anyActive ? 'waiting' : 'active', completedAt: undefined }
}

const pauseOtherPersonalStages = (works: WorkItem[], exceptWorkId: string, exceptStage: WorkStage, timestamp: string) =>
  works.map((work) => deriveWork({
    ...work,
    stages: work.stages.map((stage) => {
      if (work.id === exceptWorkId && stage.stage === exceptStage) return stage
      if (stage.status !== 'working' || stage.trackingMode !== 'automatic' || stage.workerName !== '我') return stage
      return { ...closeStage(stage, timestamp), status: 'paused' }
    }),
  }))

const normalizeOldWork = (raw: any): WorkItem => {
  if (Array.isArray(raw.stages)) return deriveWork(raw as WorkItem)
  const channelId: ChannelId = raw.channelId ?? 'other'
  const deliveryType = channelId === 'inventory-system' ? 'internal' : (raw.deliveryType ?? 'convenience-store')
  const stages = stagesFor(channelId, deliveryType)
  for (const session of raw.sessions ?? []) {
    const target = stages.find((s) => s.stage === session.stage)
    if (target) {
      target.workerName = raw.workerName ?? '我'
      target.trackingMode = session.source ?? raw.trackingMode ?? 'automatic'
      target.sessions.push({ id: session.id ?? uid(), startedAt: session.startedAt, endedAt: session.endedAt, source: session.source ?? raw.trackingMode ?? 'automatic' })
      target.status = session.endedAt ? 'completed' : raw.status === 'paused' ? 'paused' : 'working'
      if (session.endedAt) target.completedAt = session.endedAt
    }
  }
  return deriveWork({
    id: raw.id ?? uid(), channelId, displayName: raw.displayName ?? channelNames[channelId], sequence: raw.sequence ?? 1,
    deliveryType, orderCount: raw.orderCount ?? 0, note: raw.note ?? '', createdAt: raw.createdAt ?? now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now(), completedAt: raw.completedAt, status: 'active', stages,
  })
}

export const usePackPilotStore = create<PackPilotState>()(
  persist(
    (set, get) => ({
      schemaVersion: 4,
      works: [], interruptions: [], audits: [], channelCounters: initialCounters,

      addWork: (input) => {
        const state = get()
        const timestamp = safeTime(input.startedAt)
        const sequence = (state.channelCounters[input.channelId] ?? 0) + 1
        const deliveryType = input.channelId === 'inventory-system' ? 'internal' : input.channelId === 'myship' ? 'convenience-store' : input.deliveryType
        const stages = stagesFor(input.channelId, deliveryType)
        const first = stages[0]
        first.status = 'working'; first.workerName = input.workerName.trim() || '未指定'; first.trackingMode = input.trackingMode
        first.sessions = [{ id: uid(), startedAt: timestamp, source: input.trackingMode }]
        let works = state.works
        if (input.trackingMode === 'automatic' && first.workerName === '我') works = pauseOtherPersonalStages(works, '', first.stage, timestamp)
        const base = channelNames[input.channelId]
        const work = deriveWork({
          id: uid(), channelId: input.channelId, displayName: sequence === 1 ? base : `${base}（${sequence}）`, sequence,
          deliveryType, orderCount: input.channelId === 'inventory-system' ? 0 : Math.max(0, Math.floor(input.orderCount)),
          note: input.note.trim(), createdAt: timestamp, updatedAt: timestamp, status: 'active', stages,
        })
        set({ works: [work, ...works], channelCounters: { ...state.channelCounters, [input.channelId]: sequence }, audits: [audit(work.id, '建立工作', `${work.displayName}，${first.workerName}`), ...state.audits] })
      },

      startStage: (workId, stageName, workerName, mode, happenedAt) => {
        const timestamp = safeTime(happenedAt)
        set((state) => {
          let works = state.works
          if (mode === 'automatic' && workerName.trim() === '我') works = pauseOtherPersonalStages(works, workId, stageName, timestamp)
          works = works.map((work) => work.id !== workId ? work : deriveWork({
            ...work, updatedAt: timestamp,
            stages: work.stages.map((stage) => stage.stage !== stageName ? stage : ({
              ...stage, status: 'working', workerName: workerName.trim() || '未指定', trackingMode: mode,
              sessions: [...stage.sessions, { id: uid(), startedAt: timestamp, source: mode }], completedAt: undefined,
            })),
          }))
          return { works, audits: [audit(workId, '開始階段', `${stageName}，${workerName}`), ...state.audits] }
        })
      },

      completeStage: (workId, stageName, happenedAt) => {
        const timestamp = safeTime(happenedAt)
        set((state) => ({
          works: state.works.map((work) => work.id !== workId ? work : deriveWork({
            ...work, updatedAt: timestamp,
            stages: work.stages.map((stage) => stage.stage !== stageName ? stage : ({ ...closeStage(stage, timestamp), status: 'completed', completedAt: timestamp })),
          })),
          interruptions: state.interruptions.map((i) => i.workId === workId && i.stage === stageName && !i.resumedAt ? { ...i, resumedAt: timestamp } : i),
          audits: [audit(workId, '完成階段', stageName), ...state.audits],
        }))
      },

      pauseStage: (workId, stageName, reason, note) => {
        const timestamp = now()
        const work = get().works.find((w) => w.id === workId)
        if (!work) return
        set((state) => ({
          works: state.works.map((w) => w.id !== workId ? w : deriveWork({ ...w, updatedAt: timestamp, stages: w.stages.map((s) => s.stage !== stageName ? s : ({ ...closeStage(s, timestamp), status: 'paused' })) })),
          interruptions: [{ id: uid(), workId, workName: work.displayName, stage: stageName, reason, note: note.trim(), createdAt: timestamp }, ...state.interruptions],
          audits: [audit(workId, '暫停階段', `${stageName}，${reason}`), ...state.audits],
        }))
      },

      resumeStage: (workId, stageName) => {
        const timestamp = now()
        const work = get().works.find((w) => w.id === workId)
        const stage = work?.stages.find((s) => s.stage === stageName)
        if (!work || !stage) return
        set((state) => {
          let works = state.works
          if (stage.trackingMode === 'automatic' && stage.workerName === '我') works = pauseOtherPersonalStages(works, workId, stageName, timestamp)
          return {
            works: works.map((w) => w.id !== workId ? w : deriveWork({ ...w, updatedAt: timestamp, stages: w.stages.map((s) => s.stage !== stageName ? s : ({ ...s, status: 'working', sessions: [...s.sessions, { id: uid(), startedAt: timestamp, source: s.trackingMode }] })) })),
            interruptions: state.interruptions.map((i) => i.workId === workId && i.stage === stageName && !i.resumedAt ? { ...i, resumedAt: timestamp } : i),
            audits: [audit(workId, '恢復階段', stageName), ...state.audits],
          }
        })
      },

      editStage: (workId, stageName, workerName, mode, startedAt, endedAt) => {
        const start = startedAt ? safeTime(startedAt) : undefined
        const end = endedAt ? safeTime(endedAt) : undefined
        set((state) => ({
          works: state.works.map((work) => work.id !== workId ? work : deriveWork({
            ...work, updatedAt: now(), stages: work.stages.map((stage) => {
              if (stage.stage !== stageName) return stage
              const sessions = start ? [{ id: uid(), startedAt: start, endedAt: end, source: mode }] : stage.sessions
              return { ...stage, workerName: workerName.trim() || '未指定', trackingMode: mode, sessions, status: end ? 'completed' : start ? 'working' : stage.status, completedAt: end }
            }),
          })),
          audits: [audit(workId, '修改階段', `${stageName} 時間／執行者`), ...state.audits],
        }))
      },

      skipStage: (workId, stageName) => set((state) => ({
        works: state.works.map((work) => work.id !== workId ? work : deriveWork({ ...work, updatedAt: now(), stages: work.stages.map((s) => s.stage === stageName ? ({ ...closeStage(s, now()), status: 'skipped', completedAt: now() }) : s) })),
        audits: [audit(workId, '略過階段', stageName), ...state.audits],
      })),

      updateWork: (workId, input) => set((state) => ({
        works: state.works.map((work) => {
          if (work.id !== workId) return work
          const channelId = input.channelId
          const deliveryType = channelId === 'inventory-system' ? 'internal' : channelId === 'myship' ? 'convenience-store' : input.deliveryType
          const oldStageMap = new Map(work.stages.map((s) => [s.stage, s]))
          const stages = stagesFor(channelId, deliveryType).map((s) => oldStageMap.get(s.stage) ?? s)
          return deriveWork({ ...work, channelId, deliveryType, displayName: work.sequence === 1 ? channelNames[channelId] : `${channelNames[channelId]}（${work.sequence}）`, orderCount: Math.max(0, Math.floor(input.orderCount)), note: input.note.trim(), stages, updatedAt: now() })
        }),
        audits: [audit(workId, '編輯工作', '通路、配送、單數或備註'), ...state.audits],
      })),

      cancelWork: (workId) => set((state) => ({ works: state.works.map((w) => w.id === workId ? deriveWork({ ...w, cancelledAt: now(), updatedAt: now(), stages: w.stages.map((s) => closeStage(s, now())) }) : w), audits: [audit(workId, '取消工作', '已封存為取消'), ...state.audits] })),
      restoreWork: (workId) => set((state) => ({ works: state.works.map((w) => w.id === workId ? deriveWork({ ...w, cancelledAt: undefined, updatedAt: now() }) : w), audits: [audit(workId, '恢復工作', '取消狀態已復原'), ...state.audits] })),
      deleteWork: (workId) => set((state) => ({ works: state.works.filter((w) => w.id !== workId), interruptions: state.interruptions.filter((i) => i.workId !== workId), audits: state.audits.filter((a) => a.workId !== workId) })),
      duplicateWork: (workId) => {
        const source = get().works.find((w) => w.id === workId)
        if (!source) return
        const state = get(); const sequence = (state.channelCounters[source.channelId] ?? 0) + 1; const timestamp = now()
        const stages = stagesFor(source.channelId, source.deliveryType)
        const copy: WorkItem = { ...source, id: uid(), sequence, displayName: `${channelNames[source.channelId]}（${sequence}）`, createdAt: timestamp, updatedAt: timestamp, completedAt: undefined, cancelledAt: undefined, status: 'active', stages }
        set({ works: [copy, ...state.works], channelCounters: { ...state.channelCounters, [source.channelId]: sequence }, audits: [audit(copy.id, '複製工作', `來源：${source.displayName}`), ...state.audits] })
      },
      resetAll: () => set({ works: [], interruptions: [], audits: [], channelCounters: initialCounters }),
    }),
    {
      name: 'packpilot-data', version: 4, storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const old = persisted as any
        return { schemaVersion: 4, works: Array.isArray(old?.works) ? old.works.map(normalizeOldWork) : [], interruptions: old?.interruptions ?? [], audits: old?.audits ?? [], channelCounters: { ...initialCounters, ...(old?.channelCounters ?? {}) } }
      },
      partialize: (state) => ({ schemaVersion: state.schemaVersion, works: state.works, interruptions: state.interruptions, audits: state.audits, channelCounters: state.channelCounters }),
    },
  ),
)
