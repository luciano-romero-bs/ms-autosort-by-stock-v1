const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a GraphQL request to a store's Shopify Admin API. `store` must have
 * shopDomain, adminToken and apiVersion (see lib/supabaseClient.js#getStoreBySlug)
 * — there's no global fallback, since this app talks to many stores at once.
 * Retries on throttling (429 / THROTTLED errors) with exponential backoff.
 */
export async function shopifyGraphQL(query, variables, store) {
  const url = `https://${store.shopDomain}/admin/api/${store.apiVersion}/graphql.json`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": store.adminToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 401) {
      throw new Error(
        `Shopify respondió 401 (token inválido o revocado) para ${store.shopDomain}. Hay que regenerar el token de esa tienda.`
      );
    }

    if (response.status === 429) {
      if (attempt === MAX_RETRIES) throw new Error("Shopify throttling: se agotaron los reintentos.");
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      continue;
    }

    const body = await response.json();

    const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled) {
      if (attempt === MAX_RETRIES) throw new Error("Shopify throttling: se agotaron los reintentos.");
      await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      continue;
    }

    if (body.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
    }

    return body.data;
  }

  throw new Error("Shopify throttling: se agotaron los reintentos.");
}

export function toCollectionGid(numericId) {
  return `gid://shopify/Collection/${numericId}`;
}

const COLLECTION_PRODUCTS_QUERY = `
  query($id: ID!, $cursor: String) {
    collection(id: $id) {
      title
      sortOrder
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          totalInventory
          productType
          featuredImage {
            url(transform: { maxWidth: 200, maxHeight: 200 })
            altText
          }
        }
      }
    }
  }
`;

/**
 * Fetches a collection's title, sortOrder and every product (paginated)
 * from the given store.
 */
export async function getCollectionProducts(collectionGid, store) {
  let cursor = null;
  let hasNextPage = true;
  let title = null;
  let sortOrder = null;
  const products = [];

  while (hasNextPage) {
    const data = await shopifyGraphQL(COLLECTION_PRODUCTS_QUERY, { id: collectionGid, cursor }, store);

    if (!data.collection) {
      throw new Error("La colección no existe.");
    }

    title = data.collection.title;
    sortOrder = data.collection.sortOrder;
    products.push(...data.collection.products.nodes);

    hasNextPage = data.collection.products.pageInfo.hasNextPage;
    cursor = data.collection.products.pageInfo.endCursor;
  }

  return {
    title,
    sortOrder,
    isManual: sortOrder === "MANUAL",
    products,
  };
}

const COLLECTIONS_QUERY = `
  query($cursor: String) {
    collections(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title sortOrder productsCount { count } }
    }
  }
`;

/**
 * Fetches every collection of the store (paginated): id, title, sortOrder
 * and product count. Used by the on-demand sync that detects collections
 * without an automation.
 */
export async function listCollections(store) {
  let cursor = null;
  let hasNextPage = true;
  const collections = [];

  while (hasNextPage) {
    const data = await shopifyGraphQL(COLLECTIONS_QUERY, { cursor }, store);

    for (const node of data.collections.nodes) {
      collections.push({
        id: node.id,
        title: node.title,
        sortOrder: node.sortOrder,
        productsCount: node.productsCount?.count ?? null,
      });
    }

    hasNextPage = data.collections.pageInfo.hasNextPage;
    cursor = data.collections.pageInfo.endCursor;
  }

  return collections;
}

const REORDER_MUTATION = `
  mutation($id: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $id, moves: $moves) {
      job { id }
      userErrors { field message }
    }
  }
`;

const JOB_QUERY = `
  query($id: ID!) {
    job(id: $id) { id done }
  }
`;

async function pollJob(jobId, store, { intervalMs = 500, timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await shopifyGraphQL(JOB_QUERY, { id: jobId }, store);
    if (data.job?.done) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timeout esperando a que termine el job ${jobId}.`);
}

/**
 * Sends collectionReorderProducts in batches of <=250 moves, polling each
 * job to completion before sending the next batch (positions are absolute
 * and relative to current collection state).
 */
export async function reorderCollection(collectionGid, moveBatches, store) {
  for (const batch of moveBatches) {
    const data = await shopifyGraphQL(REORDER_MUTATION, { id: collectionGid, moves: batch }, store);
    const userErrors = data.collectionReorderProducts?.userErrors ?? [];
    if (userErrors.length) {
      throw new Error(`Shopify userErrors: ${userErrors.map((e) => e.message).join("; ")}`);
    }

    const jobId = data.collectionReorderProducts?.job?.id;
    if (jobId) {
      await pollJob(jobId, store);
    }
  }
}
