# Corrección del flujo de tickets V2 — 2026-10-08

Partida: `5f06e096cb138c8d1edaf5c8987fc3c8516776d3`, rama `refactor/logica-negocio-v2`, árbol limpio. Se conservó ese commit local y se ejecutó `git fetch origin` sin reset, rebase ni modificación de main. Este bloque termina en un único commit local, sin push, merge ni despliegue.

## Cambios funcionales y de presentación

- MASS: formulario compacto; selección de cámara/galería; instrucciones de arrastrar solo con puntero fino; miniaturas agrupadas, ampliación por teclado, eliminación y reemplazo atómico incluso con las cinco fotos permitidas. El servidor registra la nueva y retira lógicamente la anterior en la misma transacción, sin perder el original ante un fallo ni alterar fotos ya asociadas o ajenas. El reintento conserva ID/archivo y omite una carga ya confirmada. Se conservan límites, optimización WebP, validación y recuperación de evidencias del servidor.
- Incidencias: tarjetas móviles priorizan tienda, descripción, estado, prioridad, técnico/fecha cuando existen y detalle. El ID queda secundario. Búsqueda real y filtros avanzados plegables en móvil; controles horizontales/grid en escritorio; resumen de filtros activos y limpieza. Fechas visibles en día/mes/año de Perú; el calendario nativo conserva su compatibilidad y valores ISO.
- Detalle: columnas alineadas arriba en escritorio, sin estirar tarjetas; reporte y fotos ampliables, programación compacta, resolución ausente como estado informativo. MASS sigue sin programar o aprobar. National tiene enlace contextual a la revisión existente cuando la excepción fue enviada; no hay otro mecanismo de aprobación.
- Historial: cada evento operativo conserva fecha y actor real cuando está autorizado. Reprogramación se presenta una vez; invalidaciones conservadas en auditoría expandible, con datos anterior/nuevo accesibles. Los cinco eventos recientes aparecen directamente y los anteriores en un bloque desplegable. No se correlacionan eventos por coincidencia horaria ni se eliminan eventos.
- Técnico: Pendientes/Finalizadas, orden cronológico y señales discretas para atraso/programación. Solo registros propios; recuperación de trabajo, resultados/correcciones y revisión mediante WorkRecovery. Mapa independiente del listado, reutilizando exactamente el catálogo de tiendas activas autorizadas del mapa de checklists; sin snapshots ajenos. Icono de tienda y ubicación propia diferenciados; popup de indicaciones y controles de zoom separados.
- «Registrar resultado del trabajo» confirma fin físico y después abre el editor. La segunda llamada solo ocurre tras el estado confirmado; los bloqueos de doble pulsación y endpoints idempotentes conservan fechas y eventos. Si falla la apertura, recargar/reintentar abre desde el fin ya persistido sin repetirlo. Se aplica al componente compartido porque el flujo anterior aún tenía dos pulsaciones.
- Resolución: descripción y foto con mensajes junto al campo; miniaturas/ampliación y cámara/galería agrupadas; un envío principal según revisión. Se conserva autoguardado, borradores, caché de fotos, reintento, conflictos y recuperación; se retiran detalles de almacenamiento, asociación y versiones internas de la interfaz del técnico. La acción excepcional tiene borde/tamaño táctil y aparece durante el trabajo físico, con motivo y confirmación.
- GPS: motivos con mínimo visible de diez caracteres, foto compacta, mensajes humanos y bloqueo por fecha separado de fallo GPS. Tras envío: estado/fecha, excepción resumida y navegación; sin auditoría técnica del supervisor. Revisiones mantienen evidencia ampliable, validación de decisión, autorización y cierre automático existente.

## Contrato de programación por día

`scheduledAt` de la solicitud acepta una fecha ISO `YYYY-MM-DD`. La nueva programación se guarda a las 00:00 de ese día en `America/Lima` (equivale a las 05:00 UTC); la respuesta conserva `scheduledAt` como timestamp ISO compatible con los adapters existentes. También se aceptan solicitudes antiguas con timestamp y offset explícito, interpretando su día de Lima. Se rechazan datetimes sin offset por ser ambiguos.

