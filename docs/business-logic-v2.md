# National Facilities — Especificación funcional canónica V2

Este documento es la **única fuente de verdad funcional para V2**. Cuando exista
contradicción, sustituye las reglas funcionales anteriores de:

- [docs/integration/decisions-pending.md](integration/decisions-pending.md).
- [frontend/docs/visit-execution.md](../frontend/docs/visit-execution.md).
- [frontend/docs/backend-contracts.md](../frontend/docs/backend-contracts.md).
- La documentación histórica y los tests anteriores.

Las expectativas antiguas no pueden obligar a V2 a conservar una regla incorrecta.
Los documentos anteriores conservan su valor histórico y técnico donde no
contradigan esta especificación; no constituyen una fuente paralela de reglas V2.

**Fase:** 0, especificación documental. **Fecha:** 2026-10-04.
**Rama de referencia:** `refactor/logica-negocio-v2`, con main incorporado,
incluidos los PR #16 y #17 de despliegue.

Este documento describe el comportamiento objetivo; no afirma que ya esté
implementado. No define nuevos endpoints, columnas, códigos de estado de DB ni
parámetros operativos no confirmados. Las diez precisiones de cierre de Fase 0
están incorporadas como reglas canónicas. Solo quedan aspectos de diseño o
políticas futuras expresamente delimitados al final; no deben resolverse mediante
valores inventados o expectativas legacy.

## 1. Principios generales

- El checklist preventivo y la atención correctiva son procesos distintos.
- En la interfaz se usa **Incidencias** para reportes correctivos y **Atenciones**
  para el trabajo técnico correctivo. `Ticket` puede mantenerse exclusivamente
  como término o modelo técnico interno.
- El backend es autoridad sobre permisos, cobertura, estados, timestamps, GPS,
  validaciones, transiciones y concurrencia.
- El frontend nunca es la única barrera de una regla de negocio.
- No se fabrican timestamps, GPS, precisión, radio, snapshots ni información
  histórica inexistente.
- Una obligación publicada conserva su snapshot y sus reglas históricas
  aplicables. La configuración vigente no sustituye a la histórica.

## 2. Roles

| Rol | Alcance y responsabilidades |
| --- | --- |
| Administrador | Alcance global, sin necesidad de cobertura operativa. Gestiona usuarios, clientes, zonas, tiendas, configuración del servicio, plantillas y especialidades. |
| Técnico | Una o varias combinaciones explícitas Cliente + Zona. No se asigna tienda por tienda. Accede a trabajos nuevos dentro de su cobertura y conserva acceso suficiente para terminar los ya iniciados si cambia esa cobertura. |
| Supervisor National Facilities | Una o varias combinaciones Cliente + Zona. Gestiona la operación de su cobertura, programa/reprograma incidencias, revisa excepciones y ve la auditoría interna correspondiente. |
| Supervisor de tienda | Exactamente una tienda. Reporta y consulta sus incidencias, resolución y evidencia autorizada. No recibe auditoría operativa interna NF. |

## 3. Modelo territorial y cobertura

La jerarquía funcional es **Cliente → Zona → Tienda**. Cada tienda pertenece
exactamente a un cliente y una zona, y conserva dirección y GPS.

**Zona pertenece a Cliente** y su nombre es único dentro de ese cliente. MASS +
Lima Norte y ENTEL + Lima Norte son zonas distintas aunque compartan nombre.
`Tienda.Cliente` debe coincidir con `Zona.Cliente`. El backend impide tiendas y
coberturas con combinaciones inconsistentes.

La cobertura operativa es una combinación **Usuario + Cliente + Zona**. Cada
combinación autorizada debe ser explícita, por ejemplo:

- MASS + Lima Norte.
- MASS + Lima Sur.
- Entel + Lima Norte.

No se interpretan `clientIds=[A,B]` y `zoneIds=[1,2]` como un producto cartesiano
implícito. Tener dos clientes y dos zonas no concede automáticamente las cuatro
combinaciones.

La asignación directa a tienda se conserva exclusivamente para Supervisor de
tienda. La visibilidad de checklists nuevos del técnico corresponde a tiendas
activas de sus combinaciones autorizadas. La continuidad de una ejecución ya
iniciada se rige por la sección 13.

## 4. Checklist preventivo

Flujo conceptual normal:

**Disponible → Tomar checklist → Pendiente de iniciar → Registrar llegada →
Recorrido de inspección → Terminar recorrido → Registro de resultados →
Finalizado.**

Con excepciones, el registro completo se envía a revisión. Si se rechaza, pasa a
Corrección requerida y se reenvía en un nuevo ciclo de revisión, conservando la
misma ejecución. Las decisiones se rigen por la sección 10.

### Tomar checklist

- Reserva el checklist durante dos horas; no inicia trabajo físico ni formulario.
- Repetir o reintentar la reserva no extiende su vencimiento original.
- Si vence sin iniciar, la misma obligación vuelve a estar disponible.
- La liberación queda auditada.
- Mientras esté reservado se muestra **Pendiente de iniciar** y su expiración.

### Período

El checklist mensual no tiene día obligatorio. Debe iniciarse dentro del mes
correspondiente. La cantidad publicada y las reglas de esa obligación se
preservan según la sección 14.

