import { useEffect, useState } from 'react'
import { MapPin, Pause, Play, Square } from 'lucide-react'
import type { AppSettings, TimerState } from '../types'
import { db } from '../lib/db'
import { pauseTimer, resumeTimer, startTimer, stopTimer, timerElapsedMinutes } from '../lib/timer'
import { formatMoney, payCentsFor } from '../lib/time'
import { workLocationById } from '../lib/geofence'

interface TimerCardProps {
  timer?: TimerState
  settings: AppSettings
}

function elapsedSeconds(timer: TimerState, now: Date) {
  const gross = (now.getTime() - new Date(timer.startAt).getTime()) / 1000
  const closed = timer.breaks.reduce(
    (sum, item) => sum + (new Date(item.endAt).getTime() - new Date(item.startAt).getTime()) / 1000,
    0,
  )
  const active = timer.breakStartedAt ? (now.getTime() - new Date(timer.breakStartedAt).getTime()) / 1000 : 0
  return Math.max(0, Math.floor(gross - closed - active))
}

function timerText(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const secs = seconds % 60
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')
}

export function TimerCard({ timer, settings }: TimerCardProps) {
  const [note, setNote] = useState(timer?.note ?? '')
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => setNote(timer?.note ?? ''), [timer?.id, timer?.note])
  useEffect(() => {
    if (!timer || timer.breakStartedAt) return
    const interval = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [timer])

  async function changeNote(value: string) {
    setNote(value)
    if (timer) await db.timers.update('active', { note: value })
  }

  const seconds = timer ? elapsedSeconds(timer, clock) : 0
  const status = timer?.breakStartedAt ? 'On break' : timer ? 'Clock running' : 'Ready to clock in'
  const automaticLocation = timer?.source === 'workplace' ? workLocationById(timer.workLocationId) : undefined
  const liveRateCents = timer?.rateCents ?? settings.defaultRateCents
  const livePayCents = timer ? payCentsFor(timerElapsedMinutes(timer, clock), liveRateCents) : 0

  return (
    <section className={`daily-timer ${timer ? 'timer-active' : ''}`} aria-live="polite">
      <div className="timer-status"><i className={timer && !timer.breakStartedAt ? 'pulse' : ''} /><span>{status}</span></div>
      <div className="timer-readout">{timerText(seconds)}</div>
      {timer && liveRateCents ? <div className="timer-earnings">{formatMoney(livePayCents, settings.currency, settings.locale)} earned</div> : null}
      <div className="job-pill"><i />{settings.jobName || 'Work'}</div>
      {automaticLocation ? <div className="automatic-timer-label"><MapPin size={14} /> Started automatically at {automaticLocation.shortAddress}</div> : null}
      <input className="timer-note-input" value={note} onChange={(event) => changeNote(event.target.value)} placeholder="Add a note (optional)" aria-label="Timer note" />
      <div className="timer-actions">
        {!timer ? (
          <button className="primary-action" onClick={() => startTimer(settings, undefined, note)}><Play size={18} fill="currentColor" /> Clock in</button>
        ) : timer.breakStartedAt ? (
          <button className="primary-action" onClick={() => resumeTimer(timer)}><Play size={18} fill="currentColor" /> Resume work</button>
        ) : (
          <button className="primary-action" onClick={() => pauseTimer(timer)}><Pause size={18} fill="currentColor" /> Take a break</button>
        )}
        {timer ? <button className="secondary-action" onClick={() => stopTimer(timer)}><Square size={15} fill="currentColor" /> Finish</button> : null}
      </div>
    </section>
  )
}
