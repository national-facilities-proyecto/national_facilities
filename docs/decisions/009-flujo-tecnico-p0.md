# ADR 009 — Flujo técnico P0 y evidencia de llegada

Fecha: 2026-10-08. Estado: implementación para revisión en V2.
Referencia: [issue #18](https://github.com/national-facilities-proyecto/national_facilities/issues/18).

## Contexto

GPS de salida, formulario de cinco minutos y asociación posterior de fotos
provocaban excepciones redundantes y bloqueaban correcciones reales. El issue
actualiza las reglas V2 anteriores, manteniendo trazabilidad y autorización.

## Decisión

El GPS fresco se valida solo en llegada. La alternativa excepcional exige motivo
y foto de cámara confirmada, sin acreditar presencia normal. `Evidencia` añade
propósito y FK protegida a `Excepcion`; `result` es el valor por defecto para
conservar archivos anteriores. La foto conserva autor, captura declarada y subida
autoritativa. El backend valida propietario, contexto, origen, MIME y tamaño;
el origen declarado no sustituye una prueba física de autenticidad.

`POST visitas/:id/terminar/` registra fin físico sin GPS, una vez y con evento.
El endpoint anterior de ubicación de cierre es un alias compatible, sin alterar
datos históricos. Apertura no crea vencimiento y los envíos no comprueban tiempo.
La migración `0019` relaja únicamente la restricción del vencimiento nuevo y añade
los vínculos de evidencia; no reescribe archivos, timestamps ni decisiones.

Las fotos del checklist se cargan por ítem al responder. La foto de llegada no
cuenta como foto de resultado y no es visible al Supervisor de tienda. WebP,
límite de 5 MB y configuración GCS de producción se mantienen.

Las correcciones conservan la telemetría original y exigen cambio versionado real.
NF puede decidir otras excepciones históricas pendientes después de un rechazo.
No realizado, cuotas, cobertura, exclusividad, CAS y claves idempotentes continúan
bajo las garantías V2.

## Alternativas y consecuencias

Ocultar GPS/temporizador solo en React dejaría reglas contradictorias en backend.
Borrar vencimientos o aprobar GPS al revisar perdería evidencia histórica. Mantener
esas columnas con valor histórico conserva auditoría sin imponer requisitos nuevos.

La política de sesión por inactividad y su duración quedan pendientes de especificar.
La validación local usa PostgreSQL y almacenamiento aislados; no requiere GCP ni
credenciales productivas. Validar teléfonos físicos y GCS pertenece a una revisión
operativa posterior autorizada. No se despliega ni fusiona este cambio.