### Registrar llegada

- Es una sola acción visible llamada **Registrar llegada**.
- Obtiene una lectura GPS nueva y la envía al backend para validar timestamp,
  precisión, distancia y radio.
- Registra llegada/inicio y comienza la ejecución física.
- No abre el formulario ni inicia los cinco minutos.
- No se presenta como “Iniciar checklist”.

Los fallos o lecturas inválidas siguen la sección 7. Solicitar una excepción GPS
puede permitir continuar físicamente como **ejecución bajo excepción pendiente**,
sin esperar aprobación del Supervisor NF en la tienda. La presencia no queda
aprobada y se conserva la telemetría real disponible. El registro final que
depende de esa excepción no puede finalizar hasta la decisión correspondiente.

### Recorrido de inspección

No tiene límite temporal. El técnico puede capturar fotografías durante el
recorrido. Las fotografías temporales y confirmadas tienen las garantías de
persistencia indicadas en las secciones 12 y 20.

### Terminar recorrido

- Es una sola acción visible llamada **Terminar recorrido**.
- Obtiene una lectura GPS de cierre, que el backend valida y persiste.
- Registra el fin físico y después permite abrir el formulario final.
- No se presenta como “Finalizar checklist”.
- El envío final no vuelve a solicitar GPS.

Un fallo de GPS ofrece inmediatamente reintento o solicitud de excepción según
la sección 7; no se registra una lectura válida ficticia.

### Registro de resultados

Es una etapa/pantalla separada del recorrido, no un formulario añadido debajo de
la etapa física. Los cinco minutos empiezan cuando el backend persiste
exitosamente la primera apertura, según la sección 8. Reabrir, refrescar, cerrar
el navegador, cambiar de dispositivo o reloguearse no reinicia el plazo. El
servidor es autoridad del vencimiento, incluso si se pierde la respuesta o falla
el renderizado del formulario.

El fin físico y la apertura del formulario son eventos distintos. Terminar el
recorrido no inicia por sí mismo el reloj. El técnico sigue ocupado hasta enviar
el registro completo o finalizar directamente, según la sección 6.

## 5. Incidencias y atenciones correctivas

Flujo conceptual normal:

**Incidencia reportada → Pendiente de programación → Programada → Registrar
llegada → Atención en curso → Terminar atención → Registro de resolución →
Finalizada.**

Con excepción: registro completo enviado → En revisión → Finalizada.
Con rechazo: En revisión → Corrección requerida → Reenviar → En revisión →
Finalizada, una vez aprobadas todas las excepciones necesarias.

El Supervisor de tienda reporta la incidencia. El Supervisor NF selecciona
técnico, fecha/hora y prioridad.

### Programación y cambios

- El técnico debe estar habilitado para la misma combinación Cliente + Zona de
  la tienda. No se exige una asignación técnico ↔ tienda.
- La primera programación no pide motivo.
- Si cambian técnico, fecha/hora o prioridad, se exige **Motivo del cambio**.
- Si todos esos valores son exactamente iguales, la operación es neutra: no
  exige motivo, no crea nueva visita ni genera auditoría falsa de cambio.
- Después de Registrar llegada no se puede reasignar el técnico.
- Un inicio anterior a `scheduledAt` se rechaza. Para adelantar la atención, el
  Supervisor NF debe reprogramarla primero.

**Programación de visitas no es un módulo independiente.** Programar y
reprogramar son acciones del módulo Incidencias.

### Ejecución

Registrar llegada es una sola acción de solicitud, validación y registro GPS,
con la vía de ejecución bajo excepción pendiente de la sección 7. La atención
física no tiene límite de cinco minutos. Terminar atención obtiene y persiste
una sola lectura de cierre y registra fin físico antes del formulario. Los cinco
minutos empiezan al persistir el backend la primera apertura del registro de
resolución. El envío utiliza el cierre persistido, sin pedir otra lectura.

## 6. Exclusividad de ejecución

Un técnico puede tener varias incidencias programadas y varias reservas
pendientes, pero solo **una ejecución operativa activa simultáneamente**.

La ocupación se considera activa desde Registrar llegada hasta el envío del
registro final completo o la finalización directa. Incluye el recorrido/atención
y el formulario posterior, aunque el trabajo físico ya haya terminado. Si el
intento no puede completarse, su terminación auditada como No realizado sigue la
sección 19 y libera esa ocupación sin declarar cumplimiento.

| Situación | ¿Ocupa la única ejecución activa? |
| --- | --- |
| Reserva sin iniciar o incidencia programada | No |
| Llegada registrada y trabajo físico en curso | Sí |
| Ejecución bajo excepción GPS pendiente, antes del envío completo | Sí |
| Fin físico registrado, formulario aún no enviado | Sí |
| Formulario vencido/incompleto que todavía debe completarse | Sí |
| Registro completo enviado a revisión | No |
| Espera de aprobación | No |
| Corrección requerida de un registro previamente enviado | No |
| Finalizado | No |
| Intento registrado como No realizado | No |

Una excepción recién creada o un borrador guardado no equivalen al envío final y
no liberan la ocupación. La corrección posterior no crea una nueva ejecución.

