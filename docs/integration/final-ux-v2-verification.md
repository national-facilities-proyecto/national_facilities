# Verificación de experiencia del técnico y supervisor V2 — 2026-10-08

Base comprobada antes de editar: `3aa111a9271460515fae1dfca97b948d0a995569`, HEAD local y remoto de `refactor/logica-negocio-v2`, con árbol limpio. Se ejecutó `git fetch origin` y se actualizó explícitamente la referencia remota V2 porque el fetch configurado solo incluye main.

## Cambios

- Mapa debajo de recuperación: consulta independiente de tiendas autorizadas, aunque no haya visitas o falle su consulta. Solo tiendas activas con coordenadas válidas, agrupadas por ID; ningún snapshot amplía el alcance de cobertura. Marcadores con nombre y dirección, popup y enlace «Cómo llegar» con coordenadas reales, clic/Enter/Espacio y ubicación actual conservada. Sin navegación automática a checklists.
- Tres pestañas: Bolsa compartida, En revisión y Finalizados. Las dos últimas requieren propietario conectado; revisión exige envío y fase real `in_review`. Los trabajos reservados, físicos, con resultados pendientes o correcciones siguen accesibles mediante WorkRecovery. Se conserva la reserva interna.
- Estados vacíos: mensajes sencillos de ausencia de checklists o tiendas asignadas. La falta de ubicaciones disponibles se explica sin fabricar coordenadas. La generación fallida tiene un mensaje general y permite consultar registros existentes.
- Técnico: excepción actual con estado, motivo, evidencia y decisión; se retiran historial e identificadores/telemetría de esa interfaz. La corrección conserva su campo editable, rechazo y evidencia. Los resultados y registros recibidos permanecen intactos.
- Supervisor: solicitudes pendientes y decisiones, historial de versiones/acciones auténticas y auditoría GPS expandible. La solicitud inicial vigente se representa mediante su ficha y metadata técnica; correcciones y reaperturas históricas se conservan como eventos. Un mismo motivo ya resumido o repetido entre eventos no se imprime de nuevo; decisiones legacy sin ID también se muestran una sola vez. No se eliminan eventos, evidencias o decisiones del backend.
- Fechas: tabla y filtro usan `startedAt ?? scheduledAt`, con etiquetas «Ejecutada»/«Programada». El detalle distingue fecha de ejecución/programación y conserva finalización y cronología en Detalles técnicos. Formato y filtros siguen la zona America/Lima; no se reescriben fechas.

## Autorización y reglas conservadas

Se comprobó que `tiendas_visibles_para` exige tiendas activas y cobertura activa exacta cliente + zona. `visible_visits` ya restringe al técnico a visitas propias y bolsa disponible autorizada; otro técnico de la misma cobertura no puede leer revisiones o finalizaciones ajenas, ni por lista ni por ID. No fue necesario cambiar estos servicios.

Se añadieron regresiones backend para catálogo autorizado sin visitas, zonas ajenas, tiendas/coberturas inactivas y acceso entre técnicos de la misma cobertura. Los tests originales de reserva, recuperación, expiración y concurrencia se conservan. No se cambiaron generación, cuotas, estados, servicios de negocio ni migraciones.

## Pruebas

- Backend: 162 pruebas aprobadas en PostgreSQL 16 aislado, incluidas las dos nuevas de permisos. `manage.py check` y `makemigrations --check --dry-run` aprobados, sin cambios de esquema.
- Frontend: 228 pruebas en 33 archivos aprobadas. Cubren mapa sin visitas, independencia de pestañas/consulta, alcance, deduplicación, tres pestañas y propietario, fases de recuperación, GPS simple/auditable, decisiones legacy y fechas de visitas en revisión/finalizadas/no iniciadas.
- Cobertura de los módulos configurados: líneas 93.44 %, ramas 92.59 %; umbrales aprobados. No representa cobertura de toda la interfaz.
- Prettier completo, ESLint, TypeScript y builds normal/API aprobados. `check-api-build.mjs` confirma que el build API no contiene fixtures ni repositorios mock.
- Black y Flake8 de los archivos Python modificados, Flake8 global de errores graves y compilación Python aprobados. Black se comprobó archivo por archivo tras bloquearse su ejecución multiproceso en el entorno.
- Las cinco E2E nuevas pasaron inicialmente en 20.6 segundos con API real. Verifican cobertura sin visitas, tres pestañas/popup/coordenadas, finalizaciones propias, recuperación tras cerrar/reingresar, ausencia de cobertura, revisión propia, GPS sin duplicación y fecha del supervisor. Incluyen Axe y ancho móvil de 390 px; los tiles se sustituyen por protobuf vacío válido, con Leaflet real.
- Suite E2E completa final: 36 aprobadas en 243.7 segundos (4.1 minutos), sin fallos, omitidas ni pruebas inestables. Incluye los flujos reales de cámara, recuperación, permisos, concurrencia, excepciones y finalización.

## Incidencias de verificación

Se corrigieron mocks/selectores de la tabla responsive y campos obligatorios de telemetría en fixtures TypeScript. La suite completa anterior se interrumpió al recuperarse el entorno; se habían confirmado 18 pruebas aprobadas, sin resultado final. El código y PostgreSQL ficticio se conservaron. Se restableció la API local, se comprobó que no quedaban ejecuciones ficticias activas y se repitió la suite con reporte persistente. Esa repetición tuvo 34 aprobadas y dos fallidas por aserciones antiguas: esperaban «Detalles técnicos» en el técnico y la pestaña «Mis trabajos». Se actualizaron para comprobar auditoría/duraciones en el supervisor y las dos reservas en WorkRecovery, conservando las comprobaciones de cámara, cuotas, permisos y contraseñas. No se borraron registros ni se reinicializó la base.

## Entorno y revisión pendiente

API localhost:8000, preview localhost:5174 y PostgreSQL local nuevo `nf-final-ux-v2-postgres`, puerto 55437, base `nf_integration`, credenciales únicamente de prueba. El helper de fixtures exige settings de prueba, base/host local y marcador del seed ficticio. No se crearon datos en producción ni se modificaron main o migraciones. Cambios destinados a un único commit local; sin push, merge ni despliegue.

Pendiente en Android físico: popup táctil y apertura en Google Maps/app, cartografía con conectividad móvil real, recuperación al cerrar por completo el navegador, legibilidad del resumen GPS y del historial del supervisor. Las pruebas usan Chromium y GPS/cámara controlados; no acreditan esas comprobaciones físicas.

## Archivos modificados

- `backend/core/tests.py`
- `backend/test_support/checklist_map_case.py`
- `frontend/e2e/checklist-map.spec.ts`
- `frontend/e2e/flows.spec.ts`
- `frontend/e2e/mobile-presentation.spec.ts`
- `frontend/e2e/real-api.spec.ts`
- `frontend/src/features/checklists/ExceptionHistory.tsx`
- `frontend/src/features/checklists/VisitEditor.tsx`
- `frontend/src/features/checklists/VisitRecord.tsx`
- `frontend/src/features/checklists/VisitRecord.test.tsx`
- `frontend/src/features/checklists/WorkRecovery.test.tsx`
- `frontend/src/features/checklists/checklistMap.ts`
- `frontend/src/features/technician/AssignedLocationsMap.tsx`
- `frontend/src/features/technician/LazyMap.tsx`
- `frontend/src/pages/ChecklistListPage.tsx`
- `frontend/src/pages/ChecklistListPage.test.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistDetailPage.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistDetailPage.test.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistsPage.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistsPage.test.tsx`
- `docs/integration/final-ux-v2-verification.md`
