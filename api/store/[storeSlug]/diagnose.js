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
// Total autoritativo según Shopify. Si no coincide con el largo del listado,
// el problema está en la conexión `collections`, no en los permisos.
const COUNT_QUERY = `query { collectionsCount { count precision } }`;
// Búsqueda del lado de Shopify (no filtrando en JS): si la colección aparece
// acá con otro ID, el número de la URL del admin no es el GID que hay que usar.
const SEARCH_QUERY = `
  query($q: String!) {
    collections(first: 20, query: $q) { nodes { id title updatedAt } }
  }
`;
// ¿El GID resuelve a algo, sea del tipo que sea?
const NODE_QUERY = `query($id: ID!) { node(id: $id) { id __typename } }`;

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

  const { storeSlug, collectionId, title, apiVersion } = req.query;

  if (apiVersion && !/^\d{4}-\d{2}$|^unstable$/.test(apiVersion)) {
    return res.status(400).json({ ok: false, error: "apiVersion debe ser YYYY-MM o 'unstable'." });
  }

  if (collectionId && !/^\d+$/.test(collectionId)) {
    return res.status(400).json({ ok: false, error: "collectionId debe ser numérico." });
  }

  const storeRow = await getStoreBySlug(storeSlug);
  if (!storeRow) return res.status(404).json({ ok: false, error: `No existe la tienda "${storeSlug}".` });

  // ?apiVersion= permite probar otra versión sin tocar la config de la tienda:
  // una colección creada con features nuevas puede no ser representable (y por
  // lo tanto no existir) en una versión de API vieja.
  const store = {
    shopDomain: storeRow.shop_domain,
    adminToken: storeRow.admin_token,
    apiVersion: apiVersion || storeRow.api_version,
  };

  const out = {
    ok: true,
    configurado: {
      slug: storeRow.slug,
      shopDomain: store.shopDomain,
      apiVersionGuardada: storeRow.api_version,
      apiVersionUsadaEnEstaConsulta: store.apiVersion,
      tokenPrefijo: store.adminToken ? `${store.adminToken.slice(0, 8)}…` : null,
      tokenLargo: store.adminToken?.length ?? 0,
    },
  };

  // Qué versiones soporta hoy esta tienda, según la propia Shopify.
  const versions = await attempt(async () => {
    // La ruta sin versionar devuelve 404 en tiendas nuevas; se prueban las dos.
    const paths = [`/admin/api/${store.apiVersion}/api_versions.json`, "/admin/api/api_versions.json"];
    let lastStatus = null;
    for (const path of paths) {
      const resp = await fetch(`https://${store.shopDomain}${path}`, {
        headers: { "X-Shopify-Access-Token": store.adminToken },
      });
      if (resp.ok) return resp.json();
      lastStatus = resp.status;
    }
    throw new Error(`HTTP ${lastStatus}`);
  });
  out.versionesSoportadas = versions.ok
    ? (versions.value.api_versions ?? []).filter((v) => v.supported).map((v) => v.handle)
    : { error: versions.error };

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

  // Total autoritativo. Si Shopify dice 122 y el listado trajo 121, el que
  // está fallando es el listado y no hay problema de permisos.
  const count = await attempt(() => shopifyGraphQL(COUNT_QUERY, {}, store));
  out.totales.segunCollectionsCount = count.ok
    ? { count: count.value.collectionsCount?.count, precision: count.value.collectionsCount?.precision }
    : { error: count.error };

  // Búsqueda por título: en el listado que ya trajimos y, por separado, contra
  // el buscador de Shopify (que usa otro índice).
  if (title) {
    if (full.ok) {
      const needle = title.toLowerCase();
      out.porTituloEnElListado = full.value
        .filter((c) => c.title.toLowerCase().includes(needle))
        .map((c) => ({ id: c.id.split("/").pop(), title: c.title }));
    }
    const search = await attempt(() => shopifyGraphQL(SEARCH_QUERY, { q: title }, store));
    out.porTituloSegunShopify = search.ok
      ? search.value.collections.nodes.map((c) => ({
          id: c.id.split("/").pop(),
          title: c.title,
          updatedAt: c.updatedAt,
        }))
      : { error: search.error };
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

    // ¿El GID resuelve a algo? Si `node` devuelve un __typename distinto de
    // Collection, el número de la URL no es el de una colección.
    const node = await attempt(() => shopifyGraphQL(NODE_QUERY, { id: toCollectionGid(collectionId) }, store));
    out.coleccionBuscada.node = node.ok
      ? node.value.node
        ? { tipo: node.value.node.__typename }
        : "null (el GID no resuelve a nada)"
      : { error: node.error };
  }

  res.status(200).json(out);
}
