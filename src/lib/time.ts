import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type {
  AppSettings,
  IntervalEntry,
  ReportDay,
  ReportGroup,
  ReportQuery,
  ReportResult,
  WorkEntry,
} from '../types'

export const todayIso = () => format(new Date(), 'yyyy-MM-dd')

export function toDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function parseDuration(value: string): number | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  if (/^\d{1,3}:\d{1,2}$/.test(normalized)) {
    const [hours, minutes] = normalized.split(':').map(Number)
    if (minutes >= 60) return null
    return hours * 60 + minutes
  }

  const hoursMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  const minutesMatch = normalized.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/)
  if (!hoursMatch && !minutesMatch) {
    const decimal = Number(normalized)
    return Number.isFinite(decimal) && decimal > 0 ? Math.round(decimal * 60) : null
  }

  const hours = hoursMatch ? Number(hoursMatch[1]) : 0
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0
  const total = Math.round(hours * 60 + minutes)
  return total > 0 ? total : null
}

export function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function formatDecimalHours(minutes: number) {
  return (minutes / 60).toFixed(2)
}

export const payCentsFor = (minutes: number, rateCents?: number) =>
  rateCents ? Math.round((minutes * rateCents) / 60) : 0

export function formatMoney(cents: number, currency: string, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatDisplayDate(date: string, locale = 'en-US', options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatEntryTime(iso: string, settings: AppSettings, timezone = settings.timezone) {
  return new Intl.DateTimeFormat(settings.locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.timeFormat === '12',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function dateTimeToIso(date: string, time: string, timezone: string) {
  return fromZonedTime(`${date}T${time.length === 5 ? `${time}:00` : time}`, timezone).toISOString()
}

export function isoToDateTimeLocal(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, "yyyy-MM-dd'T'HH:mm")
}

export function entryMinutes(entry: WorkEntry) {
  if (entry.kind === 'duration') return entry.durationMinutes
  const gross = Math.round((new Date(entry.endAt).getTime() - new Date(entry.startAt).getTime()) / 60_000)
  const preciseBreaks = entry.breaks.reduce(
    (sum, item) => sum + Math.round((new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000),
    0,
  )
  return Math.max(0, gross - entry.breakMinutes - preciseBreaks)
}

function splitIntervalByLocalDay(
  startAt: string,
  endAt: string,
  timezone: string,
  multiplier = 1,
) {
  const result = new Map<string, number>()
  let cursor = new Date(startAt)
  const end = new Date(endAt)

  while (cursor < end) {
    const date = formatInTimeZone(cursor, timezone, 'yyyy-MM-dd')
    const nextDate = format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
    const nextMidnight = fromZonedTime(`${nextDate}T00:00:00`, timezone)
    const segmentEnd = nextMidnight < end ? nextMidnight : end
    const minutes = Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000) * multiplier
    result.set(date, (result.get(date) ?? 0) + minutes)
    cursor = segmentEnd
  }
  return result
}

export function allocateEntryByDay(entry: WorkEntry) {
  if (entry.kind === 'duration') return new Map([[entry.workDate, entry.durationMinutes]])

  const allocated = splitIntervalByLocalDay(entry.startAt, entry.endAt, entry.timezone)
  for (const item of entry.breaks) {
    const breakAllocation = splitIntervalByLocalDay(item.startAt, item.endAt, entry.timezone, -1)
    for (const [date, minutes] of breakAllocation) {
      allocated.set(date, (allocated.get(date) ?? 0) + minutes)
    }
  }
  if (entry.breakMinutes) {
    allocated.set(entry.workDate, (allocated.get(entry.workDate) ?? 0) - entry.breakMinutes)
  }
  for (const [date, minutes] of allocated) allocated.set(date, Math.max(0, minutes))
  return allocated
}

export function overlaps(entry: WorkEntry, others: WorkEntry[]) {
  if (entry.kind !== 'interval') return false
  const start = new Date(entry.startAt).getTime()
  const end = new Date(entry.endAt).getTime()
  return others.some((other) => {
    if (other.id === entry.id || other.deletedAt || other.kind !== 'interval') return false
    return start < new Date(other.endAt).getTime() && end > new Date(other.startAt).getTime()
  })
}

function groupKey(date: string, query: ReportQuery, weekStartsOn: 0 | 1) {
  const parsed = parseISO(date)
  if (query.grouping === 'week') return format(startOfWeek(parsed, { weekStartsOn }), 'yyyy-MM-dd')
  if (query.grouping === 'month') return format(startOfMonth(parsed), 'yyyy-MM-dd')
  return date
}

function groupLabel(key: string, grouping: ReportQuery['grouping'], locale: string) {
  if (grouping === 'day') return formatDisplayDate(key, locale, { weekday: 'short' })
  if (grouping === 'week') return `Week of ${formatDisplayDate(key, locale, { year: undefined })}`
  return formatDisplayDate(key, locale, { day: undefined })
}

export function buildReport(
  entries: WorkEntry[],
  query: ReportQuery,
  settings: AppSettings,
): ReportResult {
  const filtered = entries.filter((entry) => {
    if (entry.deletedAt) return false
    if (query.projectIds.length && (!entry.projectId || !query.projectIds.includes(entry.projectId))) return false
    if (query.tagIds.length && !query.tagIds.every((tagId) => entry.tagIds.includes(tagId))) return false
    const allocation = allocateEntryByDay(entry)
    return [...allocation.keys()].some((date) => date >= query.startDate && date <= query.endDate)
  })

  const daysMap = new Map<string, ReportDay>()
  for (const entry of filtered) {
    const allocation = allocateEntryByDay(entry)
    for (const [date, minutes] of allocation) {
      if (date < query.startDate || date > query.endDate || minutes <= 0) continue
      const existing = daysMap.get(date) ?? { date, minutes: 0, payCents: 0, entryIds: [] }
      existing.minutes += minutes
      existing.payCents += payCentsFor(minutes, entry.rateCents ?? settings.defaultRateCents)
      if (!existing.entryIds.includes(entry.id)) existing.entryIds.push(entry.id)
      daysMap.set(date, existing)
    }
  }

  const days = [...daysMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const groupsMap = new Map<string, ReportGroup>()
  for (const day of days) {
    const key = groupKey(day.date, query, settings.weekStartsOn)
    const existing = groupsMap.get(key) ?? {
      key,
      label: groupLabel(key, query.grouping, settings.locale),
      minutes: 0,
      payCents: 0,
      days: [],
    }
    existing.minutes += day.minutes
    existing.payCents += day.payCents
    existing.days.push(day)
    groupsMap.set(key, existing)
  }

  const totalMinutes = days.reduce((sum, day) => sum + day.minutes, 0)
  const totalPayCents = days.reduce((sum, day) => sum + day.payCents, 0)
  return {
    query,
    days,
    groups: [...groupsMap.values()],
    entries: filtered,
    totalMinutes,
    totalPayCents,
    workedDays: days.length,
    averageMinutes: days.length ? Math.round(totalMinutes / days.length) : 0,
  }
}

export function presetRange(
  preset: 'today' | 'this-week' | 'last-week' | 'this-month' | 'last-month',
  weekStartsOn: 0 | 1,
) {
  const now = new Date()
  if (preset === 'today') return { startDate: toDateInput(now), endDate: toDateInput(now) }
  if (preset === 'this-week') {
    return {
      startDate: toDateInput(startOfWeek(now, { weekStartsOn })),
      endDate: toDateInput(endOfWeek(now, { weekStartsOn })),
    }
  }
  if (preset === 'last-week') {
    const last = subWeeks(now, 1)
    return {
      startDate: toDateInput(startOfWeek(last, { weekStartsOn })),
      endDate: toDateInput(endOfWeek(last, { weekStartsOn })),
    }
  }
  const month = preset === 'last-month' ? subMonths(now, 1) : now
  return { startDate: toDateInput(startOfMonth(month)), endDate: toDateInput(endOfMonth(month)) }
}

export function intervalIsOvernight(entry: IntervalEntry) {
  return formatInTimeZone(entry.startAt, entry.timezone, 'yyyy-MM-dd') !== formatInTimeZone(entry.endAt, entry.timezone, 'yyyy-MM-dd')
}
