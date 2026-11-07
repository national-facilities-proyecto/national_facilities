# ADR-011: Contingencia cartográfica con teselas propias en AWS

**Fecha:** 2026-11-07
**Estado:** Implementación propuesta para revisión; infraestructura y validación real pendientes

## Contexto

El frontend utiliza Leaflet.VectorGrid 1.3.0 con OpenFreeMap, PBF XYZ, renderer
Canvas, zoom nativo 14 y seis capas de estilos OpenMapTiles. Un único proveedor
cartográfico introduce un punto de fallo externo. El repositorio utiliza Docker,
Vite, Vitest y Playwright; no contiene un sistema de IaC previo. La nube del resto
de la aplicación se mantiene según ADR-007.

## Decisión

Mantener OpenFreeMap como principal y habilitar mediante `VITE_AWS_MAP_TILES_URL`
un segundo origen de MVT estático propio, servido por CloudFront desde S3 privado
con OAC. Generar los datos a partir de fuentes legalmente obtenidas, con esquema
compatible con los estilos actuales. No espejar las teselas públicas del principal.

Un fallo HTTP, red, decodificación o timeout de 12 s retira y cancela la capa activa
y avanza una sola vez al respaldo. Tras doble fallo, ofrecer lista de tiendas y
reintento manual desde el principal. No ejecutar probes ni conmutación automática
de retorno. Conservar el objeto mapa, marcadores, GPS, coordenadas y controles.

Corregir el transporte de VectorGrid en su punto de extensión por instancia:
la versión actual silencia HTTP no exitoso y no captura correctamente rechazos.
Reutilizar sus decodificadores existentes, sin sustituir el motor de renderizado.

Entregar una plantilla CloudFormation aislada, exportador MBTiles TMS → XYZ y
procedimiento reproducible; no crear recursos, publicar ni desplegar durante esta
implementación. Detalles, licencias, costos y pruebas: [guía de operación](../maps/README.md).

## Alternativas

- Un segundo proveedor público mantiene la dependencia de terceros para servir
  datos y no satisface el objetivo de alojamiento propio.
- Migrar a MapLibre o raster exige cambiar el renderer o los estilos y amplía el alcance.
- S3 con un archivo MBTiles o PMTiles sin adaptar el cliente no cumple el contrato
  XYZ que consume la implementación actual.
- Detectar solo `tileerror` sin adaptar el transporte deja falsos éxitos ante 403/503.

## Consecuencias

Se mejora tolerancia a fallos e interoperabilidad conservando reglas de negocio.
La operación añade mantenimiento, generación de cartografía, licencias y costos
AWS. El piloto es regional; no existe garantía offline ni SLA medido. Se debe revisar
el adaptador al actualizar VectorGrid y validar la similitud visual de los datos.
Sin endpoint válido el respaldo queda deshabilitado, con error recuperable del
principal. Los tests controlados no demuestran disponibilidad real de AWS.
