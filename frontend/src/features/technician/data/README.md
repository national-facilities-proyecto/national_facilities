# Piloto cartográfico local: Lima sur, v1

`lima-pilot.geojson` es un extracto derivado de **datos geográficos reales de
OpenStreetMap**, no de teselas de OpenFreeMap. Se obtuvo con una consulta manual
acotada a Overpass y se versiona para servirlo desde el mismo frontend.
La aplicación no consulta Overpass, OSM, GeoBoundaries ni otro proveedor al dibujarlo.

## Procedencia y licencia

- Fuente: OpenStreetMap contributors, obtenida mediante `https://overpass-api.de/api/interpreter`.
- Descarga: 2026-11-07. Timestamp de la base informado por Overpass: **2026-11-07T17:02:51Z**.
- Licencia de los datos y de este extracto derivado: **Open Database License 1.0 (ODbL-1.0)**.
- Atribución visible: **© OpenStreetMap contributors**, enlazada a <https://www.openstreetmap.org/copyright>.
- Texto de licencia: <https://opendatacommons.org/licenses/odbl/1-0/>.
- La licencia de datos no cambia las condiciones del código de la aplicación ni
  convierte las coordenadas de tiendas del sistema en datos de OpenStreetMap.
- Es una referencia comunitaria simplificada; no acredita límites oficiales,
  geofencing, precisión catastral, transitabilidad ni rutas de navegación.

## Cobertura y contenido

Se incluyen los límites completos de estas relaciones administrativas de nivel 8:

| Distrito según OSM     | Relación OSM |
| ---------------------- | ------------ |
| Barranco               | 1944691      |
| Chorrillos             | 1944714      |
| Miraflores             | 1944770      |
| San Borja              | 1944802      |
| San Juan de Miraflores | 1944816      |
| Santiago de Surco      | 1944844      |
| Surquillo              | 1944852      |

Las vías son una selección de segmentos con nombre y clase `motorway`, `trunk`
o `primary`, agrupados en 116 features MultiLineString por nombre y clase.
No se incluyen todas las calles ni se calculan rutas. Los nombres y geometrías
son los recibidos de OSM; no se inventan conexiones, calles ni distritos.

El área operativa declarada es **[-77.11, -12.27, -76.90, -12.04]**, en orden
oeste/sur/este/norte. La cobertura de una ubicación exige estar dentro de ese
rectángulo **y** dentro de alguno de los polígonos distritales, excluyendo huecos.
El rectángulo es una restricción del piloto, no un distrito inventado.
Se exige cubrir todas las tiendas válidas consultadas y el punto GPS, si está activo.
Si una ubicación no está cubierta, se descarta el respaldo y aparece la lista.

Overpass devuelve las geometrías completas de vías que coinciden con la consulta,
por lo que puede haber tramos y partes de distritos fuera del rectángulo declarado.
Eso no amplía la cobertura que anuncia ni acepta la aplicación. Al desplazar la
vista fuera del piloto puede no haber geometría; el aviso permanente lo indica.

## Tamaño e integridad

- Archivo: **581 023 bytes** sin compresión; 123 features (7 distritos y 116 grupos de vías).
- SHA-256: `e80708c8900f84e56ade9625f222a2357c1ee8ace4254165ad00afd8818a1f22`.
- SHA-256 de la respuesta JSON fuente: `81518c5675dbf226234e2fe6aff7b400ece6283a8b8fa9eff646bcdb89b436ed`.
- GeoJSON en WGS84, coordenadas **[longitud, latitud]**.
- El runtime exige FeatureCollection, metadatos compatibles, polígonos cerrados
  no degenerados, geometrías admitidas y coordenadas numéricas finitas. Limita
  a 500 features, 50 000 posiciones y 1 MiB antes de representar el archivo.
- No se realizó una certificación topológica/cartográfica de la fuente. El validador
  evita estructuras incompatibles; no acredita exactitud de todos los datos OSM.

## Transformaciones reproducibles

La consulta original está en `lima-pilot.overpassql`. La descarga fue una operación
manual de preparación, no un servicio de la aplicación. Para reconstruir el mismo
extracto se necesita la misma respuesta fuente; una consulta posterior puede
devolver modificaciones. La fecha puede fijarse con el mecanismo histórico de
Overpass cuando el servidor lo soporte. No ejecutar descargas masivas ni bucles.

Desde `frontend`, con la respuesta guardada fuera del repositorio:

```powershell
node scripts/prepare-lima-pilot.mjs C:/map-work/overpass-response.json src/features/technician/data/lima-pilot.geojson
npm test -- src/features/technician/localPilot.test.ts
```

El conversor solo lee el JSON local. Une miembros `outer` de las relaciones por
extremos exactamente iguales; falla si un anillo no cierra. Normaliza el sentido
de los anillos exteriores a antihorario, sin introducir coordenadas nuevas.
Esta versión de conversor rechaza fuentes con miembros `inner` para exigir revisión
manual; el validador y el control de cobertura del frontend sí entienden huecos.
Agrupa segmentos de vías como MultiLineString sin unir extremos ni simplificar
o redondear coordenadas. Quita atributos ajenos al visor y conserva identificadores
OSM para trazabilidad. Minifica el JSON; `.gitattributes` conserva finales LF para
que el checksum no cambie entre sistemas.

Para una actualización: revisar fuente/licencia/cobertura, fijar versión y fecha
en el conversor, reconstruir, revisar el diff geográfico y metadatos, actualizar
checksum y pruebas y ejecutar la suite. No ampliar la cobertura solo cambiando
el rectángulo. La publicación requiere un nuevo build de frontend; no hay
actualización automática de datos en segundo plano.

## Distribución y caché

Vite emite `assets/lima-pilot-<hash>.geojson`. El worker lo incorpora a su lista
exacta de recursos propios y lo almacena bajo la misma política existente:
**7 días, 100 recursos, 10 MiB** de cuerpos por versión, expulsión FIFO.
Solo se descarga al necesitar el respaldo. Si todavía no está guardado y no hay
conexión al frontend, se utilizará la lista. El navegador puede eliminarlo o puede
caducar; no se garantiza cobertura offline de todo Lima ni recarga offline del portal.

Fuentes de referencia: [datos/licencia OSM](https://www.openstreetmap.org/copyright),
[uso de la instancia pública Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
