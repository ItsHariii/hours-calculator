import type { AppSettings, Project, ReportResult, Tag, WorkEntry } from '../types'
import { entryMinutes, formatDecimalHours, formatEntryTime, formatMinutes } from './time'

function csvCell(value: string | number | undefined) {
  const text = value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvRow(values: Array<string | number | undefined>) {
  return values.map(csvCell).join(',')
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportDetailedCsv(
  report: ReportResult,
  settings: AppSettings,
  projects: Project[],
  tags: Tag[],
) {
  const projectMap = new Map(projects.map((project) => [project.id, project.name]))
  void tags
  const header = csvRow([
    'Date', 'Type', 'Start', 'End', 'Break minutes', 'Hours (H:MM)', 'Decimal hours',
    'Job', 'Note', 'Hourly rate', 'Estimated pay', 'Timezone',
  ])
  const rows = report.entries.map((entry) => {
    const minutes = entryMinutes(entry)
    return csvRow([
      entry.workDate,
      entry.kind,
      entry.kind === 'interval' ? formatEntryTime(entry.startAt, settings, entry.timezone) : '',
      entry.kind === 'interval' ? formatEntryTime(entry.endAt, settings, entry.timezone) : '',
      entry.kind === 'interval'
        ? entry.breakMinutes + entry.breaks.reduce((sum, item) => sum + Math.round((new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 60_000), 0)
        : '',
      formatMinutes(minutes),
      formatDecimalHours(minutes),
      entry.projectId ? projectMap.get(entry.projectId) ?? settings.jobName : settings.jobName,
      entry.note,
      entry.rateCents === undefined ? '' : (entry.rateCents / 100).toFixed(2),
      entry.rateCents === undefined ? '' : ((minutes * entry.rateCents) / 6000).toFixed(2),
      entry.timezone,
    ])
  })
  downloadBlob([header, ...rows].join('\n'), `hours-detail-${report.query.startDate}-to-${report.query.endDate}.csv`, 'text/csv;charset=utf-8')
}

export function exportSummaryCsv(report: ReportResult) {
  const rows = [csvRow(['Date', 'Hours (H:MM)', 'Decimal hours', 'Estimated pay'])]
  report.days.forEach((day) => rows.push(csvRow([day.date, formatMinutes(day.minutes), formatDecimalHours(day.minutes), (day.payCents / 100).toFixed(2)])))
  rows.push(csvRow(['OVERALL TOTAL', formatMinutes(report.totalMinutes), formatDecimalHours(report.totalMinutes), (report.totalPayCents / 100).toFixed(2)]))
  downloadBlob(rows.join('\n'), `hours-summary-${report.query.startDate}-to-${report.query.endDate}.csv`, 'text/csv;charset=utf-8')
}

export function entrySort(a: WorkEntry, b: WorkEntry) {
  const aTime = a.kind === 'interval' ? a.startAt : `${a.workDate}T00:00:00`
  const bTime = b.kind === 'interval' ? b.startAt : `${b.workDate}T00:00:00`
  return bTime.localeCompare(aTime)
}
