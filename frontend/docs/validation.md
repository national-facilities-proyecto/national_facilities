# Validación de integración real

Comprobación local del 2026-10-01 al 2026-10-02, en `feature/sprint1-alex-frontend`, Windows, Python 3.13, Node 22.14, PostgreSQL 18 aislado y Edge. Sin SQLite ni respuestas ficticias para operaciones E2E principales. No se hizo push, merge ni commit.

## Resultados

| Comprobación                     | Resultado                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Django check                     | Sin incidencias                                                                                                 |
| makemigrations --check --dry-run | Sin cambios pendientes                                                                                          |
| migrate sobre nf_integration     | Migraciones aplicadas, después sin pendientes                                                                   |
| Tests backend sobre PostgreSQL   | 39 pasaron, incluidos tests con transacciones/hilos reales                                                      |
| pip check                        | Sin dependencias incompatibles                                                                                  |
| audit_integrity (base aislada)   | Sin respuestas duplicadas, visitas vigentes duplicadas, contratos superpuestos ni históricos incompletos        |
| Temporales (inspección)          | Ninguno elegible; no se ejecutó borrado físico                                                                  |
| Frontend typecheck y lint        | Pasaron                                                                                                         |
| Vitest                           | 14 archivos, 67 pruebas pasaron                                                                                 |
| Cobertura de módulos incluidos   | 94,53 % sentencias; 91,25 % ramas; 97,50 % funciones; 95,41 % líneas                                            |
| Build normal/API                 | Pasó; comprobación de ausencia de fixtures/repo mock                                                            |
| Playwright con API/base real     | 21 recorridos pasaron; recuperación, revisión, mínimo por tienda, UX de carga y formulario de cliente estable   |
| Docker de desarrollo             | Arranque/migraciones/catálogos/check informados por el usuario; se aplicaron 0012/0013 y se comprobó health 200 |

Formato, lint, typecheck, build normal y build API se comprobaron con el código final. La cobertura incluye configuración, validaciones, GPS, errores, mappers, transporte y fechas; no representa cobertura de toda la UI ni del backend.

Después de retirar el nombre comercial por la última indicación del usuario, se repitieron los 39 tests backend, los 64 tests frontend y tres recorridos de administración con API/PostgreSQL reales: formulario de cliente estable, plantilla con ítems y cliente/tienda/contrato/usuario/asignaciones/contraseñas. Todos pasaron. Los 21 recorridos completos y la cobertura de la tabla corresponden a la ejecución anterior a esa retirada; la migración 0013, los checks y el build se verificaron después del cambio.

## Los doce casos de ejecución solicitados

Cada fila se aplica a checklist y ticket.

| Caso                                       | Evidencia y resultado                                                                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inicio sin formulario/temporizador      | Backend + navegador: timestamp inicial, apertura/vencimiento nulos                                                                                                                        |
| 2. Trabajo >5 min antes de abrir           | Backend + navegador: inicio 8 min antes por helper exclusivo de base E2E; permite abrir luego                                                                                             |
| 3. Primera apertura única de cinco minutos | Restricción/servicio y apertura concurrente PostgreSQL; deadline idéntico entre sesiones                                                                                                  |
| 4. Autoguardado y fotos                    | Respuestas/observaciones o descripción + JPEG multipart; recuperación del servidor                                                                                                        |
| 5. Recarga dentro del plazo                | Navegador recupera contenido/fotos y compara vencimiento original                                                                                                                         |
| 6. Cierre y regreso dentro del plazo       | Navegador cierra pestaña y autentica de nuevo, tanto etapa A como formulario                                                                                                              |
| 7. Expiración y continuación               | Revocación real del servidor, refresh 401 y autenticación del mismo usuario sin perder editor/plazo                                                                                       |
| 8. Regreso vencido y justificación         | Helper protegido vence timestamps; navegador recarga y envía motivo sobre la misma visita                                                                                                 |
| 9. Otra sesión sin renovar                 | Segundo contexto autenticado recupera fotos y deadline original                                                                                                                           |
| 10. Reintentos sin duplicados              | Backend concurrencia/idempotencia y navegador con red interrumpida; UUID de fotos estable                                                                                                 |
| 11. Aprobación/rechazo trazables           | Backend y navegador: incompleto editable, rechazo, corrección/reenvío y aprobación en la misma ejecución con historial y vencimiento original; tiempo/GPS independientes, CAS de revisión |
| 12. Cierre válido                          | Backend + navegador: contenido, JPEG confirmado y GPS real del dispositivo de prueba; visita completed/ticket resolved                                                                    |

El registro incompleto no se aprueba. Un rechazo permite corregir y reenviar sin nueva ejecución ni plazo; todas las decisiones anteriores permanecen en eventos y el supervisor de National Facilities revisa solo su cartera.

## Otros recorridos

