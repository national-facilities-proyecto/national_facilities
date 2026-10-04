# Arranque, migraciones y comprobación

Rama de trabajo: `feature/sprint1-alex-frontend`. Sin creación de ramas, incorporación automática de referencias, commit, push ni merge. Comprobación local en Windows, Python 3.13, Node 22.14, PostgreSQL 18 aislado y Edge. Compose/CI especifican PostgreSQL 16. El usuario levantó Compose y compartió migraciones/catálogos/check correctos; después se aplicaron 0012 y 0013 en ese Docker y se comprobó su health. Los recorridos de navegador se verificaron con backend/base nativos aislados.

## Desarrollo con Compose

1. Con Docker Engine activo, copiar `.env.example` a `.env` únicamente si no existe. Configurar claves reales de Django/PostgreSQL, host `db`, hosts y CORS. En la integración local se creó solo una configuración ignorada de ejemplo; debe ajustarse antes de usar datos operativos.
2. Ejecutar `docker compose up --build -d`.
3. Ejecutar desde la raíz:

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py bootstrap_catalogs
docker compose exec -e NF_ADMIN_PASSWORD="TU_CLAVE_SEGURA" backend python manage.py bootstrap_admin --username admin --email admin@tu-dominio.com
docker compose exec backend python manage.py check
```

4. Ingresar a http://localhost:5173 y cambiar contraseña inicial. Crear cliente, tienda con coordenadas reales, plantilla/tareas, contrato vigente, usuarios y asignaciones en el portal. La bolsa se genera desde el técnico autorizado.
5. Verificar salud http://localhost:8000/api/health/, cambios persistentes al recargar y consulta desde otro usuario autorizado.

No cargar fixtures operativos ni cuentas demo como paso de arranque. `bootstrap_catalogs` inicializa por nombre sin sobrescribir existentes; `bootstrap_admin` exige una contraseña validada, username/email explícitos y no reemplaza un usuario existente. El bootstrap conserva valores SLA heredados del catálogo pero no los presenta como una política confirmada.

Volúmenes `pgdata` y `evidence_data` conservan base y fotografías. No eliminar volúmenes para actualizar. El puerto 5432 puede ajustarse si ya está ocupado.

`docker compose --env-file .env.example config --quiet` pasó con una `.env` local de ejemplo. El arranque posterior compartido por el usuario muestra los contenedores de backend, frontend, base y liberación de reclamos activos. La verificación de recorridos usa una base aislada y no introduce datos de prueba en ese Docker.

## Desarrollo nativo

Instalar PostgreSQL, Python compatible y Node 22.14. Crear una base/usuario propio para desarrollo; no conectar la base aislada de tests a datos operativos. Exportar las variables de `.env.example`, cambiando POSTGRES_HOST a 127.0.0.1 y el puerto real. Django lee `.env` mediante python-decouple; variables de proceso tienen prioridad.

PowerShell desde la raíz:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.venv\Scripts\python.exe backend/manage.py migrate
.venv\Scripts\python.exe backend/manage.py bootstrap_catalogs
# Definir NF_ADMIN_PASSWORD en esta terminal sin registrarla en Git.
.venv\Scripts\python.exe backend/manage.py bootstrap_admin --username admin --email admin@tu-dominio.com
.venv\Scripts\python.exe backend/manage.py check
.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000
```

