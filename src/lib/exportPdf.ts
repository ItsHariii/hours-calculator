import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AppSettings, Project, ReportResult } from '../types'
import { entryMinutes, formatDisplayDate, formatEntryTime, formatMinutes, formatMoney } from './time'

export function exportReportPdf(report: ReportResult, settings: AppSettings, projects: Project[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const projectMap = new Map(projects.map((project) => [project.id, project.name]))
  doc.setFillColor(91, 59, 122)
  doc.rect(0, 0, 612, 104, 'F')
  doc.setTextColor(243, 235, 217)
  doc.setFont('courier', 'bold')
  doc.setFontSize(22)
  doc.text('HOURS LEDGER', 42, 47)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`${formatDisplayDate(report.query.startDate, settings.locale)} — ${formatDisplayDate(report.query.endDate, settings.locale)}`, 42, 70)
  doc.setTextColor(46, 40, 35)
  doc.setFont('courier', 'bold')
  doc.setFontSize(28)
  doc.text(formatMinutes(report.totalMinutes), 42, 143)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('TOTAL HOURS', 42, 160)
  doc.setFont('courier', 'bold')
  doc.setFontSize(18)
  doc.text(String(report.workedDays), 220, 143)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('WORKED DAYS', 220, 160)
  doc.setFont('courier', 'bold')
  doc.setFontSize(18)
  doc.text(formatMoney(report.totalPayCents, settings.currency, settings.locale), 370, 143)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('ESTIMATED REGULAR PAY', 370, 160)

  autoTable(doc, {
    startY: 194,
    head: [['Date', 'Hours', 'Estimated pay']],
    body: report.days.map((day) => [
      formatDisplayDate(day.date, settings.locale, { weekday: 'short' }),
      formatMinutes(day.minutes),
      formatMoney(day.payCents, settings.currency, settings.locale),
    ]),
    theme: 'grid',
    styles: { font: 'courier', fontSize: 9, textColor: [46, 40, 35], lineColor: [91, 59, 122] },
    headStyles: { fillColor: [91, 59, 122], textColor: [255, 255, 255] },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 194
  autoTable(doc, {
    startY: finalY + 26,
    head: [['Date', 'Time', 'Job', 'Hours', 'Note']],
    body: report.entries.map((entry) => [
      entry.workDate,
      entry.kind === 'interval' ? `${formatEntryTime(entry.startAt, settings, entry.timezone)}–${formatEntryTime(entry.endAt, settings, entry.timezone)}` : 'Duration',
      entry.projectId ? projectMap.get(entry.projectId) ?? settings.jobName : settings.jobName,
      formatMinutes(entryMinutes(entry)),
      entry.note,
    ]),
    theme: 'striped',
    styles: { fontSize: 8, textColor: [46, 40, 35] },
    headStyles: { fillColor: [91, 59, 122], textColor: [243, 235, 217] },
  })
  doc.save(`hours-report-${report.query.startDate}-to-${report.query.endDate}.pdf`)
}
