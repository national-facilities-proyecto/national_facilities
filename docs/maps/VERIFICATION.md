# Verificación de la alternativa aprobada

Rama: `feat/local-map-assets-cache`. Se conserva el commit anterior como historia;
el diff final retira las partes específicas del respaldo AWS. No se modifica main,
no se ejecuta merge y no se despliega.

Fecha: 2026-11-07. Entorno: Windows, Node 22.14.0 y Microsoft Edge.

| Comprobación | Resultado real |
| --- | --- |
| `npm run test:coverage` | 46 archivos, 310 pruebas aprobadas; umbrales existentes aprobados |
| `npm run test:map:e2e` | 7 escenarios aprobados sobre build real y Service Worker real |
| `npm run typecheck` | Correcto |
| `npm run lint` | Correcto |
| `npm run format:check` | Correcto |
| `npm run build` | Correcto; emite map-assets-sw.js y excluye el fixture maptest |
| `npm run build:api` | Correcto |
| `node scripts/check-api-build.mjs` | Correcto; bundle API sin fixtures/repositorio mock |

La cobertura existente mide módulos centrales seleccionados: statements 92.35%,
branches 92.45%, functions 92.39%, lines 92.83%. Esos porcentajes **no representan
la cobertura del worker ni del módulo cartográfico**; estos tienen sus pruebas
específicas unitarias y de navegador. No se amplió artificialmente ese alcance.

La prueba de viabilidad anterior verificó términos oficiales y una sola solicitud
HEAD real a OpenFreeMap; no se descargaron áreas. Las pruebas automatizadas usan
respuestas MVT sintéticas para no depender del proveedor. El worker y la caché
de archivos propios son reales en Playwright, no mocks de Service Worker.

Se corrigió una incompatibilidad de claves debida a Vary/Origin entre peticiones
de CSS/módulos y fetch. Las claves normalizadas de archivos estáticos no conservan
cabeceras de solicitud. Las lecturas no reescriben ni prolongan la vida de entradas.

## Alcance comprobable

- Pruebas de la política: hit, miss, fallo de red, caducidad absoluta, recuperación,
  límites de cantidad/bytes, concurrencia, cuota, almacenamiento denegado, limpieza
  de versiones propias y exclusión de teselas/API/HTML/Authorization.
- Pruebas de registro: producción segura, desarrollo, contexto inseguro y error tolerado.
- Pruebas de ciclo de mapa: carga, timeout inicial/tardío, errores, limpieza,
  cancelación, desmontaje/import tardío y reintento sin bucles.
- Integración de componente: identidad de mapa/marcadores, GPS, coordenadas y lista.
- Playwright sobre build real: worker y Cache Storage reales, reutilización offline
  de archivo propio guardado, ausencia/borrado, caducidad y recuperación online.
- Leaflet/VectorGrid reales con HTTP, rechazo de red, PBF corrupto y timeout de
  OpenFreeMap simulados; tiendas accesibles y recuperación manual del principal.

Esto no demuestra mapas offline ni disponibilidad de teselas/zonas/zooms. No se
activa una caché PBF personalizada: esa parte se descartó en la alternativa aprobada.
No se cachéan HTML ni toda la cadena de dependencias; no se garantiza abrir el
portal sin red. La suite completa E2E de negocio requiere API/BD preparadas y se
conserva en CI; la suite de mapas no requiere backend.

## Retirado y conservado

Se retiran la plantilla CloudFormation, exportador MBTiles y pruebas, validador de
dataset, capturas AWS, variable VITE_AWS_MAP_TILES_URL, build arg Docker, rama de
selección AWS y sus escenarios específicos. Las guías de despliegue cartográfico
se sustituyen por la explicación de almacenamiento local. El ADR-011 permanece
como decisión histórica descartada; ADR-012 registra la alternativa aprobada.

Se mantienen todas las pruebas previas a AWS, el adaptador de coordenadas, estilos,
correcciones del transporte, cancelación, timeouts, lista y reintento. No se cambian
paquetes/versiones, backend, datos, usuarios, permisos ni configuración de PostgreSQL.

## Evidencia visual

Captura de un fallo HTTP controlado, con tiendas ficticias y renderer Leaflet real.
No demuestra disponibilidad offline del mapa base.

![Mapa no disponible y tiendas accesibles](screenshots/map-unavailable.png)

## Archivos principales

- Nuevos: `frontend/mapAssetPlugin.ts`, `mapAssetWorker.ts`, `registerMapAssetWorker.ts`
  y sus pruebas; `frontend/map-tests/map-cache.spec.ts`, entorno ficticio `.env.maptest`
  y ADR-012.
- Adaptados: Vite, Nginx, registro en `main.tsx`, configuración Playwright/CI,
  componente/fábrica/ciclo de mapa y escenarios de integración.
- Documentación: esta evidencia y guía de limitaciones; ADR-011 marcado descartado.
- Retirados: herramientas, configuración y pruebas específicas de AWS detalladas arriba.

No se ejecutó la suite E2E completa de negocio por faltar API/BD de integración
locales; se conserva en el workflow. No se comprobó disponibilidad de OpenFreeMap
durante las pruebas de integración: sus respuestas están interceptadas.
