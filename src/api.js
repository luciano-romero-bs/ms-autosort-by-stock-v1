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

export function fetchCollectionProducts(id) {
  return apiFetch(`/api/collection/${id}/products`);
}

export function reorderCollection(id, { productTypeOrder, stockThreshold, save }) {
  return apiFetch(`/api/collection/${id}/reorder`, {
    method: "POST",
    body: JSON.stringify({ productTypeOrder, stockThreshold, save }),
  });
}

export function fetchConfig(collectionGid) {
  return apiFetch(`/api/config/${encodeURIComponent(collectionGid)}`);
}
