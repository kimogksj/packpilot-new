export type ChannelId = 'shopee' | 'preorder' | 'myship' | 'boss-note' | 'ojisan' | 'ichibansan' | 'other'
export type DeliveryType = 'convenience-store' | 'home-delivery'
export type TrackingMode = 'automatic' | 'manual'
export type WorkStage = 'picking' | 'sorting' | 'packing' | 'waiting-logistics' | 'moving-hallway'
export type StageStatus = 'not-started' | 'working' | 'paused' | 'completed' | 'waiting'
export type WorkStatus = 'active' | 'waiting' | 'suspended' | 'completed' | 'cancelled'
export type EventType = 'inbound' | 'inventory-system'

export interface TimeSession { id: string; startedAt: string; endedAt?: string; source: TrackingMode }
export interface StageRecord { stage: WorkStage; status: StageStatus; leadWorker: string; helpers: string[]; trackingMode: TrackingMode; sessions: TimeSession[]; completedAt?: string }
export interface SuspensionRecord { id: string; startedAt: string; resumedAt?: string; fromWorkday: string; toWorkday?: string }
export interface WorkItem {
  id: string; jobCode: string; channelId: ChannelId; displayName: string; sequence: number; deliveryType: DeliveryType
  orderCount: number; note: string; createdAt: string; updatedAt: string; completedAt?: string; cancelledAt?: string
  shipmentId?: string; status: WorkStatus; originWorkday: string; currentWorkday: string; stages: StageRecord[]; suspensions: SuspensionRecord[]
}
export interface ActivityEvent { id: string; type: EventType; worker: string; startedAt: string; endedAt?: string; note: string }
export interface ShipmentBatch { id: string; code: string; workIds: string[]; worker: string; helpers: string[]; startedAt: string; endedAt?: string; note: string }
export interface WorkdayRecord { date: string; closedAt?: string; reopenedAt?: string }
export interface AuditRecord { id: string; entityType: 'work'|'event'|'shipment'|'workday'; entityId: string; happenedAt: string; action: string; detail: string }
export interface AddWorkInput { channelId: ChannelId; deliveryType: DeliveryType; orderCount: number; leadWorker: string; helpers: string[]; note: string }
export interface StageTimeInput { startedAt: string; endedAt: string; markCompleted: boolean }
