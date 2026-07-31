// Resolución de la versión de la Admin API.
//
// Por qué esto existe: una versión vieja no ve las colecciones creadas con el
// modelo de datos del admin nuevo, y no lo avisa — para esa versión
// directamente no existen (ausentes del listado, null por id, null en `node`,
// y ni siquiera contadas por `collectionsCount`). Como Shopify saca una
// versión por trimestre, cualquier valor fijo se vuelve viejo solo.
//
// Tampoco sirve mandar un handle mágico: ante uno desconocido Shopify no
// falla, cae a la versión soportada MÁS VIEJA, que es el peor resultado
// posible. Así que hay que preguntarle qué versiones soporta y elegir.

import { shopifyGraphQL } from "./shopifyClient.js";

// Piso, y fallback cuando no se puede consultar a Shopify.
export const DEFAULT_API_VERSION = "2026-07";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

/**
 * De una lista de handles devuelve el estable más nuevo. Descarta `unstable`
 * y cualquier cosa que no sea YYYY-MM; al ser de ancho fijo, el orden
 * lexicográfico coincide con el cronológico.
 */
export function pickNewestStable(handles) {
  const stable = (handles ?? []).filter((h) => /^\d{4}-\d{2}$/.test(h));
  if (!stable.length) return null;
  return stable.sort().at(-1);
}

// Se consulta por GraphQL y no por el `api_versions.json` de REST: esa Admin
// API está siendo retirada y el endpoint devuelve 404, que fue justamente lo
// que hacía fallar la detección en silencio y volver al piso.
const VERSIONS_QUERY = `query { publicApiVersions { handle supported } }`;

/** Los handles que la tienda soporta hoy, según la propia Shopify. */
export async function fetchSupportedVersions(store) {
  const data = await shopifyGraphQL(VERSIONS_QUERY, {}, store);
  const versions = data.publicApiVersions ?? [];
  if (!versions.length) throw new Error("Shopify no devolvió versiones de API.");
  return versions.filter((v) => v.supported).map((v) => v.handle);
}

/**
 * La versión estable más nueva que soporta esa tienda, cacheada 6hs por
 * proceso. Si no se puede averiguar, cae a `fallback` (lo guardado en la
 * tabla `stores`) y después a DEFAULT_API_VERSION: es preferible seguir
 * andando con una versión conocida que romper toda la corrida.
 */
export async function resolveApiVersion(shopDomain, adminToken, fallback) {
  const cached = cache.get(shopDomain);
  if (cached && cached.expiresAt > Date.now()) return cached.version;

  const floor = fallback || DEFAULT_API_VERSION;
  try {
    // La consulta se hace contra el piso, que sabemos que responde.
    const handles = await fetchSupportedVersions({ shopDomain, adminToken, apiVersion: floor });
    const newest = pickNewestStable(handles);
    if (newest) {
      // Nunca retroceder respecto de lo configurado: si la lista viniera
      // recortada, quedarse con la más alta de las dos.
      const version = newest > floor ? newest : floor;
      cache.set(shopDomain, { version, expiresAt: Date.now() + CACHE_TTL_MS });
      return version;
    }
  } catch (err) {
    console.warn(`[apiVersion] ${shopDomain}: no se pudo resolver (${err.message}), se usa ${floor}.`);
  }
  return floor;
}

/**
 * Arma el objeto `store` que esperan shopifyClient/reorderService a partir de
 * una fila de la tabla `stores`, resolviendo la versión de API. `api_version`
 * de la fila pasa a ser el piso/fallback, no el valor final.
 */
export async function buildStore(storeRow) {
  return {
    id: storeRow.id,
    slug: storeRow.slug,
    shopDomain: storeRow.shop_domain,
    adminToken: storeRow.admin_token,
    apiVersion: await resolveApiVersion(storeRow.shop_domain, storeRow.admin_token, storeRow.api_version),
  };
}
