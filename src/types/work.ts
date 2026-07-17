export type ChannelId = 'shopee' | 'preorder' | 'myship' | 'boss-note' | 'ojisan' | 'ichibansan' | 'inventory-system' | 'other'
export type DeliveryType = 'convenience-store' | 'home-delivery' | 'internal'
export type TrackingMode = 'automatic' | 'manual'
export type WorkStage = 'picking' | 'sorting' | 'packing' | 'waiting-logistics' | 'shipping' | 'moving-hallway' | 'system-use'
export type StageStatus = 'not-started' | 'working' | 'paused' | 'completed' | 'skipped' | 'waiting'
export type WorkStatus = 'active' | 'waiting' | 'suspended' | 'completed' | 'cancelled'

export interface TimeSession { id: string; startedAt: string; endedAt?: string; source: TrackingMode }
export interface StageRecord {
  stage: WorkStage
  status: StageStatus
  leadWorker: string
  helpers: string[]
  trackingMode: TrackingMode
  sessions: TimeSession[]
  completedAt?: string
}
export interface SuspensionRecord { id: string; startedAt: string; resumedAt?: string; fromWorkday: string; toWorkday?: string }
export interface WorkItem {
  id: string
  jobCode?: string
  channelId: ChannelId
  displayName: string
  sequence: number
  deliveryType: DeliveryType
  orderCount: number
  note: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  cancelledAt?: string
  status: WorkStatus
  originWorkday: string
  currentWorkday: string
  stages: StageRecord[]
  suspensions: SuspensionRecord[]
}
export interface InboundSession {
  id: string
  startedAt: string
  endedAt?: string
  worker: string
}
export interface WorkdayRecord { date: string; closedAt?: string; reopenedAt?: string }
export interface AuditRecord { id: string; workId: string; happenedAt: string; action: string; detail: string }
export interface AddWorkInput { channelId: ChannelId; deliveryType: DeliveryType; orderCount: number; leadWorker: string; helpers: string[]; note: string }
export interface StageTimeInput { startedAt: string; endedAt: string; leadWorker: string; helpers: string[]; markCompleted: boolean }
