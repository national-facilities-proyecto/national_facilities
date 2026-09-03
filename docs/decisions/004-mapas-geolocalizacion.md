# ADR-004: Mapas y Geolocalización

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
El sistema necesita: (1) mostrar en un mapa la ruta y las tiendas asignadas al técnico, (2) obtener la ubicación del técnico, y (3) validar que el checklist se cerró estando físicamente en la tienda (geofencing) — sin contar con presupuesto para servicios de pago.

## Decisión
- **Visualización de mapa:** Leaflet (librería open source) con tiles de **OpenFreeMap o MapTiler** (planes gratuitos, sin tarjeta de crédito).
- **Ubicación del técnico:** Geolocation API nativa del navegador (`navigator.geolocation`).
- **Validación de proximidad (geofencing):** fórmula de Haversine calculada en el backend, sin servicio externo.
- **Ruteo por calles (opcional, mejora futura):** OpenRouteService, que ofrece un plan gratuito orientado a evaluación y proyectos de bajo volumen, sin tarjeta de crédito.

## Alternativas consideradas

### Google Maps Platform
- Ventajas: mejor precisión de geocodificación y estilos de mapa muy pulidos.
- Desventajas: desde marzo de 2025 Google eliminó el crédito gratuito de $200/mes y ahora exige tarjeta de crédito desde el primer momento, con un umbral gratuito reducido (del orden de 10,000 solicitudes/mes) por cada API por separado. Para un proyecto académico sin presupuesto, esto representa un riesgo real de facturación no controlada.
- **Rechazada** por el riesgo financiero y la barrera de la tarjeta de crédito.

### Servidor público `tile.openstreetmap.org` directamente
- Descartado: su política de uso restringe explícitamente el uso de alto volumen o en producción sin permiso previo; en su lugar se usa un proveedor derivado (OpenFreeMap/MapTiler) que sí permite este uso de forma gratuita.

## Consecuencias
**Positivas:** costo cero, sin dependencia de tarjeta de crédito, resuelve directamente el problema de evidencia falsa mediante geofencing.

**Negativas / riesgos:** obligación de mostrar la atribución "© OpenStreetMap contributors" visible en el mapa (requisito de la licencia ODbL); si el proyecto creciera a un volumen alto de usuarios reales, se debería reevaluar el proveedor de tiles.
