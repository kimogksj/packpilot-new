import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  ActivityEvent,
  AddWorkInput,
  AuditRecord,
  ChannelId,
  EventType,
  RestoreMode,
  ShipmentBatch,
  StageRecord,
  StageTimeInput,
  WorkCompletionSnapshot,
  WorkItem,
  WorkStage,
  WorkdayRecord,
} from '../types/work'

interface State {
  schemaVersion: 9
  works: WorkItem[]
  events: ActivityEvent[]
  shipments: ShipmentBatch[]
  workdays: WorkdayRecord[]
  audits: AuditRecord[]
  counters: Record<ChannelId, number>
  addWork(input: AddWorkInput): void
  updateWorkDetails(id: string, patch: Partial<Pick<WorkItem, 'orderCount' | 'channelId' | 'deliveryType' | 'note'>>): void
  updateStageWorkers(id: string, stage: WorkStage, lead: string, helpers: string[]): void
  startStage(id: string, stage: WorkStage, lead: string, helpers: string[]): void
  pauseStage(id: string, stage: WorkStage): void
  resumeStage(id: string, stage: WorkStage): void
  completeStage(id: string, stage: WorkStage): void
  updateStageTime(id: string, stage: WorkStage, input: StageTimeInput): void
  suspendWork(id: string): void
  resumeWork(id: string): void
  restoreWork(id: string, mode: RestoreMode): void
  cancelWork(id: string): void
  deleteWork(id: string): void
  startEvent(type: EventType, worker: string, note?: string): void
  completeEvent(id: string): void
  startShipment(workIds: string[], worker: string, helpers: string[], note?: string): void
  completeShipment(id: string): void
  undoShipment(id: string): void
  endWorkday(): void
  resetAll(): void
}

export const workers = ['韋', 'NIKI', '豪豪', '阿拉蕾', '小田', '其他']
export const channelNames: Record<ChannelId, string> = {
  shopee: '蝦皮',
  preorder: '預購',
  myship: '賣貨便',
  'boss-note': '老闆記事本',
  ojisan: '歐吉桑',
  ichibansan: '一番桑',
  other: '其他',
}

const initialCounters: Record<ChannelId, number> = {
  shopee: 0,
  preorder: 0,
  myship: 0,
  'boss-note': 0,
  ojisan: 0,
  ichibansan: 0,
  other: 0,
}

const uid = () => crypto.randomUUID()
const iso = () => new Date().toISOString()
export const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE')

const makeStage = (stage: WorkStage): StageRecord => ({
  stage,
  status: 'not-started',
  leadWorker: '',
  helpers: [],
  trackingMode: 'automatic',
  sessions: [],
})

const stagesFor = (delivery: WorkItem['deliveryType']) =>
  delivery === 'home-delivery'
    ? [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('waiting-logistics'), makeStage('moving-hallway')]
    : [makeStage('picking'), makeStage('sorting'), makeStage('packing'), makeStage('waiting-logistics')]

const close = (stage: StageRecord, at: string): StageRecord => ({
  ...stage,
  sessions: stage.sessions.map(session => (session.endedAt ? session : { ...session, endedAt: at })),
})

const cloneStages = (stages: StageRecord[]): StageRecord[] =>
  stages.map(stage => ({
    ...stage,
    helpers: [...stage.helpers],
    sessions: stage.sessions.map(session => ({ ...session })),
  }))

const snapshotFor = (work: WorkItem): WorkCompletionSnapshot => ({
  status: work.status,
  shipmentId: work.shipmentId,
  stages: cloneStages(work.stages),
})

const derive = (work: WorkItem): WorkItem => {
  if (work.cancelledAt) return { ...work, status: 'cancelled' }
  if (work.status === 'suspended') return work
  if (work.deliveryType === 'home-delivery' && work.stages.find(stage => stage.stage === 'moving-hallway')?.status === 'completed') {
    return { ...work, status: 'completed', completedAt: work.completedAt ?? work.updatedAt }
  }
  if (work.shipmentId) return { ...work, status: 'completed', completedAt: work.completedAt ?? work.updatedAt }
  if (work.stages.some(stage => stage.stage !== 'waiting-logistics' && (stage.status === 'working' || stage.status === 'paused'))) {
    return { ...work, status: 'active', completedAt: undefined }
  }
  if (work.stages.find(stage => stage.stage === 'waiting-logistics')?.status === 'waiting') {
    return { ...work, status: 'waiting', completedAt: undefined }
  }
  return { ...work, status: 'active', completedAt: undefined }
}

