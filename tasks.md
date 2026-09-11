# Tasks — Ordenador automático de colecciones (Shopify) — versión simple

Plan de implementación incremental. Cada tarea referencia los requisitos (R#) que cubre.
Marcar `[x]` a medida que se completan.

## Fase 0 — Setup

- [x] 0.1 Estructura de carpetas: `/api` (funciones serverless), `/lib` (lógica backend),
  `/shared` (algoritmo puro), `/src` (frontend Vite en la raíz del repo, sin subcarpeta), `/supabase`.
- [x] 0.2 `package.json` único en la raíz con deps de frontend + `@supabase/supabase-js`.
  `.env.example` con las variables de la sección 3 del design (sin `PORT`). `.gitignore`
  (`node_modules`, `dist`, `.env`, `.env.local`, `.vercel`).
- [ ] 0.3 Crear el proyecto en Supabase y correr `supabase/migrations/0001_init.sql`
  (`collection_configs`, `run_logs`, `collection_locks`). (R6, R7.5, R5.5) — **pendiente: lo hace el usuario, requiere cuenta de Supabase.**

## Fase 1 — Núcleo: algoritmo de ordenamiento (sin Shopify todavía)

- [x] 1.1 `sortCollection(products, productTypeOrder, stockThreshold)` en `shared/sortCollection.mjs`. (R2, R3, R5)
- [x] 1.2 `buildMoves(finalOrder)` / `chunkMoves(moves, 250)` en `shared/buildMoves.mjs`. (R5.1)
- [x] 1.3 Tests unitarios del algoritmo (`test/sortCollection.test.js`, `test/buildMoves.test.js`). (R2.3, R3, R7.3)

## Fase 2 — Integración con Shopify

- [x] 2.1 `lib/shopifyClient.js`: `shopifyGraphQL`, maneja 401/429/THROTTLED con backoff. (R8.1, R8.2)
- [x] 2.2 `getCollectionProducts(collectionGid)`: paginada, devuelve `title`, `sortOrder`, `isManual`. (R1.1)
- [x] 2.3 `toCollectionGid(numericId)`. (R1.4)
- [x] 2.4 `reorderCollection(collectionGid, moveBatches)`: lotes + polling de jobs. (R5.1, R5.2, R5.3)
- [x] 2.5 `lib/lock.js`: lock de serialización **respaldado en Supabase** (`collection_locks`),
  no en memoria — necesario porque las funciones serverless no comparten estado entre invocaciones. (R5.5)

## Fase 3 — API (funciones serverless de Vercel)

- [x] 3.1 `lib/auth.js`: `requireBasicAuth(req, res)` para las rutas del panel y
  `requireCronAuth(req, res)` (acepta `Authorization: Bearer <CRON_SECRET>` de Vercel Cron o
  `X-Cron-Secret` para pruebas manuales). (R8.3, R7.2)
- [x] 3.2 `api/collection/[id]/products.js`: usa 2.2, devuelve productos + `productTypes` únicos +
  `isManual`. (R1.1, R1.2, R1.3, R2.1)
- [x] 3.3 `api/collection/[id]/reorder.js`: corre el algoritmo (Fase 1), ejecuta el reorder (2.4),
  y si `save=true` persiste la config en Supabase. (R5, R6.1)
- [x] 3.4 `api/configs.js` y `api/config/[collectionGid].js` para precargar la UI. (R6.2, R6.3)
- [x] 3.5 `api/cron/run.js`: itera configs `enabled`, reordena cada una con datos frescos, saltea
  las que no son manual, maneja productType nuevo, y escribe `run_logs`. (R7)

## Fase 4 — Frontend (panel)

- [x] 4.1 Pantalla de login simple contra la auth básica. (R8.3)
- [x] 4.2 Input `type="number"` de Collection ID + botón "Cargar". (R1.1, R1.3, R1.4)
- [x] 4.3 Lista de `productType`, reordenable con `@dnd-kit/sortable`, precarga config guardada. (R2.1, R2.2, R6.3)
- [x] 4.4 Input numérico de umbral con validación. (R3.1, R3.4)
- [x] 4.5 Vista previa del orden final, recalculada en el cliente (reusa `shared/sortCollection.mjs`
  directo, sin proxy porque frontend y `/api` viven en el mismo dominio de Vercel). (R4)
- [x] 4.6 Botón "Ordenar colección" con estado de carga y confirmación/error. (R5.4, R6.1)

**Verificado en esta sesión**: `npm install` corrió sin errores, los 27 tests unitarios
(`npm test`) pasan, `npm run build` generó `dist/` sin errores, y un smoke test manual de cada
handler de `/api` confirmó que devuelven 401/405 correctamente sin credenciales/método inválido.
No se corrió `vercel dev` end-to-end (requiere login interactivo con una cuenta de Vercel) ni se
probó contra Shopify/Supabase reales (requiere las credenciales reales del usuario).

## Fase 5 — Deploy en Vercel

- [ ] 5.1 Subir esta carpeta a un repo de GitHub. — **pendiente: lo hace el usuario.**
- [ ] 5.2 Importar el repo en Vercel ("Add New Project"), dejar que autodetecte Vite. — **pendiente.**
- [ ] 5.3 Cargar las env vars en Vercel (Project Settings → Environment Variables). — **pendiente:
  requiere el token real de Shopify y las claves de Supabase, no se pueden generar acá.**
- [ ] 5.4 Confirmar que el Cron Job de `vercel.json` aparece activo en Project Settings → Cron
  Jobs después del primer deploy. — **pendiente.**
- [ ] 5.5 Prueba E2E manual contra la colección real de test con pocos productos: flujo manual
  (panel) y una corrida forzada del cron vía `curl -H "X-Cron-Secret: ..." https://<proyecto>.vercel.app/api/cron/run`.
  — **pendiente: requiere la app ya deployada.**

## Fase 6 — Multi-tienda

- [x] 6.1 `supabase/migrations/0002_multi_store.sql`: tabla `stores`, y `store_id` en
  `collection_configs` (unique compuesto), `run_logs` y `collection_locks` (PK compuesta). (R9.3)
- [x] 6.2 `lib/env.js` deja de exigir `SHOPIFY_*`; `lib/supabaseClient.js` suma
  `listStoresPublic`/`listStoresInternal`/`getStoreBySlug`/`upsertStore` y las funciones de
  config/log ahora reciben `storeId`. (R8.1, R9.5)
- [x] 6.3 `lib/shopifyClient.js` recibe un objeto `store` (`shopDomain`/`adminToken`/`apiVersion`)
  en vez de leer env vars globales; `lib/lock.js` escopeado por `(storeId, collectionGid)`;
  `lib/reorderService.js#runCronForAllEnabled` recorre todas las tiendas. (R9.2, R9.3, R9.4)
- [x] 6.4 Rutas movidas a `api/store/[storeSlug]/collection/[id]/{products,reorder}.js` y
  `api/store/[storeSlug]/config/[collectionGid].js`; nuevo `api/stores.js` (GET lista sin token,
  POST alta/edición). `vercel.json` actualizado. (R9.1, R9.5)
- [x] 6.5 Frontend: `StoreSelector.jsx` (selector + alta de tienda), `App.jsx` pasa `storeSlug` a
  todas las llamadas, `api.js` con los nuevos endpoints. (R9.1, R9.2)
- [x] 6.6 Tests actualizados a la nueva firma de `shopifyClient` (recibe `store` explícito).
- [ ] 6.7 Correr `0002_multi_store.sql` en el Supabase real y dar de alta las tiendas desde el
  panel. — **pendiente: lo hace el usuario.**

## Fase 7 — Automatizaciones guardadas y categorías nuevas

- [x] 7.1 `supabase/migrations/0003_new_product_types.sql`: columna `new_product_types` en
  `collection_configs`. (R10.4)
- [x] 7.2 `shared/sortCollection.mjs`: categorías fuera del orden guardado van al fondo absoluto
  (debajo del fondo por stock), enteras. Tests actualizados + test nuevo. (R7.3)
- [x] 7.3 Backend: `upsertConfig` acepta `newProductTypes`, `deleteConfig`, `setNewProductTypes`;
  el cron mergea los grupos nuevos en `new_product_types`. `GET /api/store/:slug/configs` nuevo;
  `PUT`/`DELETE` en `config/[collectionGid]`. (R10.1–R10.4)
- [x] 7.4 Frontend: se quita el checkbox de guardar (reorder siempre `save:false`); botón
  "Automatizar ordenado"/"Actualizar automatización" con confirmación tras un ordenado OK; sección
  "Automatizaciones guardadas" (`SavedAutomations.jsx`) con edición drag+umbral, eliminación con
  confirmación, badges "Nueva" clickeables y banner de aviso. (R10)
- [ ] 7.5 Correr `0003_new_product_types.sql` en el Supabase real. — **pendiente: lo hace el usuario.**

## Fase 8 — Colecciones sin automatizar

- [x] 8.1 `supabase/migrations/0004_store_collections.sql`: tabla `store_collections` (cache del
  listado de colecciones por tienda, flag `ignored`, `synced_at` para podar eliminadas). (R11.1)
- [x] 8.2 `lib/shopifyClient.js#listCollections`: query `collections(first: 250)` paginada con
  `id`, `title`, `sortOrder`, `productsCount`. Test de paginación. (R11.1)
- [x] 8.3 `lib/supabaseClient.js`: `listStoreCollections`, `replaceStoreCollections` (upsert que
  preserva `ignored` + poda por `synced_at`), `setCollectionIgnored`. (R11.1, R11.3)
- [x] 8.4 API: `GET|POST /api/store/:slug/collections` (leer cache / sync on-demand) y
  `PATCH /api/store/:slug/collections/:gid` (`{ ignored }`). `maxDuration: 60` para el sync y
  para `products`. (R11.1, R11.3)
- [x] 8.5 Frontend `UnautomatedCollections.jsx`: botón "Refrescar colecciones", lista de
  pendientes (cruce cache vs configs en el cliente), acciones "Automatizar stock" (defaults:
  categorías alfabéticas + umbral más frecuente de la tienda, con confirmación), "Crear
  automatización" (precarga el panel avanzado vía `presetId` del `CollectionLoader`) e "Ignorar"
  (+ listado colapsable de ignoradas con restaurar). Badge "no Manual". (R11.2–R11.4)
- [ ] 8.6 Correr `0004_store_collections.sql` en el Supabase real. — **pendiente: lo hace el usuario.**

## Fase 9 — Orden manual de productos por categoría (toggleable)

- [x] 9.1 `supabase/migrations/0005_manual_product_order.sql`: columna `manual_product_order`
  (jsonb, default `{}`) en `collection_configs`. (R12.6)
- [x] 9.2 `shared/sortCollection.mjs`: 4º parámetro `manualProductOrder`; un grupo con
  `enabled: true` usa el orden guardado (productos no posicionados van al final del grupo, por
  stock desc) y queda exento del fondo por umbral. `groupKey`/`byInventoryDescThenTitle` ahora
  exportados para reusar la regla de desempate en el frontend. Nuevo `isManualOrderEnabled` para
  que el preview tagee "fondo" igual que el algoritmo. Tests nuevos (5). (R12.2, R12.3, R12.4)
- [x] 9.3 Backend: `lib/supabaseClient.js#upsertConfig` y `lib/reorderService.js#runReorder` /
  `runCronForAllEnabled` pasan `manualProductOrder` de punta a punta; los dos endpoints
  (`.../reorder.js`, `.../config/[collectionGid].js`) lo validan (`{ enabled, order[] }` por
  categoría) y lo reenvían. (R12.6)
- [x] 9.4 Frontend: `CategoryProductOrder.jsx` (nuevo) — drag-and-drop de productos dentro de una
  categoría con `@dnd-kit`. `ProductTypeList.jsx` extendido: toggle "Orden manual" por categoría +
  panel anidado, sin romper el uso existente en `SavedAutomations.jsx` (que no pasa `products` y
  por lo tanto no muestra el toggle — ver Fuera de alcance en `requirements.md`). `App.jsx`
  mantiene `manualProductOrder` en el estado, lo precarga desde la config guardada, lo manda al
  preview (`sortCollection` + tag "fondo"), al reorder y a "Automatizar ordenado". (R12.1, R12.4,
  R12.5, R12.7)
- [ ] 9.5 Correr `0005_manual_product_order.sql` en el Supabase real. — **pendiente: lo hace el
  usuario.**

## Fase 10 — Shell fijo con columnas tipo drill-down (UI)

- [x] 10.1 Shell de altura fija (`100vh`, sin scroll de `body`) con sidebar + columnas, cada una
  con su propio scroll. `src/styles.css` reescrito: `.shell`, `.sidebar`, `.shell-main`, `.col`,
  `.col-editor`, `.col-manual-order`, `.panel-header`. Ver `design.md` sección 13.
- [x] 10.2 `Sidebar.jsx` (reemplaza `StoreSelector.jsx`): selector de tienda a la izquierda,
  editar/eliminar por icono al hover en vez de texto siempre visible.
- [x] 10.3 `CollectionLoader.jsx`: colapsado detrás de un botón "Cargar colección por ID" (flujo
  de excepción, no el camino normal).
- [x] 10.4 `SavedAutomations.jsx`: sin edición inline — "Editar" abre la columna 2
  (`CollectionEditorPanel.jsx`). Simplifica el componente (menos estado local).
- [x] 10.5 `UnautomatedCollections.jsx`: buscador + listado colapsado por default, "Ver todo el
  listado" para expandir sin buscar.
- [x] 10.6 `CollectionEditorPanel.jsx` (nuevo, columna 2): unifica "cargar por ID" y "editar
  automatización guardada" en el mismo panel — loader mientras carga, luego categorías + umbral +
  preview + ordenar/automatizar. Antes vivía todo esto inline en `App.jsx`.
- [x] 10.7 `ManualOrderColumn.jsx` (nuevo, columna 3) + `PanelHeader.jsx` (nuevo, compartido):
  abre el orden manual de una categoría (R12) en su propia columna grande, angostando la columna 2.
  `ProductTypeList.jsx` deja de renderizar el grid inline (ya no importa `CategoryProductOrder`),
  ahora solo pide abrir/cerrar la columna vía `onOpenCategory`.
- [x] 10.8 `App.jsx` reducido a orquestar el shell: solo trackea `storeSlug` y `editorId`, toda la
  lógica de una colección abierta vive en `CollectionEditorPanel`. Se borra `BackToTop.jsx` (sin
  sentido sin scroll de página).

## Notas

- El token de Shopify es offline y no expira; si aparece un 401, el mensaje indica regenerarlo
  con Authorization Code Grant.
- No hardcodear el token en ningún lado ni exponerlo al frontend.
- La colección objetivo tiene que estar en `sortOrder: MANUAL` en el admin de Shopify.
- Si en algún momento esta versión se queda corta (por ejemplo, el límite de 60s de las funciones
  serverless empieza a ser un problema con colecciones grandes, o aparece un requisito de
  infraestructura corporativa), la lógica de `shared/` y `lib/` es prácticamente portable 1:1 a
  `ms-autosort-by-stock/` (Argo CD/K8s) — ver la nota en design.md sección 0.
