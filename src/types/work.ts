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
  | 'completed'
export type WorkStatus = 'working' | 'paused' | 'waiting' | 'completed'
export type InterruptionReason =
  | 'arrival'
  | 'inventory-occupied'
  | 'waiting-colleague'
  | 'support-other-work'
  | 'manager-request'
  | 'other-department'
  | 'break'
  | 'other'

export interface WorkSession {
  id: string
  stage: WorkStage
  startedAt: string
  endedAt?: string
  source: TrackingMode
}

export interface StageTimestamp {
  stage: WorkStage
  enteredAt: string
}

export interface WorkItem {
  id: string
  channelId: ChannelId
  displayName: string
  sequence: number
  deliveryType: DeliveryType
  orderCount: number
  workerName: string
  trackingMode: TrackingMode
  stage: WorkStage
  status: WorkStatus
  note: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  sessions: WorkSession[]
  stageTimeline: StageTimestamp[]
}

export interface InterruptionRecord {
  id: string
  workId: string
  workName: string
  reason: InterruptionReason
  note: string
  pausedStage: WorkStage
  createdAt: string
  resumedAt?: string
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
