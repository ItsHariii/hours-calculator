import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { db, ensureDatabase } from './lib/db'
import { WORK_LOCATIONS } from './lib/geofence'

describe('Hours Ledger app', () => {
  afterEach(cleanup)
  beforeEach(async () => {
    await Promise.all([
      db.entries.clear(),
      db.projects.clear(),
      db.tags.clear(),
      db.settings.clear(),
      db.timers.clear(),
    ])
    await ensureDatabase()
  })

  it('logs a duration entry and includes it in reports', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /add hours/i }))

    const dialog = await screen.findByRole('dialog', { name: /add entry/i })
    fireEvent.click(within(dialog).getByRole('button', { name: /save entry/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('8:00').length).toBeGreaterThan(0))

    const reportButtons = screen.getAllByRole('button', { name: 'Reports' })
    fireEvent.click(reportButtons[0])
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)
  })

  it('specializes the daily logger around one saved job name', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    const jobName = await screen.findByLabelText('Job name')
    fireEvent.change(jobName, { target: { value: 'Hospital shift' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await screen.findByText('Saved')

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByText(/Quick log to Hospital shift/i)).toBeInTheDocument()
    expect(screen.getByText('Hospital shift')).toBeInTheDocument()
  })

  it('automatically clocks in on arrival and clocks out after departure', async () => {
    let watchPosition: PositionCallback | undefined
    const geolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn((success: PositionCallback) => {
        watchPosition = success
        return 7
      }),
      clearWatch: vi.fn(),
    }
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geolocation })
    await db.settings.update('settings', { locationAutomationEnabled: true })
    const app = render(<App />)

    try {
      await waitFor(() => expect(geolocation.watchPosition).toHaveBeenCalled())
      const workplace = WORK_LOCATIONS[0]
      const emit = async (latitude: number, longitude: number) => {
        const position = {
          coords: { latitude, longitude, accuracy: 12 },
          timestamp: Date.now(),
        } as GeolocationPosition
        await act(async () => {
          watchPosition?.(position)
          await Promise.resolve()
        })
      }

      await emit(workplace.latitude, workplace.longitude)
      await emit(workplace.latitude, workplace.longitude)
      await waitFor(async () => expect((await db.timers.get('active'))?.source).toBe('workplace'))

      await db.timers.update('active', { startAt: new Date(Date.now() - 60 * 60_000).toISOString() })
      await emit(workplace.latitude + 0.01, workplace.longitude)
      await emit(workplace.latitude + 0.01, workplace.longitude)

      await waitFor(async () => expect(await db.timers.get('active')).toBeUndefined())
      const automaticEntry = (await db.entries.toArray()).find((entry) => entry.source === 'workplace')
      expect(automaticEntry?.workLocationId).toBe(workplace.id)
    } finally {
      app.unmount()
      Reflect.deleteProperty(navigator, 'geolocation')
    }
  })
})
