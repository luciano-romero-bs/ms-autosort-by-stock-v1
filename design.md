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
  guarda el lock de serialización (ver sección 7).
- **Vercel Cron Jobs**: reemplaza al `CronJob` de Kubernetes para la corrida diaria.

La idea es usar esta versión para validar el producto (probarlo con Shopify y Supabase reales) y,
si más adelante hace falta la infraestructura corporativa (Argo CD/K8s), portar esta misma lógica
a `ms-autosort-by-stock/` — el algoritmo de ordenamiento y el cliente de Shopify son casi
copy-paste entre ambas.

## 1. Arquitectura general

Un solo proyecto de Vercel con dos partes:

- **Frontend (SPA React + Vite)**: sirve como sitio estático. El panel donde el usuario carga la
  colección, ordena los grupos por drag-and-drop, setea el umbral, previsualiza y ejecuta. No habla
  nunca directo con Shopify.
- **Backend (funciones serverless de Vercel, carpeta `/api`)**: cada archivo en `api/` es un
  endpoint HTTP independiente (sin Express, sin servidor propio escuchando 24/7). Habla con
  Shopify, corre el algoritmo de ordenamiento, persiste config en Supabase.

```
[ Usuario ] -> [ Frontend estático (Vercel) ] --fetch same-origin--> [ Funciones /api (Vercel) ] --GraphQL--> [ Shopify Admin API ]
                                                                              |
                                                                              +--> [ Supabase (config, logs, lock) ]
                                                                              ^
[ Vercel Cron Job ] -- GET/POST --------------------------------------------+
   (declarado en vercel.json, dispara "/api/cron/run" una vez al día)
```

No hay contenedor, no hay cluster, no hay proceso que corra "siempre prendido": cada request
(manual o del cron) levanta una función, hace su trabajo, y termina.

## 2. Stack

- Frontend: React 18 + Vite. Drag-and-drop con `@dnd-kit/core` + `@dnd-kit/sortable`.
- Backend: funciones serverless de Vercel (Node 20), un archivo por endpoint bajo `/api`.
  Cliente HTTP nativo (`fetch`) para Shopify. Sin Express: no hace falta, cada función ya recibe
  `(req, res)` y Vercel resuelve el ruteo por convención de carpetas (incluso con segmentos
  dinámicos tipo `api/collection/[id]/products.js`).
- Persistencia: Supabase (Postgres). Tablas `collection_configs`, `run_logs`, `collection_locks`.
- Deploy: repo en GitHub, importado una vez en Vercel. Cada push a `main` = deploy de producción;
  cada PR = preview deploy automático (gratis, útil para probar cambios antes de mergear).

## 3. Variables de entorno

Se cargan como "Environment Variables" del proyecto en el dashboard de Vercel (no se commitea
ningún `.env`). Para desarrollo local con `vercel dev`, se copian a un `.env.local` (gitignored).

| Variable | Descripción |
|---|---|
| `SHOPIFY_SHOP` | `jack-jones-uy.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | Token offline no expirable (Authorization Code Grant) |
| `SHOPIFY_API_VERSION` | ej. `2025-10` |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (solo backend, nunca al frontend) |
| `CRON_SECRET` | Mismo nombre que reconoce Vercel: si existe, Vercel agrega automáticamente `Authorization: Bearer <valor>` en cada invocación del Cron Job |
| `PANEL_USER` / `PANEL_PASS` | Credenciales de acceso al panel (auth básica) |

No hace falta `PORT`: las funciones serverless no escuchan un puerto propio.

## 4. Modelo de datos (Supabase)

Igual que en la versión Argo/K8s, más una tabla nueva para el lock:

### `collection_configs`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `collection_gid` | text (unique) | GID completo, ej. `gid://shopify/Collection/655386214692` |
| `collection_title` | text | Cacheado para mostrar en UI |
| `product_type_order` | jsonb | Array ordenado de strings de `productType` |
| `stock_threshold` | int | Umbral. 0 = sin fondo por stock |
| `enabled` | boolean | Si entra o no en la corrida diaria |
| `updated_at` | timestamptz | |

### `run_logs`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `collection_gid` | text | |
| `status` | text | `success` / `error` / `skipped` |
| `products_count` | int | Cantidad reordenada |
| `message` | text | Detalle o error |
| `ran_at` | timestamptz | |

### `collection_locks` (nueva en esta versión — ver sección 7)

| Columna | Tipo | Notas |
|---|---|---|
| `collection_gid` | text (PK) | Una fila = un reorder en curso para esa colección |
| `locked_at` | timestamptz | Usado para expirar locks huérfanos |

## 5. Contratos de API

Mismos contratos que la versión Argo/K8s (para que el frontend no tenga que cambiar), implementados
como funciones serverless en vez de rutas de Express:

| Ruta | Archivo | Auth |
|---|---|---|
| `GET /api/collection/:id/products` | `api/collection/[id]/products.js` | Basic auth |
| `POST /api/collection/:id/reorder` | `api/collection/[id]/reorder.js` | Basic auth |
| `GET /api/configs` | `api/configs.js` | Basic auth |
| `GET /api/config/:collectionGid` | `api/config/[collectionGid].js` | Basic auth |
| `GET\|POST /api/cron/run` | `api/cron/run.js` | Cron secret (Bearer o `X-Cron-Secret`) |

Mismos payloads de request/response que `ms-autosort-by-stock/design.md` sección 5 — no se repiten acá.

## 6. Algoritmo de ordenamiento