Hoy se puede programar aunque la medianoche ya pasó. Llegada compara días de Lima: antes del día se rechaza, cualquier hora de ese día y posteriores se permite sujeto a las demás reglas. No se modifica ningún timestamp histórico. Una solicitud con el mismo técnico, prioridad y día conserva la visita y timestamp anteriores; un cambio real exige motivo cuando corresponde, revisión vigente y técnico elegible. Reasignación, snapshots, cobertura, GPS, locks, idempotencia, auditoría y estados siguen en los mismos servicios. Sin migración.

## Verificación

- Backend: 169 pruebas aprobadas con PostgreSQL 16 local; cuatro nuevas de días/zonas horarias/compatibilidad/historial y tres de reemplazo al límite, reintentos, autorización y fallo de almacenamiento; más las regresiones anteriores de permisos, concurrencia, idempotencia y evidencias.
- Frontend: 240 pruebas en 38 archivos aprobadas. Incluyen transición con ambos tipos de fallo de red, recarga sin repetir fin físico, reemplazo fallido conservando el original, ID estable al reintentar, mapa independiente, privacidad, filtros y auditoría histórica accesible.
- Cobertura de los módulos configurados: líneas 92.83 %, ramas 92.43 %; umbrales aprobados. No es cobertura de toda la interfaz.
- Cuatro E2E nuevas incluidas en la suite con API real: MASS a 320/390/1440 px (móvil con puntero táctil), cinco fotos/reemplazo al límite/carga única, ampliación/teclado, filtros y Axe; programación desde navegador Asia/Tokyo, rechazo anticipado, reprogramación, GPS fuera de radio, recuperación de fin físico, revisión y finalización automática, privacidad y mapa.
- Suite E2E completa: 40 aprobadas en 307.1 segundos; cero fallidas, omitidas o inestables, sin reintentos automáticos. Incluye las regresiones anteriores de checklists, mapa, GPS, cámara, permisos, concurrencia y revisiones.
- Prettier, ESLint, TypeScript, builds normal/API y comprobación de ausencia de fixtures/mock en el build API aprobados.
- Black archivo por archivo, Flake8 de todos los Python modificados (120 caracteres) y revisión global de errores graves aprobados; sintaxis Python aprobada. Se dividieron literales largos sin cambiar sus mensajes.
- Django check y detección de migraciones aprobados: sin cambios de esquema.

## Comandos reproducibles

Con PostgreSQL **aislado** `nf_integration` y variables de prueba locales configuradas (sin credenciales productivas):

```sh
# Desde backend/:
../.venv/bin/python manage.py test --settings=config.test_settings
../.venv/bin/python manage.py check --settings=config.test_settings
../.venv/bin/python manage.py makemigrations --check --dry-run --settings=config.test_settings

# Desde frontend/:
npm run test:coverage
npm run format:check
npm run lint
npm run typecheck
npm run build
npm run build:api
node scripts/check-api-build.mjs
npx playwright test --config=../.integration/playwright.config.ts --reporter=list,json
```

E2E utiliza Chromium local, API en localhost y la configuración de integración ignorada por Git que reemplaza el ejecutable del navegador. No se modifica la configuración general de Playwright. Black se ejecutó por archivo; Flake8 verificó los nueve Python modificados con máximo 120 caracteres y `E203,W503` ignorados, más errores graves de todo backend (`E9,F63,F7,F82`).

## Fallos corregidos y entorno

La primera pasada completa tuvo 33 E2E aprobadas y 7 fallidas: cuatro aserciones de botones/mensajes retirados y tres búsquedas que reutilizaban el texto de ejecuciones anteriores. Se actualizaron las comprobaciones para consultar el contenido real confirmado en la API y se introdujo un identificador único en cada reporte. Las pruebas nuevas del reemplazo fallaron primero al alcanzar el límite de cinco fotos y al usar una foto ajena; se corrigió el contrato de carga con `replaceId`, restringido a adjuntos temporales propios. La suite backend completa ahora comprueba esas regresiones. Una ejecución intermedia de E2E se interrumpió para reconstruir el build API después de los cambios; no se cuenta como aprobada.

Se corrigieron aserciones antiguas del flujo de dos pulsaciones, mensajes retirados y pestañas anteriores, además de dos aserciones nuevas de backend (offset equivalente y nombre del evento). Las E2E detectaron un desbordamiento real del formulario a 320 px; se fijó su columna mínima y volvió a probarse sin clics forzados. Se aislaron reporteros para evitar que fotos temporales de un caso fallido afectaran al siguiente; el helper exige settings de prueba, host/base locales y marcador de seed. También se corrigieron una selección ambigua de tienda en ese helper y una expectativa incorrecta de botón: la decisión corta se valida al enviar y no produce aprobación.

