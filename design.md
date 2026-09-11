# Design — Ordenador automático de colecciones (Shopify) — versión simple (Vercel + Supabase)

## 0. Por qué esta variante existe

`ms-autosort-by-stock/` (carpeta hermana) está pensada para desplegarse en un cluster Kubernetes
propio de la empresa, sincronizado por Argo CD. Ese camino depende de cosas que hay que confirmar
con un equipo de plataforma (convención del repo GitOps, registry de imágenes, manejo de secrets,
permisos para mergear manifiestos).

Esta carpeta (`ms-autosort-by-stock-simple/`) es la misma app funcionalmente, pero pensada para
subir en minutos, sin depender de nadie más:

- **GitHub → Vercel**: se conecta el repo una vez desde el dashboard de Vercel y cada `git push`
  a `main` dispara un deploy automático. No hay Dockerfile, no hay YAML de Kubernetes, no hay Argo CD.
- **Supabase**: mismo rol que en la otra versión (persistir configuración y logs), pero acá también
  guarda el lock de serialización (ver sección 8) y, a diferencia de la otra versión, **las
  credenciales de cada tienda de Shopify** (ver sección 5 — soporte multi-tienda).
- **Vercel Cron Jobs**: reemplaza al `CronJob` de Kubernetes para la corrida diaria.

La idea es usar esta versión para validar el producto (probarlo con Shopify y Supabase reales) y,
si más adelante hace falta la infraestructura corporativa (Argo CD/K8s), portar esta misma lógica
a `ms-autosort-by-stock/` — el algoritmo de ordenamiento y el cliente de Shopify son casi
copy-paste entre ambas.

## 1. Arquitectura general

Un solo proyecto de Vercel con dos partes:

- **Frontend (SPA React + Vite)**: sirve como sitio estático. El panel donde el usuario elige (o
  da de alta) una tienda, carga la colección, ordena los grupos por drag-and-drop, setea el
  umbral, previsualiza y ejecuta. No habla nunca directo con Shopify.
- **Backend (funciones serverless de Vercel, carpeta `/api`)**: cada archivo en `api/` es un
  endpoint HTTP independiente (sin Express, sin servidor propio escuchando 24/7). Habla con
  Shopify usando las credenciales de la tienda pedida en la URL, corre el algoritmo de
  ordenamiento, persiste config en Supabase.

```
[ Usuario ] -> [ Frontend estático (Vercel) ] --fetch same-origin--> [ Funciones /api (Vercel) ] --GraphQL--> [ Shopify Admin API (tienda N) ]
                                                                              |
                                                                              +--> [ Supabase (stores, config, logs, lock) ]
                                                                              ^
[ Vercel Cron Job ] -- GET/POST --------------------------------------------+
   (declarado en vercel.json, dispara "/api/cron/run" una vez al día, recorre TODAS las tiendas)
```

No hay contenedor, no hay cluster, no hay proceso que corra "siempre prendido": cada request
(manual o del cron) levanta una función, hace su trabajo, y termina.

Este proyecto es **multi-tienda**: un solo deploy, un solo login, y adentro del panel un selector
para elegir con qué tienda de Shopify se está trabajando (ver sección 5). Cada tienda tiene su
propio dominio `.myshopify.com` y su propio Admin API access token — ya no son env vars globales,
viven como filas en Supabase para poder sumar una tienda nueva sin redeployar.

## 2. Stack

- Frontend: React 18 + Vite. Drag-and-drop con `@dnd-kit/core` + `@dnd-kit/sortable`.
- Backend: funciones serverless de Vercel (Node 20), un archivo por endpoint bajo `/api`.
  Cliente HTTP nativo (`fetch`) para Shopify. Sin Express: no hace falta, cada función ya recibe
  `(req, res)` y Vercel resuelve el ruteo por convención de carpetas, incluso con múltiples
  segmentos dinámicos anidados (`api/store/[storeSlug]/collection/[id]/products.js`).
- Persistencia: Supabase (Postgres). Tablas `stores`, `collection_configs`, `run_logs`,
  `collection_locks`.
