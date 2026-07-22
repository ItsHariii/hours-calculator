import { useEffect, useState } from 'react'
import { Check, Download, LocateFixed, MapPin, ShieldCheck, Upload } from 'lucide-react'
import type { AppSettings, HoursBackup, WorkEntry } from '../types'
import { exportBackupData, importBackupData, saveSettings, validateBackup } from '../lib/db'
import { downloadBlob } from '../lib/export'
import { WORK_LOCATIONS, workLocationById } from '../lib/geofence'
import type { WorkplaceAutomationStatus } from '../hooks/useWorkplaceAutomation'

interface SettingsViewProps {
  settings: AppSettings
  entries: WorkEntry[]
  workplaceStatus: WorkplaceAutomationStatus
}

export function SettingsView({ settings, entries, workplaceStatus }: SettingsViewProps) {
  const [form, setForm] = useState(settings)
  const [saved, setSaved] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [backup, setBackup] = useState<HoursBackup | null>(null)
  const [importError, setImportError] = useState('')
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationDiag, setLocationDiag] = useState<string[]>([])

  function pushDiag(line: string) {
    setLocationDiag((prev) => [...prev, `${new Date().toLocaleTimeString()} · ${line}`].slice(-8))
  }

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

  async function enableLocationAutomation() {
    setLocationError('')
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true
    pushDiag(`tap · secure=${window.isSecureContext} standalone=${standalone} geo=${'geolocation' in navigator}`)
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setLocationError('Automatic logging needs the secure installed app or an HTTPS page.')
      pushDiag('blocked: not a secure context')
      return
    }
    if (!('geolocation' in navigator)) {
      setLocationError('This browser does not provide location access.')
      pushDiag('blocked: no geolocation API')
      return
    }
    setLocationBusy(true)
    pushDiag('calling getCurrentPosition…')
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20_000,
        })
      })
      pushDiag(`granted · acc=${Math.round(position.coords.accuracy)}m`)
      const next = { ...form, jobName: form.jobName.trim() || 'Work', locationAutomationEnabled: true }
      setForm(next)
      await saveSettings(next)
    } catch (error) {
      const locationFailure = error as GeolocationPositionError
      pushDiag(`error · code=${locationFailure.code} msg=${locationFailure.message || 'none'}`)
      setLocationError(locationFailure.code === locationFailure.PERMISSION_DENIED
        ? 'Location access was denied. Allow it in your browser or phone settings, then try again.'
        : 'A reliable location was not available. Move near a window and try again.')
    } finally {
      setLocationBusy(false)
    }
  }

  async function disableLocationAutomation() {
    const next = { ...form, locationAutomationEnabled: false }
    setForm(next)
    await saveSettings(next)
  }

  const detectedWorkplace = workLocationById(workplaceStatus.locationId)
  const locationStatusText = workplaceStatus.state === 'inside' && detectedWorkplace
    ? `At ${detectedWorkplace.shortAddress}`
    : workplaceStatus.state === 'checking'
      ? 'Checking location…'
      : workplaceStatus.state === 'denied'
        ? 'Permission needed'
        : workplaceStatus.state === 'low-accuracy'
          ? 'Waiting for better GPS accuracy'
          : workplaceStatus.state === 'error' || workplaceStatus.state === 'unavailable'
            ? 'Location unavailable'
            : 'Ready for your next arrival'

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

        <section className="setting-section workplace-settings">
          <span className="section-label">Automatic workplace logging</span>
          <div className={`workplace-automation-card ${form.locationAutomationEnabled ? 'active' : ''}`}>
            <div className="workplace-card-heading">
              <span><LocateFixed size={20} /></span>
              <div><strong>{form.locationAutomationEnabled ? 'Arrival detection is on' : 'Clock in when you arrive'}</strong><p>Starts one shift at either workplace and finishes only an automatically started shift when you leave.</p></div>
            </div>
            <div className="saved-workplaces">
              {WORK_LOCATIONS.map((location) => <div key={location.id}><MapPin size={15} /><span><strong>{location.shortAddress}</strong><small>{location.address.replace(`${location.shortAddress} `, '')}</small></span></div>)}
            </div>
            {form.locationAutomationEnabled ? <div className={`location-live-status ${workplaceStatus.state}`}><i /> <span><strong>{locationStatusText}</strong>{workplaceStatus.detail ? <small>{workplaceStatus.detail}</small> : null}</span></div> : null}
            {locationError ? <div className="form-error">{locationError}</div> : null}
            <button className={form.locationAutomationEnabled ? 'disable-location' : 'enable-location'} type="button" disabled={locationBusy} onClick={form.locationAutomationEnabled ? disableLocationAutomation : enableLocationAutomation}>
              {locationBusy ? 'Checking permission…' : form.locationAutomationEnabled ? 'Turn off automatic logging' : 'Enable & check location'}
            </button>
            {locationDiag.length ? <pre className="location-diag">{locationDiag.join('\n')}</pre> : null}
          </div>
          <p className="location-limit-note">Keep Hours Ledger open during the shift. Browser location checks may pause in the background and stop when the app is fully closed; they resume the next time you open it. Your location samples are never saved or uploaded.</p>
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
