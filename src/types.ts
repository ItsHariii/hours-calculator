export type EntryKind = 'duration' | 'interval'
export type ReportGrouping = 'day' | 'week' | 'month'

export interface BreakInterval {
  startAt: string
  endAt: string
}

interface WorkEntryBase {
  id: string
  kind: EntryKind
  workDate: string
  timezone: string
  projectId?: string
  tagIds: string[]
  note: string
  rateCents?: number
  currency: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface DurationEntry extends WorkEntryBase {
  kind: 'duration'
  durationMinutes: number
}

export interface IntervalEntry extends WorkEntryBase {
  kind: 'interval'
  startAt: string
  endAt: string
  breakMinutes: number
  breaks: BreakInterval[]
}

export type WorkEntry = DurationEntry | IntervalEntry

export interface Project {
  id: string
  name: string
  color: string
  defaultRateCents?: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

export interface TimerState {
  id: 'active'
  startAt: string
  timezone: string
  projectId?: string
  tagIds: string[]
  note: string
  rateCents?: number
  currency: string
  breaks: BreakInterval[]
  breakStartedAt?: string
}

export interface AppSettings {
  id: 'settings'
  displayName: string
  jobName: string
  weeklyTargetHours: number
  weekStartsOn: 0 | 1
  timeFormat: '12' | '24'
  timezone: string
  locale: string
  currency: string
  defaultRateCents?: number
  updatedAt: string
}

export interface ReportQuery {
  startDate: string
  endDate: string
  grouping: ReportGrouping
  projectIds: string[]
  tagIds: string[]
}

export interface ReportDay {
  date: string
  minutes: number
  payCents: number
  entryIds: string[]
}

export interface ReportGroup {
  key: string
  label: string
  minutes: number
  payCents: number
  days: ReportDay[]
}

export interface ReportResult {
  query: ReportQuery
  days: ReportDay[]
  groups: ReportGroup[]
  entries: WorkEntry[]
  totalMinutes: number
  totalPayCents: number
  workedDays: number
  averageMinutes: number
}

export interface EntryDraftBase {
  workDate: string
  projectId?: string
  tagIds: string[]
  note: string
  rateCents?: number
}

export type EntryDraft =
  | (EntryDraftBase & { kind: 'duration'; durationMinutes: number })
  | (EntryDraftBase & {
      kind: 'interval'
      startAt: string
      endAt: string
      breakMinutes: number
      breaks: BreakInterval[]
    })

export interface ParseIssue {
  line: number
  source: string
  message: string
}

export interface ParseResult {
  drafts: EntryDraft[]
  issues: ParseIssue[]
  warnings: ParseIssue[]
}

export interface HoursBackup {
  schemaVersion: 1
  exportedAt: string
  entries: WorkEntry[]
  projects: Project[]
  tags: Tag[]
  settings: AppSettings
}

export type ViewName = 'today' | 'timesheet' | 'reports' | 'settings'
