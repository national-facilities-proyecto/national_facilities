# Rendimiento y mapas

Medición local del build demo el 09/09/2026, Windows y Node 22.14.0. Los tamaños completos están en [bundle-report.json](bundle-report.json); las cifras Lighthouse, en [lighthouse-summary.json](lighthouse-summary.json).

## Tamaños de artefactos

Valores del script `node scripts/bundle-report.mjs`, en bytes. Gzip calculado con `node:zlib.gzipSync` y sus opciones predeterminadas; puede diferir ligeramente de la estimación de Vite. No sumar todos los chunks como si se descargaran en el login.

| Artefacto                  | Minificado / archivo |   Gzip | Momento de carga                                  |
| -------------------------- | -------------------: | -----: | ------------------------------------------------- |
| JS principal               |              242.923 | 78.283 | Inicio: React, router, sesión y shell.            |
| CSS principal              |               22.939 |  4.627 | Inicio.                                           |
| Inter Latin variable WOFF2 |               48.256 | 48.254 | Al pintar texto; fuente local, font-display swap. |
| Mapa Leaflet + VectorGrid  |              203.234 | 60.881 | Solo después de pulsar Mostrar mapa de tiendas.   |
| CSS del mapa               |               15.491 |  6.563 | Importación diferida del mapa.                    |

Otros chunks del build, según Vite: repositorios mock 17,54 kB (5,89 gzip), editor 13,84 kB (5,03 gzip), componentes UI 10,92 kB (3,95 gzip), administración 8,88 kB (3,32 gzip), login 2,64 kB (1,28 gzip). Las páginas se dividen mediante imports dinámicos. El build API excluye fixtures y el repositorio mock, comprobado con `check-api-build.mjs`.

Comparación de la misma salida de Vite con la línea base: CSS principal **65,17 → 22,93 kB** (aproximadamente 65 % menos); JS principal **236,67 → 242,92 kB** (aproximadamente 3 % más). El JS incorpora router, proveedores y flujos compartidos. El mapa pasa de **1.122,70 kB a 203,23 kB** (aproximadamente 82 % menos), además de continuar diferido hasta que el técnico lo solicita.

## Lighthouse ejecutado

[Lighthouse](https://github.com/GoogleChrome/lighthouse), versión 12.8.2, Edge headless, navegación móvil simulada, perfil predeterminado de throttling, URL `http://127.0.0.1:5175/login`. Ejecución final registrada a `2026-09-10T04:22:11.166Z`, después de migrar a React 18 y retirar MapLibre. Se auditó el login demo en localhost; no se midieron los cuatro portales autenticados ni un despliegue productivo.

| Métrica                   |   Resultado |
| ------------------------- | ----------: |
| Rendimiento               |    97 / 100 |
| Accesibilidad automática  |   100 / 100 |
| Buenas prácticas          |   100 / 100 |
| First Contentful Paint    | 1.995,60 ms |
| Largest Contentful Paint  | 2.172,80 ms |
| Total Blocking Time       |        0 ms |
| Cumulative Layout Shift   |     0,05226 |
| Speed Index               | 1.995,60 ms |
| Advertencias de ejecución |     Ninguna |

Una medición anterior señaló un favicon 404; se corrigió con el logotipo existente y se añadió prioridad/preload al logo de login. La tabla registra la **última ejecución**, sin elegir la puntuación más alta. Son resultados de laboratorio sujetos a variación del equipo.

Reproducción:

```bash
npx playwright install chromium
npm run test:wpo
npm run report:bundle
```

Con Edge en PowerShell: `$env:PW_CHANNEL='msedge'; npm run test:wpo`. El script abre y cierra su propio preview en 5175 y el navegador con depuración local en 9223; esos puertos deben estar libres. Reportes detallados: `test-results/lighthouse-login.html` y `.json`, ignorados por Git. Lighthouse es dependencia de desarrollo y no forma parte del bundle de aplicación.

## Decisiones implementadas

- Rutas lazy, fallback accesible y límites de error globales, por portal y alrededor del mapa. El reintento de un chunk fallido recarga la aplicación.
- Mapa Leaflet/React Leaflet en un chunk diferido que se solicita al abrir el portal técnico. Playwright comprueba que la lista permanece utilizable si falla OpenFreeMap.
- Se eliminan MapLibre, su adaptador y worker. Leaflet es el único motor; Leaflet.VectorGrid renderiza los tiles vectoriales oficiales de OpenFreeMap permitidos por ADR-004.
- OpenFreeMap según ADR-004; no existe fallback a `tile.openstreetmap.org`. Se muestran estado no disponible y reintento.
- Inter se limita al alfabeto Latin utilizado por el portal; se eliminan descargas de otros subconjuntos. Imágenes de evidencia con carga lazy y dimensiones; logo con dimensiones, precarga y prioridad.
- Consultas cancelables al desmontar; cámaras, timers, observadores y URLs temporales con limpieza. Persistencia separada de la renderización y borradores serializados.
- CSS de componentes centralizado con Tailwind, sin los antiguos archivos de estilos superpuestos por rol.

## Riesgos y siguiente medición

Leaflet.VectorGrid renderiza los tiles vectoriales de OpenFreeMap sin añadir un segundo motor ni depender de WebGL. Debe verificarse el detalle en móviles reales; el mapa depende de la disponibilidad externa del proveedor. Su paquete transitivo incluye dependencias marcadas como deprecadas por npm, por lo que debe revisarse al actualizar dependencias.

El login todavía muestra un desplazamiento de 0,052 durante la carga asíncrona. Reservar el espacio exacto del selector y revisar el costo inicial del router son optimizaciones posteriores medibles. Medir en el hosting definitivo con Brotli/gzip, caché de assets por hash, HTTPS, política SPA y latencia de API. Esas configuraciones de despliegue no se modificaron en esta entrega.
