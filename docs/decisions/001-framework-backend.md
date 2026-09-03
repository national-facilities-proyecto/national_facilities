# ADR-001: Framework de Backend

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
El sistema para National Facilities necesita un backend que exponga una API para 4 roles (técnico, supervisor de cuenta, supervisor de tienda cliente, administrador), maneje datos sensibles (evidencia fotográfica, geolocalización, contratos por cliente) y debe estar operativo al 100% en un plazo de 10 semanas académicas. El equipo tiene nivel disperso: a la mayoría le cuesta Java, y solo un integrante tiene experiencia previa con TypeScript.

## Decisión
Se utilizará **Python + Django + Django REST Framework (DRF)** como framework de backend, expuesto como API REST consumida por un frontend desacoplado en React.

## Alternativas consideradas

### Java + Spring Boot
- Ventajas:
  - La opción más madura y probada en sistemas críticos (banca, seguros), con dos décadas de uso en producción.
  - Mayor capacidad de escalabilidad horizontal en escenarios de alto volumen transaccional concurrente, gracias a la JVM.
  - Ecosistema de seguridad muy completo (Spring Security: OAuth2, JWT, RBAC granular).
- Desventajas:
  - Curva de aprendizaje considerablemente más alta para un equipo que ya reporta dificultad con la sintaxis y rigidez del lenguaje.
  - Mayor tiempo de configuración inicial (Maven/Gradle, anotaciones, capas repository/service/controller) frente a Django, que trae más funcionalidad "de fábrica".
  - Spring Security es muy robusto pero **exige configuración explícita y buen dominio del framework**; con un equipo de nivel disperso existe riesgo de que quede mal configurado.
  - Sin panel de administración incluido: habría que construir un backoffice a medida, consumiendo tiempo valioso de las 10 semanas disponibles.
  - La capacidad de escalabilidad que ofrece supera ampliamente el volumen de usuarios que este proyecto académico va a manejar (decenas de tiendas, cientos de técnicos), por lo que esa ventaja no se traduce en beneficio real para este caso.
- **Rechazada** por riesgo de ejecución del cronograma: sus fortalezas (escalabilidad extrema, robustez de sistemas bancarios) exceden lo que este proyecto necesita, mientras que su curva de aprendizaje sí representa un riesgo concreto para el plazo.

### Node.js + NestJS (TypeScript)
- Ventajas: mismo lenguaje que el frontend (TypeScript), arquitectura modular con inyección de dependencias similar a Spring, y el tipado estático reduce errores de integración entre capas.
- Desventajas: la seguridad (CSRF, XSS, sanitización, protección contra inyección SQL) debe configurarse explícitamente; un equipo con nivel disperso puede omitir alguna de estas configuraciones sin darse cuenta.
- **Descartada** como opción final por priorizar la seguridad por defecto sobre la unificación de lenguaje.

### Python + Django + DRF (elegida)
- Ventajas:
  - Seguridad activada por defecto: protección CSRF, escape automático de XSS y protección contra inyección SQL vía ORM, sin configuración manual adicional.
  - Panel de administración incluido de fábrica (Django Admin), utilizable como backoffice inicial para supervisores de National Facilities sin construir esa interfaz desde cero.
  - GeoDjango + PostGIS ofrece el camino más maduro para geofencing (validar que el técnico esté físicamente en la tienda), atacando directamente el problema original de evidencia falsa.
  - Sintaxis más flexible, potencialmente más accesible que TypeScript estricto para un equipo al que ya le cuesta la rigidez de Java.
  - Ecosistema maduro y ampliamente documentado, con abundante disponibilidad de librerías de terceros y de profesionales en el mercado local, lo que facilita el mantenimiento y la continuidad del sistema una vez entregado a la empresa.
- Desventajas: introduce dos ecosistemas en el proyecto (pip en backend, npm en frontend) en lugar de uno solo.

## Criterios de decisión (de mayor a menor peso)
1. Seguridad por defecto de los datos del negocio.
2. Capacidad de resolver el problema de evidencia falsa (geofencing).
3. Velocidad de entrega del MVP (backoffice incluido).
4. Curva de aprendizaje del equipo.

## Consecuencias
**Positivas:** menor superficie de errores de seguridad, backoffice funcional temprano, base sólida para geofencing futuro.

**Negativas / riesgos:** manejo de dos lenguajes en el proyecto (se mitiga documentando la API con DRF + OpenAPI/Swagger para que el contrato entre frontend y backend quede explícito); el equipo debe invertir tiempo inicial en aprender Django/DRF si no lo conoce (se mitiga con pair programming, revisión de código por Pull Request y la extensa documentación oficial del framework).
