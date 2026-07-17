import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronDown, ClipboardList, Clock3, Copy, Edit3, LogOut, PackageOpen, Pause, Play, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { channelNames, dayKey, usePackPilotStore, workers } from './store/usePackPilotStore'
import type { ChannelId, DeliveryType, StageRecord, WorkItem, WorkStage } from './types/work'
import './styles.css'

const channels = Object.entries(channelNames).map(([id, label]) => ({ id: id as ChannelId, label }))
const labels: Record<WorkStage, string> = { picking: '撿貨', sorting: '分貨', packing: '包貨', 'waiting-logistics': '等待寄貨／搬運', shipping: '寄貨', 'moving-hallway': '搬到走廊', 'system-use': '庫存系統作業' }
const coreStages: WorkStage[] = ['picking','sorting','packing']
const logisticsStages: WorkStage[] = ['shipping','moving-hallway']
const fmt = (ms: number) => { const min = Math.max(0, Math.floor(ms / 60000)); return min < 60 ? `${min} 分` : `${Math.floor(min/60)} 小時 ${min%60} 分` }
const sessionMs = (s: StageRecord, now: number) => s.stage === 'waiting-logistics' ? 0 : s.sessions.reduce((sum, x) => sum + Math.max(0, Date.parse(x.endedAt ?? new Date(now).toISOString()) - Date.parse(x.startedAt)), 0)
const waitingMs = (s: StageRecord, now: number) => s.stage !== 'waiting-logistics' ? 0 : s.sessions.reduce((sum, x) => sum + Math.max(0, Date.parse(x.endedAt ?? new Date(now).toISOString()) - Date.parse(x.startedAt)), 0)
const inboundMs = (startedAt: string, endedAt: string | undefined, now: number) => Math.max(0, Date.parse(endedAt ?? new Date(now).toISOString()) - Date.parse(startedAt))
const useClock = () => { const [n,setN] = useState(Date.now()); useEffect(() => { const id=setInterval(()=>setN(Date.now()),1000); return()=>clearInterval(id)},[]); return n }
const isOnDay = (value: string | undefined, date: string) => value ? dayKey(new Date(value)) === date : false
const toLocalInput = (value?: string) => {
  const d = value ? new Date(value) : new Date()
  const pad = (n:number) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fallbackJobCode = (w: WorkItem) => `PP-${w.originWorkday.replaceAll('-','')}-${String(w.sequence).padStart(3,'0')}`

function WorkerPicker({ lead, setLead, helpers, setHelpers, single=false }: { lead:string; setLead:(v:string)=>void; helpers:string[]; setHelpers:(v:string[])=>void; single?:boolean }) {
  return <div className="worker-box"><label>主要執行者<select value={lead} onChange={e=>{setLead(e.target.value);setHelpers(helpers.filter(x=>x!==e.target.value))}}>{workers.map(w=><option key={w}>{w}</option>)}</select></label>{!single&&<div><small>協助人員</small><div className="chips">{workers.filter(w=>w!==lead).map(w=><button type="button" key={w} className={helpers.includes(w)?'chip active':'chip'} onClick={()=>setHelpers(helpers.includes(w)?helpers.filter(x=>x!==w):[...helpers,w])}>{w}</button>)}</div></div>}</div>
}

function TimeEditor({ work, stage, onClose }: { work:WorkItem; stage:StageRecord; onClose:()=>void }) {
  const save = usePackPilotStore(s=>s.updateStageTime)
  const first = stage.sessions[0]
  const [lead,setLead]=useState(stage.leadWorker||'韋')
  const [helpers,setHelpers]=useState(stage.helpers)
  const [start,setStart]=useState(toLocalInput(first?.startedAt ?? work.createdAt))
  const [end,setEnd]=useState(toLocalInput(first?.endedAt))
  const [minutes,setMinutes]=useState('')
  const [completed,setCompleted]=useState(stage.status==='completed' || stage.trackingMode==='manual')
  const applyMinutes = () => {
    const mins = Number(minutes)
    if (!Number.isFinite(mins) || mins <= 0) return
    const startDate = new Date(start)
    if (!Number.isFinite(startDate.getTime())) return
    setEnd(toLocalInput(new Date(startDate.getTime()+mins*60000).toISOString()))
  }
  const submit = () => {
    const a = new Date(start), b = new Date(end)
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a) { window.alert('請確認開始與結束時間，結束時間必須晚於開始時間。'); return }
    save(work.id, stage.stage, { startedAt:start, endedAt:end, leadWorker:lead, helpers, markCompleted:completed })
    onClose()
  }
  return <div className="inline-editor time-editor"><WorkerPicker lead={lead} setLead={setLead} helpers={helpers} setHelpers={setHelpers} single={stage.stage==='sorting'}/><div className="time-grid"><label>開始時間<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>結束時間<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>快速輸入耗時（分鐘）<div className="duration-input"><input type="number" min="1" value={minutes} onChange={e=>setMinutes(e.target.value)}/><button type="button" onClick={applyMinutes}>套用</button></div></label></div><label className="check-row"><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/>儲存後將此階段標記為完成</label><div className="editor-actions"><button onClick={onClose}>取消</button><button className="primary" onClick={submit}><Save size={16}/>儲存時間</button></div></div>
}

