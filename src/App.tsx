import { useEffect, useMemo, useState } from 'react'
import {
  ArchiveRestore, Check, ChevronDown, Copy, Edit3, MoreVertical,
  Pause, Play, Plus, RotateCcw, SkipForward, TimerReset, Trash2, Users, X,
} from 'lucide-react'
import { channelNames, usePackPilotStore } from './store/usePackPilotStore'
import type { ChannelId, DeliveryType, InterruptionReason, StageRecord, TrackingMode, WorkItem, WorkStage } from './types/work'
import './styles.css'

const channels: { id: ChannelId; label: string }[] = Object.entries(channelNames).map(([id, label]) => ({ id: id as ChannelId, label }))
const stageLabels: Record<WorkStage, string> = {
  picking: '撿貨', sorting: '分貨', packing: '包貨', 'ready-to-ship': '等待寄貨', shipping: '寄貨',
  'ready-for-hallway': '等待搬到走廊', 'moving-hallway': '搬到走廊', 'system-use': '使用庫存系統',
}
const interruptionLabels: Record<InterruptionReason, string> = {
  arrival: '到貨', 'inventory-occupied': '庫存系統被占用', 'waiting-colleague': '等待同事完成',
  'support-other-work': '支援其他工作', 'manager-request': '主管交辦', 'other-department': '其他部門拿貨',
  break: '休息', other: '其他',
}
const coreStages = new Set<WorkStage>(['picking', 'sorting', 'packing', 'system-use'])

const toLocalInput = (iso?: string) => {
  const date = iso ? new Date(iso) : new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}
