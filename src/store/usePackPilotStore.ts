import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  AddWorkInput,
  ChannelId,
  InterruptionReason,
  InterruptionRecord,
  WorkItem,
  WorkSession,
  WorkStage,
} from '../types/work'

interface PackPilotState {
  schemaVersion: 3
  works: WorkItem[]
  interruptions: InterruptionRecord[]
  channelCounters: Record<ChannelId, number>
  addWork: (input: AddWorkInput) => void
  advanceWork: (workId: string, happenedAt?: string) => void
  interruptWork: (workId: string, reason: InterruptionReason, note: string) => void
  resumeWork: (workId: string) => void
  startFulfillment: (workId: string, happenedAt?: string) => void
  completeWork: (workId: string, happenedAt?: string) => void
  updateOrderCount: (workId: string, orderCount: number) => void
  resetAll: () => void
}

export const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮',
  preorder: '預購',
  myship: '賣貨便',
  'boss-note': '老闆記事本',
  ojisan: '歐吉桑',
  ichibansan: '一番桑',
  'inventory-system': '庫存系統',
  other: '其他',
}

const initialCounters: Record<ChannelId, number> = {
  shopee: 0,
  preorder: 0,
  myship: 0,
  'boss-note': 0,
  ojisan: 0,
  ichibansan: 0,
  'inventory-system': 0,
  other: 0,
}

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()
const safeTime = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : now()
const startSession = (stage: WorkStage, source: WorkItem['trackingMode'], startedAt = now()): WorkSession => ({ id: id(), stage, startedAt, source })

const closeOpenSession = (work: WorkItem, endedAt = now()): WorkItem => ({
  ...work,
  sessions: work.sessions.map((session) => (session.endedAt ? session : { ...session, endedAt })),
})

const pauseAutomaticPersonalWork = (works: WorkItem[], exceptId?: string): WorkItem[] => {
  const timestamp = now()
  return works.map((work) => {
    if (work.id === exceptId || work.status !== 'working' || work.trackingMode !== 'automatic' || work.workerName !== '我') return work
    return { ...closeOpenSession(work, timestamp), status: 'paused', updatedAt: timestamp }
  })
}

const nextWorkStage = (work: WorkItem): WorkStage | null => {
  if (work.stage === 'system-use') return 'completed'
  if (work.stage === 'picking') return 'sorting'
  if (work.stage === 'sorting') return 'packing'
  if (work.stage === 'packing') return work.deliveryType === 'convenience-store' ? 'ready-to-ship' : 'ready-for-hallway'
  return null
}

const normalizeWork = (raw: Partial<WorkItem>): WorkItem => {
  const createdAt = raw.createdAt ?? now()
  const channelId = raw.channelId ?? 'other'
  const deliveryType = channelId === 'inventory-system' ? 'internal' : (raw.deliveryType ?? 'convenience-store')
  const trackingMode = raw.trackingMode ?? 'automatic'
  const stage = raw.stage ?? (channelId === 'inventory-system' ? 'system-use' : 'picking')
  return {
    id: raw.id ?? id(),
    channelId,
    displayName: raw.displayName ?? channelNames[channelId],
    sequence: raw.sequence ?? 1,
    deliveryType,
    orderCount: Number.isFinite(raw.orderCount) ? Math.max(0, Number(raw.orderCount)) : 0,
    workerName: raw.workerName ?? '我',
    trackingMode,
    stage,
    status: raw.status ?? 'working',
    note: raw.note ?? '',
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
    completedAt: raw.completedAt,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map((session) => ({ ...session, source: session.source ?? trackingMode })) : [],
    stageTimeline: Array.isArray(raw.stageTimeline) ? raw.stageTimeline : [{ stage, enteredAt: createdAt }],
  }
}

