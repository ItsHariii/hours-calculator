import { useState } from 'react'
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AppSettings, WorkEntry } from '../types'
import { allocateEntryByDay, buildReport, formatDisplayDate, formatMinutes } from '../lib/time'
import { EntryRow } from './EntryRow'

interface TimesheetViewProps {
  settings: AppSettings
  entries: WorkEntry[]
  onAdd: () => void
  onEdit: (entry: WorkEntry) => void
  onDuplicate: (entry: WorkEntry) => void
  onDelete: (entry: WorkEntry) => void
}

export function TimesheetView({ settings, entries, onAdd, onEdit, onDuplicate, onDelete }: TimesheetViewProps) {
  const [anchor, setAnchor] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const weekStart = startOfWeek(parseISO(anchor), { weekStartsOn: settings.weekStartsOn })
  const dates = Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), 'yyyy-MM-dd'))
  const report = buildReport(entries, { startDate: dates[0], endDate: dates[6], grouping: 'day', projectIds: [], tagIds: [] }, settings)
  const targetMinutes = Math.max(1, settings.weeklyTargetHours * 60)

  return (
    <div className="mobile-page page-reveal">
      <header className="screen-title"><h1>Timesheet</h1></header>
      <section className="week-picker">
        <button onClick={() => setAnchor(format(addWeeks(weekStart, -1), 'yyyy-MM-dd'))} aria-label="Previous week"><ChevronLeft /></button>
        <div><strong>Week of {formatDisplayDate(dates[0], settings.locale, { year: undefined })}</strong><small>{formatDisplayDate(dates[0], settings.locale)} – {formatDisplayDate(dates[6], settings.locale, { year: undefined })}</small></div>
        <button onClick={() => setAnchor(format(addWeeks(weekStart, 1), 'yyyy-MM-dd'))} aria-label="Next week"><ChevronRight /></button>
      </section>

      <section className="sheet-summary">
        <div><strong>{formatMinutes(report.totalMinutes)}</strong><em>hours logged</em></div>
        <div className="progress-track"><i style={{ width: `${Math.min(100, (report.totalMinutes / targetMinutes) * 100)}%` }} /></div>
        <small>{formatMinutes(Math.max(0, targetMinutes - report.totalMinutes))} remaining toward {settings.weeklyTargetHours}h</small>
      </section>

      <section className="sheet-days">
        {dates.map((date) => {
          const day = report.days.find((item) => item.date === date)
          const dayEntries = entries
            .map((entry) => ({ entry, minutes: allocateEntryByDay(entry).get(date) ?? 0 }))
            .filter((item) => item.minutes > 0)
          return (
            <article className="sheet-day" key={date}>
              <header><h2>{formatDisplayDate(date, settings.locale, { month: undefined, day: undefined, year: undefined, weekday: 'long' })} <span>{formatDisplayDate(date, settings.locale, { year: undefined, weekday: undefined })}</span></h2><strong>{formatMinutes(day?.minutes ?? 0)}</strong></header>
              {dayEntries.length ? <div>{dayEntries.map(({ entry, minutes }) => <EntryRow key={entry.id} entry={entry} displayMinutes={minutes} settings={settings} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} showDate={false} />)}</div> : <button className="empty-day" onClick={onAdd}><Plus size={14} /> Add hours</button>}
            </article>
          )
        })}
      </section>
    </div>
  )
}
