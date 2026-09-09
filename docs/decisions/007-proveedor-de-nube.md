# ADR-007: Proveedor de nube y servicios de despliegue

**Fecha:** 2026-09-09
**Estado:** Aceptado
**Reemplaza a:** ADR-005 (en lo relativo al proveedor de nube)

## Contexto

El ADR-005 estableció DigitalOcean como proveedor, sustentado en el crédito
estudiantil de USD 200 disponible a través del GitHub Student Developer Pack.

Ese fundamento desapareció. DigitalOcean se retiró del Student Developer Pack:
el 31/07/2026 fue el último día de canje y el 01/08/2026 expiraron todos los
créditos, incluidos los ya otorgados. Mantener DigitalOcean implicaría un costo
mensual asumido por el equipo, incompatible con el criterio de presupuesto nulo.

El ADR-005 afirmaba además que el curso exige DigitalOcean como proveedor. Esa
afirmación es incorrecta y queda rectificada aquí: la exigencia recae sobre el
uso de Docker, la portabilidad de la arquitectura y el empleo preferente de una
base de datos administrada, no sobre un proveedor determinado.

## Decisión

**Google Cloud Platform**, con la siguiente correspondencia de servicios:

| Componente | Servicio |
|---|---|
| API (Django + DRF) | Cloud Run |
| Interfaz (React + Vite) | Cloud Run |
| Base de datos | Cloud SQL for PostgreSQL |
| Registro de imágenes Docker | Artifact Registry |
| Evidencia fotográfica | Cloud Storage |
| Monitoreo de CPU, memoria y logs | Cloud Monitoring + Cloud Logging |

El registro de la cuenta se difiere deliberadamente al **23/09/2026**.

## Alternativas consideradas

| Alternativa | A favor | En contra |
|---|---|---|
| Mantener DigitalOcean | No obliga a rehacer documentación | Costo mensual sin crédito disponible |
| AWS (Free Plan) | Aurora PostgreSQL serverless en capa gratuita desde marzo 2026; ventana de 6 meses | Límite de 1 GiB de almacenamiento por clúster, insuficiente para las pruebas de carga; complejidad de red y permisos; riesgo de cargos por servicios no cubiertos |
| Oracle Cloud | Capa permanentemente gratuita sin vencimiento | Menor documentación; mayor curva de configuración |
| PostgreSQL gratuitas de prototipo (tipo Supabase) | Sin costo | No permiten monitorear consumo de procesador, memoria ni registros de la base, capacidad exigida para las pruebas de estrés; sus límites pueden interrumpir la ejecución de las pruebas |

## Justificación

1. **Cloud Run cubre la exigencia de autoescalado de la Unidad 4 sin
   configuración adicional.** Recibe la imagen Docker y multiplica instancias
   según la carga, lo que permite demostrar el comportamiento bajo K6 de forma
   directa y observable.
2. **Cloud SQL es una base de datos administrada real**, con monitoreo de
   procesador, memoria y registros desde Cloud Monitoring, sin necesidad de
   instalar Grafana o Prometheus.
3. **No altera decisiones previas.** Sigue siendo PostgreSQL: el ADR-003 y el
   código Django no se modifican. La contenerización adoptada desde el inicio
   (ADR-005) hizo que el cambio de proveedor no afectara a la aplicación, que es
   precisamente lo que la arquitectura agnóstica buscaba garantizar.
4. **El crédito de USD 300 es el más holgado de las alternativas**, margen
   relevante porque el consumo se concentra en las pruebas de carga.

## Riesgo principal y su mitigación

El crédito de Google Cloud vence a los **90 días fijos desde el registro**, no a
los 12 meses. Registrar hoy (09/09) haría que venciera el 08/12, dos días antes
del cierre real del proyecto.

**Mitigación:** diferir el registro al 23/09/2026, con lo que la ventana llega al
22/12 y cubre el cierre del proyecto con margen. Antes de esa fecha el equipo
debe tener preparados en local el Dockerfile de producción, el build del
frontend, las variables de entorno y los comandos de despliegue, de modo que el
crédito no se consuma en aprendizaje.

**Mitigaciones complementarias:**

- Alerta de presupuesto en USD 50 el mismo día del registro.
- Tope máximo de instancias en Cloud Run, para que una prueba de K6 mal
  configurada no agote el crédito.
- La cuenta se registra a nombre del proyecto, no de un integrante en
  particular, y sus credenciales quedan accesibles a más de una persona.
- No emplear la "instancia de prueba gratuita" de Cloud SQL: dura 30 días, no
  admite modificar su configuración ni realizar copias de respaldo. Se crea una
  instancia normal financiada con el crédito.

## Consecuencias

**Positivas:** autoescalado demostrable sin trabajo adicional; monitoreo nativo
para las Unidades 3 y 4; sin costo dentro del plazo del proyecto.

**Negativas / riesgos:** ventana de 90 días sin prórroga posible; ningún
integrante tiene experiencia previa con la plataforma, lo que exige la
preparación anticipada descrita arriba.

**Cambio derivado obligatorio:** el sistema de archivos de Cloud Run es efímero.
La evidencia fotográfica, que hoy se almacena con `ImageField` sobre el disco del
contenedor, debe migrar a Cloud Storage antes del despliegue. De no hacerse, las
fotografías se pierden en cada reinicio o escalado de la instancia.

## Documentos afectados por esta decisión

- ADR-005 — corregido y marcado como reemplazado en cuanto al proveedor
- README.md — tabla de stack tecnológico
- ENT-08 SLA, sección 1
- ENT-08 SLO, sección 2
- ENT-09 Plan de Medición, fila de disponibilidad
- Documento de Selección de Herramientas, sección 3
- Informe del Avance 1, secciones 7.5, 8.1.2 y 9.4
- HU-26 en Jira y en el Product Backlog
