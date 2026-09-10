# Contratos de integración con Django

Este documento distingue código observado de contratos propuestos. No se modificó ni se ejecutó Django durante la refactorización. Un modelo existente no implica que exista una API para consumirlo.

## Base revisada

Backend del checkout `28b37636cdc1b355a778b22561f02c9fa980bbfc`, rama `feature/sprint1-alex-frontend`. Fuentes: `backend/core/urls.py`, `views.py`, `serializers.py`, `models.py`, `permissions.py` y `backend/config/urls.py`.

La consulta `git ls-remote` del 09/09/2026 encontró `main` remoto en `766a324d45252a47589b32fecd5903914122f8a7`; no se hizo merge ni se cambió de rama. Los contratos siguientes corresponden al checkout analizado, no a una certificación de despliegue de `main`.

## Endpoints definidos en el checkout

| Método                                     | Ruta real                                                                                                                | Alcance observado / diferencia relevante                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| POST                                       | `/api/auth/login/`                                                                                                       | SimpleJWT; entrega tokens. No hay respuesta extendida de usuario y rol en la vista configurada.                                        |
| POST                                       | `/api/auth/refresh/`                                                                                                     | Renovación de token definida. No se activa renovación automática en esta entrega.                                                      |
| GET                                        | `/api/tiendas/`                                                                                                          | Tiendas visibles según usuario; decimales de coordenadas serializados como texto.                                                      |
| GET, POST                                  | `/api/evidencias/`                                                                                                       | Evidencia asociada a checklist: `checklist`, `foto`, `descripcion`, `subida_en`. No hay relación con respuesta/ítem en ese serializer. |
| GET                                        | `/api/visitas/pool/`                                                                                                     | Filtra origen checklist y estados programada/en curso; no excluye todas las visitas ya tomadas. Acordar la semántica final de bolsa.   |
| POST                                       | `/api/visitas/pool/{id}/tomar/`                                                                                          | Reclama con transacción; 409 si tiene técnico. Cambia directamente a `en_curso`, sin un paso GPS de inicio separado.                   |
| GET                                        | `/api/visitas/programadas/`                                                                                              | Visitas de tickets del técnico. No devuelve el detalle completo del reporte.                                                           |
| GET, POST, GET detalle, PUT, PATCH, DELETE | `/api/admin/clientes/`, `/api/admin/tiendas/`, `/api/admin/contratos/`, `/api/admin/plantillas/`, `/api/admin/usuarios/` | ViewSets de administrador. Un endpoint definido no implica validación funcional realizada en este trabajo.                             |
| GET, POST, GET detalle, PUT, PATCH         | `/api/admin/items-plantilla/`                                                                                            | Desactivación; DELETE está excluido explícitamente.                                                                                    |

Las URLs de detalle de los ViewSets agregan `{id}/`. Los permisos definitivos siguen siendo responsabilidad del servidor.

## Interfaces frontend

`src/services/repositories/contracts.ts` es el punto de sustitución. Todos los métodos devuelven promesas; las consultas aceptan `AbortSignal`. Las páginas reciben repositorios desde `RepositoriesContext`. `AppError` clasifica validación, 401, 403, 404, conflicto, red, almacenamiento, GPS y operación no integrada.

| Repositorio              | Casos de uso                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| AuthRepository           | Login, restauración, logout, cambio de contraseña; listado de cuentas ficticias en mock.  |
| ChecklistRepository      | Listar bolsa y visitas propias, obtener detalle, tomar visita y guardar borrador.         |
| VisitRepository          | Listar asignaciones, detalle, inicio/cierre GPS, solicitud y revisión de excepción.       |
| TicketRepository         | Crear, listar, detalle, programar, reprogramar y reasignar con historial.                 |
| StoreRepository          | Listar tiendas visibles y obtener la tienda concreta.                                     |
| UserRepository           | Usuarios necesarios para asignación y nombres de participantes.                           |
| DashboardRepository      | Indicadores derivados de visitas, tickets y contratos.                                    |
| AdministrationRepository | Listado y escritura tipados de usuarios, tiendas, clientes, contratos y plantillas/ítems. |
| EvidenceRepository       | Persistir, recuperar y eliminar Blob junto con metadatos.                                 |

La implementación HTTP es una estructura parcial intercambiable por interfaz: login y listado de tiendas tienen transporte real; el resto devuelve `not_implemented`. Esto es deliberado: el encargo pide completar primero el modo mock. No se presenta el adaptador HTTP como integración funcional completa.

## Contratos pendientes: propuestas, NO endpoints existentes

