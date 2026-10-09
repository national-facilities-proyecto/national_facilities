# Correcciones y verificación del traspaso a Fabrizio

Fecha: 2026-10-09. Rama: `fix/fabrizio-entrega`, basada en el merge `463c72c` de `main`.

## Alcance y resultados

| Observación | Cambio o comprobación |
| --- | --- |
| Reutilizar contraseña inicial | La API rechaza una nueva contraseña igual a la vigente, sin inicializar la cuenta ni revocar la sesión. El error aparece junto al campo. Aplica a los cuatro roles. |
| Espacios en usuario de acceso | Formulario y API los rechazan explícitamente, incluidos los de inicio/fin. Se conservan caracteres permitidos, unicidad y validaciones restantes. |
| Segundo supervisor MASS en tienda ocupada | Se conserva una tienda por supervisor y se exige un supervisor MASS activo por tienda. Se validan creación, edición, cambio de rol y reactivación con bloqueo transaccional. Una cuenta inactiva no ocupa la tienda. |
| Duplicados históricos | `audit_integrity` añade `multipleActiveStoreSupervisors`, con IDs de tienda y usuarios. Es de solo lectura: no desactiva cuentas ni cambia asignaciones. |
| Ubicación confundida con tiendas | La ubicación usa un punto azul con halo y etiqueta permanente; las tiendas conservan su icono de local. El encuadre incluye ambas ubicaciones, incluso si el técnico está lejos. |
| Menú hamburguesa | Se reprodujo con fotografías en Revisiones pendientes y en el detalle de una visita. Las columnas implícitas de las listas e historiales tomaban el ancho mínimo de la galería y ensanchaban la página móvil; el diálogo quedaba desplazado y recortado. Se acotan esas columnas y sus elementos al ancho disponible. Regresiones de los cuatro roles cubren 27 rutas del portal, detalles con datos reales de prueba, perfil, apertura/cierre, navegación, foco y ausencia de desbordamiento. |
| Administrador | Inspección visual de sus ocho secciones y formularios en escritorio; pruebas de formularios en móvil, filtros de usuarios y CRUD existente. El error de tienda asignada ahora se vincula al selector. |
| Formato en Windows | Prettier conserva el tipo de salto de línea del archivo (`endOfLine: auto`), evitando fallos por CRLF en una copia de Git para Windows. No se reformateó todo el proyecto. |

Los cambios no requieren una migración de base de datos. Se mantienen roles,
cobertura, GPS operativo, historial, snapshots, evidencias privadas y flujos de
checklists/tickets de la versión actual.

## Entorno y evidencia

Node 22.14, Python 3.13, PostgreSQL 18 local en loopback:55432. Docker estaba
apagado; se siguió la alternativa nativa documentada. Base exclusiva
`nf_integration`; tests Django usan `test_nf_integration`. No se consultó ni
modificó Cloud SQL de producción.

Backend de pruebas: `http://127.0.0.1:8000/api/`. Preview de API:
`http://127.0.0.1:5174`. Los usuarios de la semilla pertenecen exclusivamente a
ese entorno, no a la aplicación publicada.

Resultados de regresión: 184 tests Django y 249 tests frontend
aprobados; cobertura del conjunto configurado: 92.35% sentencias y 92.83% líneas.
Comprobaciones Django y ausencia de nuevas migraciones aprobadas. Formato,
ESLint, TypeScript, build normal, build API y comprobación de ausencia de mocks
aprobados. Suite completa de Playwright: 49 tests aprobados en 4.9 minutos,
incluidas las regresiones táctiles y de todos los roles. La ejecución de GitHub
Actions se comprueba en el Pull Request antes de integrar los cambios.

Los nuevos casos están en `backend/core/test_delivery_fixes.py` y
`frontend/e2e/delivery-fixes.spec.ts`. Las comprobaciones completas del navegador
usan la API real y PostgreSQL aislado; cámara/GPS y proveedor de mapa se simulan
únicamente en pruebas. Capturas e informes se generan en
`frontend/test-results/` y `frontend/playwright-report/` (ignorados por Git).

## Diferencia encontrada en el traspaso

El traspaso menciona cinco minutos para documentar resultados. El código de
`main`, sus contratos HTTP y sus tests ya describen un formulario sin ese plazo.
Esta entrega conserva el comportamiento existente; se solicitó aclaración a
Fabrizio sobre la decisión del equipo. No se reintroduce un temporizador dentro
de estas correcciones.

## Prueba en Android físico

Pendiente de realizar con Fabrizio en un celular real:

1. Entrar con cada rol y abrir/cerrar el menú en listas, detalles y formularios,
   con orientación vertical y horizontal.
2. Cambiar la contraseña inicial: comprobar rechazo de la misma y aceptación de
   una diferente.
3. En técnico, permitir GPS y pulsar «Mi ubicación»: comprobar el punto azul, la
   etiqueta, las tiendas y las indicaciones de Google Maps.
4. Probar cámara, galería, teclado virtual, desplazamiento y dimensiones de
   modales.
5. Interrumpir la conexión/cerrar el navegador durante una atención de prueba y
   comprobar la recuperación del trabajo y de las evidencias confirmadas.

La emulación y los tests del navegador no sustituyen esta prueba física.

## Recorrido de presentación

Preparar cliente, zona, tienda con coordenadas correctas, especialidad habilitada,
plantilla, contrato y usuarios en un entorno autorizado para demostración.

1. Administrador: mostrar los datos maestros, filtros y mensajes de validación.
2. Supervisor MASS: reportar una incidencia con descripción y evidencia.
3. Supervisor National: consultar el reporte y programar técnico/fecha.
4. Técnico: consultar mapa, registrar llegada y documentar una atención con foto;
   mostrar también un checklist y la recuperación de trabajo.
5. Supervisor National: revisar una excepción preparada y mostrar el resultado
   final y seguimiento.

Ensayar antes de la presentación y conservar un caso adicional listo para
mostrar. No crear datos ficticios en producción. Para publicar cambios, coordinar
frontend y backend con el responsable autorizado de Google Cloud. La revisión de
accesos y retirada del permiso pendiente de Rogelio sigue a cargo del propietario
autorizado; esta entrega no modifica IAM ni secretos.
