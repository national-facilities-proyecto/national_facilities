# Refactorización frontend — registro de trabajo

Fecha de auditoría: 09/09/2026. Alcance: frontend, su documentación y workflow de validación. No se modificó `backend/`, no se hizo commit, push ni merge.

## Línea base

| Referencia                               | Valor observado                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Checkout de trabajo                      | `feature/sprint1-alex-frontend`, `28b37636cdc1b355a778b22561f02c9fa980bbfc` |
| `main` local                             | `c8758ee`                                                                   |
| `origin/main` almacenado localmente      | `101b936`                                                                   |
| `main` consultado directamente en GitHub | `766a324d45252a47589b32fecd5903914122f8a7`                                  |
| Estado inicial del árbol                 | Sin cambios previos según `git status --short`                              |
| Entorno                                  | Windows, Node 22.14.0, npm 10.9.2                                           |

Se leyeron README general, CONTRIBUTING, frontend, los ADR y los contratos Django. La consulta inicial de GitHub falló por red restringida y se repitió con el permiso del entorno. No se sustituyó el checkout por una rama remota.

Antes de editar: `npm ci --no-audit --no-fund` instaló 327 paquetes; `npm run lint` salió con 0; `npm run build` salió con 0; `npm test` salió con 0, **7 archivos / 16 pruebas**. No existían scripts de typecheck, formato ni cobertura. El build incluía una advertencia por el mapa de 1.122,70 kB minificado. Estos resultados no demostraban que los recorridos estuvieran completos.

## Problemas encontrados y tratamiento

| Hallazgo                                                            | Implementación                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Rol nulo autorizado, token sin identidad y roles dispersos          | AuthProvider, validación de sesión, tipo UserRole y guards cerrados.                                                                          |
| Mocks por defecto también en producción; contraseñas demo embebidas | Selección explícita de fuente, build sin configuración falla, cuentas ficticias sin contraseña y exclusión del repositorio mock en build API. |
| Perfiles y cambio inicial ligados al navegador                      | Datos del usuario autenticado; cambio simulado por usuario sin guardar contraseña.                                                            |
| Arreglos desconectados en técnico/tienda/cuenta                     | Base mock compartida, persistencia versionada, repositorios y eventos de actualización.                                                       |
| No existía toma real de bolsa                                       | Reclamo persistente, conflictos reproducibles y visibilidad de visitas propias.                                                               |
| ID de tienda usado como visita y fallback al primer registro        | Entidades separadas y errores de recurso inexistente.                                                                                         |
| Coordenadas constantes al cerrar y ubicación antigua reutilizada    | Tienda de cada visita, lectura nueva, precisión y antigüedad comprobadas.                                                                     |
| Fotos guardadas como URL y tamaño cero                              | Blob y metadatos en IndexedDB; URLs por componente con revocación.                                                                            |
| Dos modales al fallar GPS y salida al cerrar error                  | Unión de estados exclusiva; error mantiene el editor; navegación después de éxito o solicitud enviada.                                        |
| Observación reutilizada entre tareas                                | Formulario montado por apertura/tarea con valor inicial actual.                                                                               |
| Fechas y filtros codificados/UTC                                    | Utilidades locales, fixtures relativas al día y reloj del listado actualizado.                                                                |
| Tickets independientes entre portales                               | Reporte, asignación/reasignación, historial, atención y resolución comparten IDs y repositorios.                                              |
| Faltaban administración y dashboard                                 | Rutas de administrador, formularios confirmables, ítems desactivables e indicadores derivados.                                                |
| Tablas móviles por scroll; CSS superpuesto                          | Listas de tarjetas en teléfono, tabla contextual en escritorio y Tailwind con tokens NF.                                                      |
| Mapa con fallback contrario al ADR-004                              | OpenFreeMap, reintento y estado no disponible; sin tile.openstreetmap.org.                                                                    |
| Testing mínimo y README Vite                                        | Pruebas de contrato/flujo, Playwright, cobertura y documentación específica.                                                                  |

## Orden de implementación

1. Contratos, tipos, errores, configuración, persistencia y fixtures.
2. Sesión, roles, navegación, páginas de error y layout compartido.
3. Bolsa, inicio, editor, GPS, cámara y borradores.
4. Prontos del técnico y estados por fecha.
5. Creación/consulta de incidencias de tienda.
6. Programación, reasignación, historial y revisión de excepciones de cuenta.
7. Administración y dashboard (incluidos en esta entrega; no pospuestos).
8. Componentes accesibles, responsive y consolidación CSS/Tailwind.
9. Adaptación de las pruebas existentes y ampliación de los recorridos.
10. Verificación de navegador, WPO, CI y documentación.

Los resultados finales verificables se registran en `validation.md` y `wpo.md`. Las pruebas originales se adaptaron al nuevo contrato; no se conservó como expectativa el comportamiento incorrecto de dos diálogos simultáneos. Se mantiene `--passWithNoTests` eliminado.

## Límites deliberados

- El modo HTTP es parcial y falla claramente para operaciones no integradas; su estructura permite sustituir adaptadores. No se afirma que toda la API funcione.
- La demo es local al navegador/origen. Usa Web Locks cuando están disponibles para serializar escrituras; no es sincronización entre dispositivos ni una garantía de concurrencia de servidor.
- La captura y el GPS físicos requieren HTTPS/localhost y permisos. Playwright usa una cámara de prueba; la compatibilidad con hardware iOS/Android debe verificarse en dispositivos reales.
- Las visitas existentes conservan la copia de sus tareas. Editar una plantilla no reescribe checklists históricos ni genera automáticamente el siguiente mes; el proceso de generación corresponde al contrato operativo futuro.
- No hay envío de emails, renovación automática de JWT ni backend de cambio de contraseña. El flujo de cambio mock informa que es una simulación.
- El mapa usa servicios externos y WebGL. Su fallo no impide usar los listados.
- Los cambios locales no están publicados en GitHub. El workflow agregado queda pendiente de ejecutarse en GitHub Actions cuando el equipo autorice subir la rama.
