#!/usr/bin/env node
// Diagnostica por qué una colección nueva no aparece en el panel.
// Para cada tienda guardada en Supabase pregunta a Shopify (a) a qué shop
// pertenece realmente el token, (b) cuántas colecciones devuelve el listado,
// y (c) si el ID que le pasás existe en esa tienda. Después compara contra lo
// que hay cacheado en `store_collections`, para separar "Shopify no lo
// devuelve" de "la caché quedó vieja".
//
//   node --env-file=.env.local scripts/diagnose-collections.js 655386214692 "Remeras"
//
// Ambos argumentos son opcionales. El segundo busca por título, para detectar
// el caso en que la colección existe pero con un ID distinto al de la URL.
import { shopifyGraphQL, listCollections, toCollectionGid } from "../lib/shopifyClient.js";
import { listStoresInternal, listStoreCollections } from "../lib/supabaseClient.js";

const collectionId = process.argv[2];

if (collectionId && !/^\d+$/.test(collectionId)) {
  console.error(`ID inválido: "${collectionId}". Tiene que ser el número que sale en la URL del admin.`);
  process.exit(1);
}

const titleFragment = process.argv[3];

const SHOP_QUERY = `query { shop { name myshopifyDomain } }`;
const ONE_COLLECTION_QUERY = `
  query($id: ID!) {
    collection(id: $id) { id title sortOrder productsCount { count } }
  }
`;
// Los scopes que Shopify le concedió a ESTE token. Si falta read_products,
// o si la app quedó instalada con menos permisos de los que creés, sale acá.
const SCOPES_QUERY = `
  query { currentAppInstallation { accessScopes { handle } } }
`;
// Las colecciones más nuevas primero. Si la colección existe en el admin pero
// no aparece en este top, el token no la está viendo en el listado.
const NEWEST_QUERY = `
  query {
    collections(first: 10, sortKey: ID, reverse: true) {
      nodes { id title }
    }
  }
`;

const stores = await listStoresInternal();
console.log(`Tiendas guardadas: ${stores.length}\n`);

let found = false;

for (const row of stores) {
  const store = {
    shopDomain: row.shop_domain,
    adminToken: row.admin_token,
    apiVersion: row.api_version,
  };

  console.log(`=== ${row.display_name} (slug: ${row.slug})`);
  console.log(`    shop_domain : ${store.shopDomain}`);
  console.log(`    api_version : ${store.apiVersion}`);
  console.log(`    admin_token : ${store.adminToken ? `${store.adminToken.slice(0, 8)}… (${store.adminToken.length} chars)` : "AUSENTE"}`);

  // (a) ¿A qué tienda pertenece el token de verdad? Si no coincide con
  // shop_domain, el panel está hablando con otra tienda que la que creés.
  try {
    const { shop } = await shopifyGraphQL(SHOP_QUERY, {}, store);
    const mismatch = shop.myshopifyDomain !== store.shopDomain;
    console.log(`    token vive en: ${shop.name} / ${shop.myshopifyDomain}${mismatch ? "   <-- NO COINCIDE con shop_domain" : ""}`);
  } catch (err) {
    console.log(`    ✖ Shopify rechazó el token: ${err.message}`);
    console.log("");
    continue;
  }

  // (a2) Permisos concedidos a este token.
  try {
    const { currentAppInstallation } = await shopifyGraphQL(SCOPES_QUERY, {}, store);
    const scopes = (currentAppInstallation?.accessScopes ?? []).map((s) => s.handle);
    console.log(`    scopes      : ${scopes.join(", ") || "(ninguno)"}`);
    if (!scopes.includes("read_products")) {
      console.log("       <-- FALTA read_products: sin ese scope Shopify no devuelve colecciones.");
    }
  } catch (err) {
    console.log(`    scopes      : no se pudieron leer (${err.message})`);
  }

  // (a3) Las 10 colecciones más nuevas según Shopify. Si la que buscás existe
  // en el admin pero no está acá, el problema es de visibilidad, no de ID.
  try {
    const { collections } = await shopifyGraphQL(NEWEST_QUERY, {}, store);
    console.log("    colecciones más nuevas según Shopify:");
    for (const c of collections.nodes) {
      console.log(`       · ${c.id.split("/").pop()}  ${c.title}`);
    }
  } catch (err) {
    console.log(`    ✖ Falló el listado de más nuevas: ${err.message}`);
  }

  // (b) Listado completo vs. lo cacheado en Supabase.
  let fresh = [];
  try {
    fresh = await listCollections(store);
    console.log(`    colecciones en Shopify : ${fresh.length}`);
  } catch (err) {
    console.log(`    ✖ Falló listCollections: ${err.message}`);
    console.log("       (si menciona productsCount, la api_version es anterior a 2024-04)");
  }

  try {
    const cached = await listStoreCollections(row.id);
    console.log(`    colecciones cacheadas  : ${cached.length}`);
    if (fresh.length) {
      const cachedGids = new Set(cached.map((c) => c.collection_gid));
      const missing = fresh.filter((c) => !cachedGids.has(c.id));
      if (missing.length) {
        console.log(`    -> ${missing.length} en Shopify que NO están cacheadas (falta un "Refrescar colecciones"):`);
        for (const c of missing.slice(0, 10)) console.log(`       · ${c.title} (${c.id.split("/").pop()})`);
      }
    }
  } catch (err) {
    console.log(`    ✖ Falló la lectura de la caché: ${err.message}`);
  }

  // (b2) Buscar por título. Si la colección aparece acá pero con OTRO ID, el
  // número de la URL del admin no es el que hay que usar.
  if (titleFragment && fresh.length) {
    const needle = titleFragment.toLowerCase();
    const matches = fresh.filter((c) => c.title.toLowerCase().includes(needle));
    if (matches.length) {
      console.log(`    títulos que contienen "${titleFragment}":`);
      for (const c of matches) {
        const id = c.id.split("/").pop();
        console.log(`       · ${id}  ${c.title}${collectionId && id !== collectionId ? "   <-- ID DISTINTO al que buscás" : ""}`);
      }
    } else {
      console.log(`    ningún título contiene "${titleFragment}" en esta tienda.`);
    }
  }

  // (c) El ID puntual que no te carga.
  if (collectionId) {
    try {
      const data = await shopifyGraphQL(ONE_COLLECTION_QUERY, { id: toCollectionGid(collectionId) }, store);
      if (data.collection) {
        found = true;
        console.log(`    ✔ La colección ${collectionId} EXISTE acá: "${data.collection.title}" · orden ${data.collection.sortOrder} · ${data.collection.productsCount?.count ?? "?"} productos`);
        if (data.collection.sortOrder !== "MANUAL") {
          console.log('       Ojo: no está en orden "Manual", la corrida diaria la saltea.');
        }
      } else {
        console.log(`    ✖ La colección ${collectionId} no existe en esta tienda.`);
      }
    } catch (err) {
      console.log(`    ✖ Error consultando la colección ${collectionId}: ${err.message}`);
    }
  }

  console.log("");
}

if (collectionId) {
  console.log(
    found
      ? "Resultado: la colección existe. Si el panel dice que no, tenés seleccionada otra tienda."
      : "Resultado: ninguna de las tiendas configuradas ve esa colección. Revisá que el ID sea el correcto y que la tienda donde la creaste esté cargada en el panel."
  );
}