function StageRow({ work, stage, now }: { work:WorkItem; stage:StageRecord; now:number }) {
  const startStage=usePackPilotStore(s=>s.startStage), complete=usePackPilotStore(s=>s.completeStage), pause=usePackPilotStore(s=>s.pauseStage), resume=usePackPilotStore(s=>s.resumeStage)
  const [open,setOpen]=useState(false), [edit,setEdit]=useState(false), [lead,setLead]=useState(stage.leadWorker||'韋'), [helpers,setHelpers]=useState(stage.helpers)
  const isWait=stage.stage==='waiting-logistics'; const duration=isWait?waitingMs(stage,now):sessionMs(stage,now)
  const logisticsStart = isWait && stage.status==='waiting'
  const nextStage = work.deliveryType==='home-delivery'?'moving-hallway':'shipping'
  if (isWait) return <div className="stage-row waiting-row"><div><strong>{labels[stage.stage]}</strong><span>自動狀態 · 不計入效率</span></div><b>{stage.status==='waiting'?fmt(duration):stage.status==='completed'?'已結束':'尚未進入'}</b>{logisticsStart&&<button className="primary small" onClick={()=>setOpen(true)}><Play size={16}/>開始{labels[nextStage]}</button>}{open&&<div className="inline-editor"><WorkerPicker lead={lead} setLead={setLead} helpers={helpers} setHelpers={setHelpers}/><button className="primary" onClick={()=>{startStage(work.id,nextStage,lead,helpers);setOpen(false)}}>{lead==='韋'?'開始物流計時':'建立手動物流紀錄'}</button></div>}</div>
  const manualPending = stage.trackingMode==='manual' && stage.status==='paused' && stage.sessions.length===0
  return <div className={`stage-row status-${stage.status}`}><div><strong>{labels[stage.stage]}</strong><span>{stage.leadWorker?`主要：${stage.leadWorker}${stage.helpers.length?` · 協助：${stage.helpers.join('、')}`:''}`:'尚未指定'} · {stage.trackingMode==='automatic'?'自動':'手動'}</span></div><b>{manualPending?'待補登':fmt(duration)}</b><div className="stage-actions">{stage.status==='not-started'&&<button onClick={()=>setOpen(!open)}><Play size={16}/>開始</button>}{stage.status==='working'&&<><button onClick={()=>pause(work.id,stage.stage)}><Pause size={16}/>暫停</button><button className="done" onClick={()=>complete(work.id,stage.stage)}><Check size={16}/>完成</button></>}{stage.status==='paused'&&stage.trackingMode==='automatic'&&<button onClick={()=>resume(work.id,stage.stage)}><Play size={16}/>恢復</button>}{stage.status==='completed'&&<span className="done-label">已完成</span>}<button onClick={()=>setEdit(!edit)}><Edit3 size={16}/>{manualPending?'填寫時間':'調整時間'}</button></div>{open&&<div className="inline-editor"><WorkerPicker lead={lead} setLead={setLead} helpers={helpers} setHelpers={setHelpers} single={stage.stage==='sorting'}/><button className="primary" onClick={()=>{startStage(work.id,stage.stage,lead,helpers);setOpen(false); if(lead!=='韋')setEdit(true)}}>{lead==='韋'?'開始自動計時':'使用手動時間'}</button></div>}{edit&&<TimeEditor work={work} stage={stage} onClose={()=>setEdit(false)}/>}</div>
}

