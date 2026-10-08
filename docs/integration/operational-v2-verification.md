# Verificación operativa V2 — 2026-10-08

Base comprobada tras `git fetch origin`: `f502104a4b916176be94d601327c9402835cd021`, en `refactor/logica-negocio-v2`. Cambios destinados a un commit local; no se autoriza push en esta entrega.

## Implementación

- Llegada: un botón orquesta reclamo transaccional existente → GPS fresco → inicio confirmado. Un conflicto de reclamo detiene el flujo antes del GPS. El reclamo sigue vigente si falla GPS y no se duplica al reintentar. ADR-010 documenta la decisión; no cambia endpoints, modelos, transiciones ni migraciones.
- Recorrido y resultados: etapas visibles, actividades resumidas, acción principal separada y «No pude realizar el trabajo» secundaria neutral. Contacto/mapa y reporte de incidencias se abren a demanda. Se retiran textos repetidos de reservas y tiempos.
- Respuestas: Conforme/No conforme/No aplica sin check permanente; selección única con `aria-pressed` y destacado únicamente en la opción elegida. Se conservan observaciones y condiciones de foto obligatoria/opcional/No aplica.
- Supervisor: resumen, cada excepción pendiente por su ID, motivo, foto y Aprobar/Rechazar. Resultados, historial y detalles técnicos cerrados inicialmente. Se conservan decisiones actuales no representadas en el historial recibido, respuestas huérfanas históricas y reporte general.
- Decisión: contexto original, instrucción de diez caracteres, error junto al campo, estados de carga y manejo de conflictos. Se envían revisión de visita y revisión de la excepción seleccionada sin fusionar excepciones.
- Auditoría: se elimina el componente visual ClaimHistory y sus referencias operativas. Los DTO, eventos en PostgreSQL, exclusión y expiración siguen vigentes. ID de visita/excepción, nombres autorizados, revisores, fechas y duraciones permanecen en Detalles técnicos. GPS se traduce a mensajes humanos y los metros se redondean en presentación.

## Defectos de evidencias demostrados

1. La validación local de requisitos pendientes reutilizaba el estado de error de persistencia y anunciaba «No se confirmó el guardado». Ahora tiene estado separado, requisitos junto a cada tarea y aviso breve; para incidencias se abre el detalle de requisitos al intentar enviar.
2. Una revisión r+1 podía aceptarse después de subir una foto aunque GET no confirmara su asociación al ítem. La regresión falló en la base: la captura se resolvía sin asociación. Ahora exige asociación confirmada para cualquier revisión aceptada; no guarda IDs locales ni sobrescribe un cambio concurrente.
3. Una foto confirmada por API seguida de fallo del borrador dejaba la cámara diciendo «No se pudo guardar la foto». Ahora termina la captura al confirmar la asociación y muestra en el editor qué guardado sigue pendiente. Reintentar guarda solo el borrador; no vuelve a subir una foto confirmada. Un guardado manual exitoso también elimina el aviso pendiente. Cargas no confirmadas conservan selección y reintento idempotente.
4. La nueva regresión backend confirma requisitos del snapshot histórico tras modificar la plantilla, rechaza asociar una foto del primer ítem al segundo, bloquea finalización cuando falta foto obligatoria y acepta No aplica con motivo y foto opcional ausente. No se encontró defecto que requiera cambiar reglas backend.

## Pruebas finales

- Backend: 160 pruebas en PostgreSQL 16 aislado, aprobadas. `manage.py check`, `makemigrations --check --dry-run`, compilación Python aprobados.
- Frontend: 204 pruebas en 31 archivos, aprobadas. Cobertura de los módulos configurados: líneas 93.44 %, ramas 92.30 %; umbrales aprobados. Esta cifra no representa cobertura de toda la interfaz.
- Formato/lint: Prettier completo, ESLint, TypeScript aprobados; Black y Flake8 del archivo backend modificado aprobados; Flake8 global de errores graves E9/F63/F7/F82 aprobado.
- Compilaciones: `npm run build` y `npm run build:api` aprobadas. `check-api-build.mjs` confirma ausencia de fixtures/repositorio mock en el build API.
- E2E: 31 pruebas aprobadas, ninguna fallida, última ejecución completa en 3.9 minutos. Incluye llegada única, validación de resultados sin falso error de guardado, fallo simulado del borrador tras foto confirmada, reintento sin nuevo upload, decisiones con error inline, accesibilidad Axe, cámara vertical/horizontal, recuperación, dos dispositivos, expiración, readonly y No realizado. Chromium local, API Django local, PostgreSQL nuevo `nf-operational-v2-postgres` en 55435; fixtures ficticios E2E-ONLY y credenciales exclusivamente de prueba.

