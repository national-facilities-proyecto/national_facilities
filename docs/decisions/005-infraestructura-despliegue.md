# ADR-005: Infraestructura y Despliegue

**Fecha:** 2026-08-23
**Estado:** Parcialmente reemplazado por [ADR-007](007-proveedor-de-nube.md)
**Última revisión:** 2026-09-09

> **Nota de revisión (09/09/2026).** Este registro contenía dos errores que se
> corrigen a continuación sin borrar el texto original, para conservar la
> trazabilidad de cómo evolucionó la decisión:
>
> 1. Afirmaba que el curso exige DigitalOcean como proveedor. **Es incorrecto.**
>    El curso exige Docker, arquitectura portable y base de datos administrada;
>    no impone un proveedor.
> 2. La elección de DigitalOcean quedó sin sustento al descontinuarse el crédito
>    estudiantil. El proveedor vigente es Google Cloud, registrado en el ADR-007.
>
> La parte de esta decisión referida a **contenedores** sigue vigente.

## Contexto

El curso exige el uso de Docker, una base de datos relacional administrada y la
capacidad de soportar pruebas de carga en fases posteriores del proyecto.

## Decisión

- **Contenedores:** Docker Compose en desarrollo local (servicios: backend,
  frontend, PostgreSQL). *Vigente.*
- **Nube:** ~~DigitalOcean, usando un Droplet o App Platform para la aplicación y
  DigitalOcean Managed Database (PostgreSQL)~~ → **Reemplazado por el ADR-007:
  Google Cloud (Cloud Run + Cloud SQL for PostgreSQL).**

## Alternativas consideradas

- **AWS + EC2:** descartado en su momento por la complejidad adicional de
  configuración (IAM, VPC, seguridad de red). Reevaluado en el ADR-007 con
  información actualizada.

## Nota pendiente — resuelta

Se preguntaba si "RDS" se refería al producto específico de AWS o al concepto
genérico de base de datos relacional administrada. **Queda resuelto:** la
exigencia es sobre el concepto. Cloud SQL for PostgreSQL lo cumple.

## Consecuencias

**Positivas:** la contenerización desde la primera semana permitió que el cambio
de proveedor no afectara al código de la aplicación. Este es el beneficio
concreto que la arquitectura agnóstica buscaba, verificado en la práctica.

**Negativas / riesgos:** se detallan en el ADR-007 para el proveedor vigente.
