# ADR-012: Caché local limitada de archivos propios del visor

**Fecha:** 2026-11-07
**Estado:** Alternativa conservadora aprobada por el usuario

## Contexto

Se descarta el respaldo de S3/CloudFront por costo de infraestructura. El usuario
solicita evaluar Service Worker/Cache Storage y no implementar caché de teselas
si las condiciones del proveedor son incompatibles.

Los términos consultados de OpenFreeMap requieren identificación User-Agent para
descargas offline. El frontend no puede garantizar un User-Agent personalizado
en Chrome; no hay aclaración expresa sobre la caché oportunista web de teselas.
No se interpreta esto como prohibición general de toda caché, pero tampoco como
autorización de una modalidad offline específica.

## Decisión

El usuario aprueba cachear únicamente archivos JS/CSS propios del visor mediante
Service Worker y mantener teselas bajo caché HTTP normal del navegador. No crear
Cache Storage para PBF ni descargas anticipadas o automáticas de áreas.

Una lista exacta generada en build limita el alcance del worker. Política cache-first,
siete días de caducidad absoluta, máximo 100 recursos/10 MiB de cuerpos y expulsión
FIFO. Sin API, HTML, datos de negocio ni credenciales. Limpieza de versiones propias,
tolerancia a cuota/registro/almacenamiento denegados y timeout de red acotado.

Conservar OpenFreeMap, Leaflet.VectorGrid, estilos, validación de coordenadas,
cancelación, timeout, protección de desmontaje y lista de tiendas ante fallo.
Retirar únicamente componentes específicos de la propuesta AWS. No modificar backend.

## Consecuencias

No se añaden recursos de infraestructura. La caché es una optimización local y
puede ser eliminada por el navegador. No ofrece mapas offline, cobertura territorial,
todos los zooms ni recarga offline del portal. No es una aplicación PWA completa.
La política PBF podrá reconsiderarse tras aclaración del proveedor, sin asumir que
un header alternativo sustituye su exigencia de User-Agent.

Detalles, fuentes y reproducción: [guía](../maps/README.md).
