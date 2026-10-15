# Editor de plantillas del administrador

Crear y editar plantillas pasa del modal compartido a una página dentro del portal,
conservando el menú y las validaciones del guardado existente.

- Listado: `/admin/templates`.
- Crear: `/admin/templates/new`.
- Editar: `/admin/templates/:id/edit`.
- Datos generales compactos e ítems numerados, con descripción, foto obligatoria,
  estado y botones para subir o bajar el orden.
- Agregar ítem enfoca su descripción. La barra inferior mantiene accesibles las
  acciones al desplazarse por formularios largos.
- La revisión se muestra dentro de la página y el guardado requiere confirmación.
  Los errores de API conservan el formulario y los ítems para corregir y reintentar.
- Navegar, cancelar o usar Atrás con cambios pendientes ofrece seguir editando o
  salir sin guardar. Recargar/cerrar usa el aviso nativo del navegador.
- El editor solo admite el rol administrador y explica una plantilla inexistente.

## Validación local

251 pruebas frontend aprobadas, incluyendo protección del borrador y rechazo de
API con reintento. Formato, ESLint, TypeScript y build API sin repositorios mock
aprobados.

Pruebas de navegador con API Django real y PostgreSQL exclusivo para esta
comprobación, separado de la base local de Docker del usuario:

- Crear veinte ítems, cambiar foto/estado, reordenar, revisar, guardar y editar;
  recuperar los mismos IDs y el orden desde la API a 320, 390 y 1440 px.
- Barra visible arriba, en medio y al final, sin desbordamiento horizontal.
- Protección al volver al listado y con Atrás; continuar y descartar correctamente.
- Accesibilidad automática del formulario y de la revisión, y capturas de pantalla.
- Denegación de las rutas nuevas a técnico, supervisor MASS y supervisor NF.
- Ocho secciones del administrador en móvil/escritorio y persistencia de la
  plantilla del recorrido anterior.

Capturas y resultados se guardan en `frontend/test-results`, ignorado por Git.
Este cambio no modifica endpoints, modelos ni migraciones del backend.