Backend, base de datos y transacciones deben proteger la exclusividad. Dos
solicitudes simultáneas de inicio sobre trabajos distintos del mismo técnico
permiten que exactamente una gane. Los botones frontend no son la garantía.

Registrar un intento como No realizado termina ese intento sin declarar el
trabajo cumplido ni la incidencia resuelta. La obligación/incidencia sigue el
flujo de la sección 19; su situación pendiente no mantiene al intento terminado
como ejecución activa. No se simula un envío normal ni una finalización válida.

## 7. GPS

### Llegada y cierre

Se conserva evidencia real de latitud, longitud, precisión, `capturedAt`,
distancia, radio y resultado de validación. Para el cierre se obtiene una lectura
al terminar recorrido/atención y se persiste antes del formulario.

El envío final utiliza el cierre guardado: no obtiene otra lectura ni reemplaza
el cierre por la ubicación del dispositivo durante el registro. Recuperar el
formulario no convierte esa evidencia persistida en una nueva captura GPS.

### Parámetros iniciales V2

| Validación normal | Límite |
| --- | --- |
| Antigüedad de la lectura | Máximo 60 segundos |
| Timestamp futuro | Máximo +5 segundos |
| Precisión | Máximo `min(radioConfigurado, 100 metros)` |
| Distancia | Dentro del radio configurado |

Estos parámetros permanecen centralizados en backend. El frontend puede
presentar ayuda y resultados, pero no mantener una autoridad de validación
independiente con valores duplicados. Una lectura fuera de estos límites no se
acepta silenciosamente como validación normal.

### Lectura stale

Si una lectura se vuelve demasiado antigua antes de enviarse para registrar la
llegada o el cierre, se solicita una lectura nueva automáticamente. No se deja
al usuario atrapado con una lectura caducada.

Esta recuperación no autoriza nuevas lecturas durante el envío del formulario:
allí se utiliza la evidencia de cierre ya persistida en su etapa correspondiente.

### Fallos y excepciones

Ante `denied`, `timeout` o `unavailable` se ofrecen inmediatamente:

- **Reintentar ubicación**.
- **Solicitar excepción GPS**.

Fuera de radio o con baja precisión nunca se acepta presencia silenciosamente.
Se permite nueva lectura y solicitud de excepción controlada, conservando la
lectura real, distancia, precisión y demás evidencia disponible para revisión.

Solicitar una excepción no significa aprobarla ni convertir una lectura fallida
en válida. Tampoco implica entrar automáticamente a En revisión o esperar a que
venzan los cinco minutos.

### GPS inválido en llegada: continuación bajo excepción pendiente

Ante `denied`, `timeout`, `unavailable`, fuera de radio o precisión insuficiente,
el técnico puede reintentar o solicitar excepción GPS. La excepción puede
permitir continuar físicamente el trabajo bajo el estado conceptual
**ejecución bajo excepción pendiente**, sin esperar en la tienda a que el
Supervisor NF apruebe para empezar.

Se guarda toda la telemetría realmente disponible: coordenadas si existen,
precisión, distancia, error/failure y timestamp. Una lectura real rechazada no se
descarta ni se sustituye por otra inventada. Si no existen datos, se indican como
no registrados.

La continuación excepcional no acredita presencia aprobada. El registro final
que depende de esa excepción no puede considerarse Finalizado hasta la decisión
del Supervisor NF y el cumplimiento de las demás condiciones de revisión. La
solicitud temprana y la continuación física no equivalen a enviar a revisión un
registro incompleto.

Una ubicación inexistente nunca se sustituye por las coordenadas de la tienda.
La captura normal de cierre o su incidencia controlada siguen conservando toda
evidencia real disponible; el envío del formulario no pide otro GPS.

## 8. Cinco minutos

Los cinco minutos pertenecen al registro final, no al trabajo físico. Empiezan
cuando el **backend persiste exitosamente la primera apertura** y tienen un
vencimiento autoritativo en el servidor.

- Si el backend persiste la apertura pero se pierde la respuesta o el frontend
  no logra renderizar, el reloj ya comenzó. Se recupera el timestamp del servidor.
- Si la petición nunca fue aceptada/persistida por backend, el reloj no comenzó.
- Ningún retry crea otra apertura ni reinicia el reloj.

Al vencer:

- No se borra contenido ni evidencia.
- Se conserva y recupera el borrador confirmado.
- Se solicita justificación de demora.
- Se permite seguir completando el mismo registro.
- No se concede prórroga ni se crea otro reloj.
- Si falta contenido, el trabajo no entra en revisión.

Primero se completa el registro y después se envía explícitamente. La
justificación sola no equivale a ese envío. Reloguearse, cambiar de dispositivo
o corregir un rechazo no modifica la primera apertura ni el vencimiento.

## 9. Resultados del checklist

| Resultado | Texto/motivo obligatorio | Fotografía |
| --- | --- | --- |
| Conforme | No se añade una obligación de observación | Solo si `photoRequired=true` |
| No conforme | Observación obligatoria | Si `photoRequired=true` |
| No aplica | Motivo obligatorio | No se exige, incluso con `photoRequired=true` |

