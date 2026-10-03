# Ejecución, formulario y recuperación

Aplicable por igual a checklists y tickets. Estas reglas sustituyen el temporizador desde inicio, la cámara exclusiva y los reinicios automáticos anteriores.

## Estados

Pendiente, En proceso y Finalizado son los estados habituales de ambos tipos de trabajo. En revisión identifica el registro con justificación, revisado por el supervisor de National Facilities. La asignación y programación se muestran como información adicional; el vencimiento es una condición del plazo, no otro estado operativo.

## Etapa A — Trabajo

El técnico reclama la visita mensual o usa el ticket asignado. Iniciar checklist/Iniciar atención obtiene GPS nuevo y pide inicio al servidor. Django comprueba propiedad, tienda, asignación, contrato, estado y ubicación; registra inicio real y snapshot aplicable.

Se muestran tareas, inicio y tiempo transcurrido. No se abre el formulario ni empieza su plazo. Se puede trabajar más de cinco minutos y reunir fotografías previamente. Repetir el inicio o volver a ingresar no altera el timestamp.

## Etapa B — Registro

Registrar resultados/Registrar resolución llama a la primera apertura. Django fija apertura y vencimiento cinco minutos después bajo bloqueo; otra pestaña recibe exactamente esos valores. El reloj del navegador usa serverNow para mostrar el tiempo restante y nunca decide un nuevo plazo.

Se completan resultados/observaciones o descripción técnica y se cargan fotos por cámara o galería. No se atribuye una fecha exacta de captura a una fotografía cuya fecha se desconoce. La fecha de subida sí es del servidor.

El envío exige contenido, evidencia, estado, autorización, plazo y GPS de cierre válidos. Solo se registra envío/finalización cuando procede; reintentos no crean eventos ni ejecuciones adicionales.

## Autoguardado y conflictos

Cambios del editor se guardan automáticamente en el servidor con revision. Guardando, guardado y pendiente por error son estados distintos: guardado exige respuesta válida y confirmada. Los envíos son serializados; una revisión antigua recibe conflicto.

Un fallo conserva contenido y File/UUID de foto pendiente mientras la página siga abierta. Reintentar reutiliza el UUID para no duplicar. No se puede prometer recuperación de bytes o texto nunca sincronizados después de apagar/cerrar el dispositivo; se avisa antes de abandonar y se conserva todo lo confirmado en el servidor.

Si otro dispositivo cambió el borrador, el editor conserva sus cambios, muestra conflicto y ofrece consultar la versión del servidor, usarla o guardar explícitamente su edición sobre la revisión actual. Las evidencias confirmadas de la versión remota se conservan al conciliar. No se toma el orden de llegada de respuestas como autoridad.

## Recuperación

| Estado real del servidor            | Pantalla y acción                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Inicio sin apertura                 | Retomar ejecución; abrir formulario cuando termine el trabajo                               |
| Formulario abierto dentro del plazo | Continuar formulario; respuestas/fotos confirmadas y tiempo restante original               |
| En proceso, plazo transcurrido      | Cuadro de justificación automático; conserva borrador y vencimiento                         |
| En revisión                         | Completar si aún no fue enviado; consultar decisiones o corregir tras rechazo; GPS separado |
| Finalizado                          | Registro de resultados, fotos y tiempos; no admite otra ejecución/envío                     |
| Histórico incompleto de metadatos   | Datos conocidos y aviso; no se fabrican timestamps/snapshots                                |

Recargar, cerrar pestaña, perder red o expirar sesión no pausa ni renueva el plazo. Reautenticar consulta el servidor. Si expira la sesión con editor abierto, el modal permite autenticar el mismo usuario sin descartar sus cambios aún en memoria. Otra sesión/dispositivo recupera exclusivamente lo confirmado.

## Excepciones y revisión

Tiempo y GPS tienen autor, tipo, motivo, fecha, decisión, revisor y razón. Son solicitudes independientes y únicas por ejecución/tipo. Aprobar una no oculta la otra. Un formulario vencido puede justificarse después de volver a autenticar sin crear una nueva visita.

El contenido completo y ambas validaciones resueltas permiten aceptar cierre. La revisión pendiente no cuenta como cumplimiento. Una ubicación ausente no se sustituye por coordenadas de la tienda; se registra una lectura real o se revisa una excepción GPS.

Al vencer se abre automáticamente el cuadro de justificación, también al recuperar el formulario. Si faltan resultados o fotos se puede guardar la justificación y continuar completando el mismo registro. El envío completo exige contenido y GPS de cierre o una justificación GPS independiente. Permanece En revisión hasta que el supervisor apruebe todas las excepciones necesarias.

Rechazar conserva En revisión y permite corregir contenido o justificación y reenviar con el mismo vencimiento. El nuevo envío no crea otra intervención. Cada solicitud y decisión anterior permanece en el historial. Cuando se corrige contenido ya revisado, sus aprobaciones anteriores se reabren para revisar la versión nueva. Una pantalla de revisión antigua recibe 409 y debe recargar antes de decidir. No se conceden prórrogas. Otras reglas pendientes están en el [registro de decisiones](../../docs/integration/decisions-pending.md).

## Tiempos e historial

Se guardan por separado inicio real, primera apertura, vencimiento original, envío aceptado y finalización aprobada. Se muestran total hasta envío, tiempo previo al formulario y tiempo de registro. El tiempo hasta apertura no acredita una hora exacta de fin físico. Si no hubo evento explícito de fin físico, no se inventa.

Para pruebas de vencimiento se acelera únicamente el timestamp de una base aislada mediante un helper protegido; la aplicación operativa no tiene un reloj modificable. [Validación](validation.md) detalla los recorridos reales y las decisiones que impiden completar algunos.

## Reserva antes de iniciar

Reservar checklist reclama la visita sin exigir GPS ni abrir el formulario. El servidor fija dos horas desde ese primer reclamo; reintentar no extiende la reserva. Si no se inicia a tiempo, vuelve automáticamente a la bolsa y queda registrado el técnico anterior, el vencimiento y la liberación. Un nuevo técnico reclama la misma obligación. Iniciar requiere GPS y una reserva vigente; una pantalla antigua recibe error y permite actualizar. Una ejecución iniciada no se libera al pasar dos horas. Las cuotas mensuales son visitas independientes y pueden repetir técnico.
