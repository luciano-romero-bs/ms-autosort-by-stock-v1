import { useEffect, useState } from "react";
import { fetchStores, createStore, updateStore, deleteStore } from "../api.js";

// Ver lib/supabaseClient.js#DEFAULT_API_VERSION: una versión vieja no ve las
// colecciones creadas con el admin nuevo, así que conviene no quedarse atrás.
const DEFAULT_API_VERSION = "2026-07";

const EMPTY_FORM = { slug: "", displayName: "", shopDomain: "", adminToken: "", apiVersion: DEFAULT_API_VERSION };
const EMPTY_EDIT_FORM = { displayName: "", shopDomain: "", adminToken: "", apiVersion: DEFAULT_API_VERSION };

export default function StoreSelector({ storeSlug, onChange }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const currentStore = stores.find((s) => s.slug === storeSlug) || null;

  async function load(selectSlug) {
    setLoading(true);
    setLoadError(null);
    try {
      const { stores } = await fetchStores();
      setStores(stores);
      if (selectSlug) onChange(selectSlug);
      else if (storeSlug && !stores.some((s) => s.slug === storeSlug)) {
        // The previously selected store is gone (e.g. just deleted it).
        onChange(stores.length ? stores[0].slug : null);
      } else if (!storeSlug && stores.length) {
        onChange(stores[0].slug);
      }
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddStore(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const { store } = await createStore(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load(store.slug);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditing() {
    if (!currentStore) return;
    setEditForm({
      displayName: currentStore.display_name,
      shopDomain: currentStore.shop_domain,
      adminToken: "",
      apiVersion: currentStore.api_version || DEFAULT_API_VERSION,
    });
    setEditError(null);
    setEditing(true);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      await updateStore(storeSlug, editForm);
      setEditing(false);
      await load(storeSlug);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (!currentStore) return;
    const ok = window.confirm(
      `¿Eliminar la tienda "${currentStore.display_name}"?\n\n` +
        `Esto borra también todas sus automatizaciones, logs y colecciones sincronizadas. ` +
        `No se puede deshacer.`
    );
    if (!ok) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteStore(storeSlug);
      setEditing(false);
      await load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="store-selector">
      <label>
        Tienda
        <select
          value={storeSlug || ""}
          onChange={(e) => {
            setEditing(false);
            onChange(e.target.value);
          }}
          disabled={loading || !stores.length}
        >
          {!stores.length && <option value="">(sin tiendas cargadas)</option>}
          {stores.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.display_name}
            </option>
          ))}
        </select>
      </label>
      {loadError && <p className="error-text" role="alert">✖ {loadError}</p>}
      {deleteError && <p className="error-text" role="alert">✖ {deleteError}</p>}

      <div className="store-selector-actions">
        <button type="button" className="link-button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancelar" : "+ Agregar tienda"}
        </button>
        {currentStore && !editing && (
          <>
            <button type="button" className="link-button" onClick={startEditing}>
              Editar tienda
            </button>
            <button type="button" className="link-button danger-link" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Eliminar tienda"}
            </button>
          </>
        )}
      </div>

      {showForm && (
        <form className="store-form" onSubmit={handleAddStore}>
          <label>
            Identificador (slug)
            <input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="jack-jones-dev"
              required
            />
          </label>
          <label>
            Nombre para mostrar
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              placeholder="Jack & Jones Dev"
              required
            />
          </label>
          <label>
            Dominio myshopify.com
            <input
              value={form.shopDomain}
              onChange={(e) => setForm({ ...form, shopDomain: e.target.value })}
              placeholder="jack-jones-dev.myshopify.com"
              required
            />
          </label>
          <label>
            Admin API access token
            <input
              type="password"
              value={form.adminToken}
              onChange={(e) => setForm({ ...form, adminToken: e.target.value })}
              required
            />
          </label>
          {saveError && <p className="error-text" role="alert">✖ {saveError}</p>}
          <button type="submit" className="primary" disabled={saving}>
            {saving ? "Guardando..." : "Guardar tienda"}
          </button>
        </form>
      )}

      {editing && currentStore && (
        <form className="store-form" onSubmit={handleEditSubmit}>
          <h4>Editar "{currentStore.display_name}"</h4>
          <label>
            Nombre para mostrar
            <input
              value={editForm.displayName}
              onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
              required
            />
          </label>
          <label>
            Dominio myshopify.com
            <input
              value={editForm.shopDomain}
              onChange={(e) => setEditForm({ ...editForm, shopDomain: e.target.value })}
              required
            />
          </label>
          <label>
            Versión de API (mínima)
            <input
              value={editForm.apiVersion}
              onChange={(e) => setEditForm({ ...editForm, apiVersion: e.target.value })}
              placeholder={DEFAULT_API_VERSION}
            />
            <small>
              La app usa la versión estable más nueva que soporte la tienda. Este valor es el piso,
              por si Shopify no responde qué versiones soporta.
            </small>
          </label>
          <label>
            Admin API access token
            <input
              type="password"
              value={editForm.adminToken}
              onChange={(e) => setEditForm({ ...editForm, adminToken: e.target.value })}
              placeholder="Dejar en blanco para no cambiarlo"
            />
          </label>
          {editError && <p className="error-text" role="alert">✖ {editError}</p>}
          <div className="automation-actions">
            <button type="submit" className="primary" disabled={editSaving}>
              {editSaving ? "Guardando..." : "Guardar cambios"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={editSaving}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
