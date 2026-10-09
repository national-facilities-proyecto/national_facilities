# Registro de decisiones de negocio

Actualizado el 2026-10-02. El usuario confirmó las reglas de ejecución, reserva, contratos, mínimo por tienda, asignaciones y reasignación. Aplazó expresamente el SLA y excluyó la importación de ejecuciones anteriores al lanzamiento.

## Fuentes y precedencia

1. El encargo actual prevalece: dos etapas, cinco minutos desde primera apertura en ambos orígenes, recuperación servidor, galería permitida y excepciones tiempo/GPS distintas.
2. Se revisó el código/documentos de `feature/sprint1-alex-frontend`, los ADR y contratos frontend.
3. `docs/gestion/` no existe en este checkout. Se consultaron sin incorporar archivos los seis PDF de `f5db8b88e18a13e16e22ce3fb11682698538508f`: mapa de procesos v1.2, acta, SLA, SLO, matriz y plan de riesgos. Son orientación, no reglas automáticamente adoptadas.
4. Fixtures/mocks describen UI previa, no autoridad contractual. Ninguna otra rama se mezcló.

Los documentos de referencia proponen cámara exclusiva, plazos y contingencias con mocks ya reemplazados por instrucciones actuales. La propuesta SLA tiene puntos pendientes y mezcla soporte de plataforma con ejemplos de mantenimiento.

## Correcciones confirmadas por Fabrizio el 2026-10-09

- El cambio obligatorio de contraseña inicial debe rechazar la contraseña vigente.
- Los nombres de usuario no admiten espacios; se rechazan con un mensaje explícito,
  conservando el texto para que el administrador lo corrija.
- Cada supervisor MASS tiene una tienda. Cada tienda admite como máximo un
  supervisor MASS con usuario y asignación activos; se valida también al editar,
  cambiar de rol o reactivar. Las cuentas inactivas no ocupan la tienda. La
  cobertura National conserva sus reglas actuales.
- Los duplicados existentes se informan mediante `audit_integrity`, sin decidir
  automáticamente qué cuenta debe perder la asignación.

El traspaso describe cinco minutos para documentar resultados, mientras que el
código y los contratos de la versión actual de `main` ya funcionan sin ese plazo.
Se conserva la implementación actual y se solicitó aclaración al usuario. Las
decisiones históricas de abajo deben leerse junto con los cambios posteriores.

## Decisiones confirmadas el 2026-10-02

- Estados operativos de checklist y ticket: **Pendiente → En proceso → Finalizado**. Una justificación enviada pasa a **En revisión**, a cargo del supervisor de National Facilities (rol API `account_supervisor`, dentro de su cartera).
- Vencer el formulario abre automáticamente el cuadro de justificación; no añade un estado operativo “formulario vencido”. El plazo sigue siendo cinco minutos desde la primera apertura, separado del inicio del trabajo.
- Se permite completar el mismo formulario después de vencer, guardarlo y enviarlo con justificación, sin nuevo plazo ni nueva ejecución. El incompleto no se aprueba ni cuenta como cumplimiento.
- El rechazo mantiene En revisión y permite corregir contenido o justificación y reenviar. Ejecución, fotos, apertura y vencimiento se conservan.
- Cada solicitud, rechazo, corrección, reapertura y aprobación conserva actor, motivos, fechas y versión en eventos consultables. Corregir contenido ya revisado vuelve pendientes las aprobaciones anteriores; no borra sus decisiones ni confunde tiempo con GPS.
- Finalizado es terminal; no existe una segunda aceptación operativa “resuelto→cerrado”. Los códigos anteriores se conservan para leer historial y programación; `workStatus` representa los estados confirmados.