En otra terminal:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run dev
```

Linux/macOS: sustituir `.venv\Scripts\python.exe` por `.venv/bin/python`; usar `npm`. No se requiere activar el entorno cuando se usa la ruta del intérprete.

## Migraciones e historial

Aplicar migraciones antes de usar la API. Las nuevas migraciones son:

| Migración core                                             | Función                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0003_evento_excepcion_operacion_and_more                   | Timestamps/snapshots/revisión, metadatos y relaciones, auditoría, excepciones, idempotencia, unicidad de respuestas y ejecuciones vigentes |
| 0004_alter_evidencia_client_id                             | UUID único por archivo; asignación individual a históricos                                                                                 |
| 0005_alter_ticket_estado                                   | Estado pendiente de revisión del ticket                                                                                                    |
| 0006_alter_reasignacionticket_reasignado_por_and_more      | Restricciones de reloj/orden temporal y protección del historial de programación                                                           |
| 0007_alter_ticket_tecnico_asignado_and_more                | Protecciones de técnico asignado/revisor histórico                                                                                         |
| 0008_excepcion_revision_alter_ticket_estado_and_more       | Versiones de justificación para revisión/corrección CAS y estados visibles confirmados; no cambia códigos ni borra historial               |
| 0009_visita_reclamada_en_visita_reclamo_vence_en_and_more  | Reserva de dos horas, restricción temporal, eventos de liberación de sistema y recuperación de reclamos desde eventos reales               |
| 0010_alter_contrato_minimo_intervenciones_mensual_and_more | Mínimo de dos atenciones por tienda: validadores y restricción PostgreSQL; audita valores incompatibles                                    |
| 0011_visita_minimo_mensual_snapshot_and_more               | Snapshot del mínimo mensual y prohibición de contratos simultáneos mediante exclusión de rangos activos; fechas ordenadas                  |
| 0012_cliente_nombre_comercial                              | Nombre comercial opcional, separado de razón social; conserva clientes existentes con el dato vacío                                        |
| 0013_remove_cliente_nombre_comercial                       | Retira el campo por indicación posterior del usuario; los clientes conservan razón social, RUC y contacto                                  |

0011 instala la extensión PostgreSQL `btree_gist`: ejecutar migraciones con un rol autorizado para instalarla, o prepararla en la base con el administrador de PostgreSQL. Audita superposiciones/fechas inválidas antes de aplicar restricciones y no desactiva, borra ni fusiona contratos. La aplicación no importará ejecuciones previas al lanzamiento.

0012 y 0013 se aplicaron tanto en `nf_integration` como en el Docker de desarrollo del usuario. 0013 retira el nombre comercial por la última indicación del usuario; se conserva 0012 porque ya estaba aplicada. La API del Docker respondió 200 en `/api/health/`. Se mantienen los clientes, su razón social y sus relaciones.

0003/0006 auditan datos incompatibles antes de aplicar restricciones. Si detectan respuestas repetidas, visitas vigentes duplicadas o fechas inconsistentes, detienen la migración y enumeran IDs: no borrar/fusionar para hacerla pasar. Revisar esos casos con negocio. No asignan horas exactas de inicio/apertura/cierre a históricos que no las tienen.

Después de actualizar el esquema:

```powershell
.venv\Scripts\python.exe backend/manage.py audit_integrity
.venv\Scripts\python.exe backend/manage.py expire_temporary_evidence
```

Ambos comandos son de inspección por defecto. Caducidad --apply solo marca temporales sin visita/checklist/ticket, de antigüedad mínima 24 horas, y conserva archivos/historial. No se aplicó eliminación física ni baja de datos operativos durante este trabajo.

Para liberar reservas de checklist sin iniciar, Compose ejecuta el servicio `claim-expiry` cada 60 segundos. En arranque nativo mantener otra terminal o servicio de proceso:

```powershell
.venv\Scripts\python.exe backend/manage.py expire_checklist_claims --watch --interval 60
```

También puede programarse el comando sin `--watch` cada minuto mediante el planificador del entorno. Las consultas de bolsa/lista/detalle y las acciones de reclamo/inicio verifican el vencimiento de forma inmediata; ninguna pantalla antigua puede iniciar una reserva vencida. El proceso periódico permite liberar aun sin consultas. Nunca afecta trabajos iniciados ni plazos de formulario. `audit_integrity` enumera `unrecordedClaims`: reclamos históricos sin una hora/evento comprobable requieren decisión, se conservan y no reciben una fecha inventada.

## Evidencia duradera y Cloud Run

En local, MEDIA_ROOT o el volumen Compose guarda archivos; las descargas siempre pasan por autorización HTTP. No publicar `/media/` como acceso directo.

Cloud Run requiere `GS_BUCKET_NAME`, bucket privado y Application Default Credentials de la cuenta de servicio con permisos del bucket. El check Django bloquea Cloud Run si se intenta usar almacenamiento local efímero. Configurar además conexión Cloud SQL, SECRET_KEY, hosts/CORS, servidor WSGI productivo, estáticos y proceso de migraciones según infraestructura.

Esta integración no desplegó ni verificó Cloud Run, Cloud SQL ni lectura/escritura GCS con credenciales reales. La implementación del storage está disponible, con esa limitación explícita.

## Base exclusiva para tests

`config.test_settings` usa PostgreSQL, nunca SQLite. Exige base `nf_integration`. Por defecto: usuario `nf_test`, localhost:55432. Los tests Django crean `test_nf_integration`; el usuario necesita CREATEDB. Usan hasher rápido exclusivamente en la configuración aislada; validadores de contraseña siguen siendo reales.

Ejemplo para crear un cluster nuevo local en Windows, **solo si las rutas/base no existen ya**:

```powershell
$pgTestBin = 'C:\Program Files\PostgreSQL\18\bin'
New-Item -ItemType Directory -Path .integration -Force
& "$pgTestBin\initdb.exe" -D .integration/pgdata -U nf_test -A trust --encoding=UTF8 --locale=C
& "$pgTestBin\pg_ctl.exe" -D .integration/pgdata -l .integration/postgres.log -o '-p 55432 -h 127.0.0.1' start
& "$pgTestBin\createdb.exe" -h 127.0.0.1 -p 55432 -U nf_test nf_integration
```

Trust aquí es exclusivo del cluster de pruebas en loopback y sin datos de negocio. Para otro servidor define credenciales de un usuario aislado:

```powershell
$env:POSTGRES_DB='nf_integration'
$env:POSTGRES_USER='nf_test'
$env:POSTGRES_HOST='127.0.0.1'
$env:POSTGRES_PORT='55432'
# POSTGRES_PASSWORD según esa instancia.
.venv\Scripts\python.exe backend/manage.py check --settings=config.test_settings
.venv\Scripts\python.exe backend/manage.py makemigrations --check --dry-run --settings=config.test_settings
.venv\Scripts\python.exe backend/manage.py test core --settings=config.test_settings --noinput
.venv\Scripts\python.exe backend/manage.py migrate --settings=config.test_settings
.venv\Scripts\python.exe backend/test_support/seed.py
```

La semilla comprueba configuración/base aisladas y crea usuarios de prueba del lado Django (no cuentas disponibles en el runtime normal). Los helpers protegen clientes marcados E2E-ONLY y generan casos nuevos; no reinicializan historiales operativos.

## Navegador con backend real

Terminal 1, raíz:

```powershell
.venv\Scripts\python.exe backend/manage.py runserver 127.0.0.1:8000 --settings=config.test_settings --noreload
```

Terminal 2:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run build:api
node scripts/check-api-build.mjs
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort
```

