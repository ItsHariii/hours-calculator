import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { db, ensureDatabase } from './lib/db'

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
})