El texto visible es **No conforme**, sin el prefijo “!”. La validación de estas
reglas pertenece al backend y se refleja en el frontend.

## 10. Excepciones y revisión

Los tipos actuales son `time_limit` (demora de registro) y `location`
(ubicación/GPS). Sus claves son técnicas; la interfaz utiliza textos humanos.

Crear una excepción no cambia automáticamente el estado a En revisión. Puede
documentarse antes del envío; se conserva su cronología individual.

### Entrada a revisión

**En revisión** significa exclusivamente:

- Registro completo.
- Enviado explícitamente.
- Al menos una excepción pendiente que necesita decisión.
- Contenido de solo lectura para el técnico.

Sin excepciones, contenido completo y validaciones normales producen
Finalizado directamente. Con excepciones, el registro completo enviado pasa a
revisión. Aprobar solo una de varias excepciones no finaliza; todas las
excepciones necesarias aprobadas producen finalización automática.

Si alguna se rechaza, el estado es **Corrección requerida**, no En revisión
editable. Un registro sin decisiones pendientes y con todas las excepciones
necesarias aprobadas debe finalizar, no permanecer en una bandeja vacía.

### Corrección requerida

Son inmutables:

- Inicio original y fin físico.
- Primera apertura y vencimiento originales.
- Auditoría anterior.

El técnico puede editar únicamente según necesidad: contenido final,
observaciones, evidencias permitidas, motivo de la excepción rechazada y datos
explícitamente reparables. Se conserva la evidencia histórica y no se reemplaza
el historial de versiones o decisiones.

### Independencia de aprobaciones

Una aprobación solo se reabre cuando cambia el dato o excepción que validaba.
No se invalidan todas las aprobaciones por cualquier modificación del registro:

- Modificar motivo/datos de excepción GPS reabre la aprobación GPS correspondiente.
- Modificar motivo de demora reabre la aprobación de demora correspondiente.
- Cambiar una descripción técnica no invalida automáticamente una aprobación GPS.

Una excepción GPS aprobada no vuelve a pendiente simplemente porque se corrigió
la descripción del trabajo. Todas las versiones y decisiones anteriores se
conservan en auditoría, incluidas las aprobaciones reabiertas.

Enviar corrección genera un nuevo ciclo de revisión de la misma ejecución, no
otra ejecución ni un nuevo plazo. Las aprobaciones no afectadas siguen vigentes;
las reabiertas necesitan nueva decisión. Si ya están aprobadas todas las
excepciones necesarias y se cumplen las validaciones, la finalización es
automática; no se crea una espera de revisión sin decisiones pendientes.

## 11. Bandeja Revisiones pendientes

Es un módulo separado para Supervisor NF, limitado a su cobertura. No mezcla
todos los checklists ni todas las incidencias: solo registros completos enviados
que esperan una decisión.

Muestra origen (**Checklist / Incidencia**), tienda, técnico, tipos de excepción,
fecha principal de entrada a revisión y acción **Revisar**.

La fecha principal es la del envío del registro completo para revisión en su
ciclo correspondiente; no la fecha programada ni la de una excepción creada
antes de completar el registro.

El detalle conserva la cronología individual de llegada, fin físico, apertura
del formulario, solicitud de excepción, envío completo y decisión.

## 12. Recuperación

Después del login, el servidor permite detectar trabajos continuables. Si existe
una ejecución activa, se presenta prominentemente **Tienes un trabajo en curso**
con tienda, tipo, inicio, etapa y acción **Continuar trabajo**.

- Formulario abierto: recuperar borrador confirmado y vencimiento original;
  mostrar tiempo restante o expirado, aunque se haya perdido la respuesta de la
  apertura ya persistida.
- Reserva no iniciada: mostrar Pendiente de iniciar y expiración de reserva.
- Corrección requerida: mostrarla claramente.
- En revisión: solo lectura; no impide empezar otro trabajo.

### Garantías de persistencia

| Persistencia | Datos |
| --- | --- |
| Servidor | Reserva, timestamps, respuestas confirmadas, archivos subidos, cierre GPS, excepciones y decisiones |
| IndexedDB del mismo navegador/origen | Fotografías temporales todavía no sincronizadas |

No se promete recuperación en otro dispositivo de bytes nunca subidos. Los
datos no confirmados por el servidor no se presentan como borrador confirmado.

## 13. Cambio de cobertura durante un trabajo

La cobertura vigente determina el acceso a trabajos nuevos. Si el técnico ya
inició un trabajo y cambia su cobertura, la garantía especial dura mientras
exista una ejecución activa/continuable iniciada por él. Conserva acceso
suficiente a:

- Visita y snapshot de tienda.
- Formulario, evidencias y borrador.
- Cierre/finalización y excepciones.
- Reintentos idempotentes.

Un cambio administrativo de cobertura no puede dejar la ejecución huérfana. La
continuidad debe contemplar recuperación y corrección del mismo trabajo, sin
conceder acceso a trabajos nuevos fuera de cobertura.

Después de **Finalizado o No realizado** vuelven a aplicarse las reglas normales
de autorización vigentes. No se concede acceso indefinido a información de un
cliente porque el técnico haya trabajado allí anteriormente.

