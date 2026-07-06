import { useEffect, useState } from "react";
import { fetchStores, createStore } from "../api.js";

const EMPTY_FORM = { slug: "", displayName: "", shopDomain: "", adminToken: "", apiVersion: "2025-10" };

export default function StoreSelector({ storeSlug, onChange }) {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function load(selectSlug) {
    setLoading(true);
    setLoadError(null);
    try {
      const { stores } = await fetchStores();
      setStores(stores);
      if (selectSlug) onChange(selectSlug);
      else if (!storeSlug && stores.length) onChange(stores[0].slug);
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

  return (
    <section className="store-selector">
      <label>
        Tienda
        <select
          value={storeSlug || ""}
          onChange={(e) => onChange(e.target.value)}
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
      {loadError && <p className="error-text">✖ {loadError}</p>}

      <button type="button" className="link-button" onClick={() => setShowForm((v) => !v)}>
        {showForm ? "Cancelar" : "+ Agregar tienda"}
      </button>

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
          {saveError && <p className="error-text">✖ {saveError}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Guardar tienda"}
          </button>
        </form>
      )}
    </section>
  );
}