const formatDuration = (ms: number) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} 小時 ${minutes} 分` : `${minutes} 分`
}
const stageMs = (stage: StageRecord, nowMs: number) => stage.sessions.reduce((sum, session) => {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : nowMs
  return sum + Math.max(0, end - new Date(session.startedAt).getTime())
}, 0)
const workOperationMs = (work: WorkItem, nowMs: number) => work.stages.filter((s) => coreStages.has(s.stage)).reduce((sum, stage) => sum + stageMs(stage, nowMs), 0)
const workSpanMs = (work: WorkItem, nowMs: number) => {
  const starts = work.stages.flatMap((s) => s.sessions.map((x) => new Date(x.startedAt).getTime()))
  if (!starts.length) return 0
  const ends = work.stages.flatMap((s) => s.sessions.map((x) => x.endedAt ? new Date(x.endedAt).getTime() : nowMs))
  return Math.max(...ends) - Math.min(...starts)
}

function useClock() {
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  return nowMs
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}><X size={20} /></button></div>{children}</div></div>
}

function StageRow({ work, stage, nowMs }: { work: WorkItem; stage: StageRecord; nowMs: number }) {
  const startStage = usePackPilotStore((s) => s.startStage)
  const completeStage = usePackPilotStore((s) => s.completeStage)
  const pauseStage = usePackPilotStore((s) => s.pauseStage)
  const resumeStage = usePackPilotStore((s) => s.resumeStage)
  const editStage = usePackPilotStore((s) => s.editStage)
  const skipStage = usePackPilotStore((s) => s.skipStage)
  const [editOpen, setEditOpen] = useState(false)
  const [interruptOpen, setInterruptOpen] = useState(false)
  const [worker, setWorker] = useState(stage.workerName || '我')
  const [mode, setMode] = useState<TrackingMode>(stage.trackingMode || 'automatic')
  const firstSession = stage.sessions[0]
  const lastSession = stage.sessions.at(-1)
  const [startAt, setStartAt] = useState(toLocalInput(firstSession?.startedAt))
  const [endAt, setEndAt] = useState(lastSession?.endedAt ? toLocalInput(lastSession.endedAt) : '')
  const [reason, setReason] = useState<InterruptionReason>('waiting-colleague')
  const [reasonNote, setReasonNote] = useState('')
  const isWaitingMarker = stage.stage === 'ready-to-ship' || stage.stage === 'ready-for-hallway'
  const duration = isWaitingMarker ? 0 : stageMs(stage, nowMs)

  const begin = () => {
    const manual = mode === 'manual'
    startStage(work.id, stage.stage, worker, mode, manual ? new Date(startAt).toISOString() : undefined)
  }

  return <div className={`stage-row stage-${stage.status}`}>
    <div className="stage-main">
      <div className="stage-icon">{stage.status === 'completed' ? <Check size={17} /> : stage.status === 'working' ? <Play size={16} /> : stage.status === 'paused' ? <Pause size={16} /> : stage.status === 'skipped' ? <SkipForward size={16} /> : <span />}</div>
      <div><strong>{stageLabels[stage.stage]}</strong><span>{stage.workerName || '尚未指定'} · {stage.status === 'not-started' ? '未開始' : stage.status === 'working' ? '進行中' : stage.status === 'paused' ? '已暫停' : stage.status === 'completed' ? '已完成' : '已略過'}</span></div>
    </div>
    <div className="stage-time"><strong>{isWaitingMarker ? '不計時' : formatDuration(duration)}</strong>{stage.completedAt && <span>{new Date(stage.completedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</span>}</div>
    <div className="stage-actions">
      {stage.status === 'not-started' && !isWaitingMarker && <button className="primary small" onClick={() => setEditOpen(true)}>開始</button>}
      {stage.status === 'not-started' && isWaitingMarker && <button className="secondary small" onClick={() => completeStage(work.id, stage.stage)}>標記等待</button>}
      {stage.status === 'working' && <><button className="primary small" onClick={() => completeStage(work.id, stage.stage)}>完成</button><button className="secondary small" onClick={() => setInterruptOpen(true)}>暫停</button></>}
      {stage.status === 'paused' && <button className="primary small" onClick={() => resumeStage(work.id, stage.stage)}>繼續</button>}
      <button className="icon-button mini" title="修改階段" onClick={() => setEditOpen(true)}><Edit3 size={16} /></button>
      {stage.status !== 'completed' && stage.status !== 'skipped' && <button className="icon-button mini" title="略過階段" onClick={() => window.confirm(`略過「${stageLabels[stage.stage]}」？`) && skipStage(work.id, stage.stage)}><SkipForward size={16} /></button>}
    </div>

    {editOpen && <Modal title={`設定：${stageLabels[stage.stage]}`} onClose={() => setEditOpen(false)}>
      <div className="form-grid">
        <label>執行者<input value={worker} onChange={(e) => setWorker(e.target.value)} /></label>
        <label>計時方式<select value={mode} onChange={(e) => setMode(e.target.value as TrackingMode)}><option value="automatic">我的工作，自動計時</option><option value="manual">同事工作，手動時間</option></select></label>
        <label>開始時間<input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <label>完成時間（可留空）<input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
      </div>
      <div className="modal-actions">
        {stage.status === 'not-started' && <button className="primary" onClick={() => { begin(); setEditOpen(false) }}>開始此階段</button>}
        <button className="secondary" onClick={() => { editStage(work.id, stage.stage, worker, mode, startAt ? new Date(startAt).toISOString() : undefined, endAt ? new Date(endAt).toISOString() : undefined); setEditOpen(false) }}>儲存修改</button>
      </div>
    </Modal>}

    {interruptOpen && <Modal title="暫停原因" onClose={() => setInterruptOpen(false)}>
      <label>原因<select value={reason} onChange={(e) => setReason(e.target.value as InterruptionReason)}>{Object.entries(interruptionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>備註<input value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder="例如：等待同事分出下一箱" /></label>
      <button className="danger" onClick={() => { pauseStage(work.id, stage.stage, reason, reasonNote); setInterruptOpen(false); setReasonNote('') }}>確認暫停</button>
    </Modal>}
  </div>
}

function WorkCard({ work, nowMs }: { work: WorkItem; nowMs: number }) {
  const updateWork = usePackPilotStore((s) => s.updateWork)
  const duplicateWork = usePackPilotStore((s) => s.duplicateWork)
  const cancelWork = usePackPilotStore((s) => s.cancelWork)
  const restoreWork = usePackPilotStore((s) => s.restoreWork)
  const deleteWork = usePackPilotStore((s) => s.deleteWork)
  const [expanded, setExpanded] = useState(work.status === 'active')
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [channel, setChannel] = useState<ChannelId>(work.channelId)
  const [delivery, setDelivery] = useState<DeliveryType>(work.deliveryType)
  const [orders, setOrders] = useState(String(work.orderCount))
  const [note, setNote] = useState(work.note)
  const operationMs = workOperationMs(work, nowMs)
  const spanMs = workSpanMs(work, nowMs)
  const activeStages = work.stages.filter((s) => s.status === 'working').length

  return <article className={`work-card work-${work.status}`}>
    <div className="work-head">
      <button className="work-expand" onClick={() => setExpanded((v) => !v)}>
        <div><span className="status-dot" /><div><strong>{work.displayName}</strong><span>{work.deliveryType === 'convenience-store' ? '超商' : work.deliveryType === 'home-delivery' ? '宅配' : '內部作業'} · {work.orderCount} 單</span></div></div>
        <ChevronDown className={expanded ? 'rotated' : ''} size={20} />
      </button>
      <div className="work-metrics"><div><small>作業時間</small><strong>{formatDuration(operationMs)}</strong></div><div><small>流程跨度</small><strong>{formatDuration(spanMs)}</strong></div><div><small>同時進行</small><strong>{activeStages}</strong></div></div>
      <button className="icon-button" onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={20} /></button>
      {menuOpen && <div className="popover-menu">
        <button onClick={() => { setEditOpen(true); setMenuOpen(false) }}><Edit3 size={16} /> 編輯工作</button>
        <button onClick={() => { duplicateWork(work.id); setMenuOpen(false) }}><Copy size={16} /> 複製工作</button>
        {work.status === 'cancelled' ? <button onClick={() => restoreWork(work.id)}><ArchiveRestore size={16} /> 恢復工作</button> : <button onClick={() => window.confirm('將此工作標示為取消？') && cancelWork(work.id)}><ArchiveRestore size={16} /> 取消／封存</button>}
        <button className="danger-text" onClick={() => window.confirm('永久刪除此工作與相關紀錄？') && deleteWork(work.id)}><Trash2 size={16} /> 刪除工作</button>
      </div>}
    </div>
    {work.note && <p className="work-note">{work.note}</p>}
    {expanded && <div className="stage-list">{work.stages.map((stage) => <StageRow key={stage.stage} work={work} stage={stage} nowMs={nowMs} />)}</div>}

    {editOpen && <Modal title={`編輯：${work.displayName}`} onClose={() => setEditOpen(false)}>
      <div className="form-grid">
        <label>通路<select value={channel} onChange={(e) => { const value = e.target.value as ChannelId; setChannel(value); if (value === 'myship') setDelivery('convenience-store') }}>{channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>配送<select value={delivery} disabled={channel === 'myship' || channel === 'inventory-system'} onChange={(e) => setDelivery(e.target.value as DeliveryType)}><option value="convenience-store">超商</option><option value="home-delivery">宅配</option><option value="internal">內部</option></select></label>
        <label>單數<input type="number" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} /></label>
        <label className="full-row">備註<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button className="primary" onClick={() => { updateWork(work.id, { channelId: channel, deliveryType: delivery, orderCount: Number(orders) || 0, note }); setEditOpen(false) }}>儲存修改</button>
    </Modal>}
  </article>
}

function Section({ title, works, nowMs, empty }: { title: string; works: WorkItem[]; nowMs: number; empty: string }) {
  return <section><div className="section-title"><h2>{title}</h2><span>{works.length}</span></div><div className="stack">{works.length ? works.map((w) => <WorkCard key={w.id} work={w} nowMs={nowMs} />) : <div className="empty">{empty}</div>}</div></section>
}

export default function App() {
  const works = usePackPilotStore((s) => s.works)
  const interruptions = usePackPilotStore((s) => s.interruptions)
  const audits = usePackPilotStore((s) => s.audits)
  const addWork = usePackPilotStore((s) => s.addWork)
  const resetAll = usePackPilotStore((s) => s.resetAll)
  const nowMs = useClock()
  const [formOpen, setFormOpen] = useState(false)
  const [channel, setChannel] = useState<ChannelId>('shopee')
  const [delivery, setDelivery] = useState<DeliveryType>('convenience-store')
  const [mode, setMode] = useState<TrackingMode>('automatic')
  const [worker, setWorker] = useState('我')
  const [orders, setOrders] = useState('1')
  const [startedAt, setStartedAt] = useState(toLocalInput())
  const [note, setNote] = useState('')

  const active = useMemo(() => works.filter((w) => w.status === 'active'), [works])
  const waiting = useMemo(() => works.filter((w) => w.status === 'waiting'), [works])
  const cancelled = useMemo(() => works.filter((w) => w.status === 'cancelled'), [works])
  const completedToday = useMemo(() => works.filter((w) => w.status === 'completed' && w.completedAt && new Date(w.completedAt).toDateString() === new Date(nowMs).toDateString()), [works, nowMs])
  const totalOrders = completedToday.reduce((sum, w) => sum + w.orderCount, 0)
  const totalOperation = completedToday.reduce((sum, w) => sum + workOperationMs(w, nowMs), 0)
  const efficiency = totalOperation > 0 ? totalOrders / (totalOperation / 3600000) : 0

  const submit = () => {
    addWork({ channelId: channel, deliveryType: channel === 'myship' ? 'convenience-store' : channel === 'inventory-system' ? 'internal' : delivery, orderCount: Number(orders) || 0, workerName: worker, trackingMode: mode, note, startedAt: mode === 'manual' ? new Date(startedAt).toISOString() : undefined })
    setNote(''); setFormOpen(false)
  }

  return <main className="app-shell">
    <header className="hero"><div><p className="eyebrow">PACKPILOT · V0.4 PIPELINE</p><h1>多人並行、階段重疊，時間不再被排成一條直線。</h1><p>撿貨、分貨、包貨各自計時。等待寄貨完全切離作業時間，工作也能隨時修改或刪除。</p></div><button className="icon-button" title="清除所有資料" onClick={() => window.confirm('確定清除所有 PackPilot 資料？') && resetAll()}><RotateCcw size={20} /></button></header>

    <section className="summary-grid">
      <div className="summary-card"><small>現場進行中</small><strong>{active.length}</strong><span>個通路</span></div>
      <div className="summary-card"><small>今日完成</small><strong>{totalOrders}</strong><span>{completedToday.length} 批</span></div>
      <div className="summary-card"><small>總作業時間</small><strong>{formatDuration(totalOperation)}</strong><span>只計撿貨、分貨、包貨</span></div>
      <div className="summary-card"><small>平均效率</small><strong>{efficiency.toFixed(1)}</strong><span>單／小時</span></div>
    </section>

    <button className="new-work" onClick={() => setFormOpen((v) => !v)}><Plus size={22} /> 新增現場工作</button>
    {formOpen && <section className="create-panel">
      <div className="mode-switch"><button className={mode === 'automatic' ? 'active' : ''} onClick={() => { setMode('automatic'); setWorker('我') }}><TimerReset size={18} /> 我的工作，自動計時</button><button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><Users size={18} /> 同事工作，手動補登</button></div>
      <label>通路／資源<select value={channel} onChange={(e) => { const v = e.target.value as ChannelId; setChannel(v); if (v === 'myship') setDelivery('convenience-store') }}>{channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>第一階段執行者<input value={worker} onChange={(e) => setWorker(e.target.value)} /></label>
      {channel !== 'inventory-system' && <label>配送<select value={delivery} disabled={channel === 'myship'} onChange={(e) => setDelivery(e.target.value as DeliveryType)}><option value="convenience-store">超商</option><option value="home-delivery">宅配</option></select></label>}
      {channel !== 'inventory-system' && <label>單數<input type="number" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} /></label>}
      {mode === 'manual' && <label>實際開始時間<input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} /></label>}
      <label className="full-row">備註<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：同事 A 先撿貨，我稍後接包貨" /></label>
      <button className="primary full-row" onClick={submit}>建立並開始撿貨</button>
    </section>}

    <Section title="現場流水線" works={active} nowMs={nowMs} empty="目前沒有進行中的工作" />
    <Section title="作業已完成，等待物流" works={waiting} nowMs={nowMs} empty="沒有等待寄貨或搬運的工作" />
    <Section title="今日已完成" works={completedToday} nowMs={nowMs} empty="今天尚無完成紀錄" />
    {cancelled.length > 0 && <Section title="已取消／封存" works={cancelled} nowMs={nowMs} empty="" />}

    <section className="two-column">
      <div><div className="section-title"><h2>最近中斷</h2><span>{interruptions.length}</span></div><div className="timeline">{interruptions.slice(0, 8).map((item) => <div className="timeline-item" key={item.id}><strong>{item.workName} · {stageLabels[item.stage]}</strong><span>{interruptionLabels[item.reason]}</span>{item.note && <small>{item.note}</small>}<small>{new Date(item.createdAt).toLocaleString('zh-TW')} {item.resumedAt ? '· 已恢復' : '· 尚未恢復'}</small></div>)}{!interruptions.length && <div className="empty">尚無中斷紀錄</div>}</div></div>
      <div><div className="section-title"><h2>修改歷程</h2><span>{audits.length}</span></div><div className="timeline">{audits.slice(0, 8).map((item) => <div className="timeline-item" key={item.id}><strong>{item.action}</strong><span>{item.detail}</span><small>{new Date(item.happenedAt).toLocaleString('zh-TW')}</small></div>)}{!audits.length && <div className="empty">尚無修改紀錄</div>}</div></div>
    </section>
  </main>
}