Terminal 3:

```powershell
Set-Location frontend
$env:PW_EXTERNAL_SERVER='1'
# Por defecto usa Edge instalado localmente; PW_CHANNEL puede elegir otro.
npx.cmd playwright test --reporter=list
```

Si no hay navegador compatible, instalar Chromium con `npx playwright install chromium` y ajustar PW_CHANNEL/CI según configuración. En Linux CI se instala Chromium y Playwright inicia su preview. En Windows se verificó preview externo: el proceso administrado por Playwright había quedado bloqueado al terminar.

Los E2E realizan login, CRUD, programación, borrador, archivos, GPS, excepciones y finalización contra Django/PostgreSQL reales. Solo se simulan dispositivos de cámara/GPS y caída del proveedor externo de mapa. No se reemplazan endpoints principales por fixtures. `backend/test_support/clock.py` mueve timestamps exclusivamente en nf_integration/casos E2E para probar >5 minutos/vencimiento sin esperar en tiempo real; no es una función productiva.

Si el Docker del desarrollo ya ocupa el puerto 8000, iniciar el Django aislado en 8001. Para esa sesión de pruebas, construir el frontend con `VITE_API_URL=http://127.0.0.1:8001/api` y ejecutar Playwright con `NF_TEST_API_URL` del mismo valor. Mantener el preview en 5174 y `config.test_settings`/`nf_integration`. Las variables se definen únicamente en esas terminales; no cambiar la `.env` operativa. Al terminar, reconstruir sin esa variable para recuperar la URL configurada del build normal.

Los tests de UX de carga retrasan la descarga de módulos reales para comprobar la navegación y las dimensiones de mapa, en 320 y 1440 px, con axe y movimiento reducido. No sustituyen las respuestas de la API.

## Comprobación frontend

```powershell
Set-Location frontend
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run build:api
node scripts/check-api-build.mjs
```

Resultados y cobertura: [validación](../../frontend/docs/validation.md). La [matriz](view-endpoint-matrix.md) relaciona vistas/consultas/mutaciones y el [registro de decisiones](decisions-pending.md) recoge las reglas confirmadas, el SLA aplazado y los controles conservados.

La CI actual reproduce pruebas backend/frontend y E2E con PostgreSQL 16. No se ejecutó el workflow remoto durante este trabajo y no se hizo push.
