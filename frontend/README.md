# National Facilities — Frontend

SPA React 18 + TypeScript estricto + Vite + Tailwind 3. Conserva Inter, el logotipo y la paleta empresarial National Facilities. Los cuatro portales comparten repositorios y una demostración persistente, sin necesitar Django para recorrer los flujos.

## Instalación

Requiere Node **22.14.0 o compatible con las engines del lockfile**, npm y un navegador moderno. El Dockerfile de desarrollo usa Node 22.14.

```bash
cd frontend
npm ci
npm run dev
```

Abrir la URL que indique Vite. `.env.development` habilita explícitamente el modo mock en desarrollo. Para sobrescribirlo, copiar `.env.example` a `.env.local` (ignorado por Git), ajustar las variables y reiniciar Vite.

| Variable           | Valores / comportamiento                                                        |
| ------------------ | ------------------------------------------------------------------------------- |
| `VITE_DATA_SOURCE` | `mock` o `api`. Obligatoria; no existe fallback implícito.                      |
| `VITE_API_URL`     | Base HTTP(S), por ejemplo `http://localhost:8000/api`. Obligatoria en modo API. |

Las variables `VITE_*` son públicas dentro del bundle. Nunca colocar secretos. `.env.local` y variables de shell tienen prioridad sobre los archivos por modo: revisar estos valores antes de construir una demo o un build API.

```bash
npm run build:demo
npm run preview
# Para preparar la integración HTTP:
npm run build:api
node scripts/check-api-build.mjs
```

`npm run build` ejecuta TypeScript y Vite con el modo de producción: requiere `VITE_DATA_SOURCE` explícito en el entorno o un archivo `.env.production.local`. Sin configuración falla con un mensaje claro. `build:demo` y `build:api` incluyen typecheck y seleccionan archivos de entorno explícitos. Un build API no incluye el repositorio ni las cuentas mock.

## Demostración

En el login se selecciona una **cuenta ficticia sin contraseña**. No hay credenciales demo embebidas. Las cuentas viven exclusivamente en `src/mocks/fixtures.ts`, excluido del build API:

| Cuenta            | Rol / uso                                                                  |
| ----------------- | -------------------------------------------------------------------------- |
| Carlos Mendoza    | Técnico; checklists y prontos asignados.                                   |
| Roberto Sánchez   | Supervisor de Los Faisanes; registrar y consultar incidencias.             |
| Cesar Orejuela    | Supervisor de cuenta; programar, reasignar, revisar GPS y ver indicadores. |
| Administración NF | Usuarios/roles, tiendas, clientes, contratos, plantillas e ítems.          |
| Ana García        | Segundo técnico para reasignación/conflicto.                               |
| María Torres      | Supervisora de Vargas Machuca para comprobar aislamiento por tienda.       |

El panel **Escenarios demo** permite provocar un error recuperable, un conflicto al tomar visita o listados vacíos; volver a Normal restaura el comportamiento habitual. Los errores no sustituyen datos de API por fixtures. Cada operación mock tiene una latencia de 300 ms (0 ms en pruebas unitarias).

**Restablecer datos demo** borra únicamente los datos/fotografías de la demostración y la sesión NF, después de una confirmación. También está disponible en el login, incluso si el almacenamiento está corrupto.

- Datos JSON: `localStorage['nf:mock:v1']`, con validación de estructura y versión.
- Sesión mock: `sessionStorage['nf:session:mock:v1']`; API: `nf:session:api:v1`.
- Fotografías: IndexedDB `nf:mock:evidence:v1`, conservando Blob, MIME, tamaño, fecha, origen e identificación de tarea cuando aplica.
- Las URL de previsualización se crean al mostrar una imagen y se revocan al sustituirla o desmontarla. No se serializan como evidencia persistente.
- Cambiar contraseña en la demo valida coincidencia/longitud y registra `passwordInitialized` por usuario. **No almacena ni cambia una contraseña real**.

## Recorridos por rol

**Técnico:** bolsa compartida → detalle → tomar visita → GPS reciente → iniciar → responder tareas y capturar fotos → guardar borrador → GPS nuevo al finalizar → completada o excepción pendiente. La bolsa excluye las visitas de otro técnico. Los prontos se clasifican por fecha local en atrasados/hoy/futuros y conservan el reporte original y su resolución.

Para demostrar GPS sin estar físicamente en Lima, elegir explícitamente un escenario de ubicación junto al botón de inicio/cierre. El valor inicial siempre es GPS real. La simulación de coordenadas está identificada como tal. La cámara usa exclusivamente `getUserMedia`, incluso en la demo; requiere permisos y HTTPS/localhost.

**Supervisor de tienda:** registrar reporte con especialidad, prioridad, descripción y adjuntos → seguimiento filtrado → detalle, asignación, historial y evidencias de resolución. Se permite seleccionar fotografías desde archivo/galería únicamente en este reporte, con máximo de 5 archivos de 5 MB y validación JPG/PNG/WebP.

**Supervisor de cuenta:** incidencias abiertas → programar técnico/fecha/prioridad → reprogramar o reasignar con motivo → consultar historial y resolución. Checklists y excepciones incluye la revisión de GPS de tickets y checklists. Aprobar conserva que hubo excepción; rechazar conserva motivo y devuelve la visita al técnico.

