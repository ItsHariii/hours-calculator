import { describe, expect, it } from 'vitest'
import type { AppSettings, WorkEntry } from '../types'
import { allocateEntryByDay, buildReport, dateTimeToIso, entryMinutes, parseDuration } from './time'

const settings: AppSettings = {
  id: 'settings',
  displayName: '',
  jobName: 'Work',
  weeklyTargetHours: 40,
  weekStartsOn: 1,
  timeFormat: '12',
  timezone: 'America/New_York',
  locale: 'en-US',
  currency: 'USD',
  defaultRateCents: 2000,
  updatedAt: '2026-07-22T00:00:00.000Z',
}

function interval(overrides: Partial<Extract<WorkEntry, { kind: 'interval' }>> = {}): WorkEntry {
  return {
    id: 'entry-1',
    kind: 'interval',
    workDate: '2026-07-22',
    timezone: 'America/New_York',
    startAt: dateTimeToIso('2026-07-22', '09:00', 'America/New_York'),
    endAt: dateTimeToIso('2026-07-22', '17:00', 'America/New_York'),
    breakMinutes: 30,
    breaks: [],
    tagIds: [],
    note: '',
    rateCents: 2000,
    currency: 'USD',
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('time calculations', () => {
  it('parses common duration formats', () => {
    expect(parseDuration('8h 30m')).toBe(510)
    expect(parseDuration('7:45')).toBe(465)
    expect(parseDuration('1.5')).toBe(90)
    expect(parseDuration('2:75')).toBeNull()
  })

  it('subtracts unpaid breaks from exact elapsed minutes', () => {
    expect(entryMinutes(interval())).toBe(450)
  })

  it('splits overnight work and precise breaks at local midnight', () => {
    const entry = interval({
      workDate: '2026-07-22',
      startAt: dateTimeToIso('2026-07-22', '22:00', settings.timezone),
      endAt: dateTimeToIso('2026-07-23', '02:00', settings.timezone),
      breakMinutes: 0,
      breaks: [{
        startAt: dateTimeToIso('2026-07-22', '23:30', settings.timezone),
        endAt: dateTimeToIso('2026-07-23', '00:30', settings.timezone),
      }],
    })
    expect(Object.fromEntries(allocateEntryByDay(entry))).toEqual({
      '2026-07-22': 90,
      '2026-07-23': 90,
    })
  })

  it('uses real elapsed time across a daylight-saving jump', () => {
    const entry = interval({
      workDate: '2026-03-08',
      startAt: dateTimeToIso('2026-03-08', '01:30', settings.timezone),
      endAt: dateTimeToIso('2026-03-08', '03:30', settings.timezone),
      breakMinutes: 0,
    })
    expect(entryMinutes(entry)).toBe(60)
  })

  it('produces one shared report total for hours and pay', () => {
    const duration: WorkEntry = {
      id: 'entry-2',
      kind: 'duration',
      workDate: '2026-07-23',
      timezone: settings.timezone,
      durationMinutes: 120,
      tagIds: [],
      note: '',
      rateCents: 3000,
      currency: 'USD',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
    }
    const report = buildReport([interval(), duration], {
      startDate: '2026-07-22',
      endDate: '2026-07-23',
      grouping: 'day',
      projectIds: [],
      tagIds: [],
    }, settings)
    expect(report.totalMinutes).toBe(570)
    expect(report.totalPayCents).toBe(21_000)
    expect(report.workedDays).toBe(2)
  })
})
