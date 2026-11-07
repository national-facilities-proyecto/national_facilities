import { createRoot } from 'react-dom/client'
import { registerMapAssetWorker } from '../../src/features/technician/registerMapAssetWorker'
import '../../src/index.css'

// Datos ficticios y componente real; no se consulta la API ni se simula VectorGrid.
void registerMapAssetWorker()
const root = createRoot(document.getElementById('root')!)
root.render(
  <button
    onClick={() => {
      void import('../../src/features/technician/AssignedLocationsMap').then(
        ({ AssignedLocationsMap }) =>
          root.render(
            <main style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
              <AssignedLocationsMap
                stores={[
                  {
                    id: 1,
                    name: 'Tienda piloto Lima',
                    address: 'Miraflores, Lima',
                    latitude: new URLSearchParams(location.search).has('outside')
                      ? -16.4
                      : -12.1739,
                    longitude: new URLSearchParams(location.search).has('outside')
                      ? -71.5
                      : -77.0181,
                  },
                  {
                    id: 2,
                    name: 'Tienda piloto Surco',
                    address: 'Surco, Lima',
                    latitude: -12.13,
                    longitude: -76.99,
                  },
                ]}
              />
            </main>,
          ),
      )
    }}
  >
    Cargar visor de prueba
  </button>,
)
