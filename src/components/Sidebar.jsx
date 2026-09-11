import { useEffect, useState } from "react";
import { fetchStores, createStore, updateStore, deleteStore } from "../api.js";

// Ver lib/supabaseClient.js#DEFAULT_API_VERSION: una versión vieja no ve las
// colecciones creadas con el admin nuevo, así que conviene no quedarse atrás.
const DEFAULT_API_VERSION = "2026-07";

const EMPTY_FORM = { slug: "", displayName: "", shopDomain: "", adminToken: "", apiVersion: DEFAULT_API_VERSION };
const EMPTY_EDIT_FORM = { displayName: "", shopDomain: "", adminToken: "", apiVersion: DEFAULT_API_VERSION };

/**
 * Left panel: pick/add/edit/delete a store. Edit/delete act on whichever
 * store's icons you hover — not only the currently selected one — so you
 * don't have to switch stores just to fix a typo in another one's domain.
 */
export default function Sidebar({ storeSlug, onChange }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [editingSlug, setEditingSlug] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  const [deletingSlug, setDeletingSlug] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

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

  function startEditing(store) {
    setEditForm({
      displayName: store.display_name,
      shopDomain: store.shop_domain,
      adminToken: "",
      apiVersion: store.api_version || DEFAULT_API_VERSION,
    });
    setEditError(null);
    setShowForm(false);
    setEditingSlug(store.slug);
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError(null);
    try {
      await updateStore(editingSlug, editForm);
      setEditingSlug(null);
      await load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(store) {
    const ok = window.confirm(
      `¿Eliminar la tienda "${store.display_name}"?\n\n` +
        `Esto borra también todas sus automatizaciones, logs y colecciones sincronizadas. ` +
        `No se puede deshacer.`
    );
    if (!ok) return;

    setDeletingSlug(store.slug);
    setDeleteError(null);
    try {
      await deleteStore(store.slug);
      if (editingSlug === store.slug) setEditingSlug(null);
      await load();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Tiendas</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => {
            setEditingSlug(null);
            setShowForm((v) => !v);
          }}
          title={showForm ? "Cancelar" : "Agregar tienda"}
          aria-label={showForm ? "Cancelar" : "Agregar tienda"}
        >
          {showForm ? "✕" : "+"}
        </button>
      </div>

      {loadError && <p className="error-text" role="alert">✖ {loadError}</p>}
      {deleteError && <p className="error-text" role="alert">✖ {deleteError}</p>}

      {!loading && !stores.length && !showForm && (
        <p className="empty-hint">No hay tiendas cargadas todavía.</p>
      )}

      <ul className="sidebar-store-list">
        {stores.map((s) => (
          <li key={s.slug} className={"sidebar-store-item" + (s.slug === storeSlug ? " is-active" : "")}>
            <button
              type="button"
              className="sidebar-store-select"
              onClick={() => {
                setEditingSlug(null);
                onChange(s.slug);
              }}
              title={s.display_name}
            >
              {s.display_name}
            </button>
            <span className="sidebar-store-actions">
              <button
                type="button"
                className="icon-button"
                title="Editar tienda"
                aria-label={`Editar ${s.display_name}`}
                onClick={() => startEditing(s)}
              >
                ✎
              </button>
              <button
                type="button"
                className="icon-button danger"
                title="Eliminar tienda"
                aria-label={`Eliminar ${s.display_name}`}
                onClick={() => handleDelete(s)}
                disabled={deletingSlug === s.slug}
              >
                🗑️
              </button>
            </span>
          </li>
        ))}
      </ul>

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

      {editingSlug && (
        <form className="store-form" onSubmit={handleEditSubmit}>
          <h4>Editar tienda</h4>
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
            <button type="button" onClick={() => setEditingSlug(null)} disabled={editSaving}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