export const usePackPilotStore = create<PackPilotState>()(
  persist(
    (set, get) => ({
      schemaVersion: 3,
      works: [],
      interruptions: [],
      channelCounters: initialCounters,

      addWork: (input) => {
        const state = get()
        const timestamp = safeTime(input.startedAt)
        const sequence = (state.channelCounters[input.channelId] ?? 0) + 1
        const baseName = channelNames[input.channelId]
        const stage: WorkStage = input.channelId === 'inventory-system' ? 'system-use' : 'picking'
        const deliveryType = input.channelId === 'inventory-system' ? 'internal' : input.deliveryType
        const work: WorkItem = {
          id: id(),
          channelId: input.channelId,
          displayName: sequence === 1 ? baseName : `${baseName}（${sequence}）`,
          sequence,
          deliveryType,
          orderCount: input.channelId === 'inventory-system' ? 0 : Math.max(0, Math.floor(input.orderCount)),
          workerName: input.workerName.trim() || '未指定',
          trackingMode: input.trackingMode,
          stage,
          status: 'working',
          note: input.note.trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
          sessions: [startSession(stage, input.trackingMode, timestamp)],
          stageTimeline: [{ stage, enteredAt: timestamp }],
        }
        const existing = input.trackingMode === 'automatic' && work.workerName === '我' ? pauseAutomaticPersonalWork(state.works) : state.works
        set({ works: [work, ...existing], channelCounters: { ...state.channelCounters, [input.channelId]: sequence } })
      },

      advanceWork: (workId, happenedAt) => {
        const timestamp = safeTime(happenedAt)
        set((state) => ({
          works: state.works.map((work) => {
            if (work.id !== workId || work.status !== 'working') return work
            const nextStage = nextWorkStage(work)
            if (!nextStage) return work
            const closed = closeOpenSession(work, timestamp)
            if (nextStage === 'completed') return { ...closed, stage: 'completed', status: 'completed', completedAt: timestamp, updatedAt: timestamp, stageTimeline: [...closed.stageTimeline, { stage: 'completed', enteredAt: timestamp }] }
            const waiting = nextStage === 'ready-to-ship' || nextStage === 'ready-for-hallway'
            return {
              ...closed,
              stage: nextStage,
              status: waiting ? 'waiting' : 'working',
              updatedAt: timestamp,
              sessions: waiting ? closed.sessions : [...closed.sessions, startSession(nextStage, work.trackingMode, timestamp)],
              stageTimeline: [...closed.stageTimeline, { stage: nextStage, enteredAt: timestamp }],
            }
          }),
        }))
      },

      interruptWork: (workId, reason, note) => {
        const work = get().works.find((item) => item.id === workId)
        if (!work || work.status !== 'working') return
        const timestamp = now()
        const record: InterruptionRecord = { id: id(), workId, workName: work.displayName, reason, note: note.trim(), pausedStage: work.stage, createdAt: timestamp }
        set((state) => ({
          works: state.works.map((item) => item.id === workId ? { ...closeOpenSession(item, timestamp), status: 'paused', updatedAt: timestamp } : item),
          interruptions: [record, ...state.interruptions],
        }))
      },

      resumeWork: (workId) => {
        const timestamp = now()
        set((state) => ({
          works: pauseAutomaticPersonalWork(state.works, workId).map((work) => work.id === workId ? { ...work, status: 'working', updatedAt: timestamp, sessions: [...work.sessions, startSession(work.stage, work.trackingMode, timestamp)] } : work),
          interruptions: state.interruptions.map((record) => record.workId === workId && !record.resumedAt ? { ...record, resumedAt: timestamp } : record),
        }))
      },

      startFulfillment: (workId, happenedAt) => {
        const timestamp = safeTime(happenedAt)
        set((state) => ({
          works: state.works.map((work) => {
            if (work.id !== workId || work.status !== 'waiting') return work
            const stage: WorkStage = work.stage === 'ready-to-ship' ? 'shipping' : 'moving-hallway'
            return { ...work, stage, status: 'working', updatedAt: timestamp, sessions: [...work.sessions, startSession(stage, work.trackingMode, timestamp)], stageTimeline: [...work.stageTimeline, { stage, enteredAt: timestamp }] }
          }),
        }))
      },

      completeWork: (workId, happenedAt) => {
        const timestamp = safeTime(happenedAt)
        set((state) => ({
          works: state.works.map((work) => {
            if (work.id !== workId || work.status === 'completed') return work
            const closed = closeOpenSession(work, timestamp)
            return { ...closed, stage: 'completed', status: 'completed', completedAt: timestamp, updatedAt: timestamp, stageTimeline: [...closed.stageTimeline, { stage: 'completed', enteredAt: timestamp }] }
          }),
        }))
      },

      updateOrderCount: (workId, orderCount) => set((state) => ({ works: state.works.map((work) => work.id === workId ? { ...work, orderCount: Math.max(0, Math.floor(orderCount)), updatedAt: now() } : work) })),
      resetAll: () => set({ works: [], interruptions: [], channelCounters: initialCounters }),
    }),
    {
      name: 'packpilot-data',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const old = persisted as Partial<PackPilotState>
        return {
          schemaVersion: 3,
          works: Array.isArray(old.works) ? old.works.map(normalizeWork) : [],
          interruptions: Array.isArray(old.interruptions) ? old.interruptions : [],
          channelCounters: { ...initialCounters, ...(old.channelCounters ?? {}) },
        }
      },
      partialize: (state) => ({ schemaVersion: state.schemaVersion, works: state.works, interruptions: state.interruptions, channelCounters: state.channelCounters }),
    },
  ),
)