- Deploy: repo en GitHub, importado una vez en Vercel. Cada push a `main` = deploy de producción;
  cada PR = preview deploy automático (gratis, útil para probar cambios antes de mergear).

## 3. Variables de entorno

Se cargan como "Environment Variables" del proyecto en el dashboard de Vercel (no se commitea
ningún `.env`). Para desarrollo local con `vercel dev`, se copian a un `.env.local` (gitignored).

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (solo backend, nunca al frontend) |
| `CRON_SECRET` | Mismo nombre que reconoce Vercel: si existe, Vercel agrega automáticamente `Authorization: Bearer <valor>` en cada invocación del Cron Job |
| `PANEL_USER` / `PANEL_PASS` | Credenciales de acceso al panel (auth básica) |

No hace falta `PORT` (las funciones serverless no escuchan un puerto propio) ni `SHOPIFY_SHOP` /
`SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_API_VERSION`: esas credenciales ya no son globales, son por
tienda y viven en la tabla `stores` (sección 4) — se cargan desde el panel, no desde env vars.

## 4. Modelo de datos (Supabase)

Migraciones: `0001_init.sql` (versión inicial mono-tienda) + `0002_multi_store.sql` (agrega
`stores` y reconstruye las tres tablas siguientes con `store_id`) + `0003_new_product_types.sql`
(columna `new_product_types` en `collection_configs`) + `0004_store_collections.sql` (tabla
`store_collections` para la detección de colecciones sin automatizar) + `0005_manual_product_order.sql`
(columna `manual_product_order` en `collection_configs`, R12). Correr las cinco en orden.

### `stores`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `slug` | text (unique) | Identificador corto usado en las URLs de la API, ej. `jack-jones-dev` |
| `display_name` | text | Nombre mostrado en el selector del panel, ej. "Jack & Jones Dev" |
| `shop_domain` | text (unique) | ej. `jack-jones-dev.myshopify.com` |
| `admin_token` | text | Admin API access token de esa tienda. Nunca se devuelve al frontend (ver sección 5) |
| `api_version` | text | ej. `2026-07`. Una versión vieja **no ve** las colecciones creadas con el admin nuevo: no da error, simplemente no existen para esa versión (ni por id, ni en el listado, ni en `collectionsCount`) |
| `created_at` | timestamptz | |

### `collection_configs`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `store_id` | uuid (FK -> stores) | |
| `collection_gid` | text | GID completo, ej. `gid://shopify/Collection/655386214692`. Unique junto con `store_id` (dos tiendas distintas pueden tener colecciones con el mismo ID numérico) |
| `collection_title` | text | Cacheado para mostrar en UI |
| `product_type_order` | jsonb | Array ordenado de strings de `productType` |
| `stock_threshold` | int | Umbral. 0 = sin fondo por stock |
| `enabled` | boolean | Si entra o no en la corrida diaria |
| `new_product_types` | jsonb | productTypes detectados por el cron que el usuario todavía no ubicó (flags "Nueva" en el panel). Migración `0003` |
| `manual_product_order` | jsonb | Orden manual de productos por categoría, toggleable (R12). Forma: `{ [productType]: { enabled: boolean, order: string[] } }`, `order` = ids de producto. Migración `0005` |
| `updated_at` | timestamptz | |

### `run_logs`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `store_id` | uuid (FK -> stores) | |
| `collection_gid` | text | |
| `status` | text | `success` / `error` / `skipped` |
| `products_count` | int | Cantidad reordenada |
| `message` | text | Detalle o error |
| `ran_at` | timestamptz | |

### `collection_locks`

| Columna | Tipo | Notas |
|---|---|---|
| `store_id` | uuid (FK -> stores) | Parte de la PK compuesta |
| `collection_gid` | text | Parte de la PK compuesta junto con `store_id` |
| `locked_at` | timestamptz | Usado para expirar locks huérfanos |

### `store_collections` (migración `0004`)

Cache de todas las colecciones de cada tienda, sincronizado on-demand desde Shopify (botón
"Refrescar colecciones"). Se cruza contra `collection_configs` para detectar colecciones sin
automatizar. El estado de cada colección es derivado, no una columna: **automatizada** = existe
una config con su `(store_id, collection_gid)`; **ignorada** = `ignored = true`; **pendiente** =
ninguna de las dos.