const audit = (
  entityType: AuditRecord['entityType'],
  entityId: string,
  action: string,
  detail: string,
): AuditRecord => ({ id: uid(), entityType, entityId, happenedAt: iso(), action, detail })

const jobCodeFor = (date: string, works: WorkItem[]) =>
  `PP-${date.replaceAll('-', '')}-${String(works.filter(work => work.originWorkday === date).length + 1).padStart(3, '0')}`

const fallbackSnapshot = (work: WorkItem): WorkCompletionSnapshot => {
  const stages = cloneStages(work.stages).map(stage => {
    if (work.deliveryType === 'home-delivery' && stage.stage === 'moving-hallway' && stage.status === 'completed') {
      return { ...stage, status: 'paused' as const, completedAt: undefined }
    }
    if (work.deliveryType === 'convenience-store' && stage.stage === 'waiting-logistics' && stage.status === 'completed') {
      return { ...stage, status: 'waiting' as const, completedAt: undefined }
    }
    return stage
  })
  return {
    status: work.deliveryType === 'convenience-store' ? 'waiting' : 'active',
    shipmentId: undefined,
    stages,
  }
}

const restoreStages = (snapshot: WorkCompletionSnapshot, completedAt: string, restoredAt: string) =>
  snapshot.stages.map(stage => {
    const sessions = stage.sessions.map(session => (session.endedAt ? session : { ...session, endedAt: completedAt }))
    if (stage.status === 'working' || stage.status === 'waiting') {
      sessions.push({ id: uid(), startedAt: restoredAt, source: 'automatic' })
    }
    return { ...stage, sessions }
  })

const migrateState = (raw: unknown) => {
  const old = (raw ?? {}) as Record<string, any>

  if ((old.schemaVersion ?? 0) >= 8) {
    return {
      ...old,
      schemaVersion: 9,
      works: (old.works ?? []).map((work: WorkItem) => ({ ...work, completionSnapshot: work.completionSnapshot })),
      events: old.events ?? [],
      shipments: old.shipments ?? [],
      workdays: old.workdays ?? [{ date: dayKey() }],
      audits: old.audits ?? [],
      counters: { ...initialCounters, ...(old.counters ?? {}) },
    }
  }

  const works = (old.works ?? [])
    .filter((work: any) => work.channelId !== 'inventory-system')
    .map((work: any, index: number) => ({
      ...work,
      jobCode: work.jobCode ?? `PP-${(work.originWorkday ?? dayKey()).replaceAll('-', '')}-${String(index + 1).padStart(3, '0')}`,
      deliveryType: work.deliveryType === 'internal' ? 'convenience-store' : work.deliveryType,
      shipmentId: undefined,
      completionSnapshot: undefined,
      stages: (work.stages ?? [])
        .filter((stage: any) => stage.stage !== 'shipping' && stage.stage !== 'system-use')
        .map((stage: any) => ({ ...stage, trackingMode: stage.trackingMode ?? 'automatic' })),
    }))
  const events = (old.inboundSessions ?? []).map((event: any) => ({
    id: event.id,
    type: 'inbound',
    worker: event.worker ?? '韋',
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    note: '',
  }))

  return {
    schemaVersion: 9,
    works,
    events,
    shipments: [],
    workdays: old.workdays ?? [{ date: dayKey() }],
    audits: [],
    counters: { ...initialCounters, ...(old.counters ?? {}) },
  }
}

