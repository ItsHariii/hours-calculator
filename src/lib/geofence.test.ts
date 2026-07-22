import { describe, expect, it } from 'vitest'
import { WORK_LOCATIONS, distanceMeters, nearestWorkLocation } from './geofence'

describe('workplace geofences', () => {
  it('keeps a wider departure boundary than arrival boundary at both workplaces', () => {
    expect(WORK_LOCATIONS).toHaveLength(2)
    for (const location of WORK_LOCATIONS) {
      expect(location.enterRadiusMeters).toBe(150)
      expect(location.exitRadiusMeters).toBe(250)
      expect(location.exitRadiusMeters).toBeGreaterThan(location.enterRadiusMeters)
    }
  })

  it('finds the correct nearest workplace from an accurate reading', () => {
    const northfall = WORK_LOCATIONS[0]
    const reading = { latitude: northfall.latitude, longitude: northfall.longitude, accuracy: 15 }
    expect(distanceMeters(reading, northfall)).toBeLessThan(1)
    expect(nearestWorkLocation(reading).location.id).toBe('northfall')
  })
})
