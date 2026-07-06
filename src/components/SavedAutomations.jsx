import { useState } from "react";
import { saveConfig, deleteConfig } from "../api.js";
import ProductTypeList from "./ProductTypeList.jsx";
import ThresholdInput from "./ThresholdInput.jsx";

function numericId(gid) {
  return gid.split("/").pop();
}

function displayName(config) {
  return config.collection_title || `Colección ${numericId(config.collection_gid)}`;
}

function AutomationCard({ storeSlug, config, onReload }) {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState([]);
  const [threshold, setThreshold] = useState(0);
  const [pendingNew, setPendingNew] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const newTypes = config.new_product_types || [];

  async function persist(body) {
    setBusy(true);
    setError(null);
    try {
      await saveConfig(storeSlug, config.collection_gid, body);
      await onReload();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setOrder(config.product_type_order || []);
    setThreshold(config.stock_threshold || 0);
    setPendingNew(newTypes);
    setEditing(true);
  }

  async function handleSaveEdit() {
    const ok = await persist({
      collectionTitle: config.collection_title,
      productTypeOrder: order,
      stockThreshold: threshold,
      enabled: config.enabled,
      newProductTypes: pendingNew,
    });
    if (ok) setEditing(false);
  }

  // Accepting a "Nueva" category: the flag disappears and the type joins the
  // end of the saved order, where it can then be dragged wherever.
  async function handleAcceptNew(type) {
    if (editing) {
      setOrder([...order, type]);
      setPendingNew(pendingNew.filter((t) => t !== type));
      return;
    }
    await persist({
      collectionTitle: config.collection_title,
      productTypeOrder: [...(config.product_type_order || []), type],
      stockThreshold: config.stock_threshold || 0,
      enabled: config.enabled,
      newProductTypes: newTypes.filter((t) => t !== type),
    });
  }

  async function handleDelete() {
    const ok = window.confirm(
      `¿Eliminar la automatización de "${displayName(config)}"? La colección va a dejar de reordenarse sola cada día.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteConfig(storeSlug, config.collection_gid);
      await onReload();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const visibleNewTypes = editing ? pendingNew : newTypes;

  return (
    <li className="automation-card">
      <div className="automation-header">
        <div>
          <strong>{displayName(config)}</strong>
          <span className="automation-id">ID {numericId(config.collection_gid)}</span>
        </div>
        <div className="automation-actions">
          {!editing && (
            <button type="button" onClick={startEditing} disabled={busy}>
              Editar
            </button>
          )}
          <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
            Eliminar
          </button>
        </div>
      </div>

      {!editing && (
        <p className="automation-summary">
          {(config.product_type_order || []).length} categorías · umbral de stock: {config.stock_threshold || 0}
        </p>
      )}

      {editing && (
        <div className="automation-editor">
          <h4>Orden de categorías</h4>
          <ProductTypeList items={order} onChange={setOrder} />
          <ThresholdInput value={threshold} onChange={setThreshold} />
          <div className="automation-actions">
            <button type="button" className="primary" onClick={handleSaveEdit} disabled={busy}>
              {busy ? "Guardando..." : "Guardar cambios"}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {visibleNewTypes.length > 0 && (
        <div className="new-types">
          <p className="warning-text">
            ⚠ Categorías nuevas detectadas por la corrida automática — están al fondo de la colección
            hasta que las ubiques. Tocá "Nueva" para aceptarlas (pasan al final del orden, después las
            podés arrastrar donde quieras):
          </p>
          <ul className="new-type-list">
            {visibleNewTypes.map((type) => (
              <li key={type}>
                <span className="label">{type}</span>
                <button
                  type="button"
                  className="new-type-badge"
                  title="Quitar la marca de nueva (pasa al final del orden guardado)"
                  onClick={() => handleAcceptNew(type)}
                  disabled={busy}
                >
                  Nueva ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="error-text">✖ {error}</p>}
    </li>
  );
}

export default function SavedAutomations({ storeSlug, configs, onReload }) {
  const withNewTypes = configs.filter((c) => (c.new_product_types || []).length > 0);

  return (
    <section className="automations">
      <h3>Automatizaciones guardadas</h3>

      {withNewTypes.length > 0 && (
        <p className="warning-text">
          ⚠ Hay categorías nuevas sin ubicar en:{" "}
          {withNewTypes.map((c) => displayName(c)).join(", ")}.
        </p>
      )}

      {configs.length === 0 ? (
        <p className="empty-hint">
          Todavía no hay automatizaciones. Ordená una colección y tocá "Automatizar ordenado" para
          que se reordene sola todos los días.
        </p>
      ) : (
        <ul className="automation-list">
          {configs.map((config) => (
            <AutomationCard
              key={config.collection_gid}
              storeSlug={storeSlug}
              config={config}
              onReload={onReload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
