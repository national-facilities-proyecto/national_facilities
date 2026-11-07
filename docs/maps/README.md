# Contingencia cartográfica local — National Facilities V2

Arquitectura: **OpenFreeMap → GeoJSON propio estático → lista de tiendas**.
Se conserva React-Leaflet/Leaflet.VectorGrid, los estilos del principal, la
validación de coordenadas, marcadores, GPS y controles. No se cambian backend,
PostgreSQL, asignaciones o permisos. No se añaden servicios de infraestructura.

## Principal y transición

`MapBaseLayer.tsx` sigue utilizando OpenFreeMap y sus mecanismos existentes:
`loading`, `load`, `tileerror`, timeout de 12 segundos, captura de importación,
limpieza de listeners y cancelación de las peticiones al retirar la capa.
`vectorTileTransport.ts` sigue comprobando HTTP/PBF, sin falsos éxitos ante 403/503.

Si falla, retira la capa antes de activar `LocalGeoJSONLayer.tsx`. El mapa React no
se remonta y el fallo no vuelve a ajustar los bounds. Se conservan los objetos de
marcador y las coordenadas que recibió el sistema. Cada intento avanza solo una
vez hacia local/lista; no hay polling, sondeos ni retorno automático al principal.

Cuando OpenFreeMap funciona no se solicita el archivo GeoJSON. Cuando falla se
carga `assets/lima-pilot-<hash>.geojson` del mismo origen del frontend. No se
consulta Overpass, OSM, ni otro proveedor durante su representación.

## Respaldo simplificado y cobertura

El archivo versionado contiene datos reales OSM: siete límites distritales de Lima
sur y 116 grupos de vías principales. Tamaño: 581 023 bytes. Fecha de snapshot,
licencia ODbL-1.0, relaciones OSM, consulta original y reproducción están en
[procedencia del dataset](../../frontend/src/features/technician/data/README.md).

`localPilot.ts` valida estructura, metadatos, geometrías Polygon/MultiPolygon y
LineString/MultiLineString, anillos cerrados no degenerados y coordenadas WGS84
finitas. El archivo se limita a 1 MiB, 500 features y 50 000 posiciones antes de
representarlo. No es una validación de exactitud oficial o de topología completa.

La cobertura exige que todas las tiendas válidas y el punto GPS activo estén
dentro del rectángulo operativo y de alguno de los polígonos distritales, excluyendo
huecos. No basta con estar dentro de un bbox. No se alteran ni aproximan las
coordenadas de las tiendas para hacerlas encajar.

Con cobertura válida se dibuja una capa React-Leaflet `GeoJSON`, con límites y vías
estilizados y tooltips de nombres insertados como texto. El mapa permite zoom,
desplazamiento y popups de las tiendas. Se muestra el mensaje solicitado:

> El mapa principal no está disponible. Se está utilizando cartografía simplificada

Se identifican la cobertura regional limitada y la atribución OSM. No es un callejero
completo ni un motor de rutas. Fuera del piloto puede no haber geometrías al desplazar
la vista; el aviso permanente lo advierte. Se conservan las coordenadas y vista del
principal sin limitar artificialmente el mapa al piloto.

Un archivo ausente, HTTP fallido, JSON corrupto/incompatible, error de construcción
de capa, falta de cobertura o timeout local de cinco segundos termina en lista.
La descarga local se cancela al desmontar/reintentar; las respuestas tardías no
instalan capas ni cambian estado sobre una vista desmontada.

## Lista y recuperación

La lista conserva nombres, direcciones y enlaces de indicaciones. Las entradas
con coordenadas inválidas pueden consultarse como texto, pero no generan enlaces
de coordenadas ni marcadores. `AssignedLocationsList.tsx` es independiente del
chunk del mapa: `LazyMap.tsx` también la muestra si no puede abrir el visor.

El botón del modo local o de la lista vuelve a intentar OpenFreeMap. Antes de
instalarlo se desmonta la capa GeoJSON. Si vuelve a fallar, el nuevo intento puede
usar otra vez el mismo GeoJSON. Un cambio de tiendas/GPS durante el modo local
revalida cobertura sin repetir su descarga; si falta cobertura, pasa a lista.

