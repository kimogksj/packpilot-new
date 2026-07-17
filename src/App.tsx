import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ClipboardList, Pause, Play, Plus, RotateCcw, Truck } from 'lucide-react'
import { usePackPilotStore } from './store/usePackPilotStore'
import type { ChannelId, DeliveryType, InterruptionReason, WorkItem, WorkStage } from './types/work'
import './styles.css'

const channels: Array<{ id: ChannelId; label: string }> = [
  { id: 'shopee', label: '蝦皮' },
  { id: 'preorder', label: '預購' },
  { id: 'myship', label: '賣貨便' },
  { id: 'boss-note', label: '老闆記事本' },
  { id: 'other', label: '其他' },
]

const deliveryLabels: Record<DeliveryType, string> = {
  'convenience-store': '超商',
  'home-delivery': '宅配',
}

const stageLabels: Record<WorkStage, string> = {
  picking: '撿貨',
  sorting: '分貨',
  packing: '包貨',
  'ready-to-ship': '等待寄貨',
  'ready-for-hallway': '等待搬至走廊',
  completed: '完成',
}

const interruptionLabels: Record<InterruptionReason, string> = {
  arrival: '到貨',
  'manager-request': '主管交辦',
  'other-department': '其他部門拿貨',
  other: '其他',
}

function WorkCard({ work }: { work: WorkItem }) {
  const advanceWork = usePackPilotStore((state) => state.advanceWork)
  const interruptWork = usePackPilotStore((state) => state.interruptWork)
  const resumeWork = usePackPilotStore((state) => state.resumeWork)
  const completeShipment = usePackPilotStore((state) => state.completeShipment)
  const confirmHallwayMove = usePackPilotStore((state) => state.confirmHallwayMove)
  const [interruptOpen, setInterruptOpen] = useState(false)
  const [reason, setReason] = useState<InterruptionReason>('arrival')
  const [note, setNote] = useState('')

  const isWorkingStage = ['picking', 'sorting', 'packing'].includes(work.stage)

  return (
    <article className={`work-card ${work.status}`}>
      <div className="work-card__top">
        <div>
          <h3>{work.displayName}</h3>
          <p>{deliveryLabels[work.deliveryType]} · {stageLabels[work.stage]}</p>
        </div>
        <span className={`status-pill ${work.status}`}>{work.status === 'working' ? '進行中' : work.status === 'paused' ? '已暫停' : '待處理'}</span>
      </div>
      {work.note && <p className="note">備註：{work.note}</p>}

      <div className="actions">
        {work.status === 'working' && isWorkingStage && (
          <button className="primary" onClick={() => advanceWork(work.id)}>
            下一階段 <ArrowRight size={18} />
          </button>
        )}
        {work.status === 'working' && (
          <button className="secondary" onClick={() => setInterruptOpen((value) => !value)}>
            <Pause size={18} /> 中斷
          </button>
        )}
        {work.status === 'paused' && (
          <button className="primary" onClick={() => resumeWork(work.id)}>
            <Play size={18} /> 繼續工作
          </button>
        )}
        {work.stage === 'ready-to-ship' && (
          <button className="primary" onClick={() => completeShipment(work.id)}>
            <Truck size={18} /> 確認已寄貨
          </button>
        )}
        {work.stage === 'ready-for-hallway' && (
          <button className="primary" onClick={() => confirmHallwayMove(work.id)}>
            <Check size={18} /> 已搬到走廊
          </button>
        )}
      </div>

      {interruptOpen && (
        <div className="inline-form">
          <label>
            中斷原因
            <select value={reason} onChange={(event) => setReason(event.target.value as InterruptionReason)}>
              {Object.entries(interruptionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            備註（可留空）
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：先處理新到貨" />
          </label>
          <button className="danger" onClick={() => { interruptWork(work.id, reason, note); setInterruptOpen(false); setNote('') }}>
            確認暫停
          </button>
        </div>
      )}
    </article>
  )
}

function Section({ title, icon, works, empty }: { title: string; icon: React.ReactNode; works: WorkItem[]; empty: string }) {
  return (
    <section>
      <div className="section-title">{icon}<h2>{title}</h2><span>{works.length}</span></div>
      <div className="stack">{works.length ? works.map((work) => <WorkCard key={work.id} work={work} />) : <div className="empty">{empty}</div>}</div>
    </section>
  )
}

export default function App() {
  const works = usePackPilotStore((state) => state.works)
  const interruptions = usePackPilotStore((state) => state.interruptions)
  const addWork = usePackPilotStore((state) => state.addWork)
  const resetAll = usePackPilotStore((state) => state.resetAll)
  const [formOpen, setFormOpen] = useState(false)
  const [channel, setChannel] = useState<ChannelId>('shopee')
  const [delivery, setDelivery] = useState<DeliveryType>('convenience-store')
  const [note, setNote] = useState('')

  const active = useMemo(() => works.filter((work) => work.status === 'working'), [works])
  const paused = useMemo(() => works.filter((work) => work.status === 'paused'), [works])
  const readyToShip = useMemo(() => works.filter((work) => work.stage === 'ready-to-ship'), [works])
  const readyForHallway = useMemo(() => works.filter((work) => work.stage === 'ready-for-hallway'), [works])

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">PACKPILOT · V0.2</p>
          <h1>今天做到哪裡，一眼就知道。</h1>
          <p>一個時間只專注一件工作。新工作開始時，原工作會自動暫停。</p>
        </div>
        <button className="icon-button" title="清除所有測試資料" onClick={() => window.confirm('確定清除所有 PackPilot 資料？') && resetAll()}><RotateCcw size={20} /></button>
      </header>

      <button className="new-work" onClick={() => setFormOpen((value) => !value)}><Plus size={22} /> 新增工作</button>

      {formOpen && (
        <section className="create-panel">
          <label>通路<select value={channel} onChange={(event) => { const value = event.target.value as ChannelId; setChannel(value); if (value === 'myship') setDelivery('convenience-store') }}>{channels.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>配送方式<select value={delivery} disabled={channel === 'myship'} onChange={(event) => setDelivery(event.target.value as DeliveryType)}><option value="convenience-store">超商</option><option value="home-delivery">宅配</option></select></label>
          <label>備註（可留空）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：先處理缺貨品項" /></label>
          <button className="primary full" onClick={() => { addWork(channel, channel === 'myship' ? 'convenience-store' : delivery, note); setNote(''); setFormOpen(false) }}>開始這份工作</button>
        </section>
      )}

      <Section title="目前工作" icon={<ClipboardList size={20} />} works={active} empty="目前沒有進行中的工作" />
      <Section title="等待寄貨" icon={<Truck size={20} />} works={readyToShip} empty="沒有等待寄貨的工作" />
      <Section title="等待搬至走廊" icon={<Check size={20} />} works={readyForHallway} empty="沒有等待搬至走廊的工作" />
      <Section title="已暫停" icon={<Pause size={20} />} works={paused} empty="沒有暫停中的工作" />

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
    </main>
  )
}
