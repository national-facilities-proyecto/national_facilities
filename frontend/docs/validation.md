# Verificación de la refactorización

Entorno local: Windows, Node 22.14.0, npm 10.9.2, Edge headless para Playwright. Fecha local: 09/09/2026 (algunos artefactos registran 10/09 en UTC).

## Resultados

| Comprobación                                                         | Resultado observado                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Instalación reproducible (`npm ci --no-audit --no-fund`)             | Código de salida 0; 524 paquetes instalados desde el lockfile.                                         |
| TypeScript estricto (`npm run typecheck`)                            | Código de salida 0.                                                                                    |
| ESLint (`npm run lint`)                                              | Código de salida 0, sin infracciones.                                                                  |
| Vitest (`npm run test:coverage`)                                     | Código de salida 0; 10 archivos, 41 pruebas aprobadas.                                                 |
| Playwright (`PW_CHANNEL=msedge npm run test:e2e`)                    | Código de salida 0; 10 pruebas aprobadas en 1,1 minutos, sin reintentos.                               |
| Build demo (incluido en E2E)                                         | Código de salida 0. Leaflet como único motor; sin advertencia de chunk grande de mapa.                 |
| Build productivo con `VITE_DATA_SOURCE=mock npm run build`           | Código de salida 0.                                                                                    |
| Build API (`npm run build:api`) y `node scripts/check-api-build.mjs` | Ambos código de salida 0; fixtures y repositorio mock excluidos.                                       |
| Build productivo sin `VITE_DATA_SOURCE`                              | Código de salida 1 **esperado**: error explícito de configuración; no cae en mock.                     |
| Lighthouse (`PW_CHANNEL=msedge npm run test:wpo`)                    | Código de salida 0; rendimiento 97, accesibilidad 100, buenas prácticas 100. Alcance: login demo.      |
| Diferencias fuera de alcance                                         | `git diff --name-only -- backend docs` sin salida. Backend y documentación general sin modificaciones. |
| Espacios y conflictos de diff                                        | `git diff --check`: código 0; avisos locales LF/CRLF, sin errores.                                     |

No se ejecutó GitHub Actions localmente: se añadió el workflow exclusivamente frontend para su próxima ejecución remota autorizada. La notación `VARIABLE=valor comando` de esta tabla expresa el entorno aplicado; en PowerShell se utilizó `$env:VARIABLE='valor'`.

`npm run format:check` terminó con código 0: todos los archivos reconocidos cumplen Prettier.

## Cobertura medida

| Métrica    | Cobertura | Elementos cubiertos / total |
| ---------- | --------- | --------------------------- |
| Statements | 91,31 %   | 452 / 495                   |
| Ramas      | 88,17 %   | 328 / 372                   |
| Funciones  | 92,07 %   | 151 / 164                   |
| Líneas     | 91,98 %   | 413 / 449                   |

Alcance explícito en `vitest.config.ts`: repositorios mock, persistencia, sesión y roles, validación del checklist, GPS, fechas, configuración, errores y evidencia. Los porcentajes **no representan toda la UI**. Umbrales: 75 % statements/líneas, 70 % funciones, 65 % ramas. El informe HTML completo se genera en `coverage/index.html` y el resumen en `coverage/coverage-summary.json`.

Se conservaron los siete archivos de pruebas originales adaptando sus expectativas a los contratos corregidos. Se agregaron pruebas de repositorios, filtros de tickets y ciclo de vida de Object URLs. Se prueban roles inválidos/expiración/logout, persistencia corrupta, aislamiento por tienda, reclamo y conflicto, inicio/cierre con tienda correcta, requisitos de tareas, rechazo/aprobación GPS, reporte/programación/reasignación/resolución, fechas locales, archivos y administración.

## Recorridos de navegador

1. Técnico toma el checklist de la segunda tienda, captura fotos con cámara simulada, completa y conserva el estado al recargar.
2. Tienda registra una incidencia; cuenta programa y reasigna; técnico resuelve con foto y GPS; tienda consulta la resolución.
3. Fallo GPS abre un solo diálogo; se envía justificación y cuenta aprueba la excepción.
4. ID inexistente muestra recurso no encontrado; acceso a otro rol muestra 403; sesión con rol nulo se rechaza.
5. A 8. Pantalla inicial de cada uno de los cuatro roles: anchos de 320, 360, 390, 480, 768, 1024, 1280 y 1440 px sin overflow horizontal; menú móvil con Escape y restauración del foco; cero infracciones axe en WCAG 2 A/AA y 2.1 AA.
6. Administrador crea plantilla con ítem y comprueba persistencia tras recargar.
7. El mapa no genera solicitudes antes del botón; al bloquear OpenFreeMap muestra reintento y mantiene la lista utilizable.

Capturas de las cuatro pantallas iniciales, móvil y escritorio: `test-results/portal-{1,2,3,4}-{mobile,desktop}.png`. Se inspeccionaron visualmente capturas del técnico, dashboard de cuenta y administración móvil. Reporte: `playwright-report/index.html`.

## Límites de la verificación

- Axe y Lighthouse son comprobaciones automáticas de las páginas indicadas; no equivalen a certificar toda la aplicación WCAG AA. Queda la revisión con lectores de pantalla y dispositivos físicos.
- Cámara y GPS en E2E son simulados por el navegador. No se verificó hardware Android/iOS ni geofencing autoritativo de servidor.
- Se verificó montaje/lifecycle del mapa en unitarias y su descarga/fallo del proveedor en navegador. No se certificó disponibilidad continua de teselas externas ni WebGL en todos los equipos.
- Los tamaños y Lighthouse corresponden al build local, no a un despliegue con CDN, compresión y latencia de producción. Ver [WPO](wpo.md).
- Las primeras iteraciones detectaron etiquetas ambiguas de selects, estilos de botones purgados y cierre de procesos en Windows. Se corrigieron antes de la suite final; la ejecución E2E final se realizó fuera del sandbox con permiso del entorno.

## Entrega y trazabilidad

El [registro de implementación](implementation.md) contiene la línea base y problemas corregidos; el [README](../README.md), la arquitectura y uso; los [contratos](backend-contracts.md), las dependencias reales de Django. El inventario exacto está en [changed-files.txt](changed-files.txt). No se realizó commit, push ni merge.