| Columna | Tipo | Notas |
|---|---|---|
| `store_id` | uuid (FK -> stores) | Parte de la PK compuesta |
| `collection_gid` | text | Parte de la PK compuesta junto con `store_id` |
| `title` | text | |
| `sort_order` | text | Para avisar en el panel si no está en `MANUAL` |
| `products_count` | int | Cantidad de productos (viene gratis en la misma query) |
| `ignored` | boolean | Oculta la colección del listado de pendientes sin automatizarla |
| `synced_at` | timestamptz | El sync borra las filas con `synced_at` viejo (colecciones eliminadas en Shopify) |

Las cuatro tablas tienen Row Level Security habilitada sin políticas: solo el backend accede,
usando siempre `SUPABASE_SERVICE_KEY` (`service_role`, que ignora RLS). Ningún código de este
proyecto usa la key `anon`, así que RLS acá es defensa en profundidad, no la barrera principal.

## 5. Gestión de tiendas (multi-tienda)

Agregar una tienda nueva es una acción del panel, no un deploy: en la pantalla principal hay un
selector de tienda con un botón "+ Agregar tienda" que pide `slug`, nombre para mostrar, dominio
`.myshopify.com` y el Admin API access token de esa tienda (ver
`ms-autosort-by-stock/design.md` o la sección "Cómo conseguir el token" de la conversación de
setup para cómo generarlo — no cambia por ser multi-tienda). Ese formulario pega a
`POST /api/stores`, que valida los campos y hace un upsert en la tabla `stores`.

El `admin_token` viaja del navegador a la función serverless (protegida por auth básica y HTTPS)
y de ahí a Supabase — nunca se devuelve en ninguna respuesta de la API después de guardado
(`GET /api/stores` solo expone `id, slug, display_name, shop_domain, api_version`).

**Alternativa sin UI**: también se puede insertar una tienda directo en el SQL editor de Supabase
o con la tabla editor de Supabase, si se prefiere no tipear el token en el navegador:

```sql
insert into stores (slug, display_name, shop_domain, admin_token, api_version)
values ('jack-jones-dev', 'Jack & Jones Dev', 'jack-jones-dev.myshopify.com', 'shpca_...', '2026-07');
```

Cada tienda es completamente independiente: su propia config de colecciones, sus propios logs,
su propio lock de serialización, y el cron diario (sección 9) las recorre todas en una sola
invocación, sin que un error en una tienda afecte a las demás (misma garantía que R7.4 ya tenía
entre colecciones, ahora también entre tiendas).

## 6. Contratos de API

| Ruta | Archivo | Auth |
|---|---|---|
| `GET /api/stores` | `api/stores.js` | Basic auth. Lista tiendas (sin `admin_token`) |
| `POST /api/stores` | `api/stores.js` | Basic auth. Alta de una tienda nueva (upsert por `slug`) |
| `PUT /api/store/:storeSlug` | `api/store/[storeSlug]/index.js` | Basic auth. Edita nombre/dominio/versión de API; `adminToken` opcional (vacío = no lo toca) |
| `DELETE /api/store/:storeSlug` | `api/store/[storeSlug]/index.js` | Basic auth. Elimina la tienda y todo lo que depende de ella (automatizaciones, logs, locks, cache de colecciones — `on delete cascade`) |
| `GET /api/store/:storeSlug/collection/:id/products` | `api/store/[storeSlug]/collection/[id]/products.js` | Basic auth |
| `POST /api/store/:storeSlug/collection/:id/reorder` | `api/store/[storeSlug]/collection/[id]/reorder.js` | Basic auth |
| `GET /api/configs` | `api/configs.js` | Basic auth. Sin filtrar por tienda (usado solo como ping de login) |
| `GET /api/store/:storeSlug/configs` | `api/store/[storeSlug]/configs.js` | Basic auth. Lista las automatizaciones guardadas de la tienda |
| `GET\|PUT\|DELETE /api/store/:storeSlug/config/:collectionGid` | `api/store/[storeSlug]/config/[collectionGid].js` | Basic auth. PUT crea/edita la automatización; DELETE la elimina |
| `GET\|POST /api/store/:storeSlug/collections` | `api/store/[storeSlug]/collections/index.js` | Basic auth. GET lee el cache; POST re-sincroniza desde Shopify y devuelve la lista fresca |
| `PATCH /api/store/:storeSlug/collections/:collectionGid` | `api/store/[storeSlug]/collections/[collectionGid].js` | Basic auth. Body `{ ignored: boolean }` |
| `GET\|POST /api/cron/run` | `api/cron/run.js` | Cron secret (Bearer o `X-Cron-Secret`). Recorre todas las tiendas |

