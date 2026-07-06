const AUTH_KEY = "collection-sorter-auth";

function buildBasicAuthHeader(user, pass) {
  return "Basic " + btoa(`${user}:${pass}`);
}

export function isLoggedIn() {
  return Boolean(sessionStorage.getItem(AUTH_KEY));
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}

export async function login(user, pass) {
  const header = buildBasicAuthHeader(user, pass);
  const res = await fetch("/api/configs", { headers: { Authorization: header } });
  if (res.status === 401) throw new Error("Usuario o clave incorrectos.");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al iniciar sesión.`);
  }
  sessionStorage.setItem(AUTH_KEY, header);
}

async function apiFetch(path, options = {}) {
  const auth = sessionStorage.getItem(AUTH_KEY);
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(auth ? { Authorization: auth } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    logout();
    const err = new Error("Sesión inválida. Volvé a iniciar sesión.");
    err.status = 401;
    throw err;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Error ${res.status}`);
  }
  return body;
}

export function fetchStores() {
  return apiFetch(`/api/stores`);
}

export function createStore({ slug, displayName, shopDomain, adminToken, apiVersion }) {
  return apiFetch(`/api/stores`, {
    method: "POST",
    body: JSON.stringify({ slug, displayName, shopDomain, adminToken, apiVersion }),
  });
}

export function fetchCollectionProducts(storeSlug, id) {
  return apiFetch(`/api/store/${storeSlug}/collection/${id}/products`);
}

export function reorderCollection(storeSlug, id, { productTypeOrder, stockThreshold, save }) {
  return apiFetch(`/api/store/${storeSlug}/collection/${id}/reorder`, {
    method: "POST",
    body: JSON.stringify({ productTypeOrder, stockThreshold, save }),
  });
}

export function fetchConfig(storeSlug, collectionGid) {
  return apiFetch(`/api/store/${storeSlug}/config/${encodeURIComponent(collectionGid)}`);
}

export function fetchStoreConfigs(storeSlug) {
  return apiFetch(`/api/store/${storeSlug}/configs`);
}

export function saveConfig(storeSlug, collectionGid, { collectionTitle, productTypeOrder, stockThreshold, enabled, newProductTypes }) {
  return apiFetch(`/api/store/${storeSlug}/config/${encodeURIComponent(collectionGid)}`, {
    method: "PUT",
    body: JSON.stringify({ collectionTitle, productTypeOrder, stockThreshold, enabled, newProductTypes }),
  });
}

export function deleteConfig(storeSlug, collectionGid) {
  return apiFetch(`/api/store/${storeSlug}/config/${encodeURIComponent(collectionGid)}`, {
    method: "DELETE",
  });
}

export function fetchStoreCollections(storeSlug) {
  return apiFetch(`/api/store/${storeSlug}/collections`);
}

export function syncStoreCollections(storeSlug) {
  return apiFetch(`/api/store/${storeSlug}/collections`, { method: "POST" });
}

export function setCollectionIgnored(storeSlug, collectionGid, ignored) {
  return apiFetch(`/api/store/${storeSlug}/collections/${encodeURIComponent(collectionGid)}`, {
    method: "PATCH",
    body: JSON.stringify({ ignored }),
  });
}
