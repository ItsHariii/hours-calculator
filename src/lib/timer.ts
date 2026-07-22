import { formatInTimeZone } from 'date-fns-tz'
import type { AppSettings, Project, TimerState, WorkEntry } from '../types'
import { db } from './db'

export async function startTimer(settings: AppSettings, project?: Project, note = '') {
  const timer: TimerState = {
    id: 'active',
    startAt: new Date().toISOString(),
    timezone: settings.timezone,
    projectId: project?.id,
    tagIds: [],
    note,
    rateCents: project?.defaultRateCents ?? settings.defaultRateCents,
    currency: settings.currency,
    breaks: [],
  }
  await db.timers.put(timer)
  return timer
}

export async function pauseTimer(timer: TimerState) {
  if (timer.breakStartedAt) return
  await db.timers.put({ ...timer, breakStartedAt: new Date().toISOString() })
}

export async function resumeTimer(timer: TimerState) {
  if (!timer.breakStartedAt) return
  await db.timers.put({
    ...timer,
    breakStartedAt: undefined,
    breaks: [...timer.breaks, { startAt: timer.breakStartedAt, endAt: new Date().toISOString() }],
  })
}

export function timerElapsedMinutes(timer: TimerState, at = new Date()) {
  const gross = (at.getTime() - new Date(timer.startAt).getTime()) / 60_000
  const closedBreaks = timer.breaks.reduce(
    (sum, item) => sum + (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000,
    0,
  )
  const activeBreak = timer.breakStartedAt ? (at.getTime() - new Date(timer.breakStartedAt).getTime()) / 60_000 : 0
  return Math.max(0, Math.floor(gross - closedBreaks - activeBreak))
}

export async function stopTimer(timer: TimerState): Promise<WorkEntry | null> {
  const endAt = new Date().toISOString()
  const breaks = timer.breakStartedAt
    ? [...timer.breaks, { startAt: timer.breakStartedAt, endAt }]
    : timer.breaks
  const gross = Math.round((new Date(endAt).getTime() - new Date(timer.startAt).getTime()) / 60_000)
  const breakMinutes = breaks.reduce(
    (sum, item) => sum + Math.round((new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000),
    0,
  )
  await db.timers.delete('active')
  if (gross - breakMinutes < 1) return null
  const timestamp = new Date().toISOString()
  const entry: WorkEntry = {
    id: crypto.randomUUID(),
    kind: 'interval',
    workDate: formatInTimeZone(timer.startAt, timer.timezone, 'yyyy-MM-dd'),
    timezone: timer.timezone,
    startAt: timer.startAt,
    endAt,
    breakMinutes: 0,
    breaks,
    projectId: timer.projectId,
    tagIds: timer.tagIds,
    note: timer.note,
    rateCents: timer.rateCents,
    currency: timer.currency,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.entries.add(entry)
  return entry
}
