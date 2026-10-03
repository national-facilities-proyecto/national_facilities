# National Facilities — Frontend

SPA React + TypeScript + Vite + Tailwind. Conserva los portales y diseño existentes y consume exclusivamente la API Django/DRF. No hay selector demo, escenarios, cuentas ficticias, fixtures de respaldo ni almacenamiento local de operación.

## Desarrollo

Node 22.14 y npm, backend PostgreSQL inicializado y navegador moderno:

```bash
npm ci
npm run dev
```

Los archivos de entorno de desarrollo, producción y modo API usan `VITE_DATA_SOURCE=api` y `VITE_API_URL=http://localhost:8000/api`. Solo se acepta fuente API. Para otro servidor, configura `.env.local` y reinicia Vite. El modo API para E2E usa http://127.0.0.1:8000/api. Las variables Vite son públicas y no deben contener secretos. CORS Django debe permitir el origen real del frontend.

El [README principal](../README.md) explica la creación explícita del administrador y los catálogos. Los usuarios iniciales deben cambiar su contraseña antes de acceder a la operación.

## Recorridos conectados

- Técnico: bolsa mensual → detalle/tareas → reserva de dos horas para traslado → inicio con GPS → ejecución sin temporizador de formulario → registrar resultados → autoguardado, cámara o galería → envío con GPS. Mis rutas incluye tickets programados, recuperación y completados.
- Supervisor de tienda: reporte con tienda autorizada, catálogos reales, descripción y fotos → lista/filtros → detalle, programación, historial y resolución.
- Supervisor de cuenta: programación/reprogramación/reasignación con revisión de versión → seguimiento/finalizados → revisión independiente de excepciones de tiempo/GPS → indicadores, filtros por período/cliente y CSV.
- Administrador: usuarios y credenciales iniciales, roles normalizados y tiendas visibles, clientes, tiendas, contratos, plantillas e ítems.

El servidor aplica las reglas confirmadas: contratos simultáneos prohibidos, mínimo de dos atenciones de tickets por tienda/mes y reasignación solo en Pendiente. El SLA queda pendiente de definición por instrucción del usuario. No se reinicia automáticamente ningún plazo. Consulta la [matriz de vistas](../docs/integration/view-endpoint-matrix.md) y el [registro de decisiones](../docs/integration/decisions-pending.md).

## Ejecución, borradores y sesión

Iniciar registra el trabajo; abrir el formulario después registra su primera apertura y vencimiento original a cinco minutos. Ambas etapas se aplican a tickets y checklists. Un formulario abierto se recupera desde el servidor con su revisión, respuestas, fotos y plazo; el reloj del navegador solo lo muestra.

El editor distingue cambios pendientes, guardando y confirmado. Guarda de forma serializada con revisión CAS; ante conflicto conserva el editor, consulta la versión del servidor y requiere una elección explícita. Fotos fallidas mantienen su File/UUID para reintentar mientras la página permanezca abierta. Una foto confirmada se recupera aunque su posterior asociación desde el editor haya fallado.

La sesión JWT se renueva con un solo refresh concurrente. Si expira durante el editor, la reautenticación del mismo usuario conserva su contenido y consulta el estado real, sin renovar el formulario. Logout revoca sesiones del usuario en todos los dispositivos. Las operaciones inciertas reutilizan su clave de idempotencia tras timeout/recarga. `sessionStorage` contiene únicamente sesión y UUID de operaciones indexados por huella; no respuestas, tickets ni archivos.

Para galerías se conserva fecha de captura nula cuando se desconoce. Los archivos se suben multipart y se consultan como Blob autenticado. El navegador no afirma que una foto de galería se tomó en una fecha concreta.

## Arquitectura

`src/services/http/client.ts` concentra HTTP, JWT, refresh, errores por campo y Blob. `services/adapters/mappers.ts` valida DTO desconocidos: IDs, roles, estados, fechas, nulos, catálogos y coordenadas. `httpRepositories.ts` implementa todos los repositorios operativos y traduce los payloads explícitamente.

Las páginas consumen `useRepositories`. Consultas con carga, vacío, error y reintento; listados se refrescan ante foco, conexión y cambios confirmados. Editores no sobrescriben contenido con polling. Autorización, GPS, contenido y transiciones finales se validan en Django.

El refresco del mismo recurso ocurre en segundo plano sin desmontar la vista. Un fallo de red muestra un aviso y conserva únicamente los datos ya confirmados; un cambio de filtro/recurso o una revocación de permisos no reutiliza esos datos. Administración pausa el refresco automático mientras el formulario está abierto y actualiza el listado al cerrarlo. El formulario de clientes usa razón social, RUC/identificación y correo de contacto.

Las tiendas aceptan coordenadas decimales copiadas de un mapa, incluso con más de seis decimales. Se puede pegar el par `latitud, longitud` en cualquiera de sus campos o introducir los valores por separado con punto o coma decimal. El formulario valida los rangos antes de redondear, muestra los valores que guardará en la confirmación y envía seis decimales compatibles con el contrato HTTP.

La carga de páginas conserva cabecera, navegación y recuperación de sesión. `PageLoadingState` muestra placeholders de listas, tablas, detalles, formularios o indicadores según la ruta; el inicio de sesión usa el logo del portal. Mapa y fotografías reservan su espacio mientras cargan. Los placeholders son decorativos, los mensajes usan `role=status` y las animaciones respetan `prefers-reduced-motion`; no muestran porcentajes ni datos operativos inventados.

`src/test/doubles/` conserva los dobles útiles para Vitest. La entrada de la aplicación no importa ese directorio. IndexedDB/localStorage del doble no se utilizan en el runtime.

El mapa diferido usa OpenFreeMap conforme al ADR-004. Su indisponibilidad muestra un aviso y mantiene el listado real, sin cambiar a otra fuente de tiles ni inventar coordenadas.

## Scripts

| Script                       | Uso                                                                    |
| ---------------------------- | ---------------------------------------------------------------------- |
| `dev`                        | Desarrollo con API real                                                |
| `format` / `format:check`    | Prettier                                                               |
| `lint` / `typecheck`         | ESLint y TypeScript estricto                                           |
| `test` / `test:coverage`     | Vitest, DTO, transporte, errores y componentes                         |
| `build` / `build:api`        | Compilación operativa, ambas con API                                   |
| `preview`                    | Servir el build local; no servidor productivo                          |
| `test:e2e`                   | Build API y Playwright con backend/base aislada previamente preparados |
| `test:wpo` / `report:bundle` | Medición opcional del build API                                        |

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run build:api
node scripts/check-api-build.mjs
```

Para E2E sigue [arranque y pruebas](../docs/integration/setup-and-tests.md): usa únicamente `nf_integration`, fixtures aislados del lado servidor y Django real. Los tests no interceptan operaciones principales con respuestas ficticias. Playwright usa Edge local por defecto, Chromium en CI; `PW_CHANNEL` puede elegir un navegador instalado. GPS y cámara son dispositivos de prueba del navegador, no certificación de hardware físico.

En Windows se comprobó preview en otra terminal y `PW_EXTERNAL_SERVER=1` para evitar el bloqueo al terminar el proceso administrado por Playwright.

El workflow valida Django, migraciones, PostgreSQL 16, frontend y E2E. No se ejecutó remotamente durante esta integración: no se hizo push.

Consulta [contratos](docs/backend-contracts.md), [ejecución](docs/visit-execution.md) y [validación](docs/validation.md). Los informes previos de implementación/WPO conservan su carácter histórico.