API localhost:8000, preview localhost:5174 y contenedor de pruebas existente `nf-final-ux-v2-postgres`, base `nf_integration`, puerto 55437. Se conservaron los datos ficticios existentes. Tres fotos temporales `camara.webp`, creadas por las E2E fallidas en el usuario ficticio store y sin asociación, se retiraron mediante el borrado lógico de la API; no se borraron tickets/eventos ni se reinicializó PostgreSQL. Sin datos ni credenciales productivas.

## Conservación y revisión física pendiente

El commit de partida permanece como antecesor directo. `ChecklistListPage.tsx`, `checklistMap.ts`, `ExceptionHistory.tsx`, `TechnicalSupervisorChecklistsPage.tsx` y `TechnicalSupervisorChecklistDetailPage.tsx` no tienen cambios respecto de ese commit. Se conservan sus tres pestañas, permisos, mapa de cobertura, GPS resumido/auditable y fechas reales. Los componentes compartidos reciben únicamente los ajustes de fotos, marcador y transición solicitados; las regresiones de checklists siguen en la suite completa.

Pendiente en Android físico: comportamiento de los selectores nativos de cámara/galería, permisos reales, teclado virtual y desplazamiento, cierre completo del navegador con conectividad irregular, cartografía y apertura de Google Maps/app. También queda revisión visual manual en la laptop habitual del supervisor. Chromium emulado y cámara/GPS controlados no acreditan esas comprobaciones físicas.

## Archivos modificados

- `backend/core/evidence_views.py`
- `backend/core/scheduling.py`
- `backend/core/serializers.py`
- `backend/core/services.py`
- `backend/core/test_operational_v2.py`
- `backend/core/test_ticket_days.py`
- `backend/core/test_ticket_evidence.py`
- `backend/core/ticket_views.py`
- `backend/test_support/ticket_reporter.py`
- `docs/integration/ticket-ux-v2-verification.md`
- `frontend/e2e/flows.spec.ts`
- `frontend/e2e/helpers.ts`
- `frontend/e2e/loading.spec.ts`
- `frontend/e2e/real-api.spec.ts`
- `frontend/e2e/ticket-ux.spec.ts`
- `frontend/src/components/EvidenceGallery.tsx`
- `frontend/src/components/ListFilters.tsx`
- `frontend/src/components/ui/index.tsx`
- `frontend/src/features/checklists/ChecklistPhotos.test.tsx`
- `frontend/src/features/checklists/ChecklistPhotos.tsx`
- `frontend/src/features/checklists/GpsAction.tsx`
- `frontend/src/features/checklists/PendingVisit.tsx`
- `frontend/src/features/checklists/TicketEditor.test.tsx`
- `frontend/src/features/checklists/VisitEditor.tsx`
- `frontend/src/features/checklists/VisitStart.tsx`
- `frontend/src/features/checklists/useVisitEditor.ts`
- `frontend/src/features/technician/AssignedLocationsMap.tsx`
- `frontend/src/features/tickets/TicketDetail.test.tsx`
- `frontend/src/features/tickets/TicketDetail.tsx`
- `frontend/src/features/tickets/TicketHistory.test.tsx`
- `frontend/src/features/tickets/TicketHistory.tsx`
- `frontend/src/features/tickets/TicketList.test.tsx`
- `frontend/src/features/tickets/TicketList.tsx`
- `frontend/src/pages/ChecklistExecutionPage.test.tsx`
- `frontend/src/pages/EvidenceOptimization.test.tsx`
- `frontend/src/pages/PendingReviewsPage.test.tsx`
- `frontend/src/pages/PendingReviewsPage.tsx`
- `frontend/src/pages/RoutesPage.test.tsx`
- `frontend/src/pages/RoutesPage.tsx`
- `frontend/src/pages/SupervisorNewTicketPage.tsx`
- `frontend/src/services/adapters/httpRepositories.ts`
- `frontend/src/services/adapters/mappers.ts`
- `frontend/src/styles/components.css`
- `frontend/src/test/doubles/evidence.ts`
- `frontend/src/test/doubles/ticketsRepository.ts`
- `frontend/src/test/doubles/visitsRepository.ts`
- `frontend/src/types/models.ts`
- `frontend/src/utils/dates.test.ts`
- `frontend/src/utils/dates.ts`
