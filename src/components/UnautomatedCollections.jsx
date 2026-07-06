import { useEffect, useState } from "react";
import {
  fetchStoreCollections,
  syncStoreCollections,
  setCollectionIgnored,
  fetchCollectionProducts,
  saveConfig,
} from "../api.js";

function numericId(gid) {
  return gid.split("/").pop();
}

// The "standard" threshold for quick automations: the one most existing
// automations of this store already use (0 if there are none yet).
function defaultThreshold(configs) {
  if (!configs.length) return 0;
  const counts = new Map();
  for (const c of configs) {
    const t = c.stock_threshold || 0;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export default function UnautomatedCollections({ storeSlug, configs, onReloadConfigs, onConfigure }) {
  const [collections, setCollections] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyGid, setBusyGid] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showIgnored, setShowIgnored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCollections([]);
    setLoaded(false);
    setError(null);
    setNotice(null);
    setShowIgnored(false);
    fetchStoreCollections(storeSlug)
      .then(({ collections }) => {
        if (cancelled) return;
        setCollections(collections);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const automatedGids = new Set(configs.map((c) => c.collection_gid));
  const pending = collections.filter((c) => !c.ignored && !automatedGids.has(c.collection_gid));
  const ignored = collections.filter((c) => c.ignored);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const { collections } = await syncStoreCollections(storeSlug);
      setCollections(collections);
      setNotice(`✔ Sincronizado: ${collections.length} colecciones en la tienda.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleIgnore(col, value) {
    setBusyGid(col.collection_gid);
    setError(null);
    setNotice(null);
    try {
      await setCollectionIgnored(storeSlug, col.collection_gid, value);
      setCollections(
        collections.map((c) => (c.collection_gid === col.collection_gid ? { ...c, ignored: value } : c))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyGid(null);
    }
  }

  async function handleQuickAutomate(col) {
    const threshold = defaultThreshold(configs);
    const ok = window.confirm(
      `¿Crear una automatización rápida para "${col.title}"?\n\n` +
        `Categorías: se detectan automáticamente y quedan en orden alfabético\n` +
        `Umbral de stock: ${threshold}\n\n` +
        `Después podés ajustar el orden y el umbral desde "Automatizaciones guardadas".`
    );
    if (!ok) return;

    setBusyGid(col.collection_gid);
    setError(null);
    setNotice(null);
    try {
      const data = await fetchCollectionProducts(storeSlug, numericId(col.collection_gid));
      const types = [...data.productTypes].sort((a, b) => a.localeCompare(b));
      await saveConfig(storeSlug, col.collection_gid, {
        collectionTitle: data.collectionTitle,
        productTypeOrder: types,
        stockThreshold: threshold,
        enabled: true,
        newProductTypes: [],
      });
      await onReloadConfigs();
      setNotice(
        `✔ Automatización creada para "${col.title}".` +
          (data.isManual
            ? ""
            : ' Ojo: la colección no está en orden "Manual" en Shopify — la corrida diaria la va a saltear hasta que la cambies.')
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyGid(null);
    }
  }

  function renderRow(col, actions) {
    return (
      <li className="collection-row" key={col.collection_gid}>
        <div className="collection-info">
          <strong>{col.title || `Colección ${numericId(col.collection_gid)}`}</strong>
          <span className="collection-meta">
            ID {numericId(col.collection_gid)}
            {col.products_count != null && <> · {col.products_count} productos</>}
          </span>
          {col.sort_order && col.sort_order !== "MANUAL" && (
            <span
              className="not-manual-badge"
              title='La corrida diaria saltea colecciones que no están en orden "Manual" en Shopify.'
            >
              No manual
            </span>
          )}
        </div>
        <div className="automation-actions">{actions}</div>
      </li>
    );
  }

  return (
    <section className="automations">
      <div className="section-header">
        <h3>Colecciones sin automatizar</h3>
        <button type="button" onClick={handleSync} disabled={syncing}>
          {syncing ? "Sincronizando..." : "Refrescar colecciones"}
        </button>
      </div>

      {notice && <p className="success-text">{notice}</p>}
      {error && <p className="error-text">✖ {error}</p>}

      {loaded && collections.length === 0 && !error && (
        <p className="empty-hint">
          Todavía no se sincronizaron las colecciones de esta tienda. Tocá "Refrescar colecciones"
          para traerlas desde Shopify.
        </p>
      )}

      {collections.length > 0 && pending.length === 0 && (
        <p className="empty-hint">
          No hay colecciones pendientes: todas están automatizadas o ignoradas. Tocá "Refrescar
          colecciones" si creaste colecciones nuevas en Shopify.
        </p>
      )}

      {pending.length > 0 && (
        <ul className="collection-list">
          {pending.map((col) =>
            renderRow(
              col,
              <>
                <button
                  type="button"
                  className="primary"
                  onClick={() => onConfigure(numericId(col.collection_gid))}
                  disabled={busyGid === col.collection_gid}
                >
                  Crear automatización
                </button>
                <button
                  type="button"
                  className="dark"
                  onClick={() => handleQuickAutomate(col)}
                  disabled={busyGid === col.collection_gid}
                >
                  {busyGid === col.collection_gid ? "Creando..." : "Automatizar stock"}
                </button>
                <button
                  type="button"
                  onClick={() => handleIgnore(col, true)}
                  disabled={busyGid === col.collection_gid}
                >
                  Ignorar
                </button>
              </>
            )
          )}
        </ul>
      )}

      {ignored.length > 0 && (
        <div className="ignored-block">
          <button type="button" className="link-button" onClick={() => setShowIgnored((v) => !v)}>
            {showIgnored ? "Ocultar ignoradas" : `Ver ignoradas (${ignored.length})`}
          </button>
          {showIgnored && (
            <ul className="collection-list ignored-list">
              {ignored.map((col) =>
                renderRow(
                  col,
                  <button
                    type="button"
                    onClick={() => handleIgnore(col, false)}
                    disabled={busyGid === col.collection_gid}
                  >
                    Dejar de ignorar
                  </button>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
