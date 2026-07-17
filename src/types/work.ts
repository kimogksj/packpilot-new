export type ChannelId =
  | 'shopee'
  | 'preorder'
  | 'myship'
  | 'boss-note'
  | 'ojisan'
  | 'ichibansan'
  | 'inventory-system'
  | 'other'

export type DeliveryType = 'convenience-store' | 'home-delivery' | 'internal'
export type TrackingMode = 'automatic' | 'manual'
export type WorkStage =
  | 'picking'
  | 'sorting'
  | 'packing'
  | 'ready-to-ship'
  | 'shipping'
  | 'ready-for-hallway'
  | 'moving-hallway'
  | 'system-use'

export type StageStatus = 'not-started' | 'working' | 'paused' | 'completed' | 'skipped'
export type WorkStatus = 'active' | 'waiting' | 'completed' | 'cancelled'
export type InterruptionReason =
  | 'arrival'
  | 'inventory-occupied'
  | 'waiting-colleague'
  | 'support-other-work'
  | 'manager-request'
  | 'other-department'
  | 'break'
  | 'other'

export interface TimeSession {
  id: string
  startedAt: string
  endedAt?: string
  source: TrackingMode
}

export interface StageRecord {
  stage: WorkStage
  status: StageStatus
  workerName: string
  trackingMode: TrackingMode
  sessions: TimeSession[]
  completedAt?: string
  note?: string
}

export interface WorkItem {
  id: string
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
  stages: StageRecord[]
}

export interface InterruptionRecord {
  id: string
  workId: string
  workName: string
  stage: WorkStage
  reason: InterruptionReason
  note: string
  createdAt: string
  resumedAt?: string
}

export interface AuditRecord {
  id: string
  workId: string
  happenedAt: string
  action: string
  detail: string
}

export interface AddWorkInput {
  channelId: ChannelId
  deliveryType: DeliveryType
  orderCount: number
  workerName: string
  trackingMode: TrackingMode
  note: string
  startedAt?: string
}

export interface UpdateWorkInput {
  channelId: ChannelId
  deliveryType: DeliveryType
  orderCount: number
  note: string
}