El historial se conserva sin alterar sus datos originales. Administrador y roles
de auditoría autorizados mantienen trazabilidad conforme a su alcance, sin que
la conservación de datos conceda permisos adicionales al técnico.

## 14. Configuración del servicio

El nombre visual es **Configuración del servicio**. El modelo interno `Contrato`
puede conservar su nombre.

Configura cliente, plantilla, vigencia, cantidad de checklists mensuales, mínimo
de incidencias/atenciones correctivas mensuales y radio GPS.

### Obligaciones publicadas

Una obligación mensual ya generada conserva su snapshot, plantilla, cantidad
publicada y reglas correspondientes. Cambiar configuración aplica a períodos u
obligaciones futuras todavía no publicadas; no modifica retroactivamente las
existentes. La interfaz debe explicar ese alcance.

Cancelar una obligación publicada exige una acción explícita y auditada. No se
borra silenciosamente. Desactivar posteriormente una configuración no impide
terminar una obligación publicada/iniciada legítimamente.

### Cómputo mensual

**Checklists:** solo una obligación finalizada válidamente cuenta como cumplida.
Un intento En revisión, Corrección requerida o No realizado no cuenta. Los
intentos contra una misma obligación/cuota no aumentan la cantidad mensual ni
sustituyen una finalización válida.

**Correctivos:** el mínimo mensual se calcula por tienda y mes de finalización
aceptada, no por fecha de reporte. Una incidencia reportada en septiembre y
finalizada válidamente en octubre cuenta para octubre. En revisión y No realizada
no cuentan; Corrección requerida tampoco es una finalización aceptada.

La regla de cómputo queda congelada. Esta fase no introduce un nuevo valor
numérico mínimo fijo distinto del que se configure.

## 15. Plantillas

- La versión la controla el sistema. El administrador no escribe su número.
- Los cambios relevantes incrementan versión.
- El checklist publicado conserva snapshot y versión histórica.
- Los ítems usados no se destruyen físicamente: se desactivan preservando
  historial.
- Una plantilla con historial no se elimina destructivamente.

El objetivo V2 utiliza **Reporte general** como campo general de cierre del
checklist. No genera automáticamente otro ítem de “Observaciones generales”. Los
datos del ítem antiguo se conservan como históricos; no se borran ni se
reinterpretan como datos nuevos.

## 16. Especialidades

`CategoriaProblema` continúa como catálogo global. Se añade habilitación
**Cliente ↔ Especialidad**.

El administrador puede crear, editar, activar/desactivar especialidades y
habilitarlas/deshabilitarlas por cliente. El Supervisor de tienda solo recibe las
categorías habilitadas para el cliente de su tienda. El backend vuelve a validar
la regla aunque se manipule una petición manualmente.

Las prioridades continúan siendo globales por ahora.

## 17. Administración

- Login mediante `username + password`.
- Email de usuario opcional.
- Contacto de tienda opcional.
- Técnico y Supervisor NF: selección de combinaciones Cliente + Zona.
- Supervisor de tienda: exactamente una tienda.
- Administrador: sin cobertura operativa.

La edición normal utiliza **Guardar cambios**, sin el paso generalizado
“Revisar cambios → Confirmar y guardar”. La confirmación adicional se reserva
para desactivar, eliminar lógicamente, cambios sensibles o acciones de impacto
alto.

El primer login exige cambio de contraseña. Tras completarlo se redirige
automáticamente al home del rol. El cambio voluntario puede permanecer en el
perfil o volver normalmente; no necesita la misma redirección forzada.

## 18. Privacidad y auditoría

El Supervisor NF recibe la auditoría interna correspondiente a su cobertura.

El Supervisor de tienda solo recibe la información necesaria: incidencia
reportada, programación visible, técnico asignado, inicio relevante,
finalización, resolución y evidencias autorizadas.

No recibe por API:

- Motivos internos de demora ni códigos `time_limit`/`location`.
- Precisión o distancia GPS internas.
- Comentarios internos NF o decisiones internas detalladas.
- Eventos internos completos.
- Información de otros clientes o tiendas.

El backend produce DTO/proyecciones según rol, incluidos los datos anidados del
historial. Ocultarlos en React no cumple la regla.

Los actores se muestran con nombre humano. “Usuario #2” solo puede ser fallback
de un registro legacy sin identidad recuperable; no se inventa una identidad.

## 19. No realización y cancelación

### Antes del inicio

Antes de Registrar llegada, el **Supervisor NF** puede reprogramar o cancelar
una atención si corresponde, con motivo obligatorio y auditoría. La operación
con valores idénticos sigue siendo neutra según la sección 5; no es una
reprogramación real.

Una reserva de checklist no iniciada vuelve a disponible cuando vence; eso no
equivale a cancelar la obligación mensual.

### Después de Registrar llegada

No se elimina ni cancela destructivamente una ejecución iniciada. Si no puede
completarse, se registra un intento **No realizado** con motivo, actor, fecha y
evidencia disponible, conservando ejecución e historial.

### Incidencia / atención correctiva

