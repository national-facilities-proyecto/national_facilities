import type { MapLocation } from './mapLocation'
import { toProviderLatLng } from './mapProviderAdapter'

export function AssignedLocationsList({ stores }: { stores: MapLocation[] }) {
  return (
    <ul aria-label="Tiendas asignadas sin mapa">
      {stores.map((store) => (
        <li key={store.id}>
          <strong>{store.name}</strong>
          <p>{store.address}</p>
          {toProviderLatLng(store) && (
            <a
              className="nf-link"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`}
            >
              Cómo llegar a {store.name}
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}
