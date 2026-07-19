import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Copy,
  Edit3,
  LogOut,
  PackageOpen,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Truck,
} from 'lucide-react'
import { channelNames, dayKey, usePackPilotStore, workers } from './store/usePackPilotStore'
import type { ChannelId, DeliveryType, EventType, StageRecord, WorkItem, WorkStage } from './types/work'
import './styles.css'

const channels = Object.entries(channelNames).map(([id, label]) => ({ id: id as ChannelId, label }))
const labels: Record<WorkStage, string> = {
  picking: '撿貨',
  sorting: '分貨',
  packing: '包貨',
  'waiting-logistics': '等待物流',
  'moving-hallway': '搬到走廊',
}

const fmt = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分`
}

const msOf = (sessions: StageRecord['sessions'], now: number) =>
  sessions.reduce(
    (total, session) =>
      total + Math.max(0, Date.parse(session.endedAt ?? new Date(now).toISOString()) - Date.parse(session.startedAt)),
    0,
  )

const dayBounds = (day: string) => {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.getTime(), end.getTime()] as const
}

const intervalMsOnDay = (startedAt: string, endedAt: string | undefined, day: string, now: number) => {
  const [dayStart, dayEnd] = dayBounds(day)
  const start = Date.parse(startedAt)
  const end = endedAt ? Date.parse(endedAt) : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  return Math.max(0, Math.min(end, dayEnd) - Math.max(start, dayStart))
}

const sessionsMsOnDay = (sessions: StageRecord['sessions'], day: string, now: number) =>
  sessions.reduce((total, session) => total + intervalMsOnDay(session.startedAt, session.endedAt, day, now), 0)

const workMsOnDay = (work: WorkItem, day: string, now: number) =>
  work.stages
    .filter(stage => stage.stage !== 'waiting-logistics')
    .reduce((total, stage) => total + sessionsMsOnDay(stage.sessions, day, now), 0)

const useClock = () => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const onDay = (value: string | undefined, day: string) => Boolean(value) && dayKey(new Date(value as string)) === day
const local = (value?: string) => {
  const date = value ? new Date(value) : new Date()
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const channelClass = (id: ChannelId) => `channel-${id}`

function WorkerPicker({
  lead,
  setLead,
  helpers,
  setHelpers,
  single = false,
}: {
  lead: string
  setLead: (worker: string) => void
  helpers: string[]
  setHelpers: (workers: string[]) => void
  single?: boolean
}) {
  return (
    <div className="worker-box">
      <label>
        主要執行者
        <select
          value={lead}
          onChange={event => {
            setLead(event.target.value)
            setHelpers(helpers.filter(worker => worker !== event.target.value))
          }}
        >
          {workers.map(worker => (
            <option key={worker}>{worker}</option>
          ))}
        </select>
      </label>
      {!single && (
        <div>
          <small>協助人員</small>
          <div className="chips">
            {workers
              .filter(worker => worker !== lead)
              .map(worker => (
                <button
                  type="button"
                  key={worker}
                  className={helpers.includes(worker) ? 'chip active' : 'chip'}
                  onClick={() =>
                    setHelpers(
                      helpers.includes(worker) ? helpers.filter(selected => selected !== worker) : [...helpers, worker],
                    )
                  }
                >
                  {worker}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StageEditor({ work, stage, onClose }: { work: WorkItem; stage: StageRecord; onClose: () => void }) {
  const saveTime = usePackPilotStore(state => state.updateStageTime)
  const saveWorkers = usePackPilotStore(state => state.updateStageWorkers)
  const [first] = stage.sessions
  const [lead, setLead] = useState(stage.leadWorker || '韋')
  const [helpers, setHelpers] = useState(stage.helpers)
  const [start, setStart] = useState(local(first?.startedAt ?? work.createdAt))
  const [end, setEnd] = useState(local(first?.endedAt))
  const [done, setDone] = useState(stage.status === 'completed')

  return (
    <div className="inline-editor time-editor">
      <h4>人員與時間分開儲存</h4>
      <WorkerPicker
        lead={lead}
        setLead={setLead}
        helpers={helpers}
        setHelpers={setHelpers}
        single={stage.stage === 'sorting'}
      />
      <div className="editor-actions">
        <button onClick={() => saveWorkers(work.id, stage.stage, lead, helpers)}>
          <Save size={16} />只儲存人員
        </button>
      </div>
      <div className="time-grid">
        <label>
          開始
          <input type="datetime-local" value={start} onChange={event => setStart(event.target.value)} />
        </label>
        <label>
          結束
          <input type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} />
        </label>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={done} onChange={event => setDone(event.target.checked)} />
        標記此階段完成
      </label>
      <div className="editor-actions">
        <button onClick={onClose}>關閉</button>
        <button
          className="primary"
          onClick={() => {
            saveTime(work.id, stage.stage, { startedAt: start, endedAt: end, markCompleted: done })
            onClose()
          }}
        >
          <Save size={16} />儲存時間
        </button>
      </div>
    </div>
  )
}

function StageRow({ work, stage, now }: { work: WorkItem; stage: StageRecord; now: number }) {
  const start = usePackPilotStore(state => state.startStage)
  const pause = usePackPilotStore(state => state.pauseStage)
  const resume = usePackPilotStore(state => state.resumeStage)
  const complete = usePackPilotStore(state => state.completeStage)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState(false)
  const [lead, setLead] = useState(stage.leadWorker || '韋')
  const [helpers, setHelpers] = useState(stage.helpers)
  const duration = msOf(stage.sessions, now)

  if (stage.stage === 'waiting-logistics') {
    return (
      <div className="stage-row waiting-row">
        <div>
          <strong>{labels[stage.stage]}</strong>
          <span>等待時間不計入作業效率</span>
        </div>
        <b>{stage.status === 'waiting' ? fmt(duration) : stage.status === 'completed' ? '已結束' : '尚未進入'}</b>
      </div>
    )
  }

  return (
    <div className={`stage-row status-${stage.status}`}>
      <div>
        <strong>{labels[stage.stage]}</strong>
        <span>
          {stage.leadWorker
            ? `主要：${stage.leadWorker}${stage.helpers.length ? ` · 協助：${stage.helpers.join('、')}` : ''}`
            : '尚未指定'}{' '}
          · 自動計時
        </span>
      </div>
      <b>{fmt(duration)}</b>
      <div className="stage-actions">
        {stage.status === 'not-started' && (
          <button onClick={() => setOpen(!open)}>
            <Play size={16} />開始
          </button>
        )}
        {stage.status === 'working' && (
          <>
            <button onClick={() => pause(work.id, stage.stage)}>
              <Pause size={16} />暫停
            </button>
            <button className="done" onClick={() => complete(work.id, stage.stage)}>
              <Check size={16} />完成
            </button>
          </>
        )}
        {stage.status === 'paused' && (
          <button onClick={() => resume(work.id, stage.stage)}>
            <Play size={16} />恢復
          </button>
        )}
        {stage.status === 'completed' && <span className="done-label">已完成</span>}
        <button onClick={() => setEdit(!edit)}>
          <Edit3 size={16} />編輯
        </button>
      </div>
      {open && (
        <div className="inline-editor">
          <WorkerPicker
            lead={lead}
            setLead={setLead}
            helpers={helpers}
            setHelpers={setHelpers}
            single={stage.stage === 'sorting'}
          />
          <button
            className="primary"
            onClick={() => {
              start(work.id, stage.stage, lead, helpers)
              setOpen(false)
            }}
          >
            開始自動計時
          </button>
        </div>
      )}
      {edit && <StageEditor work={work} stage={stage} onClose={() => setEdit(false)} />}
    </div>
  )
}

function WorkEditor({ work, onClose }: { work: WorkItem; onClose: () => void }) {
  const update = usePackPilotStore(state => state.updateWorkDetails)
  const [count, setCount] = useState(String(work.orderCount))
  const [channel, setChannel] = useState(work.channelId)
  const [delivery, setDelivery] = useState(work.deliveryType)
  const [note, setNote] = useState(work.note)

  return (
    <div className="inline-editor work-editor">
      <h4>工作資訊</h4>
      <div className="time-grid">
        <label>
          通路
          <select value={channel} onChange={event => setChannel(event.target.value as ChannelId)}>
            {channels.map(item => (
              <option value={item.id} key={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          配送
          <select value={delivery} onChange={event => setDelivery(event.target.value as DeliveryType)}>
            <option value="convenience-store">超商</option>
            <option value="home-delivery">宅配</option>
          </select>
        </label>
        <label>
          單數
          <input type="number" min="0" value={count} onChange={event => setCount(event.target.value)} />
        </label>
        <label>
          備註
          <input value={note} onChange={event => setNote(event.target.value)} />
        </label>
      </div>
      <div className="editor-actions">
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          onClick={() => {
            update(work.id, {
              channelId: channel,
              deliveryType: delivery,
              orderCount: Number(count) || 0,
              note,
            })
            onClose()
          }}
        >
          <Save size={16} />儲存工作
        </button>
      </div>
    </div>
  )
}

function WorkCard({ work, now }: { work: WorkItem; now: number }) {
  const suspend = usePackPilotStore(state => state.suspendWork)
  const resume = usePackPilotStore(state => state.resumeWork)
  const restore = usePackPilotStore(state => state.restoreWork)
  const cancel = usePackPilotStore(state => state.cancelWork)
  const deleteWork = usePackPilotStore(state => state.deleteWork)
  const [open, setOpen] = useState(work.status !== 'completed')
  const [edit, setEdit] = useState(false)
  const core = work.stages
    .filter(stage => stage.stage !== 'waiting-logistics')
    .reduce((total, stage) => total + msOf(stage.sessions, now), 0)
  const wait = work.stages
    .filter(stage => stage.stage === 'waiting-logistics')
    .reduce((total, stage) => total + msOf(stage.sessions, now), 0)
  const canUndo = Boolean(work.completedAt) && now - Date.parse(work.completedAt as string) <= 30_000

  return (
    <article className={`work-card ${work.status} ${channelClass(work.channelId)}`}>
      <header>
        <button className="card-title" onClick={() => setOpen(!open)}>
          <div>
            <strong>{channelNames[work.channelId]}</strong>
            <span>
              {work.jobCode} · {work.orderCount} 單 · {work.deliveryType === 'home-delivery' ? '宅配' : '超商'}
              {work.note ? ` · ${work.note}` : ''}
            </span>
          </div>
          <ChevronDown className={open ? 'rotated' : ''} />
        </button>
        <div className="status-pill">
          {work.status === 'waiting'
            ? '等待物流'
            : work.status === 'completed'
              ? '已完成'
              : work.status === 'suspended'
                ? '跨日待續'
                : work.status === 'cancelled'
                  ? '已取消'
                  : '進行中'}
        </div>
      </header>
      <div className="metrics">
        <span>
          作業 <b>{fmt(core)}</b>
        </span>
        <span>
          等待 <b>{fmt(wait)}</b>
        </span>
      </div>
      {work.status === 'suspended' && (
        <div className="handoff">
          <span>擱置期間不計時</span>
          <button className="primary" onClick={() => resume(work.id)}>
            <Play size={16} />接續
          </button>
        </div>
      )}
      {open && <div className="stage-list">{work.stages.map(stage => <StageRow key={stage.stage} work={work} stage={stage} now={now} />)}</div>}
      {edit && <WorkEditor work={work} onClose={() => setEdit(false)} />}
      <footer>
        <button onClick={() => setEdit(!edit)}>
          <Edit3 size={15} />編輯工作
        </button>
        {work.status === 'completed' ? (
          <button className="restore-action" onClick={() => restore(work.id, canUndo ? 'undo' : 'restore')}>
            <RotateCcw size={15} />{canUndo ? '撤銷完成' : '恢復工作'}
          </button>
        ) : (
          <>
            <button onClick={() => suspend(work.id)} disabled={['cancelled', 'suspended'].includes(work.status)}>
              <Clock3 size={15} />跨日待續
            </button>
            <button onClick={() => cancel(work.id)}>
              <LogOut size={15} />取消
            </button>
          </>
        )}
        <button className="danger" onClick={() => window.confirm('永久刪除？') && deleteWork(work.id)}>
          <Trash2 size={15} />刪除
        </button>
      </footer>
    </article>
  )
}

function EventCard({ type, now }: { type: EventType; now: number }) {
  const events = usePackPilotStore(state => state.events)
  const start = usePackPilotStore(state => state.startEvent)
  const complete = usePackPilotStore(state => state.completeEvent)
  const active = events.find(event => event.type === type && !event.endedAt)
  const todayKey = dayKey()
  const today = events.filter(event => event.type === type && onDay(event.startedAt, todayKey))
  const [worker, setWorker] = useState('韋')
  const title = type === 'inbound' ? '處理到貨' : '庫存系統'
  const Icon = type === 'inbound' ? PackageOpen : ClipboardList
  const total = events
    .filter(event => event.type === type)
    .reduce((sum, event) => sum + intervalMsOnDay(event.startedAt, event.endedAt, todayKey, now), 0)

  return (
    <section className={`inbound-card ${active ? 'running' : ''}`}>
      <div>
        <Icon />
        <div>
          <strong>{title}</strong>
          <span>
            {active
              ? `${active.worker} · ${fmt(Math.max(0, now - Date.parse(active.startedAt)))}`
              : `今天 ${today.length} 次 · ${fmt(total)}`}
          </span>
        </div>
      </div>
      {active ? (
        <button className="done" onClick={() => complete(active.id)}>
          <Check size={17} />完成
        </button>
      ) : (
        <div className="event-start">
          <select value={worker} onChange={event => setWorker(event.target.value)}>
            {workers.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <button className="primary" onClick={() => start(type, worker)}>
            <Play size={17} />開始
          </button>
        </div>
      )}
    </section>
  )
}

function ShipmentPanel({ now }: { now: number }) {
  const works = usePackPilotStore(state => state.works)
  const shipments = usePackPilotStore(state => state.shipments)
  const start = usePackPilotStore(state => state.startShipment)
  const complete = usePackPilotStore(state => state.completeShipment)
  const waiting = works.filter(work => work.status === 'waiting' && work.deliveryType === 'convenience-store')
  const active = shipments.find(shipment => !shipment.endedAt)
  const [selected, setSelected] = useState<string[]>([])
  const [worker, setWorker] = useState('韋')
  const [helpers, setHelpers] = useState<string[]>([])

  return (
    <section className="shipment-panel">
      <div className="section-title">
        <h2>
          <Truck size={20} />寄貨批次
        </h2>
        <span>{waiting.length} 筆待寄</span>
      </div>
      {active ? (
        <div className="shipment-active">
          <div>
            <strong>{active.code}</strong>
            <span>
              {active.worker} · {active.workIds.length} 筆 · {fmt(now - Date.parse(active.startedAt))}
            </span>
          </div>
          <button className="done" onClick={() => complete(active.id)}>
            <Check size={17} />完成本趟寄貨
          </button>
        </div>
      ) : waiting.length ? (
        <>
          <div className="shipment-list">
            {waiting.map(work => (
              <label key={work.id} className={channelClass(work.channelId)}>
                <input
                  type="checkbox"
                  checked={selected.includes(work.id)}
                  onChange={() =>
                    setSelected(
                      selected.includes(work.id)
                        ? selected.filter(workId => workId !== work.id)
                        : [...selected, work.id],
                    )
                  }
                />
                <b>{channelNames[work.channelId]}</b>
                <span>{work.orderCount} 單</span>
              </label>
            ))}
          </div>
          <WorkerPicker lead={worker} setLead={setWorker} helpers={helpers} setHelpers={setHelpers} />
          <button
            className="primary"
            disabled={!selected.length}
            onClick={() => {
              start(selected, worker, helpers)
              setSelected([])
            }}
          >
            <Truck size={17} />開始寄貨批次
          </button>
        </>
      ) : (
        <div className="empty">目前沒有等待寄貨的超商工作</div>
      )}
    </section>
  )
}

export default function App() {
  const works = usePackPilotStore(state => state.works)
  const events = usePackPilotStore(state => state.events)
  const shipments = usePackPilotStore(state => state.shipments)
  const audits = usePackPilotStore(state => state.audits)
  const add = usePackPilotStore(state => state.addWork)
  const restoreWork = usePackPilotStore(state => state.restoreWork)
  const undoShipment = usePackPilotStore(state => state.undoShipment)
  const endDay = usePackPilotStore(state => state.endWorkday)
  const reset = usePackPilotStore(state => state.resetAll)
  const now = useClock()

  const [tab, setTab] = useState<'today' | 'log' | 'report'>('today')
  const [form, setForm] = useState(false)
  const [channel, setChannel] = useState<ChannelId>('shopee')
  const [delivery, setDelivery] = useState<DeliveryType>('convenience-store')
  const [orders, setOrders] = useState('1')
  const [lead, setLead] = useState('韋')
  const [helpers, setHelpers] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [selectedDay, setSelectedDay] = useState(dayKey())
  const [completedOpen, setCompletedOpen] = useState(false)

  const today = dayKey()
  const current = works.filter(
    work => work.currentWorkday === today && (work.status === 'active' || work.status === 'waiting'),
  )
  const carry = works.filter(work => work.status === 'suspended')
  const completeToday = works
    .filter(work => work.status === 'completed' && onDay(work.completedAt, today))
    .sort((a, b) => Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? ''))
  const waiting = works.filter(work => work.status === 'waiting')
  const totalOrders = completeToday.reduce((total, work) => total + work.orderCount, 0)
  const shipToday = shipments.filter(shipment => onDay(shipment.startedAt, today))
  const eventsToday = events.filter(event => onDay(event.startedAt, today))

  const orderMsToday = works.reduce((total, work) => total + workMsOnDay(work, today, now), 0)
  const shipmentMsToday = shipments.reduce(
    (total, shipment) => total + intervalMsOnDay(shipment.startedAt, shipment.endedAt, today, now),
    0,
  )
  const eventMsToday = events.reduce(
    (total, event) => total + intervalMsOnDay(event.startedAt, event.endedAt, today, now),
    0,
  )
  const totalMsToday = orderMsToday + shipmentMsToday + eventMsToday
  const completedWorkMs = completeToday.reduce((total, work) => total + workMsOnDay(work, today, now), 0)
  const timedWorksToday = works.filter(work => workMsOnDay(work, today, now) > 0).length

  const completedSignature = completeToday.map(work => `${work.id}:${work.completedAt}`).join('|')
  useEffect(() => setCompletedOpen(false), [completedSignature])

  const latestCompletedShipment = [...shipments]
    .filter(shipment => shipment.endedAt && now - Date.parse(shipment.endedAt) <= 30_000)
    .sort((a, b) => Date.parse(b.endedAt ?? '') - Date.parse(a.endedAt ?? ''))[0]
  const latestUndoableWork = completeToday.find(
    work => !work.shipmentId && work.completedAt && now - Date.parse(work.completedAt) <= 30_000,
  )
  const undoSeconds = latestCompletedShipment?.endedAt
    ? Math.max(0, Math.ceil((30_000 - (now - Date.parse(latestCompletedShipment.endedAt))) / 1000))
    : latestUndoableWork?.completedAt
      ? Math.max(0, Math.ceil((30_000 - (now - Date.parse(latestUndoableWork.completedAt))) / 1000))
      : 0

  const report = useMemo(() => {
    const lines = [`【${today} PackPilot 工作回報】`, '']
    channels.forEach(item => {
      const done = completeToday
        .filter(work => work.channelId === item.id)
        .reduce((total, work) => total + work.orderCount, 0)
      lines.push(`${item.label}：完成 ${done} 單`)
    })
    lines.push(
      '',
      `今日總完成：${totalOrders} 單`,
      `完成工作：${completeToday.length} 筆`,
      `寄貨：${shipToday.length} 趟／${fmt(shipmentMsToday)}`,
      `等待物流：${waiting.length} 筆`,
      '',
      '【今日工時】',
      `訂單作業：${fmt(orderMsToday)}`,
      `寄貨：${fmt(shipmentMsToday)}`,
      `事件：${fmt(eventMsToday)}`,
      `總工時：${fmt(totalMsToday)}`,
    )
    ;(['inbound', 'inventory-system'] as EventType[]).forEach(type => {
      const list = events.filter(event => event.type === type && onDay(event.startedAt, today))
      const duration = events
        .filter(event => event.type === type)
        .reduce((total, event) => total + intervalMsOnDay(event.startedAt, event.endedAt, today, now), 0)
      lines.push(`${type === 'inbound' ? '到貨' : '庫存系統'}：${list.length} 次／${fmt(duration)}`)
    })
    return lines.join('\n')
  }, [
    today,
    completeToday,
    totalOrders,
    shipToday.length,
    shipmentMsToday,
    waiting.length,
    orderMsToday,
    eventMsToday,
    totalMsToday,
    events,
    now,
  ])

  const submit = () => {
    add({
      channelId: channel,
      deliveryType: delivery,
      orderCount: Number(orders) || 0,
      leadWorker: lead,
      helpers,
      note,
    })
    setForm(false)
    setNote('')
  }

  const days = [
    ...new Set([
      today,
      ...works.map(work => work.originWorkday),
      ...events.map(event => dayKey(new Date(event.startedAt))),
      ...shipments.map(shipment => dayKey(new Date(shipment.startedAt))),
    ]),
  ].sort().reverse()

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">PACKPILOT · V0.6.0 ALPHA REVISION 2</p>
          <h1>今天的工時，現在一滴都不漏。</h1>
          <p>{today} · 寄貨納入統計、完成操作可反悔、已完成清單自動收好。</p>
        </div>
        <button className="icon" onClick={() => window.confirm('清除所有資料？') && reset()}>
          <RotateCcw />
        </button>
      </header>

      <nav className="tabs">
        <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>
          <Clock3 />今日工作
        </button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          <CalendarDays />工作日誌
        </button>
        <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>
          <ClipboardList />工作回報
        </button>
      </nav>

      {tab === 'today' && (
        <>
          <section className="summary-grid time-summary-grid">
            <div>
              <small>訂單作業</small>
              <strong>{fmt(orderMsToday)}</strong>
              <span>{timedWorksToday} 筆有計時</span>
            </div>
            <div>
              <small>寄貨</small>
              <strong>{fmt(shipmentMsToday)}</strong>
              <span>{shipToday.length} 趟</span>
            </div>
            <div>
              <small>事件</small>
              <strong>{fmt(eventMsToday)}</strong>
              <span>{eventsToday.length} 次</span>
            </div>
            <div className="total-time-card">
              <small>今日總工時</small>
              <strong>{fmt(totalMsToday)}</strong>
              <span>訂單＋寄貨＋事件</span>
            </div>
          </section>

          <div className="day-summary">
            <span>完成 {totalOrders} 單／{completeToday.length} 筆</span>
            <span>等待物流 {waiting.length} 筆</span>
            <span>寄貨 {shipToday.length} 趟</span>
            <span>跨日待續 {carry.length} 筆</span>
          </div>

          {(latestCompletedShipment || latestUndoableWork) && (
            <section className="undo-banner" role="status">
              <div>
                <strong>{latestCompletedShipment ? '寄貨批次已完成' : `${channelNames[latestUndoableWork!.channelId]}已完成`}</strong>
                <span>
                  {latestCompletedShipment
                    ? `${latestCompletedShipment.code} · ${latestCompletedShipment.workIds.length} 筆工作`
                    : `${latestUndoableWork!.orderCount} 單 · 可立即撤銷`}
                </span>
              </div>
              <button
                onClick={() =>
                  latestCompletedShipment
                    ? undoShipment(latestCompletedShipment.id)
                    : restoreWork(latestUndoableWork!.id, 'undo')
                }
              >
                <RotateCcw size={17} />撤銷（{undoSeconds} 秒）
              </button>
            </section>
          )}

          <EventCard type="inbound" now={now} />
          <EventCard type="inventory-system" now={now} />
          <ShipmentPanel now={now} />

          <div className="main-actions">
            <button className="new-work" onClick={() => setForm(!form)}>
              <Plus />新增工作
            </button>
            <button
              className="end-day"
              onClick={() => window.confirm('結束今天工作？未完成工作將轉為跨日待續。') && endDay()}
            >
              <LogOut />結束今天工作
            </button>
          </div>

          {form && (
            <section className="create-panel">
              <label>
                通路
                <select value={channel} onChange={event => setChannel(event.target.value as ChannelId)}>
                  {channels.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                配送
                <select value={delivery} onChange={event => setDelivery(event.target.value as DeliveryType)}>
                  <option value="convenience-store">超商</option>
                  <option value="home-delivery">宅配</option>
                </select>
              </label>
              <label>
                單數
                <input type="number" min="0" value={orders} onChange={event => setOrders(event.target.value)} />
              </label>
              <WorkerPicker lead={lead} setLead={setLead} helpers={helpers} setHelpers={setHelpers} />
              <p className="mode-note full">所有人皆預設自動計時。人員、數量與時間可分開修改。</p>
              <label className="full">
                備註
                <input value={note} onChange={event => setNote(event.target.value)} />
              </label>
              <button className="primary full" onClick={submit}>
                建立並開始撿貨
              </button>
            </section>
          )}

          {carry.length > 0 && (
            <section>
              <div className="section-title">
                <h2>跨日待續</h2>
                <span>{carry.length}</span>
              </div>
              <div className="stack">{carry.map(work => <WorkCard key={work.id} work={work} now={now} />)}</div>
            </section>
          )}

          <section>
            <div className="section-title">
              <h2>現在要處理</h2>
              <span>{current.length}</span>
            </div>
            <div className="stack">
              {current.length ? current.map(work => <WorkCard key={work.id} work={work} now={now} />) : <div className="empty">目前沒有待處理工作</div>}
            </div>
          </section>

          {completeToday.length > 0 && (
            <section className="completed-section">
              <button
                className="completed-toggle"
                onClick={() => setCompletedOpen(!completedOpen)}
                aria-expanded={completedOpen}
              >
                <div>
                  <strong>✅ 已完成</strong>
                  <span>預設自動折疊，讓現在的工作留在畫面中央</span>
                </div>
                <div className="completed-summary">
                  <b>{completeToday.length} 筆</b>
                  <b>{totalOrders} 單</b>
                  <b>{fmt(completedWorkMs)}</b>
                </div>
                <ChevronDown className={completedOpen ? 'rotated' : ''} />
              </button>
              {completedOpen && (
                <div className="stack completed-stack">
                  {completeToday.map(work => <WorkCard key={work.id} work={work} now={now} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {tab === 'log' && (
        <section>
          <div className="day-picker">
            {days.map(day => (
              <button key={day} className={day === selectedDay ? 'active' : ''} onClick={() => setSelectedDay(day)}>
                {day}
              </button>
            ))}
          </div>
          <div className="stack">
            {works
              .filter(work => work.originWorkday === selectedDay || onDay(work.completedAt, selectedDay))
              .map(work => <WorkCard key={work.id} work={work} now={now} />)}
          </div>
          <div className="audit">
            <h3>當日事件</h3>
            {audits
              .filter(record => onDay(record.happenedAt, selectedDay))
              .map(record => (
                <p key={record.id}>
                  <b>{record.action}</b>
                  <span>{record.detail}</span>
                  <small>
                    {new Date(record.happenedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </small>
                </p>
              ))}
          </div>
        </section>
      )}

      {tab === 'report' && (
        <section>
          <div className="section-title">
            <h2>今日工作回報</h2>
            <span>訂單、寄貨、事件全部納入</span>
          </div>
          <textarea readOnly value={report} />
          <button className="primary" onClick={() => navigator.clipboard.writeText(report)}>
            <Copy size={17} />複製完整回報
          </button>
        </section>
      )}
    </main>
  )
}