Sin cambios respecto a la otra versión: vive en `shared/sortCollection.mjs` y
`shared/buildMoves.mjs`, funciones puras sin I/O, usadas tanto por el backend (`lib/`) como por la
vista previa del frontend. Ver `ms-autosort-by-stock/design.md` sección 6 para el detalle completo
del algoritmo (particionado por umbral, agrupación por productType, desempate por título,
manejo de productType nuevo).

## 7. Integración con Shopify y serialización

Query paginada y mutation de reorder: idénticas a la otra versión (ver
`ms-autosort-by-stock/design.md` sección 7) — mismo `lib/shopifyClient.js`, cambia únicamente el
import de la config de entorno.

### Lock de serialización (diferencia clave vs. la versión Argo/K8s)

La versión Argo/K8s usa un lock **en memoria** del proceso Node porque ese proceso vive siempre
prendido en un Pod. Acá el backend son funciones serverless: cada invocación puede correr en una
instancia distinta (o en paralelo), así que un `Set` en memoria no serializaría nada.

En su lugar, `lib/lock.js` usa una fila en Supabase:

1. Antes de intentar tomar el lock, borra cualquier lock de esa `collection_gid` con más de 5
   minutos de antigüedad (limpieza de locks huérfanos — si una función murió a mitad de camino,
   no puede dejar la colección bloqueada para siempre).
2. Intenta un `insert` en `collection_locks` con esa `collection_gid` como PK. Si falla por
   violación de unicidad (`23505`), significa que ya hay un reorder en curso → se rechaza con
   `409 LOCKED`, igual que en la otra versión.
3. Al terminar (éxito o error), borra la fila en un `finally`.

### Timeouts de las funciones serverless (limitación a tener en cuenta)

Las funciones de Vercel tienen un límite de duración (60s en el plan Hobby). `reorderCollection`
puede tardar si hay muchos lotes de 250 moves con polling de jobs. Para una colección de uso
normal (algunos cientos de productos) no debería ser problema, pero si una colección crece mucho
o el cron procesa muchas colecciones en una sola invocación, se puede pisar el límite. Mitigación
aplicada: `vercel.json` sube `maxDuration` a 60 (el máximo del plan gratuito) en los dos endpoints
que hacen el trabajo pesado (`reorder` y `cron/run`). Si esto se vuelve un problema real, es una
señal de que conviene migrar a la versión Argo/K8s (un `Job` de Kubernetes no tiene ese límite).

## 8. Scheduler: Vercel Cron Jobs

Se declara en `vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/run", "schedule": "0 6 * * *" }]
}
```

`0 6 * * *` = 6am UTC = 3am UY (ajustar si cambia el huso horario). Vercel:

1. Invoca `GET /api/cron/run` una vez al día según ese cron expression.
2. Si existe la env var `CRON_SECRET` en el proyecto, agrega automáticamente el header
   `Authorization: Bearer <CRON_SECRET>` — el endpoint lo valida.
3. No hace falta ningún proceso corriendo 24/7 esperando; Vercel se encarga de disparar el request.

Para probarlo a mano sin esperar al horario programado, el mismo endpoint acepta
`X-Cron-Secret: <CRON_SECRET>` vía `curl` o Postman (mismo mecanismo que la versión Argo/K8s).

También queda `scripts/run-cron-locally.js`, un script standalone para correr la lógica del cron
directo con `node` (sin pasar por HTTP ni por Vercel) — útil mientras se desarrolla localmente,
antes de tener el proyecto conectado a Vercel.

## 9. Manejo de errores

Igual que la otra versión (ver `ms-autosort-by-stock/design.md` sección 9): ID inválido → 400,
colección no MANUAL → aviso/skip + log, `userErrors` → no reporta éxito, throttling → backoff,
productType nuevo → se ubica al final y se loguea, token inválido (401) → mensaje explícito de
regenerar el token OAuth.

## 10. Estrategia de testing

- **Unit**: algoritmo de ordenamiento (`test/sortCollection.test.js`) y construcción de moves/lotes
  (`test/buildMoves.test.js`) — portados sin cambios de la otra versión.
- **Unit**: cliente de Shopify con `fetch` mockeado (`test/shopifyClient.test.js`).
- **Unit**: helpers de auth (`test/auth.test.js`) — verifica que basic auth y cron auth rechazan
  credenciales/headers inválidos, llamando los handlers directo con `req`/`res` simulados (no hace
  falta levantar un servidor HTTP porque ya no hay un `app.js` de Express).
- **Manual/E2E**: correr contra la colección real de prueba con pocos productos, tanto el flujo
  manual (panel en la URL de Vercel) como una corrida forzada del cron (`curl` con
  `X-Cron-Secret`), y validar visualmente en el admin de Shopify.

## 11. Deploy paso a paso

1. Crear un repo en GitHub con el contenido de esta carpeta.
2. Crear un proyecto en Supabase, correr `supabase/migrations/0001_init.sql` (SQL editor o CLI).
3. Importar el repo en Vercel ("Add New Project" → conectar GitHub). Vercel detecta Vite
   automáticamente para el frontend y toma `/api` como funciones sin configuración extra.
4. Cargar las env vars de la sección 3 en Vercel (Project Settings → Environment Variables).
5. Deploy. Probar el panel en la URL que da Vercel, hacer login con `PANEL_USER`/`PANEL_PASS`.
6. Confirmar que `vercel.json` quedó activo en Project Settings → Cron Jobs (Vercel lo detecta
   solo al hacer deploy si el archivo existe en la raíz del repo).
