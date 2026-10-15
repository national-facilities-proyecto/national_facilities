# Barra lateral compartida

El supervisor de National Facilities dispone ahora del mismo botón «Cerrar menú
lateral» que los otros tres roles. El layout compartido conserva las dos columnas
al colapsar (240 px → 0 px), animando el espacio del contenido y el desplazamiento
de la barra durante 280 ms, sin ocultarla abruptamente con `display: none`.
La barra cerrada queda inerte y fuera del árbol accesible; el foco pasa al botón
de reapertura y vuelve al cierre al abrirla.

El menú móvil se presenta como panel lateral con transición de entrada, salida
y fondo. Solo este diálogo permanece montado al cerrar para permitir la salida
mediante transiciones discretas de `display` y `overlay`. Los demás modales
conservan su montaje anterior. Se mantiene el cierre con Escape, la restitución
del foco, el bloqueo del desplazamiento de fondo y el cierre al navegar.
Los sistemas con movimiento reducido omiten las animaciones y sus demoras.

Verificación local con PostgreSQL/Django aislados:

- 256 pruebas de frontend aprobadas.
- Ocho pruebas Playwright aprobadas, escritorio y móvil en los cuatro roles.
- Navegación por todas las opciones laterales, animación y expansión del contenido,
  foco, barra inerte, cierre con Escape y movimiento reducido comprobados.
- Comprobaciones axe sin infracciones en los ocho casos.
- Compilación TypeScript/API aprobada.
- ESLint y formato aprobados; regresión móvil de las páginas y detalles de los
  cuatro roles comprobada también a 320, 390 y 844 px de ancho.

No se modifican reglas operativas ni datos de la aplicación local o desplegada.
