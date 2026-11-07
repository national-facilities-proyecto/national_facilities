# Caché local limitada de archivos del visor

La propuesta de S3/CloudFront se descartó para evitar infraestructura adicional.
OpenFreeMap sigue siendo el único proveedor de teselas y Leaflet.VectorGrid sigue
renderizando el mapa con los estilos y coordenadas existentes.

**Esta implementación no guarda teselas en Cache Storage y no ofrece mapas offline.**
El usuario aprobó esta alternativa después de la revisión de viabilidad del
2026-11-07. Se guardan únicamente algunos archivos JavaScript/CSS propios del visor.
No hay cambios de backend, PostgreSQL, permisos ni reglas de negocio.

## Condiciones de OpenFreeMap y decisión

Los [términos oficiales](https://openfreemap.org/tos/), actualizados el 2026-10-14,
permiten descargar áreas para offline con límites de 3.000 tiles o 50 MB por
descarga, cuatro solicitudes simultáneas y un User-Agent que identifique la app.
No aclaran expresamente el tratamiento de una caché oportunista de teselas vistas.
Chrome descarta User-Agent personalizado en fetch, por lo que el frontend y un
Service Worker no pueden garantizar ese requisito en los navegadores objetivo.
Esto no equivale a afirmar que toda caché temporal esté prohibida; la autorización
para nuestra modalidad concreta no está confirmada.

Por esa incertidumbre se excluyen las teselas de Cache Storage. Para reconsiderarlo,
obtener primero aclaración de OpenFreeMap sobre caché web pasiva e identificación
admitida. No sustituir User-Agent por otro header y asumir que eso cumple.
No se envían mensajes al proveedor ni se añaden proxies en esta implementación.

Una comprobación HEAD de una tesela el 2026-11-07 devolvió HTTP 200, CORS `*`, MIME
MVT y Cache-Control público. Las peticiones de teselas conservan fetch normal y
la caché HTTP que administre el navegador según esos encabezados. Esto no garantiza
que una tesela siga disponible durante una caída y no autoriza por sí solo una
política de descarga offline personalizada. No hay prefetch, descarga de áreas,
polling, `force-cache`, `only-if-cached` ni una copia alternativa local de PBF.

## Qué se almacena

Durante `vite build`, `mapAssetPlugin.ts` genera `map-assets-sw.js` e incorpora una
lista exacta de archivos con hash emitidos para `AssignedLocationsMap`, `LazyMap`
y `Leaflet.VectorGrid` (JS/CSS). No usa una regla amplia para todo `/assets/`.
El identificador de versión incluye nombres de esos archivos y código del worker.

El registro usa un worker módulo del mismo origen, scope de `BASE_URL` y
`updateViaCache: none`. Solo se registra en producción, en contexto seguro y si
el navegador lo soporta. Un fallo de registro no impide iniciar la aplicación.
En desarrollo normal no se instala; la suite específica usa un build real.

El worker solo responde a GET de URLs exactas de esa lista, mismo origen, sin
query/hash, sin Authorization y sin `cache: no-store`. No intercepta teselas,
HTML/navegaciones, API, login, datos de tiendas, evidencias, fuentes ni otros
chunks compartidos. Por tanto **no es una PWA offline ni almacena la aplicación
completa**: recargar o abrir por primera vez sin red puede fallar aunque haya
algunos archivos del visor guardados.

## Política y errores

- Cache-first para archivos permitidos ya guardados y no vencidos; no se hace una
  petición adicional de actualización al acertar la caché.
- Caducidad absoluta de siete días desde almacenamiento; leer no renueva el plazo.
- Máximo 100 recursos y 10 MiB de cuerpos descomprimidos por versión. Es un límite
  de datos gestionados por la app, no una medida exacta de espacio físico: headers
  e índices del navegador añaden overhead.
- Expulsión FIFO de entradas más antiguas para cumplir ambos límites. Operaciones
  serializadas evitan exceder capacidad por solicitudes concurrentes.
- Limpieza al consultar un archivo permitido; no hay tareas periódicas. Una entrada
  vencida puede permanecer físicamente hasta la próxima consulta, pero no se sirve.
- Un miss intenta una vez la red, con timeout de cuatro segundos que cubre también
  el cuerpo. Si falla y no hay entrada vigente, falla la petición. No se devuelve
  un archivo ficticio ni se sirve contenido vencido como si fuera vigente.
- Solo se guardan respuestas 200 con MIME JavaScript/CSS, sin `no-store`/`private`.
  Se normalizan las claves sin cabeceras de petición para los archivos estáticos
  con hash, evitando variantes artificiales por Origin. Los cuerpos almacenados
  ya están decodificados: se eliminan Content-Encoding y Content-Length al reconstruirlos.
- Fallos de cuota, lectura, apertura o escritura de Cache Storage no invalidan una
  respuesta de red correcta. Las peticiones normales continúan si no hay almacenamiento.
- Al activarse se borran únicamente versiones anteriores con prefijo
  `nf-map-assets-`; no se borran cachés de otros módulos. No se fuerza `skipWaiting`:
  una actualización espera el ciclo de vida normal del navegador.

El navegador puede borrar estos datos por presión de espacio, limpieza manual,
modo privado o políticas del dispositivo. La primera visita puede no estar aún
controlada por el worker. Cambiar dominio, esquema, puerto o perfil produce un
almacenamiento diferente. No se solicita persistencia obligatoria al navegador.

## Resiliencia del mapa conservada

Se mantienen validación de coordenadas, renderizado/estilos compartidos, marcadores,
GPS, popups y controles. El transporte de VectorGrid detecta HTTP no exitoso, red y
PBF inválido; no los presenta como carga correcta. Conserva cancelación concurrente
al retirar capas y protección ante import tardío, timeout y desmontaje.

El timeout cartográfico sigue siendo 12 segundos, incluyendo nuevos ciclos de
carga después de mover/zoomear. Tras un fallo se retira la capa, se conservan
marcadores y se presenta una lista de tiendas y reintento manual desde OpenFreeMap.
No hay conmutación de proveedor ni bucles automáticos. La lista depende de los
datos autorizados ya cargados: tampoco garantiza una recarga offline de la API.

## Verificar localmente

Desde `frontend`:

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run build:api
node scripts/check-api-build.mjs
npm run test:map:e2e
```

La última orden genera un build `maptest` con un fixture de tiendas ficticias y
ejecuta Playwright contra Vite preview. Usa Service Worker, Cache Storage, Leaflet,
VectorGrid y Canvas reales. El dominio de OpenFreeMap se intercepta con respuestas
MVT controladas; no se descargan áreas ni se necesita API/BD. El modo `maptest` y
su HTML no se incluyen en el build normal de producción.

Para una revisión manual: construir y servir por HTTPS o localhost, esperar a
que DevTools Application muestre el worker activo, abrir el visor y revisar
`nf-map-assets-*`. Debe contener solo las URLs JS/CSS autorizadas, nunca PBF ni API.
Desactivar red y verificar un archivo guardado con fetch desde esa pestaña; borrar
esa entrada y comprobar fallo, volver online y comprobar recuperación. Inspeccionar
el dominio OpenFreeMap para distinguir HTTP cache de Cache Storage. No inferir que
todo un barrio, zoom o mapa se guardó por haberlo visto una vez.

Nginx entrega el script del worker con `Cache-Control: no-cache` y 404 real si falta.
Con otro servidor configurar comportamiento equivalente; no devolver index.html
para ese script. La aplicación sigue funcionando sin worker si el registro falla.
No se añade endpoint de AWS ni variables para cartografía propia.

## Fuentes

- [Términos OpenFreeMap](https://openfreemap.org/tos/) y [guía oficial](https://openfreemap.org/quick_start/).
- [User-Agent y limitación de Chrome](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header).
- [Service Workers y contexto seguro](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).
- [Cache API: caducidad y headers no son automáticos](https://developer.mozilla.org/en-US/docs/Web/API/Cache).
- [Cuotas y eliminación del almacenamiento](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Resultados reales y alcance: [VERIFICATION.md](VERIFICATION.md).
