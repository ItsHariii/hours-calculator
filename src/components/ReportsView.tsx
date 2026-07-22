import { useMemo, useState } from 'react'
import { Download, FileDown, Sheet } from 'lucide-react'
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import type { AppSettings, WorkEntry } from '../types'
import { exportDetailedCsv, exportSummaryCsv } from '../lib/export'
import { buildReport, formatDecimalHours, formatDisplayDate, formatMinutes, formatMoney, presetRange } from '../lib/time'

interface ReportsViewProps {
  settings: AppSettings
  entries: WorkEntry[]
}

type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'custom'

export function ReportsView({ settings, entries }: ReportsViewProps) {
  const initial = presetRange('this-week', settings.weekStartsOn)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [activePreset, setActivePreset] = useState<RangePreset>('this-week')
  const [exportOpen, setExportOpen] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const report = useMemo(() => buildReport(entries, { startDate, endDate, grouping: 'day', projectIds: [], tagIds: [] }, settings), [entries, startDate, endDate, settings])
  const chartDays = differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) <= 13
    ? eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) }).map((date) => {
        const iso = format(date, 'yyyy-MM-dd')
        return report.days.find((day) => day.date === iso) ?? { date: iso, minutes: 0, payCents: 0, entryIds: [] }
      })
    : report.days.slice(-14)
  const maxMinutes = Math.max(...chartDays.map((day) => day.minutes), 1)

  function applyPreset(preset: Exclude<RangePreset, 'custom'>) {
    const range = presetRange(preset, settings.weekStartsOn)
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setActivePreset(preset)
  }

  async function downloadPdf() {
    setPdfBusy(true)
    try {
      const { exportReportPdf } = await import('../lib/exportPdf')
      exportReportPdf(report, settings, [])
    } finally {
      setPdfBusy(false)
      setExportOpen(false)
    }
  }

  return (
    <div className="mobile-page page-reveal">
      <header className="screen-title"><h1>Reports</h1></header>
      <div className="range-tabs">
        <button className={activePreset === 'this-week' ? 'active' : ''} onClick={() => applyPreset('this-week')}>This week</button>
        <button className={activePreset === 'last-week' ? 'active' : ''} onClick={() => applyPreset('last-week')}>Last week</button>
        <button className={activePreset === 'this-month' ? 'active' : ''} onClick={() => applyPreset('this-month')}>This month</button>
      </div>

      <section className="report-total-card">
        <strong>{formatDecimalHours(report.totalMinutes)}</strong>
        <em>hours · {report.workedDays} active day{report.workedDays === 1 ? '' : 's'}</em>
        <div className="vertical-bars" aria-label="Hours by day">
          {chartDays.length ? chartDays.map((day) => <div key={day.date}><i className={day.minutes ? '' : 'empty'} style={{ height: `${day.minutes ? Math.max(5, (day.minutes / maxMinutes) * 100) : 2}%` }} /><span>{formatDisplayDate(day.date, settings.locale, { month: undefined, day: undefined, year: undefined, weekday: 'narrow' })}</span></div>) : <p>No hours in this range.</p>}
        </div>
      </section>

      <button className="custom-range-toggle" onClick={() => setActivePreset(activePreset === 'custom' ? 'this-week' : 'custom')}>Choose exact dates</button>
      {activePreset === 'custom' ? <div className="custom-range"><label><span>From</span><input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>Through</span><input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label></div> : null}

      <section className="single-job-summary">
        <span className="section-label">{settings.jobName || 'Work'}</span>
        <div><strong>{formatMinutes(report.totalMinutes)}</strong><small>{formatMoney(report.totalPayCents, settings.currency, settings.locale)} estimated</small></div>
        <div className="progress-track"><i style={{ width: '100%' }} /></div>
        <p>{formatDisplayDate(startDate, settings.locale)} – {formatDisplayDate(endDate, settings.locale)}</p>
      </section>

      <div className="report-actions">
        <button onClick={() => setExportOpen((open) => !open)}><Download size={17} /> Export hours</button>
        {exportOpen ? <div className="export-sheet"><button onClick={() => { exportSummaryCsv(report); setExportOpen(false) }}><Sheet size={18} /><span><strong>Summary CSV</strong><small>One line per day</small></span></button><button onClick={() => { exportDetailedCsv(report, settings, [], []); setExportOpen(false) }}><Sheet size={18} /><span><strong>Detailed CSV</strong><small>Every recorded entry</small></span></button><button onClick={downloadPdf} disabled={pdfBusy}><FileDown size={18} /><span><strong>{pdfBusy ? 'Preparing…' : 'Ledger PDF'}</strong><small>Print or share</small></span></button></div> : null}
      </div>
    </div>
  )
}
