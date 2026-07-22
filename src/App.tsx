import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, CalendarRange, Check, Clock3, CloudOff, Download, Plus, RotateCcw, Settings2 } from 'lucide-react'
import type { ViewName, WorkEntry } from './types'
import { db, defaultSettings, ensureDatabase, restoreEntry, saveDrafts, softDeleteEntry } from './lib/db'
import { todayIso } from './lib/time'
import { EntryModal } from './components/EntryModal'
import { ReportsView } from './components/ReportsView'
import { SettingsView } from './components/SettingsView'
import { TimesheetView } from './components/TimesheetView'
import { TodayView } from './components/TodayView'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const LEFT_NAV = [
  { id: 'today' as const, label: 'Today', icon: Clock3 },
  { id: 'timesheet' as const, label: 'Sheet', icon: CalendarRange },
]

const RIGHT_NAV = [
  { id: 'reports' as const, label: 'Reports', icon: BarChart3 },
  { id: 'settings' as const, label: 'Settings', icon: Settings2 },
]

export default function App() {
  const [view, setView] = useState<ViewName>('today')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<WorkEntry | undefined>()
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [installUpdate, setInstallUpdate] = useState<(() => Promise<void>) | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  const storedSettings = useLiveQuery(() => db.settings.get('settings'), [])
  const settings = storedSettings ? { ...defaultSettings, ...storedSettings } : defaultSettings
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? []
  const timer = useLiveQuery(() => db.timers.get('active'), [])
  const activeEntries = entries.filter((entry) => !entry.deletedAt)

  useEffect(() => {
    ensureDatabase()
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    const handleUpdate = (event: Event) => setInstallUpdate(() => (event as CustomEvent<() => Promise<void>>).detail)
    const handleInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('hours-ledger:update-ready', handleUpdate)
    window.addEventListener('beforeinstallprompt', handleInstall)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('hours-ledger:update-ready', handleUpdate)
      window.removeEventListener('beforeinstallprompt', handleInstall)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function addEntry() {
    setEditing(undefined)
    setModalOpen(true)
  }

  function editEntry(entry: WorkEntry) {
    setEditing(entry)
    setModalOpen(true)
  }

  async function quickLog(minutes: number, note: string) {
    await saveDrafts([{ kind: 'duration', workDate: todayIso(), durationMinutes: minutes, tagIds: [], note, rateCents: settings.defaultRateCents }], settings)
    setToast({ message: `Logged ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')} to ${settings.jobName}.` })
  }

  async function duplicateEntry(entry: WorkEntry) {
    const timestamp = new Date().toISOString()
    await db.entries.add({ ...entry, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp })
    setToast({ message: 'Entry duplicated.' })
  }

  async function deleteEntry(entry: WorkEntry) {
    await softDeleteEntry(entry.id)
    setToast({ message: 'Entry deleted.', undoId: entry.id })
  }

  const sharedViewProps = {
    settings,
    entries: activeEntries,
    onAdd: addEntry,
    onEdit: editEntry,
    onDuplicate: duplicateEntry,
    onDelete: deleteEntry,
  }

  const renderNavItem = (item: (typeof LEFT_NAV)[number] | (typeof RIGHT_NAV)[number]) => {
    const Icon = item.icon
    return <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}><Icon size={21} /><span>{item.label}</span></button>
  }

  return (
    <div className="app-shell">
      <div className="app-device">
        {!online ? <div className="offline-banner"><CloudOff size={14} /> Offline · still saving</div> : null}
        {installPrompt ? <button className="install-chip" onClick={async () => { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') setInstallPrompt(null) }}><Download size={14} /> Install</button> : null}
        <main className="main-canvas">
          {view === 'today' ? <TodayView {...sharedViewProps} timer={timer} onQuickLog={quickLog} onOpenTimesheet={() => setView('timesheet')} /> : null}
          {view === 'timesheet' ? <TimesheetView {...sharedViewProps} /> : null}
          {view === 'reports' ? <ReportsView settings={settings} entries={activeEntries} /> : null}
          {view === 'settings' ? <SettingsView settings={settings} entries={activeEntries} /> : null}
        </main>

        <nav className="bottom-nav" aria-label="Primary navigation">
          {LEFT_NAV.map(renderNavItem)}
          <button className="nav-add" onClick={addEntry} aria-label="Add hours"><Plus /></button>
          {RIGHT_NAV.map(renderNavItem)}
        </nav>

        <EntryModal open={modalOpen} settings={settings} entries={activeEntries} existing={editing} onDelete={deleteEntry} onClose={() => { setModalOpen(false); setEditing(undefined) }} />
        {toast ? <div className="toast" role="status"><Check size={16} /><span>{toast.message}</span>{toast.undoId ? <button onClick={async () => { await restoreEntry(toast.undoId!); setToast(null) }}><RotateCcw size={14} /> Undo</button> : null}</div> : null}
        {installUpdate ? <div className="update-toast"><span>A fresh version is ready.</span><button onClick={() => installUpdate()}>Refresh</button></div> : null}
      </div>
    </div>
  )
}