- El `Ticket`/Incidencia no queda resuelto.
- Devolver la incidencia a un flujo que permita decisión/reprogramación del
  Supervisor NF.
- Una nueva ejecución conserva vínculo con la misma incidencia.

### Checklist preventivo

- El intento No realizado no satisface la obligación mensual.
- La obligación continúa pendiente.
- Debe poder existir un nuevo intento contra la misma obligación/cuota.
- Se conserva el intento fallido como historial.
- No se incrementa artificialmente la cuota mensual.

La ejecución ya iniciada conserva su técnico y su historia. La futura
reprogramación no reasigna retrospectivamente esa ejecución. Una visita no
realizada nunca deja `Ticket` y `Visita` en estados contradictorios.

La implementación concreta de obligación e intentos se diseña en Fase 1,
preservando estas reglas. El intento No realizado no se convierte en una
finalización normal ni permite inventar GPS, fin físico o envío inexistentes.

## 20. Evidencias

PostgreSQL conserva exclusivamente metadatos, relaciones, hashes y referencias,
no binarios de imagen. En producción, los archivos se almacenan en Google Cloud
Storage.

Cámara y galería comparten un pipeline de normalización cuyo objetivo es WebP,
lado mayor aproximado de 1600 px y calidad de 0.82–0.85, conservando detalle
suficiente para etiquetas y seriales.

El backend mantiene validación real de tamaño, formato, contenido, autorización
y pertenencia al trabajo. La normalización del frontend no sustituye esas
validaciones.

Los temporales pertenecen a un contexto concreto de trabajo/reporte, no solo al
usuario. El contexto puede ser `draftId`, `uploadContextId`, visita o incidencia
en creación. Dos pestañas o dos incidencias simultáneas no pueden mezclar imágenes.
Las fotografías aún no sincronizadas siguen las garantías de IndexedDB de la
sección 12.

### Retención de temporales

La retención inicial de temporales no asociados es de **al menos 24 horas**. La
primera limpieza es baja lógica. La eliminación física definitiva se define
posteriormente mediante una política de retención.

Nunca se elimina automáticamente evidencia ya asociada a un trabajo operativo.
La limpieza de temporales no puede borrar evidencia histórica de intentos,
correcciones o decisiones.

Esta fase no implementa WebP, almacenamiento real ni optimizaciones de descarga.

## 21. Históricos

Nunca se inventan precisión, timestamp, radio, vencimiento, snapshot, versión,
GPS ni configuración antigua. Un dato inexistente se representa explícitamente
como **no registrado** o equivalente, identificado como legacy cuando corresponda.
Precisión GPS histórica desconocida no equivale a cero metros. No se fabrican
valores para satisfacer DTOs ni se utiliza configuración actual como si fuera la
histórica.

No se reescriben las migraciones `0001`–`0016`. Cualquier migración nueva
continúa después de las existentes. Esta fase no crea migraciones ni transforma
datos históricos.

## 22. Consistencia y concurrencia

Se conservan las garantías útiles de idempotencia, CAS/versionado del borrador,
locks de reserva, reserva de dos horas, primer reloj del formulario, snapshots
mensuales y prohibición de reasignación tras inicio.

### Finalización y contenido

La finalización incluye la revisión esperada del contenido/borrador. Un
dispositivo con versión obsoleta no puede finalizar silenciosamente contenido
que no vio. Los cambios relevantes de evidencias participan en la versión del
contenido, además de las respuestas y textos.

### Idempotencia

La identidad de una operación distingue también el método HTTP cuando
corresponde. Los reintentos no repiten efectos ni fabrican cambios o auditoría.
La continuidad tras cambio de cobertura incluye estos reintentos del trabajo
iniciado, manteniendo autorización y ownership.

### Entidades relacionadas y administración

Las transiciones que afectan a `Ticket` y `Visita` se mantienen coherentes y
preferentemente centralizadas, incluida no realización. Se evitan overwrites
silenciosos si dos administradores editan a la vez una entidad sensible.

La exclusividad operativa incluye el formulario no enviado y la ejecución bajo
excepción pendiente, según la sección 6. Una restricción limitada al recorrido
físico validado por GPS sería insuficiente para V2. Los intentos No realizados
se conservan sin aumentar cuotas ni resolver incidencias ficticiamente.

## 23. Navegación V2

Un solo layout visual coherente: sidebar común en desktop y hamburguesa en móvil.
Se elimina la navegación inferior duplicada del técnico. Los controles de
cierre/colapso deben ser consistentes; no se conserva una X aislada como patrón
distinto entre roles.

| Rol | Navegación |
| --- | --- |
| Técnico | Checklists; Atenciones |
| Supervisor de tienda | Registrar incidencia; Mis incidencias |
| Supervisor NF | Indicadores y reportes; Incidencias; Checklists; Revisiones pendientes |
| Administrador | Usuarios y roles; Clientes; Zonas; Tiendas; Configuración del servicio; Plantillas; Especialidades |

Se elimina visualmente “Mis rutas” mientras no exista un sistema real de
optimización de rutas. Programación permanece como acción de Incidencias, no
como módulo independiente.

## 24. Autorefresh