- Frecuencia superior a una visita: obligaciones independientes por tienda y mes, sin separación mínima y con posibilidad de repetir técnico. La bolsa publicada conserva sus cuotas aunque cambie el contrato.
- Reclamo abandonado antes de iniciar: liberación automática a las **dos horas desde el reclamo**, con historial y sin afectar una ejecución ya iniciada ni el plazo del formulario. La UI permite reservar antes del traslado.
- Asignaciones de técnicos: el administrador define las tiendas a las que pertenece cada técnico. El acceso depende de esas asignaciones activas; no se concede acceso a otras tiendas por pertenecer al mismo cliente. La bolsa se limita a sus tiendas y los tickets requieren además asignación al técnico vigente. Confirmado por el usuario el 2026-10-02; corresponde al control de acceso ya implementado.
- El checklist es una obligación mensual sin día obligatorio. Puede iniciarse cualquier día de su mes y no puede iniciarse por primera vez como obligación del mes anterior. Una ejecución ya iniciada conserva su continuidad y sus horas reales.
- Cada tienda debe recibir al menos **dos atenciones de tickets finalizadas y aceptadas por mes**, además de su checklist mensual. El checklist no suma al mínimo de tickets. Las atenciones se cuentan por fecha de finalización aceptada, incluso si el reporte del ticket fue de un mes anterior. Pendientes de revisión no cuentan; cumplir en una tienda no cubre a otra. El mínimo publicado queda en el snapshot de la bolsa.
- Se impiden contratos activos simultáneos del mismo cliente. Las fechas finales son inclusivas: el siguiente contrato puede empezar al día siguiente. Validación por campo, bloqueo y exclusión PostgreSQL protegen también solicitudes concurrentes; contratos consecutivos y snapshots existentes se conservan.
- Solo se puede cambiar de técnico mientras el ticket esté **Pendiente** (los detalles internos abierto/programado pertenecen a ese estado). Al comenzar la atención, queda bloqueada la reasignación. El inicio y la reasignación toman el mismo bloqueo del ticket.
- Las operaciones empiezan con el lanzamiento de la web; no se implementará importación ni regularización de trabajos previos. Las migraciones conservan sus auditorías para no borrar ni inventar datos si una base incompatible llega a utilizarse.
- **SLA aplazado por instrucción del usuario.** Se mantienen los valores de catálogo y duraciones reales; no se calcula cumplimiento SLA ni se vincula al temporizador de registro de cinco minutos.

## Criterios aplazados o conservados

| Decisión requerida         | Caso y opciones                                                                                                                       | Recomendación enviada                                                                     | Comportamiento actual hasta respuesta                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SLA y calendario           | Propuesta: Alta 4/48 h, Media 24/70 h hábiles, Baja 48 h/fin de mes; catálogo existente usa 2/8/24 h inicial y 24/72/168 h resolución | Confirmar primero si es mantenimiento o soporte de plataforma, valores y calendario       | Promedio real reporte→resolución en horas continuas, rotulado como duración; SLA no calculado                     |
| Horario y feriados         | Propuesta lunes–sábado 07–21, America/Lima, excluyendo domingos y feriados; faltan lista de feriados/fecha efectiva y pausas          | Calendario explícito/versionado con responsables antes de calcular cumplimiento           | No aplica calendario arbitrario ni usa cinco minutos como SLA                                                     |
| GPS                        | Precisión, antigüedad y futuro de lectura requieren confirmación operativa                                                            | 60 s de antigüedad, futuro ≤5 s, precisión ≤min(radio,100 m), existentes en UI de la rama | Servidor y UI alineados con esos controles actuales; no fabrican lectura. Cambiar requiere confirmación y pruebas |
| Borrado físico de archivos | Retención de evidencia e información de auditoría, temporales huérfanos y plazos                                                      | Conservar evidencia cerrada; política de retención explícita antes de borrado físico      | Baja lógica controlada; temporales antiguos se enumeran y --apply desactiva sin destruir archivo/historial        |

## Efectos en pruebas

Se verificaron aprobación completa, conservación y edición de incompletos, rechazo seguido de corrección/reenvío/aprobación en la misma ejecución, control de versiones y la independencia de tiempo/GPS. No se contabiliza cumplimiento mientras quede una revisión pendiente o rechazada.

Contratos, mínimo por tienda, permisos y reasignación cuentan con reglas confirmadas. El SLA está aplazado y la importación histórica fuera del alcance. No se autoriza una prórroga: la corrección conserva el vencimiento original. GPS usa los parámetros actuales de la rama; cualquier cambio operativo futuro exige actualizar servidor y UI. La retención física de archivos queda para infraestructura; las bajas actuales son lógicas y conservan trazabilidad.
