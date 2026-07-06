# Requirements — Ordenador automático de colecciones (Shopify) — versión simple

> Mismo problema de negocio que `ms-autosort-by-stock`. La única diferencia con ese proyecto es
> **dónde y cómo se despliega** (Vercel + GitHub en vez de Docker + Kubernetes + Argo CD). Los
> requisitos funcionales (R1–R8) son los mismos; acá solo se anotan los puntos donde el runtime
> serverless cambia el criterio de aceptación.

## Contexto

App para varias tiendas Shopify del grupo (ej. `jack-jones-dev.myshopify.com` y otras que se
vayan sumando). Reordena los productos dentro de una colección combinando dos criterios: primero
agrupa por `productType` (en un orden que define el usuario) y dentro de cada grupo ordena por
stock (`totalInventory`) descendente. Los productos con stock por debajo de un umbral configurable
se mandan al fondo de la colección, ignorando su grupo.

Es **multi-tienda**: un solo deploy y un solo login manejan N tiendas, cada una con su propio
dominio, token y configuración de colecciones (ver R9).

Tiene dos modos de uso:
- **Manual**: una interfaz web donde el usuario elige la tienda, configura y ejecuta el reordenamiento.
- **Automático**: una ejecución programada una vez al día que reaplica, para cada tienda, la
  configuración guardada de sus colecciones habilitadas.

## Glosario

- **Colección objetivo**: la colección de Shopify a reordenar, identificada por su Collection ID.
- **productType**: el valor del campo `productType` de cada producto en Shopify. Se lee, nunca se edita.
- **totalInventory**: stock total del producto sumando todas sus variantes. Se lee, nunca se edita.
- **Umbral (threshold)**: número de stock. Los productos con `totalInventory <= umbral` van al fondo.
- **Orden de grupos**: la secuencia de `productType` que define el usuario por drag-and-drop.

## Restricciones conocidas de la API de Shopify

- La colección DEBE estar en `sortOrder: MANUAL`. Si no, no se puede reordenar por API.
- La mutation `collectionReorderProducts` acepta hasta **250 moves por request**.
- Es **asíncrona**: devuelve un `job.id` que hay que pollear hasta que termine.
- `newPosition` es índice base-cero, en formato string, evaluado secuencialmente.
- Requiere el scope `write_products` (ya configurado en la app).

---

## Requisitos

### R1 — Configurar la colección objetivo

**Historia:** Como usuario, quiero ingresar un Collection ID y cargar sus productos, para saber sobre qué colección voy a trabajar.

Criterios de aceptación:
1. CUANDO el usuario ingresa un Collection ID válido y presiona "Cargar", EL SISTEMA DEBE consultar la colección y traer todos sus productos (id, title, totalInventory, productType), paginando si hay más de 250.
2. CUANDO la colección no existe o el ID tiene formato inválido, EL SISTEMA DEBE mostrar un mensaje de error claro y no continuar.
3. CUANDO la colección tiene `sortOrder` distinto de `MANUAL`, EL SISTEMA DEBE mostrar un aviso indicando que hay que cambiar el orden de la colección a "Manual" en el admin de Shopify antes de poder reordenar.
4. EL INPUT del Collection ID en el frontend DEBE ser `type="number"` — el usuario tipea solo el ID numérico, nunca el GID completo. El backend arma internamente el GID (`gid://shopify/Collection/{id}`).

### R2 — Detectar y ordenar los productType

**Historia:** Como usuario, quiero ver todos los productType presentes en la colección y ordenarlos por drag-and-drop, para controlar qué categoría aparece primero.

Criterios de aceptación:
1. CUANDO se cargan los productos, EL SISTEMA DEBE mostrar la lista de `productType` únicos encontrados, sin repetir.
2. EL SISTEMA DEBE permitir reordenar esa lista mediante drag-and-drop.
3. CUANDO un producto no tiene `productType` (vacío o null), EL SISTEMA DEBE agruparlo bajo una categoría "(sin categoría)" y mostrarla como un grupo más, ordenable.
4. EL SISTEMA DEBE conservar el orden definido por el usuario para usarlo en el reordenamiento y para guardarlo.

### R3 — Definir el umbral de stock

Criterios de aceptación:
1. EL SISTEMA DEBE ofrecer un input numérico para el umbral.
2. CUANDO el umbral es `N`, EL SISTEMA DEBE mandar al fondo de la colección todos los productos con `totalInventory <= N`, ignorando su `productType`.
3. CUANDO el umbral está vacío o es 0, EL SISTEMA DEBE no forzar ningún producto al fondo por stock.
4. EL SISTEMA DEBE validar que el umbral sea un entero mayor o igual a 0.

