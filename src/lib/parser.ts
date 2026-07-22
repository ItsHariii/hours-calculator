import { addDays, format, parse, parseISO, startOfWeek, subDays } from 'date-fns'
import type { EntryDraft, ParseIssue, ParseResult } from '../types'
import { dateTimeToIso, parseDuration, todayIso } from './time'

const DAY_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

const DATE_TOKEN = '(today|yesterday|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)'

function resolveDate(token: string, anchorDate: string, weekStartsOn: 0 | 1) {
  const normalized = token.toLowerCase()
  if (normalized === 'today') return todayIso()
  if (normalized === 'yesterday') return format(subDays(new Date(), 1), 'yyyy-MM-dd')
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const parsed = parseISO(normalized)
    return Number.isNaN(parsed.getTime()) ? null : format(parsed, 'yyyy-MM-dd')
  }
  if (/^\d{1,2}\/\d{1,2}/.test(normalized)) {
    const hasYear = normalized.split('/').length === 3
    const parsed = parse(normalized, hasYear ? 'M/d/yyyy' : 'M/d', parseISO(anchorDate))
    return Number.isNaN(parsed.getTime()) ? null : format(parsed, 'yyyy-MM-dd')
  }
  const index = DAY_INDEX[normalized]
  if (index === undefined) return null
  const weekStart = startOfWeek(parseISO(anchorDate), { weekStartsOn })
  const offset = (index - weekStartsOn + 7) % 7
  return format(addDays(weekStart, offset), 'yyyy-MM-dd')
}

interface ParsedTime {
  minutes: number
  explicitMeridian: boolean
}

function parseClock(value: string): ParsedTime | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridian = match[3]
  if (minute > 59 || hour > 24) return null
  if (meridian) {
    if (hour < 1 || hour > 12) return null
    if (meridian.startsWith('p') && hour !== 12) hour += 12
    if (meridian.startsWith('a') && hour === 12) hour = 0
  }
  return { minutes: hour * 60 + minute, explicitMeridian: Boolean(meridian) }
}

function clockString(totalMinutes: number) {
  const withinDay = totalMinutes % 1440
  return `${Math.floor(withinDay / 60).toString().padStart(2, '0')}:${(withinDay % 60).toString().padStart(2, '0')}`
}

function breakMinutesFrom(value: string) {
  const match = value.match(/(?:(\d+)\s*(?:m|min|mins|minute|minutes)\s*(?:break|lunch)|(?:break|lunch)(?:\s+of)?\s*(\d+)\s*(?:m|min|mins|minute|minutes))/i)
  return match ? Number(match[1] ?? match[2]) : 0
}

function parseLine(
  source: string,
  line: number,
  anchorDate: string,
  timezone: string,
  weekStartsOn: 0 | 1,
): { drafts: EntryDraft[]; issues: ParseIssue[]; warnings: ParseIssue[] } {
  const issues: ParseIssue[] = []
  const warnings: ParseIssue[] = []
  const drafts: EntryDraft[] = []
  const repeat = source.match(new RegExp(`^${DATE_TOKEN}\\s*(?:-|–|to)\\s*${DATE_TOKEN}\\s+(.+)$`, 'i'))

  if (repeat && DAY_INDEX[repeat[1].toLowerCase()] !== undefined && DAY_INDEX[repeat[2].toLowerCase()] !== undefined) {
    const startIndex = DAY_INDEX[repeat[1].toLowerCase()]
    const endIndex = DAY_INDEX[repeat[2].toLowerCase()]
    if (endIndex < startIndex) {
      issues.push({ line, source, message: 'Weekday ranges must move forward within one week.' })
      return { drafts, issues, warnings }
    }
    for (let index = startIndex; index <= endIndex; index += 1) {
      const dayName = Object.keys(DAY_INDEX).find((key) => key.length === 3 && DAY_INDEX[key] === index)!
      const result = parseLine(`${dayName} ${repeat[3]}`, line, anchorDate, timezone, weekStartsOn)
      drafts.push(...result.drafts)
      issues.push(...result.issues)
      warnings.push(...result.warnings)
    }
    return { drafts, issues, warnings }
  }

  const dated = source.match(new RegExp(`^${DATE_TOKEN}\\s+(.+)$`, 'i'))
  if (!dated) {
    issues.push({ line, source, message: 'Start with a date or weekday, such as “Mon 9-5” or “2026-07-22 8h”.' })
    return { drafts, issues, warnings }
  }
  const workDate = resolveDate(dated[1], anchorDate, weekStartsOn)
  if (!workDate) {
    issues.push({ line, source, message: 'The date could not be understood.' })
    return { drafts, issues, warnings }
  }

  const rest = dated[2].trim()
  const range = rest.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)(.*)$/i)
  if (range) {
    const start = parseClock(range[1])
    const end = parseClock(range[2])
    if (!start || !end) {
      issues.push({ line, source, message: 'One of the times is invalid.' })
      return { drafts, issues, warnings }
    }
    let endMinutes = end.minutes
    if (!start.explicitMeridian && !end.explicitMeridian && endMinutes <= start.minutes && start.minutes < 12 * 60 && endMinutes <= 7 * 60) {
      endMinutes += 12 * 60
    }
    let overnight = false
    if (endMinutes <= start.minutes) {
      endMinutes += 24 * 60
      overnight = true
    }
    const breakMinutes = breakMinutesFrom(range[3])
    if (overnight && breakMinutes > 0) {
      issues.push({ line, source, message: 'An overnight shift needs exact break times. Add it with the time-range form.' })
      return { drafts, issues, warnings }
    }
    const endDate = endMinutes >= 1440 ? format(addDays(parseISO(workDate), 1), 'yyyy-MM-dd') : workDate
    drafts.push({
      kind: 'interval',
      workDate,
      startAt: dateTimeToIso(workDate, clockString(start.minutes), timezone),
      endAt: dateTimeToIso(endDate, clockString(endMinutes), timezone),
      breakMinutes,
      breaks: [],
      tagIds: [],
      note: '',
    })
    if (!start.explicitMeridian && !end.explicitMeridian) {
      warnings.push({ line, source, message: `Read as ${clockString(start.minutes)}–${clockString(endMinutes)}.` })
    }
    return { drafts, issues, warnings }
  }

  const duration = parseDuration(rest)
  if (duration) {
    drafts.push({ kind: 'duration', workDate, durationMinutes: duration, tagIds: [], note: '' })
    return { drafts, issues, warnings }
  }

  issues.push({ line, source, message: 'Use a duration such as “8h 30m” or a time range such as “9:00-5:30”.' })
  return { drafts, issues, warnings }
}

export function parseBulkInput(
  text: string,
  anchorDate: string,
  timezone: string,
  weekStartsOn: 0 | 1,
): ParseResult {
  const normalized = text.replace(
    /,\s*(?=(?:today|yesterday|sun|mon|tue|wed|thu|fri|sat|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2})\b)/gi,
    '\n',
  )
  const lines = normalized.split(/\n|;/).map((line) => line.trim()).filter(Boolean)
  const result: ParseResult = { drafts: [], issues: [], warnings: [] }
  lines.forEach((source, index) => {
    const parsed = parseLine(source.replace(/,$/, ''), index + 1, anchorDate, timezone, weekStartsOn)
    result.drafts.push(...parsed.drafts)
    result.issues.push(...parsed.issues)
    result.warnings.push(...parsed.warnings)
  })
  if (!lines.length) result.issues.push({ line: 0, source: '', message: 'Enter at least one line.' })
  return result
}