| Capacidad necesaria                       | Propuesta a acordar                        | Datos mínimos                                                                                                 |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Identidad de sesión                       | `/api/auth/me/` **o login extendido**      | Usuario, rol canónico, tiendas/cuenta autorizadas, estado activo, cambio inicial pendiente y vencimiento.     |
| Cambio y recuperación de contraseña       | Rutas a definir                            | Validación actual/nueva contraseña, reglas del servidor y confirmación real. El mock no almacena contraseñas. |
| Mis checklists reclamados                 | Consulta específica o filtros documentados | ID de visita separado del ID de tienda; técnico y estado.                                                     |
| Detalle de checklist y plantilla efectiva | Ruta a definir                             | Versión de plantilla, tareas activas, obligatoriedad de foto, respuestas e IDs de evidencias.                 |
| Inicio de visita                          | Propuesta `/api/visitas/{id}/iniciar/`     | Coordenadas, precisión, captura reciente, radio del contrato y fecha autoritativa de inicio.                  |
| Borrador y cierre                         | Rutas a definir                            | Respuestas, observaciones, evidencias verificadas, GPS nuevo de cierre; conflicto de versión/idempotencia.    |
| Excepción y revisión                      | Rutas a definir                            | Motivo, tipo de fallo GPS, técnico, supervisor, decisión, observación y timestamps.                           |
| Tickets                                   | CRUD y acciones a definir                  | Reporte original, categoría, urgencia, tienda, fechas, estado, resolución, evidencias originales/técnicas.    |
| Programación y reasignación               | Acciones a definir                         | Técnico anterior/nuevo, fecha anterior/nueva, prioridad, motivo, actor e historial.                           |
| Roles y asignaciones de tienda            | Catálogos/acciones a definir               | IDs reales de rol y asignaciones activas. No se asumen IDs de fixtures del backend.                           |
| Dashboard                                 | Consulta agregada a definir                | Mes/cuenta, denominadores, tickets por estado, duración de atención y metas contractuales.                    |
| Evidencia por respuesta y de tickets      | Ampliación contractual a definir           | Archivo multipart, MIME/tamaño comprobados, tarea/respuesta, fecha de captura y fecha de recepción.           |

Ejemplo de login extendido esperado por el adaptador preparado: `{ access, refresh, expiresAt, user: { id, name, email, role, storeIds, active, passwordInitialized } }`, donde `expiresAt` es epoch en milisegundos. El DTO final puede diferir: adaptar en `services/adapters`, no en las páginas. El login SimpleJWT actual, sin identidad, produce un error claro y no abre rutas protegidas.

## Correspondencias y decisiones que deben acordarse

- Roles: `Tecnico` → `technician`, `Supervisor de tienda` → `store_supervisor`, `Supervisor de cuenta` → `account_supervisor`, `Administrador` → `administrator`. Un valor desconocido o nulo no autoriza.
- IDs de tickets y visitas son distintos. Las URLs del técnico usan el ID de visita; se muestra también `ticketId`.
- Mock: `available` → `claimed` → `in_progress` → `completed` o `pending_approval`. Django actual usa `programada`, `en_curso`, `completada`, `pendiente_validacion`, `no_realizada`; hay que acordar la distinción entre reclamar e iniciar.
- Respuestas frontend: `conforme` / `no_conforme`; modelo Django: `ok` / `observado` / `no_aplica`. El tercer estado no se inventa en la UI solicitada. La obligatoriedad de foto aún no está expuesta por el serializer de ítems.
- Categorías y prioridades usan valores de demostración. En HTTP deben mapearse a los IDs de `CategoriaProblema` y `NivelUrgencia` entregados por el servidor.
- El radio se obtiene del contrato/visita, no de una tienda fija. Mock inicial: 100 m. La UX considera antigua una lectura de más de 60 s y pide reintentar si la precisión supera el menor entre el radio y 100 m; estos umbrales son decisiones de UX pendientes de validación operativa.
- Conforme a los comentarios de `Visita`, la excepción de cierre es por permiso denegado o falta de señal (incluye timeout). No hay excepción al inicio ni para estar fuera del radio. Una aprobación manual conserva la excepción y **no fabrica coordenadas ni cambia el hecho de que faltó validación GPS**.
- Aprobación: pasa a completada/resuelto. Rechazo: vuelve a en curso, conserva motivo y permite nueva lectura. El estado definitivo debe acordarse con el backend.
- Fechas de programación del mock se interpretan en la zona local del navegador; los timestamps de auditoría son ISO. Para una operación multi-zona, acordar la zona del contrato con el backend.

## Seguridad e integración progresiva

La autorización, el geofencing y la validación de archivos definitivos pertenecen a Django. Capturar con `getUserMedia` limita la UX a la cámara, pero no demuestra al servidor el origen ni la autenticidad de una foto. No se registra información sensible en consola.

La sesión API permanece en `sessionStorage`, con expiración y borrado selectivo de claves NF. No se atribuyen garantías de protección contra XSS a ese almacenamiento. La estrategia futura de refresh/cookies HttpOnly requiere acuerdo con el backend; no se simula una cookie desde el cliente.

Integrar cada repositorio por separado cuando exista el DTO validado, añadir pruebas del mapper/transporte (401/403/404/409, cancelación, vacío y errores), y ejecutar el mismo recorrido visual. Nunca recurrir a fixtures después de un error HTTP. El almacenamiento de evidencias en Cloud Storage del ADR-007 corresponde al equipo backend/despliegue y no se modifica aquí.