## Fallos encontrados durante la verificación

- Primera pasada E2E: 18 aprobadas, 3 fallidas, 1 interrumpida, 7 sin ejecutar. El selector exacto del título del recorrido incluía su numeración; se separó el título en un elemento propio. El caso fallido quedó activo y provocó dos fallos posteriores. Se cerró exclusivamente ese intento ficticio mediante la API No realizado, conservando historial; no se borró ni reinicializó ningún registro.
- Segunda pasada completa: 30 E2E aprobadas y una fallida por el selector interno de archivos sin nombre accesible; se corrigió y la última suite completa pasó con 31/31 sobre el build final.
- Prueba de accesibilidad del editor: detectó el input interno de galería sin nombre accesible. Se añadió etiqueta y se retiró de la secuencia de tabulación; los botones visibles de cada actividad siguen abriendo el selector con teclado.
- Primera prueba móvil nueva: supervisor aprobado; captura con borrador fallido detectó el mensaje incorrecto de la cámara descrito arriba. Se corrigió y añadió regresión.
- Comprobaciones intermedias detectaron imports/selectores antiguos y errores de tipado en fixtures nuevos, corregidos. Dos ejecuciones de cobertura se solaparon y chocaron por el directorio de reportes; la ejecución final se realizó sola y pasó. Las regresiones enfocadas de selección/evidencia pasaron tras las correcciones.

## Alcance y revisión manual pendiente

No se modificó main, no se hizo merge, push ni despliegue. No se emplearon credenciales productivas, no se tocaron datos productivos ni migraciones. El esquema de pruebas se creó en una base local nueva; Django creó/eliminó únicamente su base test temporal, según su runner normal. Los intentos E2E conservan sus históricos.

Queda pendiente probar en Android físico: cámara real y rotación, permisos GPS/cámara, teclado virtual en el modal de decisión, legibilidad con nombres/motivos largos y reintentos con conectividad móvil real. Las E2E usan Chromium y cámara/GPS controlados; no acreditan funcionamiento físico en Android.

## Archivos modificados

- `backend/core/tests.py`
- `docs/decisions/010-llegada-y-presentacion-operativa-v2.md`
- `docs/decisions/README.md`
- `frontend/e2e/flows.spec.ts`
- `frontend/e2e/helpers.ts`
- `frontend/e2e/mobile-presentation.spec.ts`
- `frontend/e2e/operational-v2.spec.ts`
- `frontend/e2e/real-api.spec.ts`
- `frontend/src/components/ChecklistTaskCard.test.tsx`
- `frontend/src/components/ChecklistTaskCard.tsx`
- `frontend/src/components/ui/Disclosure.tsx`
- `frontend/src/features/checklists/ClaimHistory.tsx` (eliminado solo el componente UI)
- `frontend/src/features/checklists/ExceptionDetails.tsx`
- `frontend/src/features/checklists/ExceptionSummary.tsx`
- `frontend/src/features/checklists/GpsAction.tsx`
- `frontend/src/features/checklists/NotPerformedAction.test.tsx`
- `frontend/src/features/checklists/NotPerformedAction.tsx`
- `frontend/src/features/checklists/PendingVisit.tsx`
- `frontend/src/features/checklists/VisitEditor.tsx`
- `frontend/src/features/checklists/VisitRecord.test.tsx`
- `frontend/src/features/checklists/VisitRecord.tsx`
- `frontend/src/features/checklists/VisitResults.tsx`
- `frontend/src/features/checklists/VisitStages.tsx`
- `frontend/src/features/checklists/VisitStart.test.tsx`
- `frontend/src/features/checklists/VisitStart.tsx`
- `frontend/src/features/checklists/VisitTiming.tsx`
- `frontend/src/features/checklists/WorkRecovery.tsx`
- `frontend/src/features/checklists/useVisitEditor.evidence.test.tsx`
- `frontend/src/features/checklists/useVisitEditor.ts`
- `frontend/src/features/checklists/validation.ts`
- `frontend/src/pages/ChecklistExecutionPage.test.tsx`
- `frontend/src/pages/ChecklistVisitDetailPage.tsx`
- `frontend/src/pages/EvidenceOptimization.test.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistDetailPage.test.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistDetailPage.tsx`
- `frontend/src/styles/components.css`
- `frontend/src/utils/gpsPresentation.test.ts`
- `frontend/src/utils/gpsPresentation.ts`
- `docs/integration/operational-v2-verification.md`
