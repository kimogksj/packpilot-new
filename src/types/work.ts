export type ChannelId = 'shopee' | 'preorder' | 'myship' | 'boss-note' | 'other'
export type DeliveryType = 'convenience-store' | 'home-delivery'
export type WorkStage = 'picking' | 'sorting' | 'packing' | 'ready-to-ship' | 'ready-for-hallway' | 'completed'
export type WorkStatus = 'working' | 'paused' | 'waiting' | 'completed'
export type InterruptionReason = 'arrival' | 'manager-request' | 'other-department' | 'other'

export interface WorkItem {
  id: string
  channelId: ChannelId
  displayName: string
  sequence: number
  deliveryType: DeliveryType
  stage: WorkStage
  status: WorkStatus
  note: string
  createdAt: string
  updatedAt: string
  completedAt?: string
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