function WorkCard({ work, now }: { work:WorkItem; now:number }) {
  const resumeWork=usePackPilotStore(s=>s.resumeWork), suspend=usePackPilotStore(s=>s.suspendWork), cancel=usePackPilotStore(s=>s.cancelWork), del=usePackPilotStore(s=>s.deleteWork)
  const [open,setOpen]=useState(true)
  const core=work.stages.filter(s=>coreStages.includes(s.stage)).reduce((n,s)=>n+sessionMs(s,now),0), logistics=work.stages.filter(s=>logisticsStages.includes(s.stage)).reduce((n,s)=>n+sessionMs(s,now),0), waiting=work.stages.reduce((n,s)=>n+waitingMs(s,now),0)
  return <article className={`work-card ${work.status}`}><header><button className="card-title" onClick={()=>setOpen(!open)}><div><strong>{work.displayName}</strong><span>{work.jobCode ?? fallbackJobCode(work)} · {work.orderCount} 單 · {work.deliveryType==='home-delivery'?'宅配':work.deliveryType==='internal'?'內部':'超商'} · 建立 {work.originWorkday}{work.completedAt?` · 完成 ${dayKey(new Date(work.completedAt))}`:''}</span></div><ChevronDown className={open?'rotated':''}/></button><div className="status-pill">{work.status==='suspended'?'跨日待續':work.status==='waiting'?'等待物流':work.status==='completed'?'已完成':work.status==='cancelled'?'已取消':'進行中'}</div></header><div className="metrics"><span>核心作業 <b>{fmt(core)}</b></span><span>物流 <b>{fmt(logistics)}</b></span><span>等待 <b>{fmt(waiting)}</b></span></div>{work.status==='suspended'&&<div className="handoff"><div><strong>跨日待續</strong><span>擱置期間不計入效率，接續後才重新記錄工作時間。</span></div><button className="primary" onClick={()=>resumeWork(work.id)}><Play size={16}/>接續工作</button></div>}{open&&<div className="stage-list">{work.stages.map(s=><StageRow key={s.stage} work={work} stage={s} now={now}/>)}</div>}<footer><button onClick={()=>suspend(work.id)} disabled={['completed','cancelled','suspended'].includes(work.status)}><Clock3 size={15}/>擱置到下個工作日</button><button onClick={()=>cancel(work.id)} disabled={work.status==='cancelled'}><LogOut size={15}/>取消</button><button className="danger" onClick={()=>window.confirm('永久刪除？')&&del(work.id)}><Trash2 size={15}/>刪除</button></footer></article>
}