**Administrador:** crear/editar usuarios y asignar uno de los cuatro roles, tiendas, clientes, contratos, plantillas y sus ítems. Los formularios tienen validación y confirmación. Los ítems se desactivan, no se eliminan; las visitas existentes conservan sus tareas. No se permite desactivar la propia cuenta administradora o quitarle el rol.

## Arquitectura

```text
src/
  app/                    configuración, repositorios y navegación
  components/
    ui/                   controles, modal nativo, tarjetas y tabla/lista responsive
    feedback/             errores, carga y límites de error
  features/
    auth/                 proveedor de sesión, roles, login y contraseña
    checklists/           editor, inicio y validaciones reutilizables
    geolocation/          GPS, precisión, antigüedad y escenarios explícitos
    tickets/              reportes, programación y seguimiento compartidos
    technician/           cámara y mapa diferido
    dashboard/            indicadores derivados
    administration/       catálogos, contratos, usuarios y plantillas
  layouts/                shell compartido y navegación responsive
  mocks/                  fixtures, almacenamiento y repositorios de demostración
  services/
    repositories/         interfaces de cada caso de uso
    adapters/             adaptadores HTTP parciales
    http/                 transporte, cancelación y errores HTTP
  pages/                  composición de recorridos
  hooks/                  consultas y ciclo de vida de Object URLs
  types/                  modelos de dominio
  utils/                  fechas locales
  styles/                 componentes Tailwind
  test/                   entorno y render de integración
e2e/                      Playwright, cámara de prueba y axe
docs/                     auditoría, contratos, verificación y WPO
```

Las páginas consumen `useRepositories`; no importan fixtures ni llaman a `fetch`. Los adaptadores reciben y normalizan DTO externos. Estado de sesión en AuthProvider; borradores en el editor con guardado serializado y aviso al salir; estados de cierre mediante una unión discriminada que evita modales simultáneos.

## Scripts y pruebas

| Script                             | Propósito                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `dev`                              | Desarrollo con modo mock explícito.                                         |
| `lint`                             | ESLint con reglas conscientes de tipos y React Hooks.                       |
| `typecheck`                        | TypeScript estricto para aplicación y configuración/tests de navegador.     |
| `format` / `format:check`          | Prettier local / comprobación sin escritura.                                |
| `test`                             | Vitest y Testing Library, sin passWithNoTests.                              |
| `test:coverage`                    | Cobertura V8; genera `coverage/`.                                           |
| `test:e2e`                         | Construye demo y ejecuta Playwright contra preview del build.               |
| `test:wpo`                         | Construye demo y mide el login con Lighthouse móvil simulado.               |
| `report:bundle`                    | Construye demo y registra tamaños reales y gzip en docs/bundle-report.json. |
| `build`, `build:demo`, `build:api` | Compilación con validación explícita de entorno.                            |
| `preview`                          | Servidor local de artefactos compilados; no es servidor productivo.         |

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

En Windows se puede usar Edge instalado: `$env:PW_CHANNEL='msedge'; npm run test:e2e`. En CI se instala Chromium. Cámara y GPS de Playwright son dispositivos de prueba, no certificación de hardware físico. Los informes y capturas de navegador quedan en `playwright-report/` y `test-results/`, ignorados por Git.

Umbrales iniciales: 75 % statements/líneas, 70 % funciones y 65 % ramas. Se miden repositorios mock, almacenamiento, sesión/roles, validaciones de checklist/GPS, fechas, errores, evidencias y configuración. No se presenta ese porcentaje como cobertura de toda la UI; sus recorridos se prueban mediante Testing Library y Playwright. El workflow `../.github/workflows/frontend.yml` valida solo frontend y sus cambios.

## Accesibilidad, rendimiento y límites

Diálogos nativos con foco, Escape y fondo inerte; etiquetas explícitas; errores con `alert`, progreso con `status`, botones de al menos 44 px y tablas transformadas a tarjetas en móvil. El menú responde a cambios de ancho, cierra al navegar y restaura foco. Los estados también tienen texto. Los resultados automáticos no equivalen a una certificación integral WCAG.

Rutas cargadas con `lazy`, mapas Leaflet descargados bajo demanda, fuentes Inter Latin locales, dimensiones de imágenes y URLs temporales con limpieza. El mapa usa exclusivamente Leaflet/React Leaflet con tiles de OpenFreeMap, conforme al ADR-004; informa indisponibilidad sin usar `tile.openstreetmap.org`.

El modo API **no está conectado completamente**. Los métodos pendientes responden con error explicativo. Django debe proporcionar o acordar identidad, detalle/inicio/cierre de visitas, tickets, excepciones, archivos por respuesta y agregados. La autorización, el geofencing y la validación de archivos definitivos pertenecen al servidor. No se afirma autenticidad verificable de una foto que solo existe localmente.

Consulta [contratos backend](docs/backend-contracts.md), [registro de implementación](docs/implementation.md), [validación](docs/validation.md) y [WPO](docs/wpo.md) para el detalle y las limitaciones verificadas.