export const usePackPilotStore = create<State>()(
  persist(
    (set, get) => ({
      schemaVersion: 9,
      works: [],
      events: [],
      shipments: [],
      workdays: [{ date: dayKey() }],
      audits: [],
      counters: initialCounters,

      addWork: input => {
        const state = get()
        const at = iso()
        const date = dayKey()
        const sequence = (state.counters[input.channelId] ?? 0) + 1
        const stages = stagesFor(input.deliveryType)
        const first = stages[0]
        first.status = 'working'
        first.leadWorker = input.leadWorker
        first.helpers = input.helpers.filter(worker => worker !== input.leadWorker)
        first.sessions = [{ id: uid(), startedAt: at, source: 'automatic' }]
        const base = channelNames[input.channelId]
        const work: WorkItem = {
          id: uid(),
          jobCode: jobCodeFor(date, state.works),
          channelId: input.channelId,
          displayName: sequence === 1 ? base : `${base}（${sequence}）`,
          sequence,
          deliveryType: input.deliveryType,
          orderCount: Math.max(0, Math.floor(input.orderCount)),
          note: input.note.trim(),
          createdAt: at,
          updatedAt: at,
          status: 'active',
          originWorkday: date,
          currentWorkday: date,
          stages,
          suspensions: [],
        }
        set({
          works: [work, ...state.works],
          counters: { ...state.counters, [input.channelId]: sequence },
          audits: [audit('work', work.id, '建立工作', `${work.displayName}，${work.orderCount} 單，${input.leadWorker} 自動開始`), ...state.audits],
        })
      },

      updateWorkDetails: (id, patch) =>
        set(state => {
          const old = state.works.find(work => work.id === id)
          if (!old) return state
          const normalized = { ...patch }
          if (patch.orderCount !== undefined) normalized.orderCount = Math.max(0, Math.floor(patch.orderCount))
          const next: WorkItem = {
            ...old,
            ...normalized,
            updatedAt: iso(),
            displayName: patch.channelId ? channelNames[patch.channelId] : old.displayName,
          }
          const changes = Object.entries(normalized)
            .map(([key, value]) => `${key}: ${String((old as unknown as Record<string, unknown>)[key])} → ${String(value)}`)
            .join('；')
          return {
            works: state.works.map(work => (work.id === id ? derive(next) : work)),
            audits: [audit('work', id, '修改工作資料', changes), ...state.audits],
          }
        }),

      updateStageWorkers: (id, stage, lead, helpers) =>
        set(state => ({
          works: state.works.map(work =>
            work.id !== id
              ? work
              : {
                  ...work,
                  updatedAt: iso(),
                  stages: work.stages.map(record =>
                    record.stage !== stage
                      ? record
                      : { ...record, leadWorker: lead, helpers: helpers.filter(helper => helper !== lead) },
                  ),
                },
          ),
          audits: [audit('work', id, '修改執行人員', `${stage}：主要 ${lead}，協助 ${helpers.join('、') || '無'}`), ...state.audits],
        })),

      startStage: (id, stage, lead, helpers) =>
        set(state => ({
          works: state.works.map(work => {
            if (work.id !== id || work.status === 'completed') return work
            const at = iso()
            let stages = work.stages.map(record =>
              record.stage === stage
                ? {
                    ...record,
                    status: 'working' as const,
                    leadWorker: lead,
                    helpers: helpers.filter(helper => helper !== lead),
                    trackingMode: 'automatic' as const,
                    sessions: [...record.sessions, { id: uid(), startedAt: at, source: 'automatic' as const }],
                  }
                : record,
            )
            if (stage === 'moving-hallway') {
              stages = stages.map(record =>
                record.stage === 'waiting-logistics' && record.status === 'waiting'
                  ? { ...close(record, at), status: 'completed' as const, completedAt: at }
                  : record,
              )
            }
            return derive({
              ...work,
              updatedAt: at,
              currentWorkday: dayKey(),
              stages,
            })
          }),
          audits: [audit('work', id, '開始階段', `${stage}，${lead}`), ...state.audits],
        })),

      pauseStage: (id, stage) =>
        set(state => {
          const at = iso()
          return {
            works: state.works.map(work =>
              work.id !== id
                ? work
                : derive({
                    ...work,
                    updatedAt: at,
                    stages: work.stages.map(record =>
                      record.stage === stage ? { ...close(record, at), status: 'paused' } : record,
                    ),
                  }),
            ),
            audits: [audit('work', id, '暫停階段', stage), ...state.audits],
          }
        }),

      resumeStage: (id, stage) => {
        const record = get().works.find(work => work.id === id)?.stages.find(item => item.stage === stage)
        if (record) get().startStage(id, stage, record.leadWorker || '韋', record.helpers)
      },

      completeStage: (id, stage) =>
        set(state => {
          const at = iso()
          return {
            works: state.works.map(work => {
              if (work.id !== id || work.status === 'completed') return work
              const willCompleteWork = stage === 'moving-hallway' && work.deliveryType === 'home-delivery'
              const completionSnapshot = willCompleteWork ? snapshotFor(work) : work.completionSnapshot
              let stages = work.stages.map(record =>
                record.stage === stage ? { ...close(record, at), status: 'completed' as const, completedAt: at } : record,
              )
              if (stage === 'packing') {
                stages = stages.map(record =>
                  record.stage === 'waiting-logistics'
                    ? { ...record, status: 'waiting' as const, sessions: [{ id: uid(), startedAt: at, source: 'automatic' as const }] }
                    : record,
                )
              }
              return derive({
                ...work,
                updatedAt: at,
                completedAt: willCompleteWork ? at : work.completedAt,
                completionSnapshot,
                stages,
              })
            }),
            audits: [audit('work', id, '完成階段', stage), ...state.audits],
          }
        }),

      updateStageTime: (id, stage, input) =>
        set(state => ({
          works: state.works.map(work => {
            if (work.id !== id) return work
            const started = new Date(input.startedAt)
            const ended = new Date(input.endedAt)
            if (!Number.isFinite(started.getTime()) || !Number.isFinite(ended.getTime()) || ended <= started) return work
            const endedAt = ended.toISOString()
            const willCompleteWork = stage === 'moving-hallway' && input.markCompleted && work.deliveryType === 'home-delivery'
            const completionSnapshot = willCompleteWork ? snapshotFor(work) : work.completionSnapshot
            let stages = work.stages.map(record =>
              record.stage !== stage
                ? record
                : {
                    ...record,
                    trackingMode: 'manual' as const,
                    sessions: [{ id: uid(), startedAt: started.toISOString(), endedAt, source: 'manual' as const }],
                    status: input.markCompleted ? ('completed' as const) : ('paused' as const),
                    completedAt: input.markCompleted ? endedAt : undefined,
                  },
            )
            if (stage === 'packing' && input.markCompleted) {
              stages = stages.map(record =>
                record.stage === 'waiting-logistics'
                  ? { ...record, status: 'waiting' as const, sessions: [{ id: uid(), startedAt: endedAt, source: 'automatic' as const }] }
                  : record,
              )
            }
            return derive({
              ...work,
              updatedAt: iso(),
              completedAt: willCompleteWork ? endedAt : work.completedAt,
              completionSnapshot,
              stages,
            })
          }),
          audits: [audit('work', id, '調整工作時間', `${stage}：${input.startedAt} ～ ${input.endedAt}`), ...state.audits],
        })),

      suspendWork: id =>
        set(state => {
          const at = iso()
          return {
            works: state.works.map(work =>
              work.id !== id || ['completed', 'cancelled', 'suspended'].includes(work.status)
                ? work
                : {
                    ...work,
                    status: 'suspended' as const,
                    updatedAt: at,
                    stages: work.stages.map(record =>
                      record.status === 'working' ? { ...close(record, at), status: 'paused' as const } : record,
                    ),
                    suspensions: [...work.suspensions, { id: uid(), startedAt: at, fromWorkday: dayKey() }],
                  },
            ),
            audits: [audit('work', id, '擱置工作', '轉為跨日待續'), ...state.audits],
          }
        }),

      resumeWork: id =>
        set(state => {
          const at = iso()
          return {
            works: state.works.map(work =>
              work.id !== id || work.status !== 'suspended'
                ? work
                : derive({
                    ...work,
                    status: 'active',
                    updatedAt: at,
                    currentWorkday: dayKey(),
                    suspensions: work.suspensions.map((record, index) =>
                      index === work.suspensions.length - 1 && !record.resumedAt
                        ? { ...record, resumedAt: at, toWorkday: dayKey() }
                        : record,
                    ),
                  }),
            ),
            audits: [audit('work', id, '接續工作', dayKey()), ...state.audits],
          }
        }),

      restoreWork: (id, mode) =>
        set(state => {
          const work = state.works.find(item => item.id === id)
          if (!work || work.status !== 'completed' || !work.completedAt) return state
          if (mode === 'undo' && Date.now() - Date.parse(work.completedAt) > 30_000) return state

          const restoredAt = iso()
          const snapshot = work.completionSnapshot ?? fallbackSnapshot(work)
          const restoredStages = restoreStages(snapshot, work.completedAt, restoredAt)
          const restored: WorkItem = derive({
            ...work,
            status: snapshot.status,
            shipmentId: snapshot.shipmentId,
            completedAt: undefined,
            updatedAt: restoredAt,
            currentWorkday: dayKey(),
            stages: restoredStages,
            completionSnapshot: undefined,
          })
          const sourceShipmentId = work.shipmentId
          const action = mode === 'undo' ? '撤銷完成' : '恢復工作'
          return {
            works: state.works.map(item => (item.id === id ? restored : item)),
            shipments: sourceShipmentId
              ? state.shipments.map(batch =>
                  batch.id === sourceShipmentId ? { ...batch, workIds: batch.workIds.filter(workId => workId !== id) } : batch,
                )
              : state.shipments,
            audits: [
              audit('work', id, action, `${work.displayName} 已回到${restored.status === 'waiting' ? '等待物流' : '進行中'}`),
              ...(sourceShipmentId
                ? [audit('shipment', sourceShipmentId, '移出已恢復工作', `${work.displayName} 已從寄貨批次移除`)]
                : []),
              ...state.audits,
            ],
          }
        }),

      cancelWork: id =>
        set(state => ({
          works: state.works.map(work => (work.id === id ? { ...work, cancelledAt: iso(), status: 'cancelled' } : work)),
          audits: [audit('work', id, '取消工作', '標記取消'), ...state.audits],
        })),

      deleteWork: id =>
        set(state => ({
          works: state.works.filter(work => work.id !== id),
          shipments: state.shipments.map(batch => ({ ...batch, workIds: batch.workIds.filter(workId => workId !== id) })),
          audits: state.audits.filter(record => record.entityId !== id),
        })),

      startEvent: (type, worker, note = '') => {
        const state = get()
        if (state.events.some(event => event.type === type && !event.endedAt)) return
        const event: ActivityEvent = { id: uid(), type, worker, startedAt: iso(), note }
        set({
          events: [event, ...state.events],
          audits: [audit('event', event.id, '開始事件', `${type}，${worker}`), ...state.audits],
        })
      },

      completeEvent: id =>
        set(state => ({
          events: state.events.map(event => (event.id === id && !event.endedAt ? { ...event, endedAt: iso() } : event)),
          audits: [audit('event', id, '完成事件', '計時結束'), ...state.audits],
        })),

      startShipment: (workIds, worker, helpers, note = '') => {
        const state = get()
        if (state.shipments.some(batch => !batch.endedAt)) return
        const eligible = workIds.filter(id =>
          state.works.some(work => work.id === id && work.status === 'waiting' && work.deliveryType === 'convenience-store'),
        )
        if (!eligible.length) return
        const batch: ShipmentBatch = {
          id: uid(),
          code: `SHIP-${dayKey().replaceAll('-', '')}-${String(state.shipments.length + 1).padStart(3, '0')}`,
          workIds: eligible,
          worker,
          helpers: helpers.filter(helper => helper !== worker),
          startedAt: iso(),
          note,
        }
        set({
          shipments: [batch, ...state.shipments],
          audits: [audit('shipment', batch.id, '開始寄貨批次', `${eligible.length} 筆工作，${worker}`), ...state.audits],
        })
      },

      completeShipment: id =>
        set(state => {
          const batch = state.shipments.find(item => item.id === id)
          if (!batch || batch.endedAt) return state
          const at = iso()
          return {
            shipments: state.shipments.map(item => (item.id === id ? { ...item, endedAt: at } : item)),
            works: state.works.map(work => {
              if (!batch.workIds.includes(work.id) || work.status !== 'waiting') return work
              return {
                ...work,
                completionSnapshot: snapshotFor(work),
                shipmentId: id,
                status: 'completed',
                completedAt: at,
                updatedAt: at,
                stages: work.stages.map(record =>
                  record.stage === 'waiting-logistics'
                    ? { ...close(record, at), status: 'completed' as const, completedAt: at }
                    : record,
                ),
              }
            }),
            audits: [audit('shipment', id, '完成寄貨批次', `${batch.workIds.length} 筆工作完成`), ...state.audits],
          }
        }),

      undoShipment: id =>
        set(state => {
          const batch = state.shipments.find(item => item.id === id)
          if (!batch?.endedAt || Date.now() - Date.parse(batch.endedAt) > 30_000) return state
          const restoredAt = iso()
          const restoredWorks = new Set(
            state.works
              .filter(work => work.shipmentId === id && work.status === 'completed')
              .map(work => work.id),
          )
          if (!restoredWorks.size) return state
          return {
            shipments: state.shipments.map(item => (item.id === id ? { ...item, endedAt: undefined } : item)),
            works: state.works.map(work => {
              if (!restoredWorks.has(work.id) || !work.completedAt) return work
              const snapshot = work.completionSnapshot ?? fallbackSnapshot(work)
              return derive({
                ...work,
                status: snapshot.status,
                shipmentId: snapshot.shipmentId,
                completedAt: undefined,
                updatedAt: restoredAt,
                currentWorkday: dayKey(),
                stages: restoreStages(snapshot, work.completedAt, restoredAt),
                completionSnapshot: undefined,
              })
            }),
            audits: [
              audit('shipment', id, '撤銷寄貨完成', `${restoredWorks.size} 筆工作已回到等待物流，寄貨計時繼續`),
              ...state.audits,
            ],
          }
        }),

      endWorkday: () => {
        const state = get()
        const at = iso()
        const date = dayKey()
        set({
          events: state.events.map(event => (!event.endedAt ? { ...event, endedAt: at } : event)),
          shipments: state.shipments.map(batch => (!batch.endedAt ? { ...batch, endedAt: at } : batch)),
          works: state.works.map(work =>
            work.currentWorkday !== date || ['completed', 'cancelled', 'suspended'].includes(work.status)
              ? work
              : {
                  ...work,
                  status: 'suspended',
                  updatedAt: at,
                  stages: work.stages.map(record =>
                    record.status === 'working' ? { ...close(record, at), status: 'paused' as const } : record,
                  ),
                  suspensions: [...work.suspensions, { id: uid(), startedAt: at, fromWorkday: date }],
                },
          ),
          workdays: state.workdays.some(record => record.date === date)
            ? state.workdays.map(record => (record.date === date ? { ...record, closedAt: at } : record))
            : [{ date, closedAt: at }, ...state.workdays],
          audits: [audit('workday', date, '結束工作日', date), ...state.audits],
        })
      },

      resetAll: () =>
        set({
          works: [],
          events: [],
          shipments: [],
          workdays: [{ date: dayKey() }],
          audits: [],
          counters: initialCounters,
        }),
    }),
    {
      name: 'packpilot-data-v6-alpha-r1',
      version: 9,
      storage: createJSONStorage(() => localStorage),
      migrate: migrateState,
      partialize: state => ({
        schemaVersion: state.schemaVersion,
        works: state.works,
        events: state.events,
        shipments: state.shipments,
        workdays: state.workdays,
        audits: state.audits,
        counters: state.counters,
      }),
    },
  ),
)
