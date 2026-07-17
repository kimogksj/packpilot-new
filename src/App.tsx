import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Clock3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  TimerReset,
  Truck,
  Users,
} from 'lucide-react'
import { channelNames, usePackPilotStore } from './store/usePackPilotStore'
import type { ChannelId, DeliveryType, InterruptionReason, TrackingMode, WorkItem, WorkStage } from './types/work'
import './styles.css'

const channels: Array<{ id: ChannelId; label: string }> = Object.entries(channelNames).map(([id, label]) => ({ id: id as ChannelId, label }))

const deliveryLabels: Record<DeliveryType, string> = {
  'convenience-store': '超商',
  'home-delivery': '宅配',
  internal: '內部作業',
}

const stageLabels: Record<WorkStage, string> = {
  picking: '撿貨',
  sorting: '分貨',
  packing: '包貨',
  'ready-to-ship': '等待寄貨',
  shipping: '寄貨',
  'ready-for-hallway': '等待搬至走廊',
  'moving-hallway': '搬到走廊',
  'system-use': '使用中',
  completed: '完成',
}

const interruptionLabels: Record<InterruptionReason, string> = {
  arrival: '到貨',
  'inventory-occupied': '庫存系統被占用',
  'waiting-colleague': '等待同事完成',
  'support-other-work': '支援其他工作',
  'manager-request': '主管交辦',
  'other-department': '其他部門拿貨',
  break: '休息',
  other: '其他',
}