## Caché controlada

Se mantiene el Service Worker existente. La lista exacta generada por
`mapAssetPlugin.ts` incluye ahora el GeoJSON propio con hash, además de JS/CSS del
visor. El worker admite MIME `application/geo+json` o `application/json` únicamente
para un GeoJSON de esa lista y del mismo origen. API, HTML, autenticación, otros
GeoJSON y teselas continúan fuera del alcance.

La política no cambia:

- Cache-first para entradas vigentes.
- Caducidad absoluta de **siete días**, sin renovarla por lectura.
- Máximo **100 recursos y 10 MiB** de cuerpos por versión, expulsión FIFO.
- Operaciones serializadas; tolerancia a cuota/lectura/escritura denegadas.
- Limpieza bajo demanda y borrado solo de versiones propias al activar.
- Registro en producción segura, sin forzar `skipWaiting`.

El GeoJSON se almacena solo tras solicitar el respaldo, no se precarga mientras
el principal funciona. Si no está guardado y no hay red para descargarlo del
frontend, se utiliza la lista. Un archivo vencido no se sirve deliberadamente.
El navegador puede eliminar cachés por espacio, modo privado o limpieza manual.
El límite mide cuerpos, no todo el overhead físico del almacenamiento.

El worker limita la red de sus recursos a cuatro segundos por fetch; la carga
local tiene además su propio límite de cinco segundos. No existen reintentos
automáticos en bucle. Un contenido local corrupto puede quedar almacenado hasta
expirar o limpiar la caché; el runtime siempre lo valida y pasa a lista. Una
actualización válida se publica con un nuevo hash/build.

**No se almacenan teselas de OpenFreeMap.** Sus peticiones siguen usando fetch y
la caché HTTP normal que administre el navegador. No se descarga ninguna zona de
OpenFreeMap para offline. La restricción de User-Agent para descargas offline
evaluada en ADR-012 no se aplica como permiso para copiar sus teselas.

## Límites de disponibilidad

El respaldo elimina la dependencia de OpenFreeMap para la representación
simplificada del piloto cuando el archivo local está accesible o en caché vigente.
No garantiza todo Lima, Perú, todas las calles, datos actualizados continuamente,
precisión catastral ni SLA. Tampoco garantiza abrir o recargar todo el portal sin
Internet: HTML, dependencias compartidas y datos de negocio no se convierten en
una PWA offline. Los enlaces de indicaciones necesitan conectividad externa.

El alojamiento existente sigue sirviendo un archivo adicional; no se crean S3,
CloudFront, proveedores alternativos ni nuevos servicios de pago. Esto no implica
que el tráfico del alojamiento existente sea ilimitado o gratuito.

## Verificación reproducible

Desde `frontend`:

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run build:api
node scripts/check-api-build.mjs
npm run test:map:e2e
```

La suite Playwright construye `maptest` y usa tiendas ficticias, capas Leaflet/SVG,
Service Worker y Cache Storage reales. Intercepta el principal con MVT controlado;
el GeoJSON del respaldo es el archivo OSM real versionado, servido por Vite preview.
El fixture `maptest` no se publica en el build normal.

Para revisar manualmente: abrir el visor en HTTPS/localhost, bloquear únicamente
`tiles.openfreemap.org`, comprobar rutas locales, atribución, aviso, marcadores y
zoom. Bloquear o corromper el GeoJSON y comprobar la lista. Probar una tienda fuera
del piloto. Tras un respaldo exitoso y con worker activo, desconectar Internet y
reintentar para comprobar reutilización del GeoJSON; no confundirlo con recargar
todo el portal offline. Desbloquear el principal y pulsar reintento para recuperarlo.

Resultados/capturas: [VERIFICATION.md](VERIFICATION.md).

Referencias: [licencia OSM](https://www.openstreetmap.org/copyright),
[Overpass, uso público](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html),
[React-Leaflet v4](https://react-leaflet.js.org/docs/v4/api-components/#geojson),
[eliminación del almacenamiento del navegador](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
