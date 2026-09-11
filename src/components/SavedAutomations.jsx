import { useState } from "react";
import { saveConfig, deleteConfig } from "../api.js";

function numericId(gid) {
  return gid.split("/").pop();
}

function displayName(config) {
  return config.collection_title || `Colección ${numericId(config.collection_gid)}`;
}

function AutomationCard({ storeSlug, config, onReload, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const newTypes = config.new_product_types || [];

  // Accepting a "Nueva" category: the flag disappears and the type joins the
  // end of the saved order, where it can then be positioned by editing the
  // automation (which opens the full editor column).
  async function handleAcceptNew(type) {
    setBusy(true);
    setError(null);
    try {
      await saveConfig(storeSlug, config.collection_gid, {
        collectionTitle: config.collection_title,
        productTypeOrder: [...(config.product_type_order || []), type],
        stockThreshold: config.stock_threshold || 0,
        enabled: config.enabled,
        newProductTypes: newTypes.filter((t) => t !== type),
      });
      await onReload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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

  return (
    <li className="automation-card">
      <div className="automation-header">
        <div>
          <strong>{displayName(config)}</strong>
          <span className="automation-id">ID {numericId(config.collection_gid)}</span>
        </div>
        <div className="automation-actions">
          <button type="button" onClick={() => onEdit(config.collection_gid)} disabled={busy}>
            Editar
          </button>
          <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
            Eliminar
          </button>
        </div>
      </div>

      <p className="automation-summary">
        {(config.product_type_order || []).length} categorías · umbral de stock: {config.stock_threshold || 0}
      </p>

      {newTypes.length > 0 && (
        <div className="new-types">
          <p className="warning-text" role="status">
            ⚠ Categorías nuevas detectadas por la corrida automática — están al fondo de la colección
            hasta que las ubiques. Tocá "Nueva" para aceptarlas (pasan al final del orden, después las
            podés ubicar editando la automatización):
          </p>
          <ul className="new-type-list">
            {newTypes.map((type) => (
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

      {error && <p className="error-text" role="alert">✖ {error}</p>}
    </li>
  );
}

export default function SavedAutomations({ storeSlug, configs, onReload, onEdit }) {
  const withNewTypes = configs.filter((c) => (c.new_product_types || []).length > 0);

  return (
    <section className="automations">
      <h3>Automatizaciones guardadas</h3>

      {withNewTypes.length > 0 && (
        <p className="warning-text" role="status">
          ⚠ Hay categorías nuevas sin ubicar en:{" "}
          {withNewTypes.map((c) => displayName(c)).join(", ")}.
        </p>
      )}

      {configs.length === 0 ? (
        <p className="empty-hint">
          Todavía no hay automatizaciones. Cargá una colección (abajo, o desde "Colecciones sin
          automatizar") y tocá "Automatizar ordenado" para que se reordene sola todos los días.
        </p>
      ) : (
        <ul className="automation-list">
          {configs.map((config) => (
            <AutomationCard
              key={config.collection_gid}
              storeSlug={storeSlug}
              config={config}
              onReload={onReload}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
