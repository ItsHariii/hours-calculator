import { Copy, Pencil, Trash2 } from 'lucide-react'
import type { AppSettings, WorkEntry } from '../types'
import { entryMinutes, formatEntryTime, formatMinutes } from '../lib/time'

interface EntryRowProps {
  entry: WorkEntry
  settings: AppSettings
  onEdit: (entry: WorkEntry) => void
  onDuplicate: (entry: WorkEntry) => void
  onDelete: (entry: WorkEntry) => void
  showDate?: boolean
  displayMinutes?: number
}

export function EntryRow({ entry, settings, onEdit, onDuplicate, onDelete, showDate = true, displayMinutes }: EntryRowProps) {
  const minutes = displayMinutes ?? entryMinutes(entry)
  const label = entry.note.trim() || (entry.kind === 'interval' ? 'Work shift' : 'Hours worked')
  const detail = entry.kind === 'interval'
    ? `${formatEntryTime(entry.startAt, settings, entry.timezone)}–${formatEntryTime(entry.endAt, settings, entry.timezone)}`
    : settings.jobName || 'Work'

  return (
    <article className="work-row">
      <span className="work-dot" />
      <button className="work-row-main" onClick={() => onEdit(entry)}>
        <span><strong>{label}</strong><small>{showDate ? `${entry.workDate} · ${detail}` : detail}</small></span>
        <b>{formatMinutes(minutes)}</b>
      </button>
      <div className="row-actions">
        <button onClick={() => onEdit(entry)} aria-label="Edit entry"><Pencil size={15} /></button>
        <button onClick={() => onDuplicate(entry)} aria-label="Duplicate entry"><Copy size={15} /></button>
        <button onClick={() => onDelete(entry)} aria-label="Delete entry"><Trash2 size={15} /></button>
      </div>
    </article>
  )
}