Mismos payloads de request/response que `ms-autosort-by-stock/design.md` sección 5 para los
endpoints de colección/reorder/config — la única diferencia es el segmento `:storeSlug` extra en
la URL. No se repiten acá.

### Automatizaciones guardadas (flujo del panel)

Ordenar una colección desde el panel **ya no guarda nada solo** (el `POST reorder` va siempre con
`save: false`). Después de un ordenado exitoso aparece el botón **"Automatizar ordenado"** (o
"Actualizar automatización" si ya existía una para esa colección), que pide confirmación y hace un
`PUT` de la config actual (orden de categorías + umbral, `enabled: true`). Las automatizaciones
viven en la sección **"Automatizaciones guardadas"** del panel, donde se pueden editar (drag del
orden, umbral) o eliminar en cualquier momento.

### Colecciones sin automatizar

Sección del panel que lista las colecciones de la tienda seleccionada que todavía no tienen
automatización. El listado sale del cache `store_collections`; el botón **"Refrescar colecciones"**
dispara el sync on-demand contra Shopify (query `collections(first: 250)` paginada con
`pageInfo.hasNextPage`/`endCursor`, trayendo `id`, `title`, `sortOrder` y `productsCount`). No hay
cron para esto: es a pedido, como pidió el negocio.

Cada colección pendiente ofrece tres acciones:

- **"Automatizar stock"**: crea la automatización sin pasar por el panel avanzado. Trae los
  productos, detecta los `productType` (quedan en orden alfabético) y guarda la config con el
  umbral "estándar" de la tienda — el más frecuente entre sus automatizaciones existentes
  (0 si no hay ninguna). Pide confirmación mostrando esos defaults.
- **"Crear automatización"**: precarga el panel de configuración avanzada de arriba (mismo flujo
  que tipear el Collection ID) para armar el orden a mano.
- **"Ignorar"**: marca `ignored = true`; la colección deja de aparecer como pendiente. Hay un
  listado colapsable de ignoradas con "Dejar de ignorar".

Las colecciones cuyo `sortOrder` no es `MANUAL` se marcan con un badge "no Manual" (se pueden
automatizar igual, pero la corrida diaria las va a saltear hasta que se cambien en Shopify).

### Categorías nuevas detectadas por el cron

Cuando la corrida diaria encuentra un `productType` que no está en el orden guardado:

1. Sus productos van **al fondo absoluto** de la colección (debajo incluso del fondo por stock
   bajo), agrupados y sin partirse por el umbral — ver sección 7.
2. El cron agrega ese type a `new_product_types` de la config (además del aviso en `run_logs`).
3. El panel lo muestra en la tarjeta de la automatización con un badge **"Nueva"** (y un banner
   arriba de la sección avisa qué colecciones tienen categorías sin ubicar).
4. Al clickear el badge, el flag desaparece: el type pasa al **final** de `product_type_order`
   (deja de ser "nuevo") y desde ahí se puede arrastrar a cualquier posición editando la
   automatización.

## 7. Algoritmo de ordenamiento

Vive en `shared/sortCollection.mjs` y `shared/buildMoves.mjs`, funciones puras sin I/O que no
saben nada de tiendas ni de Supabase. Ver `ms-autosort-by-stock/design.md` sección 6 para la base
del algoritmo (particionado por umbral, agrupación por productType, desempate por título).

