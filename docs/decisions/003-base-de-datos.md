# ADR-003: Motor de Base de Datos

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
El dominio del negocio tiene relaciones claras entre tienda, cliente, técnico, ticket y checklist, y requiere consistencia transaccional para no perder trazabilidad — que es justamente el problema central que motivó el proyecto.

## Decisión
**PostgreSQL**, administrado a través del ORM de Django.

## Alternativas consideradas
- **MySQL**: viable, pero con soporte geoespacial menos maduro que PostgreSQL/PostGIS, relevante para el futuro geofencing.
- **MongoDB / NoSQL**: descartado; el dominio es altamente relacional (auditoría de tickets, historial de visitas, checklist por tienda), y un modelo no relacional dificultaría las consultas de trazabilidad que son el objetivo central del proyecto.

## Consecuencias
**Positivas:** consistencia ACID para auditoría, camino directo a PostGIS si se necesita geofencing avanzado más adelante.

**Negativas / riesgos:** requiere diseñar bien el modelo entidad-relación antes de programar, para evitar migraciones costosas a mitad de proyecto. En el MVP no se instalará PostGIS todavía: la validación de proximidad se calcula con la fórmula de Haversine directamente en el backend, dejando PostGIS como mejora futura si el tiempo lo permite.