const toLocalInput = (date = new Date()) => {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

const formatDuration = (milliseconds: number) => {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分`
  return `${hours} 小時 ${minutes} 分`
}

const getEffectiveMs = (work: WorkItem, currentTime: number) => work.sessions.reduce((sum, session) => {
  const end = session.endedAt ? new Date(session.endedAt).getTime() : currentTime
  return sum + Math.max(0, end - new Date(session.startedAt).getTime())
}, 0)

function useClock() {
  const [time, setTime] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setTime(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return time
}

function WorkCard({ work, nowMs }: { work: WorkItem; nowMs: number }) {
  const advanceWork = usePackPilotStore((state) => state.advanceWork)
  const interruptWork = usePackPilotStore((state) => state.interruptWork)
  const resumeWork = usePackPilotStore((state) => state.resumeWork)
  const startFulfillment = usePackPilotStore((state) => state.startFulfillment)
  const completeWork = usePackPilotStore((state) => state.completeWork)
  const updateOrderCount = usePackPilotStore((state) => state.updateOrderCount)
  const [interruptOpen, setInterruptOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [reason, setReason] = useState<InterruptionReason>('arrival')
  const [note, setNote] = useState('')
  const [manualTime, setManualTime] = useState(toLocalInput())
  const [orders, setOrders] = useState(String(work.orderCount))

  const effectiveMs = getEffectiveMs(work, nowMs)
  const isCoreStage = ['picking', 'sorting', 'packing', 'system-use'].includes(work.stage)
  const isManual = work.trackingMode === 'manual'
  const timestamp = isManual && manualOpen ? new Date(manualTime).toISOString() : undefined

  const runWithManualTime = (action: (time?: string) => void) => {
    action(timestamp)
    setManualOpen(false)
    setManualTime(toLocalInput())
  }

  return (
    <article className={`work-card ${work.status}`}>
      <div className="work-card__top">
        <div>
          <div className="title-row">
            <h3>{work.displayName}</h3>
            <span className={`tracking-badge ${work.trackingMode}`}>{isManual ? '手動補登' : '自動計時'}</span>
          </div>
          <p>{work.workerName} · {deliveryLabels[work.deliveryType]} · {stageLabels[work.stage]}</p>
        </div>
        <span className={`status-pill ${work.status}`}>{work.status === 'working' ? '進行中' : work.status === 'paused' ? '已暫停' : work.status === 'waiting' ? '等待中' : '已完成'}</span>
      </div>

      <div className="metrics-row">
        <div><small>有效時間</small><strong>{formatDuration(effectiveMs)}</strong></div>
        {work.deliveryType !== 'internal' && <div><small>單數</small><strong>{work.orderCount} 單</strong></div>}
        <div><small>開始</small><strong>{new Date(work.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}</strong></div>
      </div>

      {work.note && <p className="note">備註：{work.note}</p>}

      {work.status !== 'completed' && work.deliveryType !== 'internal' && (
        <div className="order-editor">
          <input inputMode="numeric" min="0" type="number" value={orders} onChange={(event) => setOrders(event.target.value)} />
          <button className="secondary compact" onClick={() => updateOrderCount(work.id, Number(orders) || 0)}>更新單數</button>
        </div>
      )}

      {isManual && work.status !== 'completed' && (
        <button className="manual-time-toggle" onClick={() => setManualOpen((value) => !value)}>
          <Clock3 size={17} /> {manualOpen ? '取消指定時間' : '指定這次紀錄時間'}
        </button>
      )}

      {manualOpen && (
        <div className="manual-time-panel">
          <label>動作發生時間<input type="datetime-local" value={manualTime} onChange={(event) => setManualTime(event.target.value)} /></label>
          <small>例如同事稍後才回報完成時間，可以在這裡補登。</small>
        </div>
      )}

      <div className="actions">
        {work.status === 'working' && isCoreStage && (
          <button className="primary" onClick={() => runWithManualTime((time) => advanceWork(work.id, time))}>
            {work.stage === 'system-use' ? '結束使用' : '下一階段'} <ArrowRight size={18} />
          </button>
        )}
        {work.status === 'waiting' && (
          <button className="primary" onClick={() => runWithManualTime((time) => startFulfillment(work.id, time))}>
            <Play size={18} /> 開始{work.stage === 'ready-to-ship' ? '寄貨' : '搬運'}
          </button>
        )}
        {work.status === 'working' && ['shipping', 'moving-hallway'].includes(work.stage) && (
          <button className="primary" onClick={() => runWithManualTime((time) => completeWork(work.id, time))}>
            <Check size={18} /> 完成工作
          </button>
        )}
        {work.status === 'working' && !isManual && (
          <button className="secondary" onClick={() => setInterruptOpen((value) => !value)}>
            <Pause size={18} /> 中斷
          </button>
        )}
        {work.status === 'paused' && (
          <button className="primary" onClick={() => resumeWork(work.id)}>
            <Play size={18} /> 繼續工作
          </button>
        )}
        {isManual && work.status !== 'completed' && (
          <button className="secondary" onClick={() => runWithManualTime((time) => completeWork(work.id, time))}>
            <Check size={18} /> 直接完成
          </button>
        )}
      </div>

      {interruptOpen && (
        <div className="inline-form">
          <label>中斷原因<select value={reason} onChange={(event) => setReason(event.target.value as InterruptionReason)}>{Object.entries(interruptionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>備註（可留空）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：等待同事完成蝦皮撿貨" /></label>
          <button className="danger" onClick={() => { interruptWork(work.id, reason, note); setInterruptOpen(false); setNote('') }}>確認暫停</button>
        </div>
      )}
    </article>
  )
}

function Section({ title, icon, works, empty, nowMs }: { title: string; icon: React.ReactNode; works: WorkItem[]; empty: string; nowMs: number }) {
  return (
    <section>
      <div className="section-title">{icon}<h2>{title}</h2><span>{works.length}</span></div>
      <div className="stack">{works.length ? works.map((work) => <WorkCard key={work.id} work={work} nowMs={nowMs} />) : <div className="empty">{empty}</div>}</div>
    </section>
  )
}

export default function App() {
  const works = usePackPilotStore((state) => state.works)
  const interruptions = usePackPilotStore((state) => state.interruptions)
  const addWork = usePackPilotStore((state) => state.addWork)
  const resetAll = usePackPilotStore((state) => state.resetAll)
  const nowMs = useClock()
  const [formOpen, setFormOpen] = useState(false)
  const [channel, setChannel] = useState<ChannelId>('shopee')
  const [delivery, setDelivery] = useState<DeliveryType>('convenience-store')
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('automatic')
  const [workerName, setWorkerName] = useState('我')
  const [orderCount, setOrderCount] = useState('1')
  const [startedAt, setStartedAt] = useState(toLocalInput())
  const [note, setNote] = useState('')

  const active = useMemo(() => works.filter((work) => work.status === 'working'), [works])
  const paused = useMemo(() => works.filter((work) => work.status === 'paused'), [works])
  const waiting = useMemo(() => works.filter((work) => work.status === 'waiting'), [works])
  const completedToday = useMemo(() => works.filter((work) => work.status === 'completed' && work.completedAt && new Date(work.completedAt).toDateString() === new Date(nowMs).toDateString()), [works, nowMs])
  const totalOrders = completedToday.reduce((sum, work) => sum + work.orderCount, 0)
  const totalEffective = completedToday.reduce((sum, work) => sum + getEffectiveMs(work, nowMs), 0)

  const inventory = channel === 'inventory-system'

  const submit = () => {
    addWork({
      channelId: channel,
      deliveryType: inventory ? 'internal' : channel === 'myship' ? 'convenience-store' : delivery,
      orderCount: inventory ? 0 : Number(orderCount) || 0,
      workerName,
      trackingMode,
      note,
      startedAt: trackingMode === 'manual' ? new Date(startedAt).toISOString() : undefined,
    })
    setNote('')
    setFormOpen(false)
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">PACKPILOT · V0.3 FIELD BOARD</p>
          <h1>整個現場的節奏，都收進同一張黑色看板。</h1>
          <p>你的工作自動計時，同事的工作可手動補登。多人並行，不再被迫塞進單一路線。</p>
        </div>
        <button className="icon-button" title="清除所有測試資料" onClick={() => window.confirm('確定清除所有 PackPilot 資料？') && resetAll()}><RotateCcw size={20} /></button>
      </header>

      <section className="summary-grid">
        <div className="summary-card"><small>現場進行中</small><strong>{active.length}</strong><span>件工作</span></div>
        <div className="summary-card"><small>今日完成</small><strong>{completedToday.length}</strong><span>{totalOrders} 單</span></div>
        <div className="summary-card wide"><small>今日有效工時</small><strong>{formatDuration(totalEffective)}</strong><span>依所有已完成流程加總</span></div>
      </section>

      <button className="new-work" onClick={() => setFormOpen((value) => !value)}><Plus size={22} /> 新增現場工作</button>

      {formOpen && (
        <section className="create-panel">
          <div className="mode-switch">
            <button className={trackingMode === 'automatic' ? 'active' : ''} onClick={() => { setTrackingMode('automatic'); setWorkerName('我') }}><TimerReset size={18} /> 我的工作，自動計時</button>
            <button className={trackingMode === 'manual' ? 'active' : ''} onClick={() => setTrackingMode('manual')}><Users size={18} /> 同事工作，手動補登</button>
          </div>
          <label>通路／現場資源<select value={channel} onChange={(event) => { const value = event.target.value as ChannelId; setChannel(value); if (value === 'myship') setDelivery('convenience-store') }}>{channels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>執行者<input value={workerName} onChange={(event) => setWorkerName(event.target.value)} placeholder="例如：我、同事 A、小林" /></label>
          {!inventory && <label>配送方式<select value={delivery} disabled={channel === 'myship'} onChange={(event) => setDelivery(event.target.value as DeliveryType)}><option value="convenience-store">超商</option><option value="home-delivery">宅配</option></select></label>}
          {!inventory && <label>處理單數<input inputMode="numeric" min="0" type="number" value={orderCount} onChange={(event) => setOrderCount(event.target.value)} /></label>}
          {trackingMode === 'manual' && <label>實際開始時間<input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></label>}
          <label className="full-row">備註（可留空）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：同事正在撿蝦皮，稍後回報完成時間" /></label>
          <button className="primary full-row" onClick={submit}>{trackingMode === 'automatic' ? '開始自動計時' : '加入現場看板'}</button>
        </section>
      )}

      <Section title="現場進行中" icon={<Users size={20} />} works={active} empty="目前沒有進行中的現場工作" nowMs={nowMs} />
      <Section title="等待下一步" icon={<Truck size={20} />} works={waiting} empty="沒有等待寄貨或搬運的工作" nowMs={nowMs} />
      <Section title="我的暫停工作" icon={<Pause size={20} />} works={paused} empty="目前沒有暫停中的工作" nowMs={nowMs} />

      <section>
        <div className="section-title"><AlertTriangle size={20} /><h2>最近中斷</h2><span>{interruptions.length}</span></div>
        <div className="timeline">
          {interruptions.length === 0 ? <div className="empty">尚無中斷紀錄</div> : interruptions.slice(0, 8).map((item) => (
            <div className="timeline-item" key={item.id}>
              <strong>{item.workName}</strong>
              <span>{interruptionLabels[item.reason]} · {stageLabels[item.pausedStage]}</span>
              {item.note && <small>{item.note}</small>}
              <small>{new Date(item.createdAt).toLocaleString('zh-TW')} {item.resumedAt ? '· 已恢復' : '· 尚未恢復'}</small>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title"><ClipboardList size={20} /><h2>今日已完成</h2><span>{completedToday.length}</span></div>
        <div className="history-list">
          {completedToday.length === 0 ? <div className="empty">今天還沒有完成紀錄</div> : completedToday.map((work) => (
            <div className="history-row" key={work.id}>
              <div><strong>{work.displayName}</strong><span>{work.workerName} · {stageLabels[work.stage]}</span></div>
              <div><strong>{formatDuration(getEffectiveMs(work, nowMs))}</strong><span>{work.orderCount ? `${work.orderCount} 單` : deliveryLabels[work.deliveryType]}</span></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
