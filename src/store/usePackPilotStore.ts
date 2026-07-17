import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChannelId, DeliveryType, InterruptionReason, InterruptionRecord, WorkItem } from '../types/work'

interface PackPilotState {
  schemaVersion: 1
  works: WorkItem[]
  interruptions: InterruptionRecord[]
  channelCounters: Record<ChannelId, number>
  addWork: (channelId: ChannelId, deliveryType: DeliveryType, note: string) => void
  advanceWork: (workId: string) => void
  interruptWork: (workId: string, reason: InterruptionReason, note: string) => void
  resumeWork: (workId: string) => void
  completeShipment: (workId: string) => void
  confirmHallwayMove: (workId: string) => void
  resetAll: () => void
}

const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮',
  preorder: '預購',
  myship: '賣貨便',
  'boss-note': '老闆記事本',
  other: '其他',
}

const initialCounters: Record<ChannelId, number> = {
  shopee: 0,
  preorder: 0,
  myship: 0,
  'boss-note': 0,
  other: 0,
}

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

const pauseWorking = (works: WorkItem[], exceptId?: string): WorkItem[] =>
  works.map((work) =>
    work.status === 'working' && work.id !== exceptId
      ? { ...work, status: 'paused', updatedAt: now() }
      : work,
  )

const nextStage = (work: WorkItem): Pick<WorkItem, 'stage' | 'status'> => {
  if (work.stage === 'picking') return { stage: 'sorting', status: 'working' }
  if (work.stage === 'sorting') return { stage: 'packing', status: 'working' }
  if (work.stage === 'packing') {
    return work.deliveryType === 'convenience-store'
      ? { stage: 'ready-to-ship', status: 'waiting' }
      : { stage: 'ready-for-hallway', status: 'waiting' }
  }
  return { stage: work.stage, status: work.status }
}

export const usePackPilotStore = create<PackPilotState>()(
  persist(
    (set, get) => ({
      schemaVersion: 1,
      works: [],
      interruptions: [],
      channelCounters: initialCounters,

      addWork: (channelId, deliveryType, note) => {
        const state = get()
        const sequence = state.channelCounters[channelId] + 1
        const baseName = channelNames[channelId]
        const work: WorkItem = {
          id: id(),
          channelId,
          displayName: sequence === 1 ? baseName : `${baseName}（${sequence}）`,
          sequence,
          deliveryType,
          stage: 'picking',
          status: 'working',
          note: note.trim(),
          createdAt: now(),
          updatedAt: now(),
        }
        set({
          works: [work, ...pauseWorking(state.works)],
          channelCounters: { ...state.channelCounters, [channelId]: sequence },
        })
      },

      advanceWork: (workId) => {
        set((state) => ({
          works: state.works.map((work) => {
            if (work.id !== workId || work.status !== 'working') return work
            const next = nextStage(work)
            return { ...work, ...next, updatedAt: now() }
          }),
        }))
      },

      interruptWork: (workId, reason, note) => {
        const work = get().works.find((item) => item.id === workId)
        if (!work || work.status !== 'working') return
        const record: InterruptionRecord = {
          id: id(),
          workId,
          workName: work.displayName,
          reason,
          note: note.trim(),
          pausedStage: work.stage,
          createdAt: now(),
        }
        set((state) => ({
          works: state.works.map((item) =>
            item.id === workId ? { ...item, status: 'paused', updatedAt: now() } : item,
          ),
          interruptions: [record, ...state.interruptions].slice(0, 50),
        }))
      },

      resumeWork: (workId) => {
        set((state) => ({
          works: pauseWorking(state.works, workId).map((work) =>
            work.id === workId ? { ...work, status: 'working', updatedAt: now() } : work,
          ),
          interruptions: state.interruptions.map((record) =>
            record.workId === workId && !record.resumedAt ? { ...record, resumedAt: now() } : record,
          ),
        }))
      },

      completeShipment: (workId) => {
        set((state) => ({
          works: state.works.map((work) =>
            work.id === workId && work.stage === 'ready-to-ship'
              ? { ...work, stage: 'completed', status: 'completed', completedAt: now(), updatedAt: now() }
              : work,
          ),
        }))
      },

      confirmHallwayMove: (workId) => {
        set((state) => ({
          works: state.works.map((work) =>
            work.id === workId && work.stage === 'ready-for-hallway'
              ? { ...work, stage: 'completed', status: 'completed', completedAt: now(), updatedAt: now() }
              : work,
          ),
        }))
      },

      resetAll: () => set({ works: [], interruptions: [], channelCounters: initialCounters }),
    }),
    {
      name: 'packpilot-data',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        schemaVersion: state.schemaVersion,
        works: state.works,
        interruptions: state.interruptions,
        channelCounters: state.channelCounters,
      }),
    },
  ),
)