### R4 — Previsualizar el orden resultante

Criterios de aceptación:
1. CUANDO el usuario tiene los productos cargados, un orden de grupos y un umbral, EL SISTEMA DEBE mostrar una vista previa de la lista final de productos en el orden en que van a quedar.
2. EL SISTEMA DEBE indicar visualmente qué productos cayeron al "fondo" por el umbral.
3. EL SISTEMA DEBE recalcular la vista previa cada vez que cambia el orden de grupos o el umbral, sin llamar de nuevo a Shopify.

### R5 — Ejecutar el reordenamiento (manual)

Criterios de aceptación:
1. CUANDO el usuario presiona "Ordenar colección", EL SISTEMA DEBE calcular el orden final y enviar la mutation `collectionReorderProducts`, dividiendo en lotes de máximo 250 moves si hace falta.
2. CUANDO la mutation devuelve un `job.id`, EL SISTEMA DEBE pollear el job hasta que termine antes de dar por exitosa la operación (y antes de enviar el siguiente lote, si hay varios).
3. CUANDO la mutation devuelve `userErrors`, EL SISTEMA DEBE mostrar el error y no reportar éxito.
4. CUANDO el reordenamiento termina OK, EL SISTEMA DEBE mostrar una confirmación con la cantidad de productos reordenados.
5. EL SISTEMA DEBE evitar ejecuciones concurrentes sobre la misma colección (serializar).
   > **Diferencia vs. la versión Argo/K8s**: ahí el lock podía vivir en memoria del proceso porque
   > el backend es un único proceso Node siempre corriendo. Acá el backend son funciones
   > serverless de Vercel que no comparten memoria entre invocaciones (y pueden correr en paralelo
   > en instancias distintas), así que el lock se implementa como una fila en una tabla de Supabase
   > (`collection_locks`), con clave compuesta `(store_id, collection_gid)` para no bloquear una
   > tienda por un reorder en curso en otra. Ver design.md sección 8.

### R6 — Guardar la configuración

Criterios de aceptación:
1. CUANDO el usuario ejecuta o guarda, EL SISTEMA DEBE persistir: Collection ID, orden de `productType`, umbral, y un flag de habilitado/deshabilitado para el cron.
2. EL SISTEMA DEBE permitir guardar configuraciones para más de una colección.
3. CUANDO el usuario vuelve a cargar una colección ya configurada, EL SISTEMA DEBE precargar su orden de grupos y umbral guardados.

### R7 — Ejecución automática diaria

Criterios de aceptación:
1. EL SISTEMA DEBE exponer un endpoint que, al ser invocado, reordene todas las colecciones configuradas y habilitadas, usando datos de stock frescos.
2. EL SISTEMA DEBE proteger ese endpoint con un secreto, para que no lo pueda disparar cualquiera.
   > **Diferencia vs. la versión Argo/K8s**: ahí el disparador es un `CronJob` de Kubernetes que
   > pega un `X-Cron-Secret` propio. Acá el disparador es un **Vercel Cron Job** (declarado en
   > `vercel.json`), que Vercel invoca automáticamente agregando `Authorization: Bearer
   > $CRON_SECRET` si existe una env var `CRON_SECRET` en el proyecto. El endpoint acepta ambos
   * esquemas (Bearer y `X-Cron-Secret`) para poder probarlo también a mano con `curl`.
3. CUANDO en la corrida diaria aparece un `productType` nuevo que no estaba en el orden guardado, EL SISTEMA DEBE ubicar sus productos al fondo absoluto de la colección (debajo incluso del fondo por stock bajo), registrar un aviso en el log, y marcar la categoría como "Nueva" en la automatización (ver R10.4) — no debe fallar la corrida.
4. CUANDO una colección configurada dejó de estar en `MANUAL`, EL SISTEMA DEBE saltearla, registrar el error en el log y continuar con las demás.
5. EL SISTEMA DEBE registrar en un log el resultado de cada colección procesada (éxito, cantidad, o error).

### R8 — Seguridad y credenciales

Criterios de aceptación:
1. EL SISTEMA DEBE leer el token de cada tienda de Shopify y su dominio desde almacenamiento protegido (tabla `stores` en Supabase, accedida solo con la service role key), nunca hardcodeados en el código ni en un `.env` commiteado.
2. EL SISTEMA NO DEBE exponer ningún `admin_token` al frontend, ni siquiera al listar tiendas; todas las llamadas a Shopify pasan por las funciones serverless.
3. EL SISTEMA DEBE proteger el panel de configuración (incluyendo el alta de tiendas) con al menos una autenticación básica (usuario/clave o secreto compartido).

