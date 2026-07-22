import { useEffect, useState } from 'react'
import { Check, Download, ShieldCheck, Upload } from 'lucide-react'
import type { AppSettings, HoursBackup, WorkEntry } from '../types'
import { exportBackupData, importBackupData, saveSettings, validateBackup } from '../lib/db'
import { downloadBlob } from '../lib/export'

interface SettingsViewProps {
  settings: AppSettings
  entries: WorkEntry[]
}

export function SettingsView({ settings, entries }: SettingsViewProps) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [backup, setBackup] = useState<HoursBackup | null>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => setForm(settings), [settings])

  async function submitSettings(event: React.FormEvent) {
    event.preventDefault()
    setSettingsError('')
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: form.timezone }).format()
    } catch {
      setSettingsError('Use a valid timezone such as America/New_York or Europe/London.')
      return
    }
    await saveSettings({ ...form, jobName: form.jobName.trim() || 'Work' })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  async function downloadBackup() {
    const data = await exportBackupData()
    downloadBlob(JSON.stringify(data, null, 2), `hours-ledger-backup-${data.exportedAt.slice(0, 10)}.json`, 'application/json')
  }

  async function readBackup(file?: File) {
    if (!file) return
    setImportError('')
    try {
      setBackup(validateBackup(JSON.parse(await file.text())))
    } catch {
      setBackup(null)
      setImportError('That file is not a valid Hours Ledger backup.')
    }
  }

  async function importBackup(mode: 'merge' | 'replace') {
    if (!backup) return
    if (mode === 'replace' && !window.confirm('Replace every local record and setting with this backup?')) return
    await importBackupData(backup, mode)
    setBackup(null)
  }

  return (
    <div className="mobile-page page-reveal settings-page">
      <header className="screen-title"><h1>Settings</h1></header>
      <form onSubmit={submitSettings}>
        <section className="setting-section">
          <span className="section-label">Your job</span>
          <div className="inset-form">
            <label><span>Job name</span><input value={form.jobName} onChange={(event) => setForm({ ...form, jobName: event.target.value })} placeholder="Work" /></label>
            <label><span>Hourly rate</span><div className="input-suffix"><input type="number" min="0" step="0.01" value={form.defaultRateCents === undefined ? '' : form.defaultRateCents / 100} onChange={(event) => setForm({ ...form, defaultRateCents: event.target.value ? Math.round(Number(event.target.value) * 100) : undefined })} placeholder="Optional" /><i>{form.currency}</i></div></label>
          </div>
        </section>

        <section className="setting-section">
          <span className="section-label">Weekly target</span>
          <div className="choice-row">{[20, 32, 40, 48].map((hours) => <button type="button" className={form.weeklyTargetHours === hours ? 'active' : ''} key={hours} onClick={() => setForm({ ...form, weeklyTargetHours: hours })}>{hours}h</button>)}</div>
        </section>

        <section className="setting-section">
          <span className="section-label">Week starts on</span>
          <div className="choice-row two"><button type="button" className={form.weekStartsOn === 1 ? 'active' : ''} onClick={() => setForm({ ...form, weekStartsOn: 1 })}>Monday</button><button type="button" className={form.weekStartsOn === 0 ? 'active' : ''} onClick={() => setForm({ ...form, weekStartsOn: 0 })}>Sunday</button></div>
        </section>

        <details className="advanced-settings">
          <summary>Time, currency & display</summary>
          <div className="inset-form">
            <label><span>Clock format</span><select value={form.timeFormat} onChange={(event) => setForm({ ...form, timeFormat: event.target.value as '12' | '24' })}><option value="12">12-hour</option><option value="24">24-hour</option></select></label>
            <label><span>Currency</span><select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option><option>AUD</option><option>INR</option><option>JPY</option></select></label>
            <label><span>Timezone</span><input value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} /></label>
          </div>
        </details>
        {settingsError ? <div className="form-error">{settingsError}</div> : null}
        <button className="save-settings" type="submit">{saved ? <><Check size={17} /> Saved</> : 'Save settings'}</button>
      </form>

      <section className="setting-section data-settings">
        <span className="section-label">Data · {entries.length} entries</span>
        <div className="data-list">
          <button onClick={downloadBackup}>Back up data <Download size={16} /></button>
          <label>Restore from backup <Upload size={16} /><input type="file" accept="application/json,.json" onChange={(event) => readBackup(event.target.files?.[0])} /></label>
        </div>
        {importError ? <div className="form-error">{importError}</div> : null}
        {backup ? <div className="backup-preview"><strong>{backup.entries.length} entries found</strong><p>Backup from {new Date(backup.exportedAt).toLocaleString()}.</p><div><button onClick={() => importBackup('merge')}>Merge newest</button><button onClick={() => importBackup('replace')}>Replace all</button></div></div> : null}
      </section>

      <div className="privacy-card"><ShieldCheck /><p><strong>Private by default.</strong><br />Your hours stay on this device until you export them.</p></div>
      <div className="kept-by-hand">Hours Ledger · kept by hand</div>
    </div>
  )
}
