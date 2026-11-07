import { createRoot } from 'react-dom/client'
import { AssignedLocationsMap } from '../../src/features/technician/AssignedLocationsMap'
import '../../src/index.css'

// Datos ficticios y componente real; no se consulta la API ni se simula VectorGrid.
createRoot(document.getElementById('root')!).render(
  <main style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
    <AssignedLocationsMap
      stores={[
        {
          id: 1,
          name: 'Tienda piloto Lima',
          address: 'Miraflores, Lima',
          latitude: -12.1739,
          longitude: -77.0181,
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
)
