# Contratos HTTP implementados

Base `/api`, JSON camelCase y barra final. Django/DRF es la autoridad de autorización, estados, timestamps, GPS y contenido. Las listas son arrays, no páginas ni fixtures. Los mappers rechazan DTO incompatibles.

## Autenticación y alcance

| Método/ruta         | Datos y respuesta                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| POST auth/login/    | `username,password` → `access,refresh,expiresAt,user`                                                 |
| POST auth/refresh/  | `refresh` → sesión nueva; rota y revoca refresh anterior                                              |
| GET auth/me/        | Identidad y alcance actual                                                                            |
| POST auth/password/ | `password,confirmation,currentPassword` (actual obligatoria después del primer cambio) → nueva sesión |
| POST auth/logout/   | 204; revoca tokens del usuario en todos los dispositivos                                              |
| GET health/         | Público; SELECT 1; 200/503                                                                            |

`expiresAt` de sesión es epoch en milisegundos. La identidad incluye ID numérico, username, name, email, role, active, passwordInitialized y storeIds. Roles canónicos: `technician,store_supervisor,account_supervisor,administrator`. JWT access dura una hora y refresh siete días; versiones del usuario invalidan tokens tras cambio de contraseña, rol, actividad o alcance. Inactivos, roles desconocidos y tokens revocados se rechazan.

Antes del cambio inicial solo se permiten identidad, cambio de contraseña y logout. El guard React complementa la restricción del servidor. Un rol válido no concede acceso a tiendas ajenas: se requieren asignaciones activas, propiedad y técnico vigente según el recurso. El administrador gestiona catálogos; no ejecuta como técnico.

La contraseña nueva debe ser diferente de la vigente, también en el primer acceso
obligatorio. Repetirla devuelve HTTP 400 con error en `password`; conserva la
contraseña, el estado de inicialización y la versión de sesión. Un cambio válido
mantiene la emisión de una nueva sesión y la revocación de las anteriores.

## Operaciones y errores

Las mutaciones JSON requieren `Idempotency-Key` (1–100 caracteres). La clave pertenece al usuario y vincula ruta+huella del payload. Misma operación devuelve el recurso actual sin repetir efectos; reutilizar la clave con otro contenido/ruta devuelve 409. La transacción almacena operación y efecto juntos.

El frontend conserva únicamente UUID/huella de operaciones inciertas en sessionStorage para reintentos. Borra la clave tras un DTO válido o rechazo definitivo; una respuesta 2xx incompatible no se considera confirmación. Fotos usan un UUID estable en multipart en lugar de Idempotency-Key.

400 contiene errores por campo, 401 exige renovación/reautenticación, 403 deniega permiso, 404 oculta un recurso fuera del alcance o inexistente, 409 comunica estado/revisión incompatible. Un fallo de red conserva el editor y no utiliza respaldo local. El transporte también admite Blob autenticado para imágenes/CSV y preserva errores HTTP antes de leerlo.

## Clientes y actualización de vistas

`GET/POST admin/clientes/` y `GET/PATCH admin/clientes/:id/` usan `id,name,taxId,email`. `name` es razón social, obligatoria y de máximo 200 caracteres; `taxId` es RUC/identificación y `email` es correo de contacto. El cliente se identifica por su razón social, conforme a la última indicación del usuario. Una edición parcial conserva los campos omitidos y no modifica las relaciones históricas.

Los refrescos del mismo recurso conservan el contenido confirmado y muestran un indicador de actualización. Ante fallo de red, se avisa explícitamente que se muestran los últimos datos del servidor; permisos revocados retiran esos datos. Cambiar recurso/filtro inicia una consulta nueva. Los formularios de Administración pausan los eventos/período automático mientras están abiertos y recargan el listado al cerrar, para evitar borrar campos escritos.

## Visitas y checklists

La escritura de `admin/tiendas/` requiere `latitude` entre −90 y 90 y `longitude` entre −180 y 180, hasta seis decimales. El formulario admite valores individuales con punto/coma decimal y pegado del par con punto decimal separado por coma. Valida formato y rangos antes de redondear a seis decimales, muestra la ubicación resultante antes de confirmar y envía números a la API. Un valor inválido identifica su campo y conserva el editor; Django mantiene su validación de rangos/precisión. Esto no modifica las coordenadas capturadas durante visitas ni los radios GPS.