Puede mantenerse la actualización automática, pero no provoca layout shift,
pérdida de scroll ni borrado de filtros. Durante una recarga no se sustituye el
contenido actual por una pantalla de carga. Se utiliza refresco silencioso o un
indicador fijo/no intrusivo.

La conservación visual no concede acceso a información que dejó de estar
autorizada. La continuidad del trabajo propio iniciado se determina en backend,
según la sección 13.

## 25. Estados visibles

Los nombres técnicos de DB no constituyen el contrato UX. Los estados
conceptuales son:

- Disponible.
- Pendiente de iniciar.
- Programado.
- En curso.
- Ejecución bajo excepción pendiente.
- Registro de resultados / resolución.
- Requiere completar.
- En revisión.
- Corrección requerida.
- Finalizado.
- No realizado / cancelado, cuando corresponda.

En revisión nunca significa contenido incompleto, GPS pendiente de captura
normal, formulario todavía editable o excepción recién creada sin envío
completo. Corrección requerida es distinta de En revisión. Finalizado no es una
fase de edición ordinaria.

Estos nombres no obligan a una columna o enum específicos: la representación
técnica deberá distinguir sin ambigüedad fase, revisión y ocupación operativa.
Ejecución bajo excepción pendiente no es presencia aprobada ni entrada a revisión.

## 26. Tests como regla de regresión

Los tests antiguos incompatibles se actualizan. No se modifica V2 para cumplir
una expectativa antigua incorrecta. Mocks, pruebas de componentes y E2E deben
representar la misma lógica que el backend.

Las garantías mínimas futuras incluyen:

- Cobertura Cliente + Zona y aislamiento entre clientes.
- Zona propia del cliente, nombre único por cliente y combinaciones consistentes.
- Una ejecución operativa simultánea, incluido formulario aún no enviado.
- Continuidad después de cambiar cobertura.
- GPS de cierre una sola vez y envío sin nueva captura.
- Continuación de llegada bajo excepción pendiente, sin aprobación ficticia,
  conservando telemetría y parámetros GPS centralizados.
- Reloj original no reiniciable y recorrido sin límite de cinco minutos.
- Apertura persistida con respuesta perdida/render fallido y retry sin reloj nuevo.
- No aplica con motivo y sin foto obligatoria.
- Revisión solo de registros completos enviados y readonly.
- Corrección tras rechazo y múltiples excepciones independientes.
- Reapertura solo de aprobaciones cuyo dato o excepción validado cambió.
- Versionado del contenido al finalizar, incluidas evidencias relevantes.
- Programación idéntica neutra y rechazo del inicio anterior a `scheduledAt`.
- Privacidad del Supervisor de tienda en la API.
- Recuperación de trabajos y límites de persistencia local/cross-device.
- Snapshots inmutables y coherencia `Ticket` ↔ `Visita`.
- Intentos No realizados vinculados sin cumplir ni multiplicar obligaciones.
- Cómputo correctivo por tienda y mes de finalización aceptada.
- Fin del acceso especial tras Finalizado/No realizado.
- Temporales por contexto, retención mínima de 24 horas y primera baja lógica.
- Legacy no registrado, sin ceros u otros valores ficticios para DTOs.
- Concurrencia de operaciones y edición administrativa sensible.

No se modifican ni ejecutan tests como parte de esta fase documental.

## 27. Seguridad funcional desde esta fase

La auditoría ofensiva completa queda para una fase posterior. Todo refactor V2
debe mantener desde el inicio autorización server-side, aislamiento multicliente,
ownership, protección contra IDOR/BOLA, validación de inputs y archivos,
transacciones y control de concurrencia.

No se confía en datos enviados por el frontend ni se exponen eventos internos a
roles no autorizados. La excepción de continuidad por cobertura no equivale a
acceso global ni elimina las demás validaciones.

## 28. Fuera de esta fase

La Fase 0 crea únicamente este documento. No implementa cambios de código,
migraciones, tests, Dockerfiles, `nginx.conf`, configuración de despliegue,
pentesting ofensivo completo, Cloud Run adicional, Cloud SQL, GCS real,
Flyway/Liquibase, rediseño visual, WebP, optimización SQL ni nuevas dependencias.
No autoriza commit ni push.

## Reglas anteriores explícitamente sustituidas

