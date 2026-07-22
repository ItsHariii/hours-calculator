import { ChevronRight, MapPin, Plus } from 'lucide-react'
import type { AppSettings, TimerState, WorkEntry } from '../types'
import { allocateEntryByDay, buildReport, formatMinutes, presetRange, todayIso } from '../lib/time'
import { EntryRow } from './EntryRow'
import { TimerCard } from './TimerCard'
import type { WorkplaceAutomationStatus } from '../hooks/useWorkplaceAutomation'
import { workLocationById } from '../lib/geofence'

interface TodayViewProps {
  settings: AppSettings
  entries: WorkEntry[]
  timer?: TimerState
  workplaceStatus: WorkplaceAutomationStatus
  onAdd: () => void
  onQuickLog: (minutes: number, note: string) => void
  onEdit: (entry: WorkEntry) => void
  onDuplicate: (entry: WorkEntry) => void
  onDelete: (entry: WorkEntry) => void
  onOpenTimesheet: () => void
  onOpenSettings: () => void
}

const QUICK_LOGS = [
  { label: 'Full shift', sub: '8 hours', minutes: 480 },
  { label: 'Half shift', sub: '4 hours', minutes: 240 },
  { label: '+ 1 hour', sub: 'Quick adjustment', minutes: 60 },
  { label: '30 minutes', sub: 'Short work block', minutes: 30 },
]

export function TodayView({ settings, entries, timer, workplaceStatus, onAdd, onQuickLog, onEdit, onDuplicate, onDelete, onOpenTimesheet, onOpenSettings }: TodayViewProps) {
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
  const currentWorkplace = workLocationById(workplaceStatus.locationId)
  const workplaceTitle = workplaceStatus.state === 'inside' && currentWorkplace
    ? `At ${currentWorkplace.shortAddress}`
    : workplaceStatus.state === 'denied'
      ? 'Location permission needed'
      : workplaceStatus.state === 'low-accuracy'
        ? 'Improving location accuracy'
        : workplaceStatus.state === 'checking'
          ? 'Checking your location'
          : workplaceStatus.state === 'error' || workplaceStatus.state === 'unavailable'
            ? 'Location check unavailable'
            : 'Watching both workplaces'

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

      {settings.locationAutomationEnabled ? (
        <button className={`workplace-status-strip ${workplaceStatus.state}`} onClick={onOpenSettings}>
          <span className="workplace-status-icon"><MapPin size={17} /></span>
          <span><strong>{workplaceTitle}</strong><small>{workplaceStatus.detail || (timer?.source === 'workplace' ? 'This shift will finish when you leave.' : 'Arrival and departure logging is on.')}</small></span>
          <ChevronRight size={17} />
        </button>
      ) : null}

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