| Consulta                                          | Respuesta/alcance                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET tiendas/, tiendas/:id/                        | Tiendas autorizadas; coordenadas numéricas o decimales serializados            |
| GET usuarios/                                     | Usuarios permitidos para selección; programación vuelve a validar elegibilidad |
| GET catalogos/                                    | Categorías activas y prioridades reales con IDs                                |
| POST checklists/generar/                          | Generación mensual transaccional; `period` opcional YYYY-MM-01 del mes actual  |
| GET checklists/                                   | Visitas de origen checklist visibles                                           |
| GET visitas/, visitas/pool/, visitas/programadas/ | Mis asignaciones, bolsa actual o tickets programados según ruta/rol            |
| GET visitas/:id/                                  | Estado, snapshot, borrador y evidencias confirmadas                            |

La visita incluye IDs, origin, scheduledAt, status, tasks/answers, workDescription, evidenceIds, revision, serverNow, timestamps, ubicaciones reales, excepciones y duraciones. `storeSnapshot` contiene nombre, dirección, coordenadas y cliente fijados para la ejecución; `radiusMeters` proviene del contrato fijado. Tareas llevan id/title/photoRequired/active/order y se preservan como snapshot. Respuestas: taskId, result (conforme/no_conforme/no_aplica o null), observation, evidenceIds.

`workStatus` es autoritativo: pending (Pendiente), in_progress (En proceso), in_review (En revisión), finished (Finalizado). cancelled/No realizada solo describe ejecuciones históricas invalidadas. `status` conserva available/claimed para disponibilidad/asignación e in_progress/pending_approval/completed/cancelled para compatibilidad. Los mappers verifican que ambos campos sean coherentes. `formOpenedAt` distingue las etapas sin inventar un fin físico; no existe estado form_expired.

| POST sobre visita             | Entrada y condición                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| visitas/pool/:id/tomar/       | Reserva dos horas; retries no amplían el vencimiento                                                                     |
| visitas/:id/iniciar/          | `location`; GPS de llegada fresco validado por backend; no abre formulario                                               |
| visitas/:id/terminar/         | `{}`; fin físico autoritativo idempotente, sin ubicación                                                                 |
| visitas/:id/ubicacion-cierre/ | Alias compatible de terminar; no consume ni sustituye GPS histórico                                                      |
| visitas/:id/formulario/       | Primera apertura después de fin físico; sin nuevo vencimiento; retries conservan apertura                                |
| visitas/:id/borrador/         | `revision,answers,workDescription,evidenceIds`; CAS; incrementa revisión                                                 |
| visitas/:id/finalizar/        | `revision`; contenido completo y validación de llegada o decisiones aprobadas; sin GPS ni plazo                          |
| visitas/:id/excepciones/      | `type=location,scope=arrival,reason,failure,evidenceId,location?`; foto cámara propia confirmada; `revision` al corregir |
| visitas/:id/revisar/          | `exceptionId,approved,reason,revision,exceptionRevision`; NF de cobertura, registro completo enviado                     |
| visitas/:id/enviar-revision/  | `revision,exceptions?`; envío explícito de registro completo; sin GPS ni límite temporal                                 |

Nuevas excepciones de tiempo/cierre se rechazan. Las históricas admiten decisiones
independientes y corrección con su revisión. Corregir ubicación no admite una
lectura nueva: conserva la telemetría original. La excepción añade `evidenceIds`;
la visita añade `arrivalEvidenceIds` para recuperar fotos de llegada confirmadas.

Las aperturas, reclamos, envíos, justificaciones y revisiones se serializan con bloqueos y claves/restricciones. Borradores concurrentes antiguos reciben 409: no sobrescriben al nuevo.

La bolsa genera tantas visitas independientes por tienda/mes como indica la frecuencia contractual, sin separación mínima ni prohibición de repetir técnico. `period`, `quota` y `quotaCount` identifican la obligación publicada; editar el contrato no reescribe las cuotas ya generadas. `claimedAt` y `claimExpiresAt` fijan dos horas desde el reclamo. Repetir la solicitud no renueva esa reserva. Solo un checklist todavía sin iniciar vuelve automáticamente a la bolsa al vencer; inicio y formulario conservan reglas separadas.

Consultar bolsa/lista/detalle y reclamar/iniciar comprueba reservas vencidas en el servidor. El servicio `expire_checklist_claims --watch --interval 60` también las libera sin tráfico. `claimHistory` devuelve id, at, actorId nullable, kind (`claim`/`claim_release`), technicianId, claimedAt, expiresAt y text. El autor nulo representa una liberación automática del sistema; no una cuenta ficticia. Un reclamo histórico sin fecha/evento comprobable queda protegido para revisión.

Los timestamps pueden ser nulos. Históricos sin snapshot/timestamps no se reinician ni se completan inventando datos; requieren decisión de migración. Nuevas aperturas no generan vencimiento; los vencimientos históricos se conservan. PostgreSQL valida el orden de eventos.

