# Ordenador de colecciones (Shopify) — versión simple: Vercel + Supabase

Misma app que `../ms-autosort-by-stock` (reordena una colección de Shopify agrupando por
`productType` y ordenando por stock), pero pensada para subirse en minutos vía GitHub → Vercel,
sin Docker/Kubernetes/Argo CD. Es **multi-tienda**: un solo deploy maneja varias tiendas de
Shopify, cada una con su propio dominio y token, dados de alta desde el propio panel (sin
redeployar). Ver `design.md` para el porqué y el detalle de arquitectura, `requirements.md` para
el detalle funcional, y `tasks.md` para el estado de implementación.

## Estructura

```
api/           funciones serverless de Vercel (un archivo = un endpoint)
lib/           lógica de backend (Shopify, Supabase, algoritmo de lock)
shared/        algoritmo puro de ordenamiento (usado por backend y por la preview del frontend)
src/           frontend React + Vite (panel)
supabase/      migración SQL
test/          tests unitarios (node --test)
scripts/       script para correr el cron a mano en local, sin pasar por HTTP
```

## Requisitos previos

- Node 20+.
- Una cuenta de Supabase (gratis) y un proyecto creado.
- El token de Admin API de Shopify de cada tienda que vayas a sumar — el mismo tipo de token que
  ya se usa en `ms-autosort-by-stock`, se puede reutilizar tal cual, es independiente del método
  de deploy. A diferencia de esa versión, acá el token no va en una env var: se carga por tienda
  desde el panel una vez deployado (ver "Gestión de tiendas" en `design.md` sección 5).
- Una cuenta de Vercel (gratis) para el paso de deploy.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con los valores reales
npm test                     # corre los tests unitarios (no necesita red)
npm run build                # build de producción del frontend (Vite)
```

Para probar también las funciones `/api` en local (no solo el frontend), usar la CLI de Vercel,
que sirve `/api` y el frontend juntos en un mismo puerto, igual que en producción:

```bash
npx vercel dev
```

La primera vez te va a pedir loguearte con una cuenta de Vercel y linkear el proyecto — no hace
falta tenerlo importado todavía, `vercel dev` lo linkea al vuelo.

Para probar la corrida diaria sin depender de Vercel Cron ni de HTTP:

```bash
npm run cron:local
```

## Supabase: crear las tablas

En el SQL Editor del proyecto de Supabase, correr en orden `supabase/migrations/0001_init.sql` y
luego `0002_multi_store.sql`. Crea `stores`, `collection_configs`, `run_logs` y `collection_locks`.

## Deploy

1. Crear un repo de GitHub con el contenido de esta carpeta y pushearlo.
2. En Vercel: "Add New Project" → importar ese repo. Vercel detecta Vite solo.
3. Cargar las env vars (Project Settings → Environment Variables) — ver la tabla en `design.md`
   sección 3 (ya no incluyen credenciales de Shopify). Sin esto el deploy funciona pero cualquier
   request a `/api/*` va a fallar al leer `process.env`.
4. Deploy. La URL que da Vercel ya sirve el panel (`/`) y las funciones (`/api/...`) juntas.
5. Entrar al panel, loguearse, y usar "+ Agregar tienda" para dar de alta cada tienda de Shopify
   (dominio + admin token). Ver `design.md` sección 5.
6. Confirmar en Project Settings → Cron Jobs que aparece el cron de `/api/cron/run` (se activa
   solo por tener `vercel.json` en la raíz).

Detalle paso a paso en `design.md` sección 12.

## Diferencias a tener en cuenta frente a la versión Argo CD/K8s

- Esta versión es multi-tienda (ver `design.md` sección 5); la versión Argo/K8s es mono-tienda
  (una sola `SHOPIFY_SHOP`/`SHOPIFY_ADMIN_TOKEN` por env vars).
- El lock de serialización (para no reordenar la misma colección dos veces en simultáneo) vive en
  una tabla de Supabase, no en memoria — ver `design.md` sección 8.
- Las funciones serverless tienen un límite de duración (60s en el plan gratis de Vercel). Para
  colecciones muy grandes o muchas tiendas/colecciones configuradas a la vez, esto podría no
  alcanzar; ver `design.md` sección 8. La versión Argo/K8s no tiene ese límite.
- No hay contenedor ni proceso corriendo 24/7: cada request levanta la función, la ejecuta, y listo.