**Diferencia con esa versión** — colocación de categorías nuevas: acá los `productType` que no
están en `productTypeOrder` van al **fondo absoluto** de la colección (debajo del fondo por stock
bajo), como grupos enteros (el umbral no los parte: toda la categoría está pendiente de revisión).
Entre sí se ordenan alfabéticamente, y adentro por stock descendente. El layout final es:

1. Grupos conocidos en el orden configurado — adentro de cada uno, por stock descendente **salvo**
   que tenga orden manual prendido (ver abajo), en cuyo caso respeta ese orden.
2. Fondo por stock bajo (`totalInventory <= umbral`), stock desc — un grupo con orden manual
   prendido nunca aporta productos acá (R12.3): se queda entero en el paso 1.
3. Categorías nuevas, al fondo del todo.

### Orden manual por categoría (R12)

`sortCollection` recibe un 4º parámetro opcional, `manualProductOrder`, con la forma
`{ [productType]: { enabled: boolean, order: string[] } }` (mismo shape que la columna
`manual_product_order` — ver sección 4). Es un toggle por categoría, independiente del orden de
grupos y del umbral:

- Un grupo solo usa orden manual si su entrada existe **y** `enabled: true`; si está `false` (o no
  existe la entrada), ese grupo cae al comportamiento de siempre (stock desc + sujeto al umbral).
  Apagar el toggle no borra `order` — queda guardado para poder prenderlo de nuevo sin rearrastrar.
- Con el toggle prendido, dentro del grupo van primero los productos listados en `order` (en ese
  orden), y después cualquier producto del grupo que **no** esté en `order` — por ejemplo uno
  agregado a Shopify después de definir el orden manual — ordenado por stock desc como fallback.
  Nunca se pierde un producto por no estar en la lista guardada.
- El grupo entero queda exento del "fondo por umbral" mientras el toggle esté prendido (ver punto 2
  arriba): es una decisión deliberada — si el usuario está curando el orden a mano, el criterio de
  stock deja de aplicar ahí, igual que las categorías nuevas ya son inmunes al umbral.

El panel edita esto con `CategoryProductOrder.jsx` (`src/components/`), una grilla drag-and-drop
anidada dentro de cada fila de `ProductTypeList.jsx`, visible solo cuando esa categoría tiene el
toggle prendido. Vive únicamente en el panel principal (donde ya están cargados los productos de la
colección) — la sección "Automatizaciones guardadas" no lo edita (ver `requirements.md`, Fuera de
alcance).

Se renderiza como una **grilla de tarjetas de 4 columnas** (2 en mobile, `<640px`), no como lista
vertical — cada tarjeta es foto + título + stock, con el número de posición y el "agarre" de
arrastre como badges superpuestos a la foto. `SortableContext` usa `rectSortingStrategy` de
`@dnd-kit/sortable` (el equivalente de `verticalListSortingStrategy` para grillas: soporta
reordenar entre filas, no solo dentro de una fila).

Cada tarjeta muestra la foto del producto (`featuredImage`, pedida a Shopify con
`transform: { maxWidth: 200, maxHeight: 200 }` para no traer la imagen a resolución completa —
`lib/shopifyClient.js#COLLECTION_PRODUCTS_QUERY`), para poder identificar el producto al arrastrar
sin depender solo del título (R12.4.1). Un producto sin imagen en Shopify (`featuredImage: null`)
muestra un placeholder en vez de romper la tarjeta.

## 8. Integración con Shopify y serialización

Query paginada y mutation de reorder: misma lógica que la otra versión (ver
`ms-autosort-by-stock/design.md` sección 7). La diferencia multi-tienda es que `lib/shopifyClient.js`
ya no lee `SHOPIFY_SHOP`/`SHOPIFY_ADMIN_TOKEN` de env vars: recibe un objeto `store`
(`{ shopDomain, adminToken, apiVersion }`) como parámetro en cada función — lo arma quien llama
(la ruta de la API, a partir de `getStoreBySlug(storeSlug)`), así que un mismo proceso puede
hablar con N tiendas distintas en la misma invocación sin pisarse.

### Lock de serialización

