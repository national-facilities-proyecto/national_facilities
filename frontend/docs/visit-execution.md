# Ejecución de visitas: checklist y tickets

## Checklist mensual

El técnico toma una visita disponible y solicita una ubicación nueva. La interfaz muestra la distancia, precisión, radio permitido y hora de captura antes de confirmar el inicio. Al confirmar, el modo mock registra `startedAt` en ISO, conserva la evidencia GPS y fija `expiresAt` cinco minutos después (`timeLimitSeconds: 300`).

El contador se calcula con `expiresAt - Date.now()`, por lo que se reconstruye al recargar. Muestra inicio, límite, tiempo restante y avisos al quedar un minuto o agotarse el tiempo. Al vencer, el cierre normal queda bloqueado: el técnico debe enviar una justificación de 10 a 500 caracteres. La visita pasa a `pending_approval` con excepción `time_limit`; se diferencia de una excepción de GPS (`location`). El supervisor de cuenta revisa ambas solicitudes.

Al finalizar dentro del plazo se solicita otra ubicación GPS. La lectura de inicio y la de cierre son independientes. La distancia que se muestra en frontend es orientativa; el backend debe recalcular GPS, radio, fechas y vencimiento antes de aceptar la operación.

Cada tarea permite **Tomar foto** con cámara y **Seleccionar de galería**. La galería acepta JPG, PNG y WebP; se aplican los límites de 5 MB y cinco fotografías existentes. Las evidencias conservan su origen (`camera` o `gallery`) y se guardan como `Blob`; las URL temporales se usan solo en la previsualización.

## Tickets o prontos

Los tickets asignados reutilizan `Visit`: registran GPS y `startedAt` al iniciar y GPS y `completedAt` al cerrar, junto con descripción y evidencias. No se les asigna límite de cinco minutos ni temporizador.

## Contratos HTTP pendientes

El adaptador API devuelve `not_implemented` para operaciones no disponibles. El backend debe exponer contratos para iniciar y finalizar checklists y tickets, obtener ejecuciones activas, adjuntar evidencias, registrar GPS de inicio/cierre, enviar y revisar excepciones de GPS y de límite de tiempo. El modo API no usa mocks como respaldo.

## Límite del modo mock

La protección de propiedad, el GPS y el temporizador en modo mock permiten demostrar el flujo, pero la autoridad final sobre autorización, ubicaciones, fechas y vencimiento pertenece al servidor.
