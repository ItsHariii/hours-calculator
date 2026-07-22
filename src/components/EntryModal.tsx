import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clock3, FileText, Minus, Plus, Rows3, Trash2, X } from 'lucide-react'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { AppSettings, EntryDraft, WorkEntry } from '../types'
import { db, entryFromDraft, saveDrafts, updateEntry } from '../lib/db'
import { parseBulkInput } from '../lib/parser'
import { entryMinutes, formatMinutes, overlaps, parseDuration, todayIso } from '../lib/time'

type Mode = 'duration' | 'interval' | 'bulk'

interface EntryModalProps {
  open: boolean
  settings: AppSettings
  entries: WorkEntry[]
  existing?: WorkEntry
  onDelete: (entry: WorkEntry) => void
  onClose: () => void
}

const toLocalInput = (iso: string, timezone: string) => formatInTimeZone(iso, timezone, "yyyy-MM-dd'T'HH:mm")
const fromLocalInput = (value: string, timezone: string) => fromZonedTime(value, timezone).toISOString()

export function EntryModal({ open, settings, entries, existing, onDelete, onClose }: EntryModalProps) {
  const [mode, setMode] = useState<Mode>('duration')
  const [date, setDate] = useState(todayIso())
  const [duration, setDuration] = useState('8:00')
  const [startLocal, setStartLocal] = useState(`${todayIso()}T09:00`)
  const [endLocal, setEndLocal] = useState(`${todayIso()}T17:00`)
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [breakStart, setBreakStart] = useState('')
  const [breakEnd, setBreakEnd] = useState('')
  const [note, setNote] = useState('')
  const [bulk, setBulk] = useState('Mon–Fri 9–5, 30m lunch')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (existing) {
      setMode(existing.kind)
      setDate(existing.workDate)
      setNote(existing.note)
      if (existing.kind === 'duration') setDuration(formatMinutes(existing.durationMinutes))
      else {
        setStartLocal(toLocalInput(existing.startAt, existing.timezone))
        setEndLocal(toLocalInput(existing.endAt, existing.timezone))
        setBreakMinutes(String(existing.breakMinutes))
        setBreakStart(existing.breaks[0] ? toLocalInput(existing.breaks[0].startAt, existing.timezone) : '')
        setBreakEnd(existing.breaks[0] ? toLocalInput(existing.breaks[0].endAt, existing.timezone) : '')
      }
    } else {
      const today = todayIso()
      setMode('duration')
      setDate(today)
      setDuration('8:00')
      setStartLocal(`${today}T09:00`)
      setEndLocal(`${today}T17:00`)
      setBreakMinutes('0')
      setBreakStart('')
      setBreakEnd('')
      setNote('')
    }
  }, [existing, open])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  const parsed = useMemo(() => parseBulkInput(bulk, date, settings.timezone, settings.weekStartsOn), [bulk, date, settings.timezone, settings.weekStartsOn])
  const activeTimezone = existing?.timezone ?? settings.timezone
  const isOvernight = startLocal.slice(0, 10) !== endLocal.slice(0, 10)
  const durationMinutes = parseDuration(duration) ?? 0

  if (!open) return null

  function setDurationMinutes(minutes: number) {
    setDuration(formatMinutes(Math.max(0, minutes)))
  }

  function sharedDraft<T extends EntryDraft>(draft: T): T {
    return {
      ...draft,
      projectId: existing?.projectId,
      tagIds: existing?.tagIds ?? [],
      rateCents: existing?.rateCents ?? settings.defaultRateCents,
      note,
    }
  }

  async function save() {
    setError('')
    if (mode === 'bulk') {
      if (parsed.issues.length) return setError('Fix the highlighted lines before saving.')
      await saveDrafts(parsed.drafts.map((draft) => ({ ...draft, rateCents: settings.defaultRateCents, tagIds: [], note: draft.note || '' })), settings)
      onClose()
      return
    }

    let draft: EntryDraft
    if (mode === 'duration') {
      if (!durationMinutes) return setError('Choose at least one minute.')
      draft = sharedDraft({ kind: 'duration', workDate: date, durationMinutes, tagIds: [], note: '' })
    } else {
      if (!startLocal || !endLocal) return setError('Choose a start and end time.')
      const startAt = fromLocalInput(startLocal, activeTimezone)
      const endAt = fromLocalInput(endLocal, activeTimezone)
      if (new Date(endAt) <= new Date(startAt)) return setError('End time must be after start time. Change the end date for overnight work.')
      const genericBreak = Number(breakMinutes || 0)
      const breaks = []
      if (isOvernight && genericBreak > 0) {
        if (!breakStart || !breakEnd) return setError('Overnight shifts need exact break start and end times.')
        const preciseStart = fromLocalInput(breakStart, activeTimezone)
        const preciseEnd = fromLocalInput(breakEnd, activeTimezone)
        if (new Date(preciseStart) < new Date(startAt) || new Date(preciseEnd) > new Date(endAt) || new Date(preciseEnd) <= new Date(preciseStart)) return setError('The break must sit entirely inside the shift.')
        breaks.push({ startAt: preciseStart, endAt: preciseEnd })
      }
      draft = sharedDraft({ kind: 'interval', workDate: startLocal.slice(0, 10), startAt, endAt, breakMinutes: isOvernight ? 0 : genericBreak, breaks, tagIds: [], note: '' })
      const candidate = entryFromDraft(draft, settings)
      if (entryMinutes(candidate) <= 0) return setError('Break time must be shorter than the shift.')
      if (overlaps({ ...candidate, id: existing?.id ?? candidate.id }, entries) && !window.confirm('This overlaps an existing timed entry. Save it anyway?')) return
    }

    if (existing) {
      const replacement = entryFromDraft(draft, settings)
      await updateEntry({ ...replacement, id: existing.id, createdAt: existing.createdAt, timezone: existing.timezone, currency: existing.currency })
    } else await db.entries.add(entryFromDraft(draft, settings))
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="entry-modal" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <div className="sheet-handle" />
        <header className="modal-header"><h2 id="entry-title">{existing ? 'Edit entry' : 'Add entry'}</h2><button onClick={onClose} aria-label="Close"><X /></button></header>
        {!existing ? <div className="mode-tabs" role="tablist" aria-label="Entry type"><button className={mode === 'duration' ? 'active' : ''} onClick={() => setMode('duration')}><FileText size={15} />Duration</button><button className={mode === 'interval' ? 'active' : ''} onClick={() => setMode('interval')}><Clock3 size={15} />Range</button><button className={mode === 'bulk' ? 'active' : ''} onClick={() => setMode('bulk')}><Rows3 size={15} />Bulk</button></div> : null}

        <div className="modal-scroll">
          {mode !== 'bulk' ? <><div className="job-context"><i />Logging to <strong>{settings.jobName || 'Work'}</strong></div><label className="soft-field"><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you work on? (optional)" /></label><label className="soft-field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></> : null}

          {mode === 'duration' ? <section className="duration-editor"><span className="section-label">Duration</span><div className="duration-steppers"><div><span><button onClick={() => setDurationMinutes(durationMinutes - 60)} aria-label="Remove one hour"><Minus /></button><strong>{Math.floor(durationMinutes / 60)}</strong><button onClick={() => setDurationMinutes(durationMinutes + 60)} aria-label="Add one hour"><Plus /></button></span><small>Hours</small></div><div><span><button onClick={() => setDurationMinutes(durationMinutes - 5)} aria-label="Remove five minutes"><Minus /></button><strong>{durationMinutes % 60}</strong><button onClick={() => setDurationMinutes(durationMinutes + 5)} aria-label="Add five minutes"><Plus /></button></span><small>Minutes</small></div></div><div className="duration-presets">{[30, 60, 240, 450, 480].map((minutes) => <button className={durationMinutes === minutes ? 'active' : ''} key={minutes} onClick={() => setDurationMinutes(minutes)}>{formatMinutes(minutes)}</button>)}</div></section> : null}

          {mode === 'interval' ? <div className="range-editor"><div className="two-fields"><label className="soft-field"><span>Start</span><input type="datetime-local" value={startLocal} onChange={(event) => setStartLocal(event.target.value)} /></label><label className="soft-field"><span>End</span><input type="datetime-local" value={endLocal} onChange={(event) => setEndLocal(event.target.value)} /></label></div><label className="soft-field"><span>Unpaid break · minutes</span><input type="number" min="0" value={breakMinutes} onChange={(event) => setBreakMinutes(event.target.value)} /></label>{isOvernight && Number(breakMinutes) > 0 ? <div className="two-fields"><label className="soft-field"><span>Break starts</span><input type="datetime-local" value={breakStart} onChange={(event) => setBreakStart(event.target.value)} /></label><label className="soft-field"><span>Break ends</span><input type="datetime-local" value={breakEnd} onChange={(event) => setBreakEnd(event.target.value)} /></label></div> : null}</div> : null}

          {mode === 'bulk' ? <div className="bulk-panel"><label className="soft-field"><span>Paste several days</span><textarea rows={6} value={bulk} onChange={(event) => setBulk(event.target.value)} /></label><p>Try “Mon–Fri 9–5, 30m lunch”, “Tue 8h”, or one entry per line.</p><label className="soft-field anchor-field"><span>Week containing</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><div className="parse-review"><div className="review-heading"><strong>Review</strong><span>{parsed.drafts.length} entries</span></div>{parsed.drafts.map((draft, index) => <div className="parsed-row" key={`${draft.workDate}-${index}`}><Check size={15} /><span>{draft.workDate}</span><strong>{draft.kind === 'duration' ? formatMinutes(draft.durationMinutes) : `${formatInTimeZone(draft.startAt, settings.timezone, 'h:mm a')}–${formatInTimeZone(draft.endAt, settings.timezone, 'h:mm a')}`}</strong></div>)}{[...parsed.issues, ...parsed.warnings].map((issue, index) => <div className={`parse-issue ${parsed.issues.includes(issue) ? 'error' : 'warning'}`} key={`${issue.line}-${index}`}><AlertTriangle size={15} /><span>Line {issue.line}: {issue.message}</span></div>)}</div></div> : null}
          {error ? <div className="form-error"><AlertTriangle size={16} />{error}</div> : null}
        </div>
        <footer className="modal-footer">{existing ? <button className="delete-action" onClick={() => { onDelete(existing); onClose() }}><Trash2 size={16} /> Delete</button> : <button className="cancel-action" onClick={onClose}>Cancel</button>}<button className="save-action" onClick={save}>{existing ? 'Save changes' : mode === 'bulk' ? `Save ${parsed.drafts.length} entries` : 'Save entry'}</button></footer>
      </section>
    </div>
  )
}
