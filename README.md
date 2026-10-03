# National Facilities — Checklists, rutas y tickets

Proyecto del curso Curso Integrador 2 — Software. Portal de mantenimiento para cadenas de retail: técnicos, supervisores de tienda, supervisores de cuenta y administradores.

React consume exclusivamente Django/DRF y PostgreSQL. Las visitas, respuestas, tickets, archivos, asignaciones y decisiones se guardan en el servidor. No hay modo demo, cuentas ficticias ni datos operativos locales en el funcionamiento normal. Los dobles permanecen únicamente en tests.

## Operación

El técnico toma un checklist de la bolsa mensual o atiende un ticket programado. **Iniciar** valida asignación, estado y GPS y registra el inicio real del trabajo. Muestra tareas y tiempo transcurrido, sin abrir el formulario ni limitar el trabajo a cinco minutos.

**Registrar resultados / resolución** registra la primera apertura y un único vencimiento a cinco minutos, tanto para checklist como para ticket. Las respuestas, observaciones, descripción y fotos se guardan en el servidor. Se admiten cámara y galería; la fecha de subida es del servidor y una fecha de captura no disponible queda nula.

Cerrar la página, cambiar de dispositivo o volver a autenticarse recupera el estado confirmado y conserva el plazo original. Los cambios aún no confirmados permanecen en el editor mientras la página siga abierta; no se anuncian como guardados. Al vencer, el cierre normal se bloquea, se conserva el contenido y se permite justificar. Tiempo y GPS se revisan por separado. El cumplimiento exige una finalización aceptada.

Los tickets conservan reporte original, programación y sus cambios, trabajo técnico, evidencias y eventos. Las plantillas, datos de ubicación y radio se fijan en la visita para proteger el historial. Las escrituras operativas pasan por servicios transaccionales, restricciones e idempotencia.

## Estado y decisiones pendientes

La [matriz de vistas](docs/integration/view-endpoint-matrix.md) identifica cada conexión, permiso, validación y comprobación. Las visitas mensuales son independientes por tienda y pueden repetir técnico; un reclamo sin iniciar se libera automáticamente a las dos horas. Cada tienda requiere además dos atenciones de tickets al mes; el checklist se cuenta por separado. El administrador asigna las tiendas del técnico y solo se reasigna un ticket Pendiente. Contratos simultáneos del mismo cliente están prohibidos. El [registro de decisiones](docs/integration/decisions-pending.md) recoge las reglas confirmadas: SLA aplazado e importación de trabajos previos al lanzamiento fuera del alcance.

Los resultados y límites de verificación están en [validación](frontend/docs/validation.md). No equivalen a un despliegue validado en Google Cloud.

## Tecnología

| Capa                     | Implementación                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Frontend                 | React, TypeScript estricto, Vite, Tailwind, Node 22.14                                    |
| Backend                  | Python 3.13 probado, Django 5.2, DRF, JWT con renovación y revocación                     |
| Persistencia             | PostgreSQL; Compose/CI usan 16, comprobación local con 18                                 |
| Evidencias               | Archivos privados con acceso autorizado; volumen local duradero o Google Cloud Storage    |
| Mapas                    | Leaflet + OpenFreeMap, carga diferida y error visible                                     |
| Infraestructura prevista | Cloud Run + Cloud SQL + Cloud Storage, [ADR-007](docs/decisions/007-proveedor-de-nube.md) |

El conjunto de dependencias Python se fija en `backend/requirements.lock.txt`; npm usa `frontend/package-lock.json`.

## Arranque con Docker Compose

Requiere Docker Desktop/Engine activo y Git. Desde la raíz, copia `.env.example` a `.env` (en PowerShell: `Copy-Item .env.example .env`), establece credenciales propias de PostgreSQL y una clave Django segura. No sobrescribas un archivo de configuración existente.

```bash
docker compose up --build -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py bootstrap_catalogs
docker compose exec -e NF_ADMIN_PASSWORD="TU_CLAVE_INICIAL_SEGURA" backend python manage.py bootstrap_admin --username admin --email admin@tu-dominio.com
docker compose exec backend python manage.py check
```

Ingresa en http://localhost:5173 con ese usuario y cambia la contraseña inicial. Desde el portal crea clientes, tiendas con coordenadas reales, plantillas/ítems, contratos vigentes, usuarios y asignaciones. Un listado vacío es un estado válido hasta cargar estos datos. El bootstrap no carga tiendas, usuarios ficticios ni fixtures operativos, y no reemplaza credenciales existentes.

API: http://localhost:8000/api/ · Salud: http://localhost:8000/api/health/. El administrador nativo Django sirve para inspección; las altas y modificaciones se gestionan en el portal/API con validación y auditoría. `createsuperuser` por sí solo no configura el rol ni sustituye el bootstrap.

Los volúmenes `pgdata` y `evidence_data` conservan datos y archivos. No uses `docker compose down -v` sobre datos que deban conservarse. Compose es un entorno de desarrollo: no es la configuración productiva de Cloud Run.

## Arranque nativo y pruebas

Las instrucciones completas de PostgreSQL, migraciones, administración inicial, entorno aislado y navegador están en [arranque y pruebas](docs/integration/setup-and-tests.md). Incluyen PowerShell y el procedimiento CI con PostgreSQL 16.

```bash
# Con PostgreSQL y variables configuradas:
python -m venv .venv
# Activar el entorno según el sistema operativo.
python -m pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py bootstrap_catalogs
python backend/manage.py runserver 127.0.0.1:8000
# Otra terminal:
cd frontend
npm ci
npm run dev
```

`frontend/.env.development` y `.env.production` usan API real. Cambia `VITE_API_URL` si el navegador llega al backend por otra URL; actualiza también CORS y hosts Django.

## Documentación y estructura

- [README frontend](frontend/README.md), [contratos HTTP](frontend/docs/backend-contracts.md) y [ejecución y recuperación](frontend/docs/visit-execution.md).
- [Matriz de vistas](docs/integration/view-endpoint-matrix.md), [arranque/pruebas](docs/integration/setup-and-tests.md), [decisiones pendientes](docs/integration/decisions-pending.md).
- `backend/core/`: modelos, migraciones, permisos, servicios y API; `backend/test_support/`: preparación exclusiva de pruebas aisladas.
- `frontend/src/`: aplicación y adaptadores HTTP; `src/test/doubles/`: fixtures y repositorios exclusivos de tests; `frontend/e2e/`: recorridos con backend real.
- [ADRs](docs/decisions/README.md) y [CONTRIBUTING](CONTRIBUTING.md). `docs/gestion/` no está presente en esta rama; sus documentos de la referencia indicada se consultaron como orientación, sin incorporarlos.

## Equipo

| Integrante             | Rol Scrum                   |
| ---------------------- | --------------------------- |
| Edu Joaquin Villasante | Product Owner               |
| Anthony Palomino       | Scrum Master                |
| Rogelio Espinoza       | Desarrollo / UX             |
| Fabrizio Alex          | Desarrollo Frontend         |
| Bryan Cacsire          | Desarrollo Backend / DevOps |

Docente: Ecmias Eduardo Fernández Gálvez.
