# ADR-008 — API autoritativa y ejecución recuperable

Fecha: 2026-10-02. Estado: implementación técnica realizada; decisiones operativas pendientes identificadas por separado.

## Contexto

Los portales existentes dependían de mocks y contratos parciales. El encargo exige persistencia PostgreSQL, controles de acceso y recuperación entre dispositivos, con trabajo físico separado de un formulario de cinco minutos. La arquitectura Django/DRF + React + PostgreSQL y almacenamiento Google Cloud se conserva.

## Implementación

- Una fuente HTTP operativa, DTO desconocidos validados y catálogos con IDs reales. Fixtures/dobles están exclusivamente en tests.
- Servicios de transición transaccionales y bloqueos con orden consistente (ticket antes de visita); restricciones de unicidad y orden temporal en PostgreSQL.
- Claves de idempotencia vinculadas a usuario, ruta y payload, con respuesta confirmada en la misma transacción. Reintentos devuelven estado actual. UUID estable para archivos.
- Inicio real independiente de primera apertura. La pareja apertura/vencimiento se fija una sola vez; el trabajo previo no se limita a cinco minutos.
- Autoguardado servidor con revisión CAS; ante conflicto o fallo se conserva el editor y se concilia explícitamente. El almacenamiento del navegador solo guarda sesión/identificadores de operación; no datos operativos.
- JWT con refresh rotatorio y versión de usuario para revocación. Contraseña inicial se exige en servidor; logout revoca los dispositivos del usuario. Expiración del token no altera el plazo de la visita.
- Fotos multipart/Blob privadas, autor/contexto, formato/tamaño/cantidad verificados y eliminación lógica controlada. Temporales del reportante se recuperan mediante API. Gallery/camera permitidas; capture time desconocido queda nulo.
- Snapshot de tareas/versiones, ubicación/cliente/radio; datos históricos faltantes conservan nulos. Excepciones independientes de tiempo/GPS, decisiones fechadas y eventos con actor/datos.
- Administración operativa se realiza por portal/API con validadores y auditoría. El sitio Django adicional es de inspección; no permite editar modelos ni cambiar contraseña por un camino que evite revocar JWT.
- Volumen local duradero en desarrollo y bucket GCS privado en nube; check impide almacenamiento local efímero en Cloud Run.

- Estados operativos confirmados: Pendiente, En proceso, En revisión y Finalizado. El cuadro de justificación se abre al vencer; el registro incompleto puede completarse y un rechazo permite corrección/reenvío en la misma ejecución, sin nuevo plazo. Versiones de contenido/justificación impiden decisiones sobre una pantalla antigua; eventos conservan cada decisión.
- Frecuencia mensual: visitas independientes por tienda/mes/cuota, sin separación mínima y con posibilidad de repetir técnico. La bolsa publicada conserva sus obligaciones y snapshots aunque se edite el contrato.
- Reserva: dos horas desde el reclamo. El servidor libera automáticamente solo checklists sin iniciar, con bloqueo de fila e historial del propietario anterior. Consultas/acciones comprueban vencimientos y un servicio periódico los procesa sin tráfico. Repetir reclamo no extiende la reserva; comenzar el trabajo desactiva su caducidad. La migración recupera únicamente fechas de eventos reales del propietario actual; los reclamos históricos sin evento no se regularizan inventando una hora.

## Consecuencias y límites

Hay conflictos explícitos para revisiones antiguas, reclamo ajeno o transiciones incompatibles. No se resuelven errores con datos inventados. Históricos inconsistentes detienen migraciones para revisión, sin borrar/fusionar.

No se inventa fin físico, prórroga, aprobación de contenido faltante ni SLA. Finalizado es terminal conforme a la confirmación del usuario; no exige otra aceptación del ticket. El [registro de decisiones](../integration/decisions-pending.md) recoge las confirmaciones: contratos simultáneos prohibidos, mínimo de dos atenciones de tickets por tienda/mes separado del checklist, tiendas asignadas por administrador y reasignación solo en Pendiente. El usuario aplazó SLA y excluyó importación histórica. PostgreSQL usa exclusión de rangos de fechas activos (`btree_gist`); la bolsa conserva el mínimo publicado en snapshot.

La [validación](../../frontend/docs/validation.md) separa PostgreSQL/navegador real, cobertura limitada a módulos medidos y despliegue GCS/Cloud Run no comprobado. La [matriz](../integration/view-endpoint-matrix.md) es el checklist de vistas y bloqueos.