export default function App(){
  const works=usePackPilotStore(s=>s.works), inboundSessions=usePackPilotStore(s=>s.inboundSessions), workdays=usePackPilotStore(s=>s.workdays), audits=usePackPilotStore(s=>s.audits), add=usePackPilotStore(s=>s.addWork), startInbound=usePackPilotStore(s=>s.startInbound), completeInbound=usePackPilotStore(s=>s.completeInbound), endDay=usePackPilotStore(s=>s.endWorkday), reset=usePackPilotStore(s=>s.resetAll), now=useClock()
  const [tab,setTab]=useState<'today'|'log'|'report'>('today'), [form,setForm]=useState(false), [channel,setChannel]=useState<ChannelId>('shopee'), [delivery,setDelivery]=useState<DeliveryType>('convenience-store'), [orders,setOrders]=useState('1'), [lead,setLead]=useState('韋'), [helpers,setHelpers]=useState<string[]>([]), [note,setNote]=useState(''), [selectedDay,setSelectedDay]=useState(dayKey())
  const today=dayKey()
  const carry=works.filter(w=>w.status==='suspended')
  const current=works.filter(w=>w.currentWorkday===today && !['cancelled','suspended'].includes(w.status))
  const completeToday=works.filter(w=>isOnDay(w.completedAt,today) && w.status==='completed')
  const dayWorks=works.filter(w=>w.originWorkday===selectedDay||w.currentWorkday===selectedDay||isOnDay(w.completedAt,selectedDay)||w.suspensions.some(s=>s.fromWorkday===selectedDay||s.toWorkday===selectedDay))
  const totalOrders=completeToday.reduce((n,w)=>n+w.orderCount,0)
  const activeInbound=inboundSessions.find(s=>!s.endedAt)
  const inboundToday=inboundSessions.filter(s=>isOnDay(s.startedAt,today))
  const totalInbound=inboundToday.reduce((n,s)=>n+inboundMs(s.startedAt,s.endedAt,now),0)
  const selectedInbound=inboundSessions.filter(s=>isOnDay(s.startedAt,selectedDay))
  const selectedInboundMs=selectedInbound.reduce((n,s)=>n+inboundMs(s.startedAt,s.endedAt,now),0)
  const totalCore=works.reduce((n,w)=>n+w.stages.filter(s=>coreStages.includes(s.stage)).reduce((a,s)=>a+s.sessions.reduce((sum,x)=>sum+(isOnDay(x.endedAt??x.startedAt,today)?Math.max(0,Date.parse(x.endedAt??new Date(now).toISOString())-Date.parse(x.startedAt)):0),0),0),0)
  const channelStats = useMemo(()=>channels.map(c=>{
    const list=works.filter(w=>w.channelId===c.id)
    return { ...c, completed:list.filter(w=>w.status==='completed'&&isOnDay(w.completedAt,today)).reduce((n,w)=>n+w.orderCount,0), pending:list.filter(w=>['active','suspended'].includes(w.status)).reduce((n,w)=>n+w.orderCount,0), waiting:list.filter(w=>w.status==='waiting').reduce((n,w)=>n+w.orderCount,0) }
  }),[works,today])
  const report = useMemo(()=>{
    const lines=[`【${today} 工作回報】`,'']
    channelStats.forEach(c=>{ lines.push(`📦 ${c.label}`); lines.push(`完成：${c.completed} 單`); lines.push(`待續：${c.pending} 單`); lines.push(`等待物流：${c.waiting} 單`); lines.push('') })
    lines.push('──────────────')
    lines.push(`今日總完成：${totalOrders} 單`)
    lines.push(`完成工作：${completeToday.length} 筆`)
    lines.push(`跨日待續：${carry.length} 筆`)
    lines.push(`等待物流：${works.filter(w=>w.status==='waiting').length} 筆`)
    lines.push(`核心作業時間：${fmt(totalCore)}`)
    lines.push('')
    lines.push('📥 處理到貨')
    lines.push(`次數：${inboundToday.length} 次`)
    lines.push(`時間：${fmt(totalInbound)}`)
    return lines.join('\n')
  },[today,channelStats,totalOrders,completeToday.length,carry.length,works,totalCore,inboundToday.length,totalInbound])
  const submit=()=>{add({channelId:channel,deliveryType:delivery,orderCount:Number(orders)||0,leadWorker:lead,helpers,note});setForm(false);setNote('')}
  const beginInbound=()=>{
    const ownStage=works.some(w=>w.stages.some(s=>s.status==='working'&&s.leadWorker==='韋'))
    if(ownStage&&!window.confirm('你目前有一個自動計時中的工作。開始處理到貨後，該階段會先暫停，其他同事的工作不受影響。是否繼續？'))return
    startInbound()
  }
  const finishDay=()=>{
    const message=activeInbound?'目前仍在處理到貨。結束今天工作後，系統會以現在時間完成這次到貨計時，其他未完成訂單則轉為跨日待續。是否繼續？':'結束今天工作？所有未完成訂單會停止計時並轉為跨日待續。'
    if(window.confirm(message))endDay()
  }
  return <main className="app-shell"><header className="hero"><div><p className="eyebrow">PACKPILOT · V0.5.2 試作三</p><h1>訂單會收尾，到貨工時也不再隱形。</h1><p>{today} · 修正物流完成判定，新增處理到貨快速計時，並保留同事並行工作的現場彈性。</p></div><button className="icon" onClick={()=>window.confirm('清除所有試作資料？')&&reset()}><RotateCcw/></button></header>
  <nav className="tabs"><button className={tab==='today'?'active':''} onClick={()=>setTab('today')}><Clock3/>今日工作</button><button className={tab==='log'?'active':''} onClick={()=>setTab('log')}><CalendarDays/>工作日誌</button><button className={tab==='report'?'active':''} onClick={()=>setTab('report')}><ClipboardList/>工作回報</button></nav>
  {tab==='today'&&<><section className="summary-grid"><div><small>今日完成</small><strong>{totalOrders}</strong><span>{completeToday.length} 筆工作</span></div><div><small>核心作業</small><strong>{fmt(totalCore)}</strong><span>不含等待與擱置</span></div><div><small>跨日待續</small><strong>{carry.length}</strong><span>可直接接續</span></div><div><small>等待物流</small><strong>{works.filter(w=>w.status==='waiting').length}</strong><span>不計效率</span></div><div><small>處理到貨</small><strong>{fmt(totalInbound)}</strong><span>{inboundToday.length} 次</span></div></section>
  {carry.length>0&&<section><div className="section-title"><h2>跨日待續</h2><span>{carry.length}</span></div><div className="stack">{carry.map(w=><WorkCard key={w.id} work={w} now={now}/>)}</div></section>}
  <section className={`inbound-card ${activeInbound?'running':''}`}><div><PackageOpen/><div><strong>處理到貨</strong><span>{activeInbound?`已進行 ${fmt(inboundMs(activeInbound.startedAt,undefined,now))}`:`今天共 ${inboundToday.length} 次，${fmt(totalInbound)}`}</span></div></div>{activeInbound?<button className="done" onClick={completeInbound}><Check size={17}/>完成到貨</button>:<button className="primary" onClick={beginInbound}><Play size={17}/>開始處理到貨</button>}</section><div className="main-actions"><button className="new-work" onClick={()=>setForm(!form)}><Plus/>新增工作</button><button className="end-day" onClick={finishDay}><LogOut/>結束今天工作</button></div>
  {form&&<section className="create-panel"><label>通路<select value={channel} onChange={e=>setChannel(e.target.value as ChannelId)}>{channels.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>{channel!=='inventory-system'&&<><label>配送<select value={delivery} onChange={e=>setDelivery(e.target.value as DeliveryType)}><option value="convenience-store">超商</option><option value="home-delivery">宅配</option></select></label><label>單數<input type="number" min="0" value={orders} onChange={e=>setOrders(e.target.value)}/></label></>}<WorkerPicker lead={lead} setLead={setLead} helpers={helpers} setHelpers={setHelpers}/><p className="mode-note full">主要執行者為「韋」時自動計時；其他人建立後會顯示「待補登」，可輸入開始、結束或耗時。</p><label className="full">備註<input value={note} onChange={e=>setNote(e.target.value)}/></label><button className="primary full" onClick={submit}>建立工作</button></section>}
  <section><div className="section-title"><h2>今天的工作</h2><span>{current.length}</span></div><div className="stack">{current.length?current.map(w=><WorkCard key={w.id} work={w} now={now}/>):<div className="empty">今天尚未建立工作</div>}</div></section></>}
  {tab==='log'&&<section><div className="section-title"><h2>工作日誌</h2><span>{workdays.length}</span></div><div className="day-picker">{[...new Set([today,...workdays.map(d=>d.date),...works.map(w=>w.originWorkday),...works.flatMap(w=>w.completedAt?[dayKey(new Date(w.completedAt))]:[]),...inboundSessions.map(s=>dayKey(new Date(s.startedAt)))])].sort().reverse().map(d=><button className={selectedDay===d?'active':''} onClick={()=>setSelectedDay(d)} key={d}>{d}</button>)}</div><div className="day-summary"><span>完成 {works.filter(w=>w.status==='completed'&&isOnDay(w.completedAt,selectedDay)).reduce((n,w)=>n+w.orderCount,0)} 單</span><span>待續 {works.filter(w=>w.status==='suspended'&&w.suspensions.some(s=>s.fromWorkday===selectedDay)).length} 筆</span><span>等待物流 {works.filter(w=>w.status==='waiting'&&w.currentWorkday===selectedDay).length} 筆</span><span>到貨 {selectedInbound.length} 次／{fmt(selectedInboundMs)}</span></div>{selectedInbound.length>0&&<div className="inbound-log"><h3>處理到貨</h3>{selectedInbound.map(x=><p key={x.id}><span>{new Date(x.startedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})} ～ {x.endedAt?new Date(x.endedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}):'進行中'}</span><b>{fmt(inboundMs(x.startedAt,x.endedAt,now))}</b></p>)}</div>}<div className="stack">{dayWorks.length?dayWorks.map(w=><WorkCard key={w.id} work={w} now={now}/>):<div className="empty">這一天沒有紀錄</div>}</div><div className="audit"><h3>當日事件</h3>{audits.filter(a=>isOnDay(a.happenedAt,selectedDay)).length?audits.filter(a=>isOnDay(a.happenedAt,selectedDay)).map(a=><p key={a.id}><b>{a.action}</b><span>{a.detail}</span><small>{new Date(a.happenedAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</small></p>):<div className="empty">這一天沒有事件</div>}</div></section>}
  {tab==='report'&&<section><div className="section-title"><h2>今日工作回報</h2><span>即時同步</span></div><div className="channel-report-grid">{channelStats.map(c=><div key={c.id}><strong>{c.label}</strong><span>完成 <b>{c.completed}</b> 單</span><span>待續 <b>{c.pending}</b> 單</span><span>等待物流 <b>{c.waiting}</b> 單</span></div>)}</div><div className="report-inbound"><PackageOpen/><div><strong>處理到貨</strong><span>{inboundToday.length} 次 · {fmt(totalInbound)}</span></div></div><textarea readOnly value={report}/><button className="primary" onClick={()=>navigator.clipboard.writeText(report)}><Copy size={17}/>複製完整回報</button><p className="hint">所有通路都固定展示，即使今天是 0 單也不會消失。完成工作後會立即更新，不必先結束工作日。</p></section>}
  </main>
}
