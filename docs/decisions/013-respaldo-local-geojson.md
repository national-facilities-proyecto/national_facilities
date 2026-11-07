# ADR-013: OpenFreeMap → GeoJSON local → lista

**Fecha:** 2026-11-07
**Estado:** Implementado para revisión; sin merge ni despliegue

## Contexto

ADR-012 cacheaba archivos propios del visor, sin proporcionar cartografía alternativa.
La caída del proveedor seguía impidiendo ver un fondo cartográfico. El usuario
solicita un respaldo local real y regional, sin servicios adicionales ni teselas de
OpenFreeMap almacenadas.

## Decisión

Versionar un extracto GeoJSON real de OSM para Lima sur (ODbL-1.0), con siete límites
distritales y una selección de vías principales. Cargarlo del mismo origen solo
tras un fallo/timeout del principal y validarlo antes de representar una capa
React-Leaflet GeoJSON. No hay llamadas a proveedores externos al dibujarlo.

Conservar el MapContainer, coordenadas, marcadores, GPS, controles y vista. Retirar
y cancelar la capa principal antes del respaldo. Cada intento avanza una sola vez:
principal → local → lista. La recuperación del principal solo ocurre por reintento
manual. No se implementan sondeos ni retorno automático.

Exigir cobertura de todas las ubicaciones consultadas mediante rectángulo operativo
y punto-en-polígono con huecos. Si el recurso falla, no es válido o falta cobertura,
mostrar lista y explicación. Mantener la lista también si falla el chunk del visor.
Identificar el modo local con el aviso exacto solicitado y advertir cobertura limitada.

Extender únicamente la lista exacta/MIME admitidos por el worker al GeoJSON propio.
No cambiar siete días, 100 recursos ni 10 MiB. No almacenar teselas del principal.

## Consecuencias

Se reduce la dependencia de OpenFreeMap para la representación simplificada del
piloto cuando el recurso propio está accesible o en caché vigente. No equivale a un
callejero completo, ruteo, límites oficiales, cobertura nacional ni una PWA offline.
Se deben mantener procedencia, ODbL, versión, cobertura y checksum. Si falta un
prerrequisito, la lista sigue siendo el último recurso con datos ya cargados.

Procedencia y reproducción: [dataset](../../frontend/src/features/technician/data/README.md).