Igual que antes (respaldado en Supabase, no en memoria — ver el razonamiento completo en la
versión previa de este documento o en `ms-autosort-by-stock/design.md`), pero la clave ahora es
compuesta: `(store_id, collection_gid)`. Esto es necesario porque dos tiendas distintas pueden
tener, cada una, una colección con el mismo ID numérico — sin `store_id` en la clave, un reorder
en curso en la tienda A bloquearía por error a la tienda B.

### Timeouts de las funciones serverless (limitación a tener en cuenta)

Las funciones de Vercel tienen un límite de duración (60s en el plan Hobby). Con multi-tienda esto
importa más en el cron: si hay muchas tiendas con muchas colecciones habilitadas, una sola
invocación de `/api/cron/run` podría acercarse al límite. Mitigación actual: `maxDuration: 60` en
`vercel.json`. Si el cron empieza a acercarse al límite, la salida es dividirlo (por ejemplo, un
cron por tienda en vez de uno global) antes de migrar a la versión Argo/K8s.

## 9. Scheduler: Vercel Cron Jobs

Se declara en `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/run", "schedule": "0 6 * * *" }]
}
```

`0 6 * * *` = 6am UTC = 3am UY (ajustar si cambia el huso horario). Vercel invoca
`GET /api/cron/run` una vez al día; `runCronForAllEnabled()` (en `lib/reorderService.js`) lista
**todas** las tiendas (`listStoresInternal()`), y para cada una sus configs `enabled`, reordenando
con datos frescos de esa tienda específica. Un error en una tienda o colección no corta la corrida
de las demás (mismo `try/catch` por ítem que ya existía, ahora anidado en un loop extra por tienda).

Para probarlo a mano: `curl -H "X-Cron-Secret: <CRON_SECRET>" https://<proyecto>.vercel.app/api/cron/run`,
o `npm run cron:local` para correr la misma lógica directo con `node`, sin pasar por Vercel.

## 10. Manejo de errores

Igual que la otra versión (ver `ms-autosort-by-stock/design.md` sección 9), más un caso nuevo:

| Situación | Comportamiento |
|---|---|
| `storeSlug` no existe en la tabla `stores` | 404 con mensaje claro, no continúa |
| Collection ID inválido / no existe | 400 con mensaje claro |
| Colección no `MANUAL` | Aviso en UI (manual) / skip + log (cron) |
| `userErrors` en la mutation | No reporta éxito |
| Throttling de Shopify | Backoff exponencial |
| productType nuevo en el cron | Se ubica al final, se loguea, no falla |
| Token inválido/revocado (401) | Error explícito que incluye el dominio de la tienda afectada |

## 11. Estrategia de testing

- **Unit**: algoritmo de ordenamiento (`test/sortCollection.test.js`) y construcción de moves/lotes
  (`test/buildMoves.test.js`) — no tocan Shopify/Supabase/tiendas, sin cambios.
- **Unit**: cliente de Shopify con `fetch` mockeado (`test/shopifyClient.test.js`), pasando un
  objeto `store` de prueba en vez de depender de env vars globales.
- **Unit**: helpers de auth (`test/auth.test.js`).
- **Manual/E2E**: correr contra una tienda real de prueba con pocos productos, agregándola desde
  el panel, tanto el flujo manual como una corrida forzada del cron, y validar en el admin de
  Shopify de esa tienda.

## 12. Deploy paso a paso

1. Crear un repo en GitHub con el contenido de esta carpeta.
2. Crear un proyecto en Supabase, correr `supabase/migrations/0001_init.sql` y luego
   `0002_multi_store.sql` en ese orden (SQL editor o CLI).
3. Importar el repo en Vercel ("Add New Project" → conectar GitHub). Vercel detecta Vite
   automáticamente para el frontend y toma `/api` como funciones sin configuración extra.
4. Cargar las env vars de la sección 3 en Vercel (Project Settings → Environment Variables) — ya
   no incluyen credenciales de Shopify, esas se cargan después desde el panel.
5. Deploy. Entrar al panel en la URL que da Vercel, login con `PANEL_USER`/`PANEL_PASS`, y usar
   "+ Agregar tienda" para dar de alta la primera tienda (o las que hagan falta).
6. Confirmar que `vercel.json` quedó activo en Project Settings → Cron Jobs.

