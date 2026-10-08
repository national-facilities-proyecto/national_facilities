# Correcciones móviles V2 posteriores a la prueba Android

Base verificada mediante `git fetch origin` y descarga explícita de la referencia V2: `57380c353140d30da1f023297fcf6ab5ebb2feda`. Trabajo local en `refactor/logica-negocio-v2`.

## Correcciones

- Duraciones: presentación en horas, minutos y segundos enteros (fracciones omitidas solo al mostrar). El backend conserva su precisión. `executionSeconds` ya representa fin físico menos inicio; se corrige la etiqueta a «Trabajo físico». No se fuerza que total sea la suma de etapas, pues puede existir un intervalo hasta abrir el registro. Nulos quedan «Sin registrar», negativos/no finitos quedan explícitamente inválidos y las duraciones superiores a un día conservan todas sus horas.
- Auditoría: nombres reales actuales asociados a los ID de técnico, autor, revisor y actor histórico. Sin nombre registrado se conserva el ID; no se inventa una identidad. Se consultan únicamente los usuarios asociados a visitas autorizadas. La proyección del supervisor de tienda continúa excluyendo el historial interno. Prefetch y consulta agrupada de nombres evitan consultas por usuario/evento/visita en los listados; la regresión comprueba cuatro consultas de preparación tanto para una visita como para dos con veintiún eventos.
- Historial: bloques con etiquetas, estado, fechas, motivo y decisión; separación entre eventos y ajuste de textos largos. Los snapshots JSON históricos se copian para mostrar nombres, sin reescribirlos.
- Cámara: modal más ancho, altura útil según viewport/orientación y `object-fit: contain` para conservar toda la imagen. Se retiran las dimensiones fijas de la previsualización. Un E2E detectó una carrera al repetir: el stream podía llegar mientras aún se mostraba la URL anterior. El vídeo reaparece inmediatamente al descartar la foto; se verifica que recibe el nuevo stream. Se mantiene el flujo de optimización, subida y persistencia.
- No realizado: bloque de acción excepcional con orientación breve y confirmación diferenciada. Mismos permisos, motivo mínimo y conservación de intento/evidencias.
- Envío: «Trabajo finalizado» depende de `status: completed` devuelto por la API. `pending_approval` muestra «En revisión» y explica que aún falta la decisión. Otros estados reciben un mensaje informativo con el estado real. No cambian las transiciones del backend.

## Archivos

Backend:

- `backend/core/serializers.py`
- `backend/core/views.py`
- `backend/core/test_mobile_presentation.py`

Frontend, presentación y componentes:

- `frontend/src/features/checklists/AuditDetails.tsx`
- `frontend/src/features/checklists/VisitTiming.tsx`
- `frontend/src/features/checklists/ExceptionSummary.tsx`
- `frontend/src/features/checklists/VisitRecord.tsx`
- `frontend/src/features/checklists/ExceptionHistory.tsx`
- `frontend/src/features/checklists/ClaimHistory.tsx`
- `frontend/src/features/checklists/NotPerformedAction.tsx`
- `frontend/src/features/checklists/VisitEditor.tsx`
- `frontend/src/features/checklists/useVisitEditor.ts`
- `frontend/src/features/checklists/submissionMessage.ts`
- `frontend/src/features/technician/CameraModal.tsx`
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/pages/TechnicalSupervisorChecklistDetailPage.tsx`
- `frontend/src/styles/components.css`
- `frontend/src/types/models.ts`
- `frontend/src/services/adapters/mappers.ts`
- `frontend/src/utils/auditPerson.ts`
- `frontend/src/utils/durations.ts`

Regresiones frontend/E2E:

- `frontend/src/features/checklists/VisitRecord.test.tsx`
- `frontend/src/features/checklists/useVisitEditor.evidence.test.tsx`
- `frontend/src/features/checklists/NotPerformedAction.test.tsx`
- `frontend/src/features/technician/CameraModal.test.tsx`
- `frontend/src/services/adapters/mappers.test.ts`
- `frontend/e2e/mobile-presentation.spec.ts`
- `frontend/e2e/real-api.spec.ts`
- `frontend/e2e/flows.spec.ts`

Este informe: `docs/integration/mobile-v2-verification.md`.

## Verificación local

PostgreSQL 16 independiente, puerto local 55434, base `nf_integration`, configuración `config.test_settings` y usuarios/datos ficticios. No se reinicializaron bases anteriores. El intento sintético interrumpido por el E2E de cámara se conservó como «No realizado» antes de repetir la prueba. Django utiliza su base temporal de tests para sus fixtures.

Resultados confirmados:

- Black y Flake8 sobre los tres archivos Python modificados; compatibilidad de estilo existente: `E203,E501,W503` excluidos en Flake8.
- Flake8 sobre backend completo para errores severos (`E9,F63,F7,F82`): aprobado.
- `manage.py check`: sin incidencias.
- `makemigrations --check --dry-run`: sin cambios; ninguna migración modificada.
- `manage.py test core`: 159 pruebas aprobadas.
- Prettier, ESLint y `tsc -b`: aprobados sobre frontend completo.
- Vitest: 178 pruebas aprobadas; cobertura sobre el alcance configurado: líneas 93,33 %, ramas 92,10 %.
- Compilaciones Vite normal y API: aprobadas; comprobación de build API aprobada.
- E2E específico de cámara: aprobado tras corregir la carrera, con vídeo sintético vertical/horizontal, repetición, proporción de previsualización, subida real, liberación de tracks y estado definitivo confirmado por API.
- Suite E2E completa final: 29 de 29 pruebas aprobadas (3,9 minutos), incluida revisión en solo lectura contrastada con `pending_approval` de la API y finalización normal contrastada con `completed`. No quedan pruebas fallidas en la ejecución final.

Fallos detectados y resueltos durante el trabajo: import sobrante de TypeScript, regla de Fast Refresh de ESLint, preparación de fixtures de las nuevas pruebas, bloqueo de captura al repetir cámara y una expectativa E2E que pedía un modal cuando el flujo existente presenta la pantalla «En revisión» en solo lectura. Se mantiene esa pantalla y se comprueba su estado contra la API. Una repetición detectó además una expectativa de guardado inmediato durante la recuperación de sesión: ahora el E2E espera la respuesta de recuperación y, si el servidor requiere conciliación, comprueba el contenido antes de aceptar su versión. Los intentos ficticios fallidos de ese grupo se conservan como No realizado para evitar fallos en cascada. Las reglas de concurrencia no se modificaron.

## Revisión manual Android pendiente

En un teléfono Android físico y un entorno de revisión autorizado:

1. Abrir la cámara tras permitir su uso; comprobar imagen completa y botones accesibles en vertical y horizontal, incluyendo rotación con la cámara abierta y barras del navegador.
2. Capturar, repetir varias veces y confirmar; comprobar que la foto coincide con lo visto, aparece en el ítem y la cámara se libera al cerrar/confirmar. Comprobar también permisos denegados y reintento tras concederlos.
3. Revisar un registro histórico largo: nombres reales disponibles, ID conservados, motivos y decisiones legibles, duraciones sin decimales y valores ausentes/anómalos explícitos.
4. Verificar que la finalización normal muestra «Trabajo finalizado» y una visita diferente enviada a revisión muestra «En revisión». No comparar estados de intervenciones distintas ni modificar registros para hacerlos coincidir.
5. Comprobar que «Marcar como no realizado» se identifica como excepcional, exige motivo y permite cancelar.

Las capturas E2E usan cámara sintética y viewports 390×844 y 844×390; no certifican la cámara física ni los permisos del navegador Android. No hubo despliegue, uso de credenciales productivas ni fusión de ramas.
