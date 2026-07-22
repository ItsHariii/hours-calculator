import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'
import { db } from '../lib/db'
import {
  MAX_LOCATION_ACCURACY_METERS,
  REQUIRED_GEOFENCE_READINGS,
  distanceMeters,
  nearestWorkLocation,
  workLocationById,
  type LocationReading,
} from '../lib/geofence'
import { startTimer, stopTimer } from '../lib/timer'

export type WorkplaceAutomationState =
  | 'off'
  | 'checking'
  | 'inside'
  | 'outside'
  | 'low-accuracy'
  | 'denied'
  | 'unavailable'
  | 'error'

export interface WorkplaceAutomationStatus {
  state: WorkplaceAutomationState
  locationId?: string
  distanceMeters?: number
  accuracyMeters?: number
  lastCheckedAt?: string
  detail?: string
}

interface UseWorkplaceAutomationOptions {
  settings: AppSettings
  onEvent: (message: string) => void
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 20_000,
}

export function useWorkplaceAutomation({ settings, onEvent }: UseWorkplaceAutomationOptions) {
  const [status, setStatus] = useState<WorkplaceAutomationStatus>({
    state: settings.locationAutomationEnabled ? 'checking' : 'off',
  })

  useEffect(() => {
    if (!settings.locationAutomationEnabled) {
      setStatus({ state: 'off' })
      return
    }

    if (!('geolocation' in navigator)) {
      setStatus({ state: 'unavailable', detail: 'This browser does not provide location access.' })
      return
    }

    let disposed = false
    let watchId: number | undefined
    let queue = Promise.resolve()
    let arrivalCandidate = ''
    let arrivalReadings = 0
    let departureReadings = 0
    let blockArrivalUntilExit = false

    setStatus({ state: 'checking' })

    async function processPosition(position: GeolocationPosition) {
      if (disposed) return
      const reading: LocationReading = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }
      const checkedAt = new Date(position.timestamp || Date.now()).toISOString()

      if (reading.accuracy > MAX_LOCATION_ACCURACY_METERS) {
        arrivalReadings = 0
        departureReadings = 0
        setStatus({
          state: 'low-accuracy',
          accuracyMeters: reading.accuracy,
          lastCheckedAt: checkedAt,
          detail: 'Waiting for a more accurate GPS reading.',
        })
        return
      }

      const nearest = nearestWorkLocation(reading)
      const activeTimer = await db.timers.get('active')
      const automaticLocation = activeTimer?.source === 'workplace'
        ? workLocationById(activeTimer.workLocationId)
        : undefined

      if (automaticLocation) {
        const automaticDistance = Math.round(
          nearest.location.id === automaticLocation.id
            ? nearest.distanceMeters
            : distanceMeters(reading, automaticLocation),
        )
        const departed = automaticDistance >= automaticLocation.exitRadiusMeters
        departureReadings = departed ? departureReadings + 1 : 0
        arrivalReadings = 0

        setStatus({
          state: departed ? 'outside' : 'inside',
          locationId: automaticLocation.id,
          distanceMeters: automaticDistance,
          accuracyMeters: reading.accuracy,
          lastCheckedAt: checkedAt,
          detail: departed && departureReadings < REQUIRED_GEOFENCE_READINGS
            ? 'Confirming that you left the workplace.'
            : undefined,
        })

        if (departureReadings >= REQUIRED_GEOFENCE_READINGS) {
          const latestTimer = await db.timers.get('active')
          if (latestTimer?.source === 'workplace' && latestTimer.workLocationId === automaticLocation.id) {
            await stopTimer(latestTimer)
            onEvent(`Clocked out automatically after leaving ${automaticLocation.shortAddress}.`)
          }
          departureReadings = 0
          blockArrivalUntilExit = true
        }
        return
      }

      const inside = nearest.distanceMeters <= nearest.location.enterRadiusMeters
      const outsideAll = nearest.distanceMeters >= nearest.location.exitRadiusMeters
      departureReadings = 0

      if (activeTimer && activeTimer.source !== 'workplace') {
        blockArrivalUntilExit = inside || !outsideAll
        arrivalReadings = 0
        setStatus({
          state: inside ? 'inside' : 'outside',
          locationId: inside ? nearest.location.id : undefined,
          distanceMeters: Math.round(nearest.distanceMeters),
          accuracyMeters: reading.accuracy,
          lastCheckedAt: checkedAt,
          detail: inside ? 'Your manually started shift stays under manual control.' : undefined,
        })
        return
      }

      if (outsideAll) blockArrivalUntilExit = false
      if (inside && !blockArrivalUntilExit) {
        if (arrivalCandidate === nearest.location.id) arrivalReadings += 1
        else {
          arrivalCandidate = nearest.location.id
          arrivalReadings = 1
        }
      } else {
        arrivalCandidate = ''
        arrivalReadings = 0
      }

      setStatus({
        state: inside ? 'inside' : 'outside',
        locationId: inside ? nearest.location.id : undefined,
        distanceMeters: Math.round(nearest.distanceMeters),
        accuracyMeters: reading.accuracy,
        lastCheckedAt: checkedAt,
        detail: inside && !blockArrivalUntilExit && arrivalReadings < REQUIRED_GEOFENCE_READINGS
          ? 'Confirming your arrival.'
          : inside && blockArrivalUntilExit
            ? 'Waiting for your next arrival before starting another shift.'
            : undefined,
      })

      if (inside && !blockArrivalUntilExit && arrivalReadings >= REQUIRED_GEOFENCE_READINGS) {
        const latestTimer = await db.timers.get('active')
        if (!latestTimer) {
          await startTimer(settings, undefined, '', {
            source: 'workplace',
            workLocationId: nearest.location.id,
          })
          onEvent(`Clocked in automatically at ${nearest.location.shortAddress}.`)
        }
        blockArrivalUntilExit = true
        arrivalReadings = 0
      }
    }

    function enqueuePosition(position: GeolocationPosition) {
      queue = queue.then(() => processPosition(position)).catch(() => {
        if (!disposed) setStatus({ state: 'error', detail: 'Automatic logging could not update the shift.' })
      })
    }

    function handleError(error: GeolocationPositionError) {
      if (disposed) return
      if (error.code === error.PERMISSION_DENIED) {
        setStatus({ state: 'denied', detail: 'Allow location access in your browser settings.' })
      } else if (error.code !== error.TIMEOUT) {
        setStatus({ state: 'error', detail: 'Your location is temporarily unavailable.' })
      }
    }

    function checkNow() {
      navigator.geolocation.getCurrentPosition(enqueuePosition, handleError, GEOLOCATION_OPTIONS)
    }

    checkNow()
    watchId = navigator.geolocation.watchPosition(enqueuePosition, handleError, GEOLOCATION_OPTIONS)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkNow()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [onEvent, settings.currency, settings.defaultRateCents, settings.locationAutomationEnabled, settings.timezone])

  return status
}