## Contenido y GPS de llegada

Todas las tareas deben tener resultado y pertenecer al snapshot. No conforme
exige observación; conforme/no conforme exigen foto si `photoRequired=true`.
No aplica exige motivo y nunca foto. Las fotos del checklist se cargan en el ítem
al responderlo; no hay galería de recorrido. Ticket exige descripción técnica y
foto de resolución, separadas del reporte original y de la foto de llegada.

Solo llegada acepta `location={latitude,longitude,accuracy,capturedAt}` (epoch ms).
El backend valida números finitos, latitud ±90, longitud ±180, precisión no negativa,
antigüedad máxima 60 s, futuro máximo 5 s y precisión ≤ min(radio,100 m). Calcula
Haversine contra el snapshot y rechaza fuera del radio. Si falla, el técnico puede
reintentar o aportar motivo de diez caracteres y foto desde cámara de la app.
La excepción inicia trabajo con presencia sin validar; aprobación NF permite
finalizar pero no convierte GPS inválido en presencia normal. Una lectura completa
fuera de radio no se clasifica como permiso denegado por una declaración del cliente.

El formulario no tiene plazo, contador ni excepción de demora. Apertura y
fin físico son eventos separados e inmutables. `timeLimitSeconds=null`;
`expiresAt`/marcas de demora existentes solo describen historial. Duraciones no
se recortan. No se impone una política nueva de inactividad de sesión.

Sin excepciones, contenido completo finaliza normalmente. Con excepción pendiente,
el técnico envía explícitamente a NF y queda solo lectura. Rechazo produce
Corrección requerida y exige cambio real versionado antes de reenviar en la misma
ejecución. Motivos/decisiones previas, fotos, respuestas y timestamps se conservan;
las aprobaciones independientes permanecen. NF puede resolver otras excepciones
pendientes aun después de un rechazo. Un nuevo envío queda auditado.

Cada excepción devuelve revision. exceptionHistory contiene id, at, actorId, kind y un snapshot exception de cada solicitud, corrección, reapertura y decisión. Revisar exige la revisión del borrador y de la excepción que se mostró al supervisor: una versión antigua recibe 409. Las evidencias se protegen durante un envío pendiente de decisión; incompleto o rechazado admite edición controlada.

Duraciones: totalSeconds = envío − inicio; executionSeconds = apertura − inicio; registrationSeconds = envío − apertura. executionSeconds es tiempo previo al formulario, no una hora inferida de fin físico. completedAt puede ser posterior al envío por revisión.

## Tickets

| Método/ruta                 | Contrato                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET/POST tickets/           | Lista autorizada / creación por supervisor de tienda                                                                       |
| GET tickets/:id/            | Reporte, programación, historial, visita vigente, resolución y ambos grupos de evidencias                                  |
| POST tickets/:id/programar/ | Supervisor de cuenta: technicianId,scheduledAt,priorityId,reason,revision                                                  |
| POST tickets/:id/cerrar/    | Compatibilidad idempotente: devuelve Finalizado si la resolución/revisión ya fue aceptada; no crea otra etapa ni timestamp |

Crear requiere storeId, categoryId, priorityId, description (10–500 caracteres), evidenceIds (máximo cinco). Las fotos temporales deben ser del reportante y no estar asociadas a otro contexto. No se usan nombres/IDs inventados del catálogo.

Programar exige fecha futura, contrato único vigente, técnico activo asignado a tienda y revisión actual. Reprogramar/reasignar exige motivo ≥10 caracteres y estado operativo Pendiente. Invalida la visita anterior sin borrar historial y crea una única ejecución vigente. El técnico anterior pierde acceso de ejecución. Una atención iniciada conserva técnico y ejecución; la reasignación está prohibida en En proceso, En revisión y Finalizado.

workStatus sigue los mismos cuatro estados que el checklist. status conserva open/scheduled como detalles de programación, in_progress/pending_approval y resolved/closed históricos. resolved y closed se presentan como Finalizado; no hay segunda aceptación posterior a la finalización. El backend sincroniza ticket/visita. history incluye ID, actor, fecha y texto, y conserva valores anteriores/nuevos.

## Evidencias privadas

GET evidencias/ permite al supervisor de tienda recuperar exclusivamente sus adjuntos temporales sin asociación, incluyendo fotos confirmadas antes de recargar el reporte.

