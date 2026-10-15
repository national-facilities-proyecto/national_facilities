# Especialidades: administración por cliente

La sección Especialidades abre ahora la vista «Por cliente»: elegir cliente,
marcar las especialidades disponibles y guardar los cambios. «Catálogo de
especialidades» permite crear, renombrar y activar o desactivar especialidades
globales mediante un formulario pequeño. Crear una especialidad no la asigna
automáticamente. Ambas rutas anteriores (`/admin/specialties` y
`/admin/clientSpecialties`) conservan el acceso a esta sección.

Se distinguen los estados global y por cliente, se indica el número de clientes
con habilitación y se explica el alcance de la desactivación global. Las
asignaciones de especialidades globalmente inactivas se conservan. El mensaje
del supervisor de tienda señala ahora «Especialidades → Por cliente».

Se conservan las API y reglas existentes. Cada relación se guarda por separado:
ante un fallo parcial se informa del avance, se conserva el borrador pendiente
y se puede reintentar. Se reutilizan los IDs de relaciones deshabilitadas para
evitar duplicados. Antes de guardar se consultan las relaciones actuales y se
envían únicamente las especialidades modificadas por el usuario, conservando
cambios ajenos en las demás. No se añade una transacción de lote al servidor.

Verificación local, octubre de 2026:

- Suite completa de frontend: 254 pruebas aprobadas antes de agregar una cuarta
  prueba de especialidades; las cuatro pruebas específicas también aprobaron.
- Casos unitarios: borrador y salida/recarga protegidos, fallo parcial y reintento,
  reactivación sin duplicar, alcance global, creación sin habilitación automática
  y conservación de cambios ajenos.
- Playwright con Django/PostgreSQL aislados: flujo completo a 320 y 1440 px,
  persistencia tras recargar, disponibilidad en el catálogo del supervisor,
  deshabilitación, catálogo y comprobación axe sin infracciones.
- Regresión de las ocho secciones administrativas en Playwright aprobada.
- Compilación TypeScript/API y ESLint aprobados.

Las pruebas de escritura se ejecutan en `nf_integration`, puerto 55433, sin
utilizar la base local del usuario ni la aplicación desplegada.