### R9 — Multi-tienda

**Historia:** Como usuario, quiero poder sumar tiendas de Shopify nuevas sin redeployar ni tocar variables de entorno, para operar sobre varias tiendas del grupo desde un solo panel.

Criterios de aceptación:
1. EL SISTEMA DEBE permitir dar de alta una tienda nueva (identificador corto, nombre para mostrar, dominio `.myshopify.com`, Admin API access token) desde el panel, sin requerir un nuevo deploy.
2. EL SISTEMA DEBE mostrar un selector de tienda en el panel; toda acción posterior (cargar colección, previsualizar, reordenar, precargar config guardada) DEBE operar sobre la tienda seleccionada.
3. LA configuración de colecciones, los logs de corrida, y el lock de serialización DEBEN estar aislados por tienda: dos tiendas distintas con una colección del mismo ID numérico NUNCA deben pisarse la configuración ni bloquearse mutuamente.
4. LA ejecución automática diaria (R7) DEBE recorrer todas las tiendas dadas de alta, no solo una. Un error en una tienda no debe impedir que se procesen las demás.
5. EL SISTEMA NO DEBE devolver el `admin_token` de ninguna tienda en las respuestas de listado (`GET /api/stores`); esa lista es de solo lectura para elegir tienda, no para ver credenciales.

### R10 — Automatizaciones guardadas

**Historia:** Como usuario, quiero automatizar explícitamente el ordenado de una colección después de probarlo, y administrar mis automatizaciones desde una sección propia del panel.

Criterios de aceptación:
1. CUANDO un ordenado manual termina OK, EL SISTEMA DEBE ofrecer un botón "Automatizar ordenado" que, previa confirmación, guarde la configuración actual (colección, orden de categorías, umbral) y la habilite para la corrida diaria. Ordenar manualmente NO guarda nada por sí solo.
2. EL SISTEMA DEBE mostrar una sección "Automatizaciones guardadas" con todas las automatizaciones de la tienda seleccionada y su configuración.
3. EL SISTEMA DEBE permitir editar (orden de categorías por drag-and-drop y umbral) o eliminar una automatización en cualquier momento. Eliminar pide confirmación.
4. CUANDO la corrida diaria detecta categorías nuevas (R7.3), EL SISTEMA DEBE marcarlas como "Nueva" en la automatización correspondiente, mostrarlas visiblemente diferenciadas, y notificar al usuario en el panel qué colecciones tienen categorías sin ubicar.
5. CUANDO el usuario clickea el badge "Nueva" de una categoría, EL FLAG DEBE desaparecer y la categoría DEBE pasar al final del orden guardado, desde donde puede reubicarse editando la automatización.

### R11 — Detección de colecciones sin automatizar

**Historia:** Como usuario, quiero ver qué colecciones de cada tienda todavía no tienen automatización, para decidir colección por colección si automatizarla, configurarla a mano o ignorarla.

Criterios de aceptación:
1. EL SISTEMA DEBE poder sincronizar on-demand (botón "Refrescar colecciones") el listado completo de colecciones de la tienda seleccionada desde la Admin API (id, título, sortOrder, cantidad de productos), paginando hasta traerlas todas, y persistirlo en Supabase para no reconsultar Shopify en cada visita al panel.
2. EL SISTEMA DEBE mostrar la lista de colecciones pendientes (ni automatizadas ni ignoradas) de la tienda seleccionada, cruzando el listado sincronizado contra las automatizaciones existentes por `store_id + collection_gid`.
3. CADA colección pendiente DEBE ofrecer: "Automatizar stock" (crea la automatización con categorías detectadas automáticamente y el umbral más frecuente de la tienda, previa confirmación), "Crear automatización" (precarga el panel de configuración avanzada con esa colección), e "Ignorar" (la oculta del listado sin automatizarla, reversible desde un listado de ignoradas).
4. EL SISTEMA DEBE indicar visualmente las colecciones cuyo `sortOrder` no es `MANUAL`, porque la corrida diaria las saltea.

## Fuera de alcance de esta versión

- Docker, Kubernetes, Argo CD, GitOps: no aplican acá (ver `ms-autosort-by-stock/` para esa variante).
- Alta disponibilidad / múltiples regiones: no hace falta para una tienda interna de bajo tráfico.
- Migrar a app embebida de Shopify (App Bridge/Polaris): fuera de alcance; sigue siendo un panel standalone.
