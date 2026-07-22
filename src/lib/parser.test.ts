import { describe, expect, it } from 'vitest'
import { entryMinutes } from './time'
import { parseBulkInput } from './parser'
import { entryFromDraft, defaultSettings } from './db'

const settings = { ...defaultSettings, timezone: 'America/New_York', weekStartsOn: 1 as const }

describe('bulk input parser', () => {
  it('expands a weekday range and subtracts lunch', () => {
    const result = parseBulkInput('Mon–Fri 9–5, 30m lunch', '2026-07-22', settings.timezone, settings.weekStartsOn)
    expect(result.issues).toEqual([])
    expect(result.drafts).toHaveLength(5)
    expect(result.drafts.map((draft) => entryMinutes(entryFromDraft(draft, settings)))).toEqual([450, 450, 450, 450, 450])
    expect(result.drafts[0].workDate).toBe('2026-07-20')
    expect(result.drafts[4].workDate).toBe('2026-07-24')
  })

  it('accepts mixed comma-separated entries', () => {
    const result = parseBulkInput('Mon 9-5, Tue 8:30-4 with 30m lunch', '2026-07-22', settings.timezone, settings.weekStartsOn)
    expect(result.issues).toEqual([])
    expect(result.drafts).toHaveLength(2)
    expect(entryMinutes(entryFromDraft(result.drafts[0], settings))).toBe(480)
    expect(entryMinutes(entryFromDraft(result.drafts[1], settings))).toBe(420)
  })

  it('accepts duration-only entries', () => {
    const result = parseBulkInput('2026-07-22 8h 15m', '2026-07-22', settings.timezone, settings.weekStartsOn)
    expect(result.issues).toEqual([])
    expect(result.drafts[0]).toMatchObject({ kind: 'duration', durationMinutes: 495 })
  })

  it('blocks ambiguous overnight breaks', () => {
    const result = parseBulkInput('Wed 10pm-6am 30m break', '2026-07-22', settings.timezone, settings.weekStartsOn)
    expect(result.drafts).toHaveLength(0)
    expect(result.issues[0].message).toContain('exact break times')
  })
})