## 13. UI — shell fijo con columnas tipo drill-down

El panel dejó de ser una página larga que scrollea de corrido: es un shell de altura fija
(`100vh`, sin scroll de `body`) con un sidebar y columnas que se van abriendo hacia la derecha —
cada una scrollea por separado. La lógica de negocio (R1–R12) no cambió, solo dónde vive cada
pieza en pantalla.

```
[ Sidebar: tiendas ] [ Columna principal ]                  [ Editor (col. 2) ]  [ Orden manual (col. 3) ]
   Sidebar.jsx         "Cargar por ID" (colapsado)             CollectionEditor    ManualOrderColumn.jsx
                        SavedAutomations.jsx                   Panel.jsx           (CategoryProductOrder,
                        UnautomatedCollections.jsx              (categorías,         en grande)
                        (buscador, colapsado)                    umbral, preview,
                                                                  ordenar/automatizar)
```

- **Sidebar** (`Sidebar.jsx`, ex `StoreSelector.jsx`): selector de tienda + alta/edición/borrado.
  Editar/eliminar son iconos que aparecen al hacer hover sobre cada fila — no hace falta
  seleccionar la tienda primero para tocarla.
- **Columna principal** (`shell-main`, contenido armado directo en `App.jsx`): "Cargar colección
  por ID" (`CollectionLoader.jsx`) vive colapsado detrás de un botón — es un flujo de excepción,
  no el camino normal (ver R1 y R11: lo normal es sincronizar colecciones y automatizarlas desde
  ahí). Debajo, "Automatizaciones guardadas" (`SavedAutomations.jsx`) como vista principal, y
  "Colecciones sin automatizar" (`UnautomatedCollections.jsx`) como buscador colapsado — con la
  lista completa oculta hasta tocar "Ver todo el listado" (buscar sí muestra resultados sin
  necesidad de expandir).
- **Columna 2 — editor** (`CollectionEditorPanel.jsx`, nuevo): se abre al tocar "Editar" en una
  automatización guardada o "Crear automatización"/cargar por ID — **es el mismo panel en los tres
  casos**, la única diferencia es de dónde sale el Collection ID inicial. Muestra un loader
  (`.panel-loader`) mientras trae los productos de Shopify y la config guardada (si existe); recién
  con todo cargado renderiza el orden de categorías, umbral, preview y los botones de
  ordenar/automatizar — el mismo contenido que antes vivía siempre visible en `App.jsx`, ahora
  encapsulado acá. `App.jsx` solo sabe **qué** Collection ID está abierto (`editorId`); todo lo
  demás (productos, orden, umbral, orden manual, qué categoría está abierta en la columna 3) es
  estado interno de este componente, que se remonta entero (vía `key`) cada vez que cambia el
  target — así no arrastra estado viejo de una colección a la siguiente.
- **Columna 3 — orden manual** (`ManualOrderColumn.jsx`, nuevo): se abre al tocar "Ordenar
  productos" en una categoría con el toggle de R12 prendido. Es una vista de detalle sobre datos ya
  cargados en la columna 2 — no pide nada nuevo a Shopify — así que vive como estado interno de
  `CollectionEditorPanel`, no de `App.jsx`. Al abrirse, la columna 2 se angosta (`.is-narrow`,
  420px) y esta se lleva el espacio que sobra, para que la grilla de 4 columnas de
  `CategoryProductOrder.jsx` (R12) tenga lugar de sobra.
- **Cierre de columnas**: cada columna tiene su propio botón "✕"/"Volver" (`PanelHeader.jsx`,
  compartido) que solo la cierra a ella — cerrar la columna 3 vuelve la columna 2 a su ancho
  completo sin tocar nada de lo cargado ahí; cerrar la columna 2 vuelve a la columna principal sola.
- **Responsive**: es una herramienta de escritorio pensada para usarse con la ventana ancha; por
  debajo de 900px el shell no intenta apilar las columnas (no tiene una traducción razonable a una
  sola columna angosta) — les pone un ancho mínimo y deja que el shell scrollee horizontalmente en
  vez de aplastar el contenido.