- Supervisor de tienda reporta; supervisor de cuenta programa y reasigna; técnico anterior pierde acceso y el nuevo atiende. Reporte original, resolución técnica y sus fotografías se mantienen separados; las fotos temporales del reporte se recuperan tras recargar.
- Administración crea cliente, tienda, contrato con tres visitas mensuales, usuario y asignaciones; exige primer cambio de contraseña y valida cambio habitual. Plantilla/ítems persisten al recargar y las visitas conservan su snapshot.
- Dos dispositivos editan la misma revisión: uno recibe conflicto; mantiene su editor, consulta servidor y concilia explícitamente.
- Cámara mediante getUserMedia y galería con fallo/reintento; archivos JPEG guardados en servidor, sin duplicar.
- Justificación/revisión, consulta de estado entre usuarios, indicadores y descarga CSV reales.
- Dos tickets finalizados cumplen el mínimo de una tienda; su checklist no suma y otra tienda sigue con dos atenciones pendientes. El indicador persiste al recargar. La API rechaza un segundo contrato activo superpuesto para el mismo cliente.
- La programación permite reasignar únicamente mientras el ticket está Pendiente. Backend y navegador bloquean el cambio después de iniciar; la carrera entre inicio y reasignación se verifica con transacciones PostgreSQL.
- Roles inválidos y recursos ajenos fallan cerrado; GPS fuera de rango/obsoleto/impreciso, ítems/evidencias ajenos y contenido inválido se rechazan.
- Generación de múltiples cuotas, reclamo/liberación automática, primera apertura, borrador, foto UUID, finalización, creación de ticket y programación concurrentes se prueban con PostgreSQL y barreras/hilos. La reserva conserva el mismo vencimiento ante reintentos, se libera una sola vez a las dos horas y nunca afecta un trabajo iniciado. Un técnico anterior no puede ejecutar tras liberación/reclamo de otro.
- También se bloquea el envío exactamente al vencer o si vence durante la validación, sin persistencia parcial. PostgreSQL impide timestamps incoherentes; historial y evidencia cerrada están protegidos; administración nativa no permite omitir servicios/validadores.
- Portales de los cuatro roles sin overflow entre 320 y 1440 px; menú/foco y axe en las páginas medidas sin violaciones detectadas. No equivale a certificación WCAG integral.
- Caída simulada únicamente del proveedor externo OpenFreeMap: listado real sigue accesible sin tiles ficticios ni otra fuente automática.

## UX de carga

La mejora de UX de carga del 2026-10-02 conserva el portal durante la descarga de cada página, adapta los placeholders a su contenido y reserva espacio para mapa/fotografías. La recuperación de sesión permanece fuera del límite de Suspense de las páginas. Dos nuevos recorridos de navegador comprueban navegación visible, dimensiones de mapa estables, ausencia de overflow, axe y `prefers-reduced-motion` en 320 y 1440 px. Se utiliza PostgreSQL aislado y backend en 8001 para convivir con el Docker de desarrollo.

El defecto de Administración recreaba el formulario cada vez que su listado entraba en carga (30 segundos/foco/eventos). El refresco ahora conserva la vista; Administración pausa esas actualizaciones mientras edita y recarga al cerrar. Cinco tests de hook cubren datos confirmados, error recuperable, permisos revocados, respuesta antigua y pausa. El E2E de cliente simula 31 segundos/foco y verifica sus tres campos intactos, guardado real de razón social y recuperación al editar tras recargar. La última indicación del usuario retiró el nombre comercial; 0013 elimina el campo y los DTO vuelven a `id,name,taxId,email`. Se conservan las pruebas de validación, edición parcial y permisos en PostgreSQL.

## Límites y bloqueos

- No hubo conexión/despliegue a Cloud Run, Cloud SQL o GCS con credenciales reales. El volumen local y acceso privado se probaron; GCS está configurado y Cloud Run exige almacenamiento duradero.
- El usuario levantó Compose y compartió el resultado de migraciones, catálogos y check. Se aplicaron 0012/0013 en ese Docker y su health respondió 200; los E2E se ejecutaron en backend/base nativos aislados, sin introducir datos de prueba en el Docker. CI PostgreSQL 16/Chromium está configurada pero no se ejecutó remotamente.
- Cámara/GPS son dispositivos de prueba del navegador; no se certificó hardware móvil real ni precisión física.
- Se aceleró el tiempo exclusivamente en casos nf_integration para no esperar >5 min reales. El servidor operativo no admite modificar reloj por API.
- Texto/fotos nunca sincronizados no sobreviven apagar/cerrar navegador: el editor avisa y retiene en memoria mientras permanece abierto. Lo confirmado sí se recupera en otra sesión/dispositivo.
- Cartera, superposición, mínimos y reasignación tienen reglas confirmadas. SLA está aplazado por el usuario; no habrá importación de operaciones previas al lanzamiento. Consulta el [registro de decisiones](../../docs/integration/decisions-pending.md). No se conceden prórrogas ni se inventan horas antiguas.
- Mediciones WPO de septiembre son históricas; no se reutilizan como rendimiento del build actual.

Reproducción desde cero: [arranque y pruebas](../../docs/integration/setup-and-tests.md). Checklist de integración: [matriz](../../docs/integration/view-endpoint-matrix.md).