POST evidencias/ multipart: `id` UUID estable, `foto` File/Blob, source (camera/gallery/upload), visitId y taskId cuando corresponde, capturedAt opcional para resultados, y `purpose=result|arrival` (default result). Llegada exige visita propia autorizada, cámara, capturedAt y ningún taskId; queda vinculada a la excepción y no se ofrece al Supervisor de tienda. El servidor verifica imagen, formato/extensión/MIME coincidentes JPEG/PNG/WebP, 1 byte–5 MB y hasta cinco por tarea, resolución o reporte temporal.

GET evidencias/:uuid/ devuelve metadatos; GET evidencias/:uuid/archivo/ devuelve Blob autorizado con no-store/nosniff. DELETE aplica baja lógica del autor durante formulario editable; no borra evidencia cerrada ni del reporte original. Reintento de mismo UUID+contenido+contexto no crea otra foto; otro contenido, autor/contexto o archivo eliminado da 409.

Metadatos: id, visitId/ticketId/taskId nulos cuando no aplican, name, mimeType, size, capturedAt nullable, uploadedAt del servidor y source. Históricos sin metadatos exactos conservan vacío/0/null, sin fabricar captura. Evidencia confirmada se recupera desde relaciones del servidor aunque falle el último guardado de respuestas.

Almacenamiento duradero: volumen local o bucket GCS privado con ADC. La URL pública de media no expone archivos. El comando de caducidad de temporales primero enumera y solo con --apply aplica baja lógica a temporales sin asociaciones; conserva archivo/trazabilidad. La política de borrado físico no está definida.

## Administración e indicadores

CRUD con permisos de administrador: `admin/usuarios,tiendas,clientes,contratos,plantillas`. `admin/items-plantilla` permite lectura; edición de ítems se hace anidada en plantilla y conserva snapshots/versiones. Usuario nuevo requiere username, password, nombre/correo, rol permitido, actividad y storeIds; contraseña pasa validadores Django. No puede desactivar ni degradar su propia cuenta administrativa. Borrados con historial protegido devuelven conflicto; se permite desactivar.

`username` rechaza espacios y otros caracteres de separación, incluidos los de
inicio y fin, con error explícito en el campo; mantiene longitud máxima, caracteres
permitidos y unicidad. El formulario conserva el valor escrito para corregirlo.

Cada supervisor MASS (`store_supervisor`) tiene exactamente una tienda. Cada
tienda admite como máximo un supervisor MASS con usuario y asignación activos.
La API valida altas, cambios de tienda/rol y reactivaciones dentro de una
transacción con bloqueo de tienda; una tienda ocupada devuelve HTTP 400 en
`storeIds` sin guardar cambios parciales. Una cuenta inactiva no reserva la tienda.
Editar el supervisor vigente conserva su propia asignación; la cobertura National
no está sujeta a esta exclusividad. `audit_integrity` informa duplicados existentes
en `multipleActiveStoreSupervisors` sin modificar usuarios ni historial.

GET dashboard/, reportes/ y reportes/exportar/ son de supervisor de cuenta, con period=YYYY-MM-01 y clientId opcional autorizado. El selector conserva todos los clientes de la cartera al filtrar uno. Cumplimiento preventivo usa cuotas mensuales y finales aceptados; pendientes no cuentan. `risks` devuelve una fila por tienda: `storeId,store,clientId,client,completed,required,missing`. El mínimo es dos atenciones de tickets por tienda/mes, además del checklist. Se cuentan tickets con visita vigente finalizada y fecha de resolución aceptada en el período, aunque fueran reportados antes. El mínimo de la bolsa publicada conserva su snapshot. CSV identifica contrato/período/cuota y distingue los cuatro timestamps, tres duraciones, estado y ambas excepciones. SLA está aplazado por el usuario; `sla=null` y la UI lo presenta pendiente de definición.

Consulta [matriz](../../docs/integration/view-endpoint-matrix.md), [decisiones](../../docs/integration/decisions-pending.md) y [validación](validation.md).

## Contratos y lanzamiento

`monthlyInterventions` es un mínimo por tienda de atenciones de tickets, con valor mínimo dos; no suma checklists. El formulario, el serializer y PostgreSQL lo validan. Las fechas de contratos son inclusivas. Dos contratos activos del mismo cliente no pueden tener fechas simultáneas: error 400 por campo y exclusión PostgreSQL ante escrituras concurrentes. Un contrato consecutivo comienza después del último día del anterior. Los snapshots publicados preservan tareas, radio y mínimo mensual. El checklist puede iniciarse cualquier día de su mes y vigencia contractual; una reserva no permite iniciar una obligación del mes anterior. El sistema comienza con registros nuevos al lanzamiento; no tiene flujo de importación/regularización histórica.