| Regla anterior incompatible | Regla canónica V2 |
| --- | --- |
| Técnico/Supervisor NF asignados tienda por tienda | Cobertura explícita Cliente + Zona; tienda directa solo para Supervisor de tienda |
| Revisión de un borrador incompleto o de una excepción recién creada | Solo registro completo enviado explícitamente con decisión pendiente |
| Rechazo permanece En revisión editable | Corrección requerida, con edición controlada y nuevo ciclo de revisión |
| GPS solicitado al finalizar/enviar o añadido normalmente desde En revisión | Cierre capturado y persistido al terminar el trabajo; envío sin nueva captura; revisión readonly |
| Ocupación limitada al trabajo físico | Ocupación desde llegada hasta envío completo/finalización directa, incluido formulario |
| “Iniciar checklist” / “Finalizar checklist” para acciones físicas | Registrar llegada / Terminar recorrido |
| Programación de visitas y Mis rutas como módulos de negocio | Programación dentro de Incidencias; técnico navega Atenciones |
| “Ticket” o “Pronto” como término de interfaz | Incidencias para reportes y Atenciones para trabajo correctivo |
| Motivo por cualquier guardado de una programación existente | Motivo solo por cambio real; datos idénticos son operación neutra |
| No aplica exige foto configurada y admite motivo vacío | Motivo obligatorio y foto no exigida |
| Versión de plantilla escribible, email/contacto obligatorios y confirmación generalizada | Versión automática, campos opcionales y Guardar cambios ordinario |
| Historial interno completo en DTO de Supervisor de tienda | Proyección mínima por rol, también en objetos anidados |
| Fallback histórico con datos actuales o inferidos | Desconocido/legacy explícito; no fabricación de datos |
| Esperar aprobación GPS en tienda o aceptar una lectura inválida como presencia aprobada | Continuación bajo excepción pendiente, con telemetría real y decisión NF antes de finalizar |
| Reiniciar apertura porque se perdió la respuesta o falló el render | El reloj empieza al persistir backend; recuperación/retry conserva ese timestamp |
| Reabrir todas las aprobaciones por cualquier corrección | Reabrir únicamente la aprobación del dato o excepción que cambió |
| Zona compartida entre clientes solo por tener el mismo nombre | Zona pertenece a Cliente y tiene nombre único dentro de él |
| Intento No realizado satisface o aumenta una cuota | Obligación pendiente; nuevo intento contra la misma cuota con historial conservado |
| Cómputo correctivo por fecha de reporte | Tienda y mes de finalización aceptada |
| Acceso histórico indefinido por una asignación pasada | Autorización vigente tras Finalizado/No realizado |
| Temporales agrupados solo por usuario | Contexto concreto, retención mínima de 24 horas y primera limpieza lógica |

Las garantías anteriores compatibles —por ejemplo reserva de dos horas, primer
reloj, idempotencia y snapshots— se conservan. La tabla no modifica documentos o
tests antiguos: establece su precedencia para el refactor futuro.

## Decisiones cerradas y diseño posterior

Quedan cerradas las diez precisiones: continuación bajo excepción GPS pendiente,
parámetros GPS, apertura persistida por backend, corrección/aprobaciones
independientes, no realización/cancelación, Zona por Cliente, cómputo mensual,
fin del acceso histórico especial, temporales por contexto con retención inicial
y representación honesta de datos legacy. No están pendientes de confirmación.

No se identifica una ambigüedad funcional bloqueante para comenzar el diseño de
Fase 1. Ese diseño debe concretar la representación de obligaciones e intentos,
las transiciones técnicas, el vínculo de cada aprobación con los datos que
valida, el contexto de subida y las garantías DB/transaccionales. Ninguna elección
de esquema puede sustituir las reglas ya congeladas.

Siguen fuera de la especificación detallada de esta fase:

- Política de eliminación física definitiva de archivos; mientras tanto, mínima
  retención de 24 horas para temporales no asociados, primera baja lógica y sin
  eliminación automática de evidencia operativa asociada.
- Identificación concreta de cambios administrativos sensibles y tratamiento de
  desactivación de usuario/retirada de rol, que no equivalen a cambiar cobertura.
- Detalle de presentación/filtro de “Mis incidencias”, respetando la única tienda
  autorizada y sin exposición de auditoría interna.

Estos aspectos se precisarán en el diseño o fase correspondiente. No reabren las
diez decisiones ni autorizan políticas nuevas por inferencia.

## Verificación de coherencia de la Fase 0

- **Revisión/corrección:** completo y enviado es condición de revisión; rechazo
  abre corrección diferenciada, sin nuevo inicio o plazo. Cada aprobación se
  reabre solo si cambia el dato o excepción que validaba.
- **GPS/cinco minutos:** cierre físico persistido antes del formulario; el reloj
  nace al persistir backend la primera apertura, incluso con respuesta perdida,
  y el envío no captura otra ubicación. Llegada bajo excepción pendiente no
  aprueba presencia ni permite finalizar sin decisión NF.
- **Cobertura/continuidad:** cobertura actual para trabajos nuevos, continuidad
  autorizada del trabajo iniciado y sus reintentos; después de Finalizado/No
  realizado rige autorización vigente. Zona pertenece a Cliente.
- **Ticket/Visita:** estados y decisiones relacionados coherentes, incluida
  atención no realizada; no resolución ficticia. Un nuevo intento de checklist
  no multiplica ni cumple por sí mismo la obligación/cuota.
- **Obligación/configuración:** snapshots publicados inmutables; cambios futuros
  no alteran reglas históricas y cancelaciones son explícitas/auditadas.
- **Una ejecución:** el formulario no enviado mantiene la ocupación; revisión y
  corrección posterior no la mantienen. Un intento registrado No realizado no
  queda activo aunque la incidencia/obligación siga pendiente.
- **Privacidad:** proyecciones backend por rol y nombres humanos sin exposición
  de auditoría interna al Supervisor de tienda.

La revisión de Fase 0 distingue las reglas funcionales cerradas del diseño aún no
implementado. No autoriza cambios de aplicación, migraciones, tests, despliegue,
commit ni push.
