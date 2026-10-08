# Mapa general de Mis Checklist — verificación V2, 2026-10-08

Base: `22ea9afd75ed886eb6a2d390cd236e53436e17b9`, rama `refactor/logica-negocio-v2`. Antes de modificar archivos se ejecutó `git fetch origin`; se comprobó el SHA remoto con `git ls-remote` y se actualizó explícitamente la referencia remota V2, porque el fetch configurado del repositorio solo incluye main. El árbol de trabajo inicial estaba limpio.

## Corrección

El mapa general excluía las visitas `completed` y desaparecía al quedarse sin tiendas. Ahora toma todas las visitas checklist accesibles devueltas por la API, independientemente de la pestaña, y agrupa los marcadores por ID de tienda. Las pestañas siguen filtrando solamente las tarjetas de visitas.

Al seleccionar un marcador se abre el detalle de una visita de esa tienda. Se prioriza trabajo en curso, corrección o registro de resultados todavía activo; luego reserva, visita disponible, revisión enviada, finalizada y cancelada. En igualdad se conserva el orden de la API. La fase de fin físico/resultados cuenta como activa aunque el estado persistido sea `pending_approval`; no se cambian estados ni transiciones.

Se usan las coordenadas válidas del catálogo autorizado, o el snapshot de una visita accesible si falta una ubicación válida en ese catálogo. Esto permite mostrar trabajos continuables fuera de la cobertura actual sin consultar tiendas adicionales ni ampliar permisos. No se incluyen tiendas del catálogo sin visita checklist accesible. Se descartan coordenadas no finitas, nulas o fuera de rango; cero y límites geográficos válidos se conservan. Si no quedan ubicaciones, se muestra una explicación y las visitas siguen disponibles en su lista.

Los marcadores permiten clic, Enter y Espacio y tienen el nombre accesible de la tienda. Los mapas sin navegación, incluido el individual, conservan sus popups. La colección de ubicaciones es estable al cambiar de pestaña para evitar reajustar el encuadre.

## Verificación

- Frontend: 225 pruebas en 32 archivos aprobadas, incluidas 21 regresiones nuevas de la página. Cubren finalizadas en todas las pestañas, cuotas duplicadas, prioridades por estado/fase, alcance, snapshot y ubicaciones inválidas/vacías.
- Cobertura de los módulos configurados: líneas 93.44 %, ramas 92.30 %; umbrales aprobados. No es cobertura de toda la interfaz ni del mapa.
- Prettier completo, ESLint, TypeScript, build normal y build API aprobados. `check-api-build.mjs` confirma que el build API no contiene fixtures ni repositorios mock.
- Backend: 160 pruebas aprobadas en PostgreSQL 16 local aislado. `manage.py check` y `makemigrations --check --dry-run` aprobados; sin cambios de esquema. Black y Flake8 del helper nuevo, Flake8 global de errores graves y compilación Python aprobados.
- E2E: suite completa, 34 pruebas aprobadas en 4.1 minutos, ninguna fallida en la ejecución final. Incluye las tres nuevas, fallos/reintentos del proveedor, carga a 320/1440 px, permisos, flujos reales, recuperación y evidencia. Se ejecutó sobre el build API final sin recompilar durante esa ejecución.

Las nuevas E2E usan un técnico con cobertura exclusiva, dos tiendas ficticias y dos cuotas por tienda. Finalizan cuatro visitas mediante la API real para reproducir el caso de todas finalizadas; comprueban las cuatro pestañas, dos marcadores, navegación por clic/teclado, accesibilidad Axe y ausencia de desbordamiento a 390 px. Otra prueba comprueba prioridad de un trabajo activo desde Finalizados y otra el estado vacío de un usuario sin cobertura. Se comprueba que otro técnico no puede consultar la visita aislada. Los tiles de estas tres pruebas se sustituyen por protobuf vacío válido; Leaflet y la API son reales. La prueba existente de fallo del proveedor y reintento conserva su alcance y se actualiza para admitir el mapa también en Mis Checklist.

## Incidencias durante la verificación

- La primera ejecución de las tres E2E nuevas tuvo dos aprobadas y una fallida: Enter no abría el detalle tras sustituir el popup por navegación directa. Se corrigió el evento de teclado y se añadieron Enter/Espacio y nombres accesibles a la regresión.
- Se interrumpió una primera ejecución completa para esperar a que acabaran las compilaciones: una prueba aprobada, una interrumpida y 32 sin ejecutar. No se atribuye la interrupción a un defecto de la aplicación.
- Se corrigieron los mocks y la parametrización de las pruebas nuevas, y una aserción de tipos innecesaria detectada por lint.

## Entorno y límites

Solo localhost: API Django en 8000, preview en 5174 y PostgreSQL nuevo `nf-checklist-map-v2-postgres` en 55436, base `nf_integration`. El helper exige settings de prueba, nombre de base aislada, host local y marcador del seed ficticio antes de escribir. No se borraron ni reinicializaron registros; los intentos ficticios conservan su historial. No se usaron credenciales productivas ni se modificaron migraciones, main o datos productivos. Sin push, merge ni despliegue.

Pendiente de revisión manual: Android físico con todas las visitas finalizadas, toque de marcadores y carga de cartografía con conectividad móvil real. Chromium con viewport móvil y tiles controlados no acredita funcionamiento en un teléfono Android físico.

## Archivos

- `frontend/src/pages/ChecklistListPage.tsx`
- `frontend/src/pages/ChecklistListPage.test.tsx`
- `frontend/src/features/checklists/checklistMap.ts`
- `frontend/src/features/technician/mapLocation.ts`
- `frontend/src/features/technician/LazyMap.tsx`
- `frontend/src/features/technician/AssignedLocationsMap.tsx`
- `frontend/e2e/checklist-map.spec.ts`
- `frontend/e2e/flows.spec.ts`
- `backend/test_support/checklist_map_case.py`
- `docs/integration/checklist-map-v2-verification.md`
