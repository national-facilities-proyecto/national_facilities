# ADR-005: Infraestructura y Despliegue

**Fecha:** 2026-08-23
**Estado:** Aceptado

## Contexto
El curso exige el uso de Docker, una base de datos relacional administrada ("RDS") y DigitalOcean como proveedor de nube, con capacidad de soportar pruebas de carga en fases posteriores del proyecto.

## Decisión
- **Contenedores:** Docker Compose en desarrollo local (servicios: backend, frontend, PostgreSQL).
- **Nube:** DigitalOcean, usando un Droplet o App Platform para la aplicación y **DigitalOcean Managed Database (PostgreSQL)** como equivalente funcional al "RDS" solicitado.

## Alternativas consideradas
- **AWS (RDS real) + EC2:** descartado como proveedor principal por la complejidad adicional de configuración (IAM, VPC, seguridad de red) que no se justifica dado el plazo de 10 semanas y el nivel del equipo; además implicaría una arquitectura multi-nube innecesaria si el resto del stack vive en DigitalOcean.

## Nota pendiente
"RDS" es el nombre de un producto específico de AWS; DigitalOcean no tiene un producto con ese nombre, sino "Managed Database". Se debe confirmar con el docente si se refiere al concepto genérico de base de datos relacional administrada (en cuyo caso esta decisión lo cumple) o si exige explícitamente el uso del producto de AWS.

## Consecuencias
**Positivas:** configuración más simple para un equipo estudiantil, costo predecible, arquitectura de un solo proveedor de nube.

**Negativas / riesgos:** menor cantidad de documentación/tutoriales que AWS; se mitiga con la documentación oficial de DigitalOcean, que es de las más completas del mercado para este tipo de despliegue.
