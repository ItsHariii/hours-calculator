import { Plus } from 'lucide-react'
import type { AppSettings, TimerState, WorkEntry } from '../types'
import { allocateEntryByDay, buildReport, formatMinutes, presetRange, todayIso } from '../lib/time'
import { EntryRow } from './EntryRow'
import { TimerCard } from './TimerCard'

interface TodayViewProps {
  settings: AppSettings
  entries: WorkEntry[]
  timer?: TimerState
  onAdd: () => void
  onQuickLog: (minutes: number, note: string) => void
  onEdit: (entry: WorkEntry) => void
  onDuplicate: (entry: WorkEntry) => void
  onDelete: (entry: WorkEntry) => void
  onOpenTimesheet: () => void
}

const QUICK_LOGS = [
  { label: 'Full shift', sub: '8 hours', minutes: 480 },
  { label: 'Half shift', sub: '4 hours', minutes: 240 },
  { label: '+ 1 hour', sub: 'Quick adjustment', minutes: 60 },
  { label: '30 minutes', sub: 'Short work block', minutes: 30 },
]

export function TodayView({ settings, entries, timer, onAdd, onQuickLog, onEdit, onDuplicate, onDelete, onOpenTimesheet }: TodayViewProps) {
  const today = todayIso()
  const weekRange = presetRange('this-week', settings.weekStartsOn)
  const week = buildReport(entries, { ...weekRange, grouping: 'day', projectIds: [], tagIds: [] }, settings)
  const todayAllocation = entries
    .map((entry) => ({ entry, minutes: allocateEntryByDay(entry).get(today) ?? 0 }))
    .filter((item) => item.minutes > 0)
  const todayMinutes = todayAllocation.reduce((sum, item) => sum + item.minutes, 0)
  const targetMinutes = Math.max(1, settings.weeklyTargetHours * 60)
  const progress = Math.min(100, (week.totalMinutes / targetMinutes) * 100)
  const remaining = Math.max(0, targetMinutes - week.totalMinutes)

  return (
    <div className="mobile-page page-reveal">
      <header className="today-header">
        <div><span className="overline">Today</span><h1>{new Intl.DateTimeFormat(settings.locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</h1></div>
        <div className="script-logo">Hours<br />Ledger</div>
      </header>

      <section className="week-progress">
        <div><span>This week</span><strong>{formatMinutes(week.totalMinutes)} <em>· {formatMinutes(remaining)} left</em></strong></div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
      </section>

      <TimerCard timer={timer} settings={settings} />

      <section className="quick-log-section">
        <span className="section-label">Quick log to {settings.jobName || 'Work'}</span>
        <div className="quick-log-grid">
          {QUICK_LOGS.map((item) => <button key={item.label} onClick={() => onQuickLog(item.minutes, item.label)}><strong>{item.label}</strong><small>{item.sub}</small></button>)}
        </div>
        <button className="custom-log-link" onClick={onAdd}><Plus size={15} /> Custom entry</button>
      </section>

      <section className="today-entries">
        <div className="simple-section-heading"><h2>Logged today</h2><button onClick={onOpenTimesheet}>{formatMinutes(todayMinutes)}</button></div>
        {todayAllocation.length ? (
          <div className="soft-list">{todayAllocation.map(({ entry, minutes }) => <EntryRow key={entry.id} entry={entry} displayMinutes={minutes} settings={settings} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} showDate={false} />)}</div>
        ) : (
          <div className="gentle-empty">Nothing logged yet — clock in or use quick log above.</div>
        )}
      </section>
    </div>
  )
}
