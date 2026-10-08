# Ejecución y recuperación — P0 del issue #18

Aplicable a checklist y atención. La especificación canónica es
[Business logic V2](../../docs/business-logic-v2.md); esta revisión sustituye el
GPS de cierre y el formulario de cinco minutos anteriores.

## Llegada y trabajo físico

El checklist se reserva durante dos horas; una atención usa su programación.
Registrar llegada pide una lectura GPS nueva al dispositivo y la valida el backend.
Una lectura válida inicia sin foto. Ante permiso denegado, tiempo agotado, posición
indisponible, caducada, imprecisa o fuera de radio, hay reintento o excepción.
Esta exige motivo de al menos diez caracteres y foto del establecimiento desde la
cámara de la app, guardada en el servidor. No permite seleccionar galería.

Una excepción pendiente permite trabajar con presencia sin validar; no acredita
presencia aprobada. Se conserva la telemetría real, sin inventar coordenadas.
El técnico ve mensajes humanos. El trabajo físico no tiene límite temporal.
Terminar recorrido/atención registra un único fin físico auditado sin pedir GPS.
Los datos de cierre antiguos se conservan.

## Registro de resultados o resolución

La primera apertura del formulario es un evento distinto del fin físico. No hay
contador, vencimiento nuevo, diálogo de demora ni límite para enviar. Reabrir o
reautenticar conserva apertura y duraciones reales. Históricos de demora mantienen
sus decisiones pendientes; no se crean nuevas excepciones de tiempo ni cierre.

Cada respuesta del checklist permite cámara o galería directamente en el ítem.
No hay galería genérica ni asociación posterior. Conforme requiere foto si está
configurada; No conforme exige observación y foto si corresponde; No aplica exige
motivo sin foto. Las fotos se normalizan a WebP y backend limita cada una a 5 MB.
La atención conserva descripción técnica y fotos propias de resolución.

## Borrador y recuperación

Autoguardado confirma `revision` en el servidor; errores conservan cambios y
UUID/File pendientes mientras vive la página. Conflictos entre dispositivos
requieren conciliación explícita, conservando evidencias confirmadas.

Cerrar pestaña, apagar el dispositivo, perder conexión o sesión no elimina las
fotos y respuestas ya confirmadas. Otro navegador recupera lo guardado tras login
del mismo técnico. Los bytes nunca subidos no tienen garantía entre dispositivos.
Las imágenes de llegada se recuperan antes de iniciar o durante la corrección;
no cuentan como evidencia de respuesta y otra cuenta no puede acceder a ellas.

La sesión expirada admite autenticar al mismo usuario sin perder editor en memoria.
No se introduce una política de inactividad: debe definirse separadamente.

## Envío, revisión y corrección

Contenido completo sin excepciones finaliza directamente. Con excepción pendiente,
el botón Enviar a revisión produce envío explícito y registro de solo lectura.
NF revisa la foto, motivo y telemetría autorizados. Aprobar permite cerrar, pero
la presencia excepcional sigue sin validación GPS normal.

Rechazo muestra su motivo y abre Corrección requerida en la misma ejecución.
El técnico corrige contenido o motivo con versionado; reenviar una excepción
rechazada idéntica se bloquea. No se vuelve a pedir ubicación para probar una
llegada pasada. Inicio, fin físico, apertura, fotos originales y decisiones previas
se conservan. Cambiar un motivo reabre únicamente esa aprobación. NF puede decidir
otras excepciones pendientes del registro completo después de rechazar una.

La recuperación distingue trabajo físico, formulario, revisión readonly, corrección
y finalizado. Los históricos sin eventos muestran datos no registrados, nunca
fechas inferidas. La reserva, No realizado, cuotas, cobertura Cliente + Zona,
exclusividad operativa, CAS e idempotencia mantienen sus reglas V2.

## Verificación

Backend y E2E usan PostgreSQL y almacenamiento locales aislados con datos ficticios.
Los E2E ejercitan cámara del navegador, API, persistencia, recarga y otro contexto.
No equivalen a validación en teléfonos físicos ni contra GCS de producción.
