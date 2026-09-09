type Coordinates = {
  latitude: number
  longitude: number
}

const earthRadiusMeters = 6_371_000

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

export function distanceInMeters(from: Coordinates, to: Coordinates) {
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const fromLatitude = toRadians(from.latitude)
  const toLatitude = toRadians(to.latitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine))
}

export function getCurrentCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu dispositivo no permite obtener la ubicación.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('No pudimos obtener tu ubicación. Activa el GPS y concede el permiso.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  })
}
