import { shopifyGraphQL, listCollections, toCollectionGid } from "../../../lib/shopifyClient.js";
import { getStoreBySlug, listStoreCollections } from "../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../lib/auth.js";

// GET /api/store/:storeSlug/diagnose?collectionId=123&title=remeras
//
// Solo lectura. Le pregunta a Shopify, con el MISMO token guardado que usa el
// panel, quién es esa tienda realmente, qué permisos tiene el token, cuáles
// son las colecciones más nuevas que ve, y si una colección puntual existe.
// Sirve para separar "Shopify no la devuelve" de "el ID no es el que creo".
//
// Cada consulta va en su propio try/catch: si una falla, el resto igual
// responde, que es justo lo que hace falta cuando no sabés dónde está el problema.
const SHOP_QUERY = `query { shop { name myshopifyDomain } }`;
const SCOPES_QUERY = `query { currentAppInstallation { accessScopes { handle } } }`;
const NEWEST_QUERY = `
  query {
    collections(first: 10, sortKey: ID, reverse: true) {
      nodes { id title updatedAt }
    }
  }
`;
const ONE_COLLECTION_QUERY = `
  query($id: ID!) {
    collection(id: $id) { id title sortOrder updatedAt productsCount { count } }
  }
`;

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  const { storeSlug, collectionId, title } = req.query;

  if (collectionId && !/^\d+$/.test(collectionId)) {
    return res.status(400).json({ ok: false, error: "collectionId debe ser numérico." });
  }

  const storeRow = await getStoreBySlug(storeSlug);
  if (!storeRow) return res.status(404).json({ ok: false, error: `No existe la tienda "${storeSlug}".` });

  const store = {
    shopDomain: storeRow.shop_domain,
    adminToken: storeRow.admin_token,
    apiVersion: storeRow.api_version,
  };

  const out = {
    ok: true,
    configurado: {
      slug: storeRow.slug,
      shopDomain: store.shopDomain,
      apiVersion: store.apiVersion,
      tokenPrefijo: store.adminToken ? `${store.adminToken.slice(0, 8)}…` : null,
      tokenLargo: store.adminToken?.length ?? 0,
    },
  };

  // ¿A qué tienda pertenece el token de verdad?
  const shop = await attempt(() => shopifyGraphQL(SHOP_QUERY, {}, store));
  out.shopSegunShopify = shop.ok
    ? { nombre: shop.value.shop.name, dominio: shop.value.shop.myshopifyDomain, coincide: shop.value.shop.myshopifyDomain === store.shopDomain }
    : { error: shop.error };

  // ¿Qué permisos le concedió Shopify a este token?
  const scopes = await attempt(() => shopifyGraphQL(SCOPES_QUERY, {}, store));
  out.scopes = scopes.ok
    ? (scopes.value.currentAppInstallation?.accessScopes ?? []).map((s) => s.handle)
    : { error: scopes.error };

  // Las 10 más nuevas por ID. Si la que buscás no está acá pero existe en el
  // admin, Shopify no se la está mostrando a este token.
  const newest = await attempt(() => shopifyGraphQL(NEWEST_QUERY, {}, store));
  out.masNuevasSegunShopify = newest.ok
    ? newest.value.collections.nodes.map((c) => ({
        id: c.id.split("/").pop(),
        title: c.title,
        updatedAt: c.updatedAt,
      }))
    : { error: newest.error };

  // Totales: lo que Shopify lista vs lo que hay cacheado en Supabase.
  const full = await attempt(() => listCollections(store));
  const cached = await attempt(() => listStoreCollections(storeRow.id));
  out.totales = {
    shopify: full.ok ? full.value.length : { error: full.error },
    cacheadas: cached.ok ? cached.value.length : { error: cached.error },
  };

  if (full.ok) {
    const ids = full.value.map((c) => Number(c.id.split("/").pop())).filter(Number.isFinite);
    // Si el ID más alto que ve Shopify es menor al que buscás, su vista del
    // catálogo está cortada en el tiempo, no es un problema de esa colección.
    out.idMasAltoQueVeShopify = ids.length ? String(Math.max(...ids)) : null;
  }

  // Búsqueda por título: detecta que la colección exista pero con otro ID.
  if (title && full.ok) {
    const needle = title.toLowerCase();
    out.porTitulo = full.value
      .filter((c) => c.title.toLowerCase().includes(needle))
      .map((c) => ({ id: c.id.split("/").pop(), title: c.title }));
  }

  // La colección puntual, por consulta directa (no pasa por ningún listado).
  if (collectionId) {
    const one = await attempt(() => shopifyGraphQL(ONE_COLLECTION_QUERY, { id: toCollectionGid(collectionId) }, store));
    if (!one.ok) {
      out.coleccionBuscada = { id: collectionId, error: one.error };
    } else if (!one.value.collection) {
      out.coleccionBuscada = { id: collectionId, existe: false, enElListado: false };
    } else {
      const c = one.value.collection;
      out.coleccionBuscada = {
        id: collectionId,
        existe: true,
        title: c.title,
        sortOrder: c.sortOrder,
        updatedAt: c.updatedAt,
        productos: c.productsCount?.count ?? null,
        enElListado: full.ok ? full.value.some((x) => x.id === c.id) : null,
      };
    }
  }

  res.status(200).json(out);
}
