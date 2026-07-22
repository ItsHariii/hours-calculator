export interface WorkLocation {
  id: string
  label: string
  shortAddress: string
  address: string
  latitude: number
  longitude: number
  enterRadiusMeters: number
  exitRadiusMeters: number
}

export interface LocationReading {
  latitude: number
  longitude: number
  accuracy: number
}

export const MAX_LOCATION_ACCURACY_METERS = 100
export const REQUIRED_GEOFENCE_READINGS = 2

export const WORK_LOCATIONS: WorkLocation[] = [
  {
    id: 'northfall',
    label: 'Northfall workplace',
    shortAddress: '11775 Northfall Ln',
    address: '11775 Northfall Ln Ste 104, Alpharetta, GA 30009',
    latitude: 34.066537014221,
    longitude: -84.307277379095,
    enterRadiusMeters: 150,
    exitRadiusMeters: 250,
  },
  {
    id: 'pirkle-ferry',
    label: 'Pirkle Ferry workplace',
    shortAddress: '416 Pirkle Ferry Rd',
    address: '416 Pirkle Ferry Rd Ste H400, Cumming, GA 30040',
    latitude: 34.206569,
    longitude: -84.132262,
    enterRadiusMeters: 150,
    exitRadiusMeters: 250,
  },
]

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function distanceMeters(
  from: Pick<LocationReading, 'latitude' | 'longitude'>,
  to: Pick<LocationReading, 'latitude' | 'longitude'>,
) {
  const earthRadiusMeters = 6_371_000
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestWorkLocation(reading: LocationReading) {
  return WORK_LOCATIONS
    .map((location) => ({
      location,
      distanceMeters: distanceMeters(reading, location),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0]
}

export function workLocationById(id?: string) {
  return WORK_LOCATIONS.find((location) => location.id === id)
}
