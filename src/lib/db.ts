import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import type { AppSettings, EntryDraft, HoursBackup, Project, Tag, TimerState, WorkEntry } from '../types'

const now = () => new Date().toISOString()

export const defaultSettings: AppSettings = {
  id: 'settings',
  displayName: '',
  jobName: 'Work',
  weeklyTargetHours: 40,
  weekStartsOn: 1,
  timeFormat: '12',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  locale: navigator.language || 'en-US',
  currency: 'USD',
  locationAutomationEnabled: false,
  updatedAt: now(),
}

class HoursDatabase extends Dexie {
  entries!: EntityTable<WorkEntry, 'id'>
  projects!: EntityTable<Project, 'id'>
  tags!: EntityTable<Tag, 'id'>
  settings!: EntityTable<AppSettings, 'id'>
  timers!: EntityTable<TimerState, 'id'>

  constructor() {
    super('hours-ledger')
    this.version(1).stores({
      entries: 'id, workDate, startAt, projectId, updatedAt, deletedAt',
      projects: 'id, name, updatedAt, deletedAt',
      tags: 'id, name, updatedAt, deletedAt',
      settings: 'id',
      timers: 'id',
    })
  }
}

export const db = new HoursDatabase()

export async function ensureDatabase() {
  if (!(await db.settings.get('settings'))) await db.settings.put(defaultSettings)
}

export function entryFromDraft(draft: EntryDraft, settings: AppSettings): WorkEntry {
  const timestamp = now()
  const base = {
    id: crypto.randomUUID(),
    workDate: draft.workDate,
    timezone: settings.timezone,
    projectId: draft.projectId,
    tagIds: draft.tagIds,
    note: draft.note,
    rateCents: draft.rateCents,
    currency: settings.currency,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  return draft.kind === 'duration'
    ? { ...base, kind: 'duration', durationMinutes: draft.durationMinutes }
    : {
        ...base,
        kind: 'interval',
        startAt: draft.startAt,
        endAt: draft.endAt,
        breakMinutes: draft.breakMinutes,
        breaks: draft.breaks,
      }
}

export async function saveDrafts(drafts: EntryDraft[], settings: AppSettings) {
  const entries = drafts.map((draft) => entryFromDraft(draft, settings))
  await db.entries.bulkPut(entries)
  return entries
}

export async function updateEntry(entry: WorkEntry) {
  await db.entries.put({ ...entry, updatedAt: now() })
}

export async function softDeleteEntry(id: string) {
  await db.entries.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function restoreEntry(id: string) {
  await db.entries.update(id, { deletedAt: undefined, updatedAt: now() })
}

export async function saveProject(input: Pick<Project, 'name' | 'color' | 'defaultRateCents'>) {
  const timestamp = now()
  await db.projects.add({ id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp })
}

export async function deleteProject(id: string) {
  await db.projects.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function saveTag(input: Pick<Tag, 'name' | 'color'>) {
  const timestamp = now()
  await db.tags.add({ id: crypto.randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp })
}

export async function deleteTag(id: string) {
  await db.tags.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function saveSettings(settings: AppSettings) {
  await db.settings.put({ ...settings, updatedAt: now() })
}

export async function exportBackupData(): Promise<HoursBackup> {
  const [entries, projects, tags, settings] = await Promise.all([
    db.entries.toArray(),
    db.projects.toArray(),
    db.tags.toArray(),
    db.settings.get('settings'),
  ])
  return {
    schemaVersion: 1,
    exportedAt: now(),
    entries,
    projects,
    tags,
    settings: { ...defaultSettings, ...(settings ?? {}) },
  }
}

const baseSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().optional(),
})
const entryBaseSchema = baseSchema.extend({
  workDate: z.string(),
  timezone: z.string(),
  projectId: z.string().optional(),
  tagIds: z.array(z.string()),
  note: z.string(),
  rateCents: z.number().optional(),
  currency: z.string(),
  source: z.union([z.literal('manual'), z.literal('workplace')]).optional(),
  workLocationId: z.string().optional(),
})
const entrySchema = z.discriminatedUnion('kind', [
  entryBaseSchema.extend({ kind: z.literal('duration'), durationMinutes: z.number().positive() }),
  entryBaseSchema.extend({
    kind: z.literal('interval'),
    startAt: z.string(),
    endAt: z.string(),
    breakMinutes: z.number().nonnegative(),
    breaks: z.array(z.object({ startAt: z.string(), endAt: z.string() })),
  }),
])
const backupSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  entries: z.array(entrySchema),
  projects: z.array(baseSchema.extend({ name: z.string(), color: z.string(), defaultRateCents: z.number().optional() })),
  tags: z.array(baseSchema.extend({ name: z.string(), color: z.string() })),
  settings: z.object({
    id: z.literal('settings'),
    displayName: z.string(),
    jobName: z.string().default('Work'),
    weeklyTargetHours: z.number().positive().default(40),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    timeFormat: z.union([z.literal('12'), z.literal('24')]),
    timezone: z.string(),
    locale: z.string(),
    currency: z.string(),
    defaultRateCents: z.number().optional(),
    locationAutomationEnabled: z.boolean().default(false),
    updatedAt: z.string(),
  }),
})

export function validateBackup(value: unknown): HoursBackup {
  return backupSchema.parse(value) as HoursBackup
}

function newestById<T extends { id: string; updatedAt: string }>(current: T[], incoming: T[]) {
  const records = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) {
    const existing = records.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) records.set(item.id, item)
  }
  return [...records.values()]
}

export async function importBackupData(backup: HoursBackup, mode: 'merge' | 'replace') {
  await db.transaction('rw', [db.entries, db.projects, db.tags, db.settings, db.timers], async () => {
    if (mode === 'replace') {
      await Promise.all([db.entries.clear(), db.projects.clear(), db.tags.clear(), db.settings.clear(), db.timers.clear()])
      await Promise.all([
        db.entries.bulkPut(backup.entries),
        db.projects.bulkPut(backup.projects),
        db.tags.bulkPut(backup.tags),
        db.settings.put(backup.settings),
      ])
      return
    }
    const [entries, projects, tags] = await Promise.all([
      db.entries.toArray(),
      db.projects.toArray(),
      db.tags.toArray(),
    ])
    const currentSettings = await db.settings.get('settings')
    await Promise.all([
      db.entries.bulkPut(newestById(entries, backup.entries)),
      db.projects.bulkPut(newestById(projects, backup.projects)),
      db.tags.bulkPut(newestById(tags, backup.tags)),
      db.settings.put(!currentSettings || backup.settings.updatedAt > currentSettings.updatedAt ? backup.settings : currentSettings),
    ])
  })
}
