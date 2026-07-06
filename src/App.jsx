import { useMemo, useState } from "react";
import { sortCollection, isBelowThreshold } from "../shared/sortCollection.mjs";
import {
  isLoggedIn,
  logout,
  fetchCollectionProducts,
  fetchConfig,
  fetchStoreConfigs,
  reorderCollection,
  saveConfig,
} from "./api.js";
import Login from "./components/Login.jsx";
import StoreSelector from "./components/StoreSelector.jsx";
import CollectionLoader from "./components/CollectionLoader.jsx";
import ProductTypeList from "./components/ProductTypeList.jsx";
import ThresholdInput from "./components/ThresholdInput.jsx";
import PreviewList from "./components/PreviewList.jsx";
import SortButton from "./components/SortButton.jsx";
import SavedAutomations from "./components/SavedAutomations.jsx";

function toCollectionGid(id) {
  return `gid://shopify/Collection/${id}`;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [storeSlug, setStoreSlug] = useState(null);
  const [collectionId, setCollectionId] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  const [productTypeOrder, setProductTypeOrder] = useState([]);
  const [stockThreshold, setStockThreshold] = useState(0);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [reordering, setReordering] = useState(false);
  const [reorderResult, setReorderResult] = useState(null);
  const [reorderError, setReorderError] = useState(null);

  const [configs, setConfigs] = useState([]);
  const [automating, setAutomating] = useState(false);
  const [automateDone, setAutomateDone] = useState(false);
  const [automateError, setAutomateError] = useState(null);

  async function loadConfigs(slug) {
    try {
      const { configs } = await fetchStoreConfigs(slug);
      setConfigs(configs);
    } catch {
      // Non-fatal: the automations section just shows empty; individual
      // actions surface their own errors.
      setConfigs([]);
    }
  }

  function handleStoreChange(slug) {
    setStoreSlug(slug);
    setCollectionId(null);
    setCollectionData(null);
    setLoadError(null);
    setReorderResult(null);
    setReorderError(null);
    setAutomateDone(false);
    setAutomateError(null);
    setConfigs([]);
    if (slug) loadConfigs(slug);
  }

  async function handleLoad(id) {
    setLoadingCollection(true);
    setLoadError(null);
    setReorderResult(null);
    setReorderError(null);
    setAutomateDone(false);
    setAutomateError(null);
    try {
      const data = await fetchCollectionProducts(storeSlug, id);
      setCollectionId(id);
      setCollectionData(data);

      let savedOrder = null;
      let savedThreshold = 0;
      try {
        const { config } = await fetchConfig(storeSlug, toCollectionGid(id));
        savedOrder = config.product_type_order || [];
        savedThreshold = config.stock_threshold || 0;
      } catch {
        // No saved config for this collection yet — that's expected the first time.
      }

      if (savedOrder) {
        const known = savedOrder.filter((t) => data.productTypes.includes(t));
        const missing = data.productTypes
          .filter((t) => !known.includes(t))
          .sort((a, b) => a.localeCompare(b));
        setProductTypeOrder([...known, ...missing]);
        setStockThreshold(savedThreshold);
      } else {
        setProductTypeOrder(data.productTypes);
        setStockThreshold(0);
      }
    } catch (err) {
      setCollectionData(null);
      setLoadError(err.message);
    } finally {
      setLoadingCollection(false);
    }
  }

  const preview = useMemo(() => {
    if (!collectionData) return { orderedProducts: [], bottomIds: new Set() };
    const { finalOrder } = sortCollection(collectionData.products, productTypeOrder, stockThreshold);
    const byId = new Map(collectionData.products.map((p) => [p.id, p]));
    const orderedProducts = finalOrder.map((id) => byId.get(id));
    const bottomIds = new Set(
      collectionData.products.filter((p) => isBelowThreshold(p, stockThreshold)).map((p) => p.id)
    );
    return { orderedProducts, bottomIds };
  }, [collectionData, productTypeOrder, stockThreshold]);

  async function handleSort() {
    setReordering(true);
    setReorderResult(null);
    setReorderError(null);
    setAutomateDone(false);
    setAutomateError(null);
    try {
      const result = await reorderCollection(storeSlug, collectionId, {
        productTypeOrder,
        stockThreshold,
        save: false,
      });
      setReorderResult(result);
    } catch (err) {
      setReorderError(err.message);
    } finally {
      setReordering(false);
    }
  }

  const hasAutomation = Boolean(
    collectionId && configs.some((c) => c.collection_gid === toCollectionGid(collectionId))
  );

  async function handleAutomate() {
    const verb = hasAutomation ? "actualizar la automatización con" : "automatizar";
    const ok = window.confirm(
      `¿Querés ${verb} esta configuración?\n\n` +
        `Colección: ${collectionData.collectionTitle}\n` +
        `Umbral de stock: ${stockThreshold}\n` +
        `Categorías: ${productTypeOrder.length}\n\n` +
        `La corrida automática diaria va a reaplicar este orden todos los días.`
    );
    if (!ok) return;

    setAutomating(true);
    setAutomateError(null);
    try {
      await saveConfig(storeSlug, toCollectionGid(collectionId), {
        collectionTitle: collectionData.collectionTitle,
        productTypeOrder,
        stockThreshold,
        enabled: true,
        newProductTypes: [],
      });
      await loadConfigs(storeSlug);
      setAutomateDone(true);
    } catch (err) {
      setAutomateError(err.message);
    } finally {
      setAutomating(false);
    }
  }

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div className="app">
      <header>
        <h1>Ordenador de colecciones</h1>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            logout();
            setLoggedIn(false);
          }}
        >
          Cerrar sesión
        </button>
      </header>

      <StoreSelector storeSlug={storeSlug} onChange={handleStoreChange} />

      {storeSlug && (
        <>
          <CollectionLoader onLoad={handleLoad} loading={loadingCollection} />
          {loadError && <p className="error-text">✖ {loadError}</p>}
        </>
      )}

      {collectionData && (
        <>
          <h2>{collectionData.collectionTitle}</h2>
          {!collectionData.isManual && (
            <p className="warning-text">
              ⚠ Esta colección tiene sortOrder <code>{collectionData.sortOrder}</code>. Cambiala a
              "Manual" en el admin de Shopify antes de poder reordenar.
            </p>
          )}

          <section>
            <h3>Orden de categorías (productType)</h3>
            <ProductTypeList items={productTypeOrder} onChange={setProductTypeOrder} />
          </section>

          <section>
            <ThresholdInput value={stockThreshold} onChange={setStockThreshold} />
          </section>

          <section>
            <PreviewList orderedProducts={preview.orderedProducts} bottomIds={preview.bottomIds} />
          </section>

          <section>
            <SortButton
              onClick={handleSort}
              loading={reordering}
              result={reorderResult}
              error={reorderError}
              disabled={!collectionData.isManual}
            />

            {reorderResult && (
              <div className="automate-action">
                {automateDone ? (
                  <p className="success-text">
                    ✔ Automatización guardada — la corrida diaria va a mantener este orden.
                  </p>
                ) : (
                  <button type="button" onClick={handleAutomate} disabled={automating}>
                    {automating
                      ? "Guardando..."
                      : hasAutomation
                        ? "Actualizar automatización"
                        : "Automatizar ordenado"}
                  </button>
                )}
                {automateError && <p className="error-text">✖ {automateError}</p>}
              </div>
            )}
          </section>
        </>
      )}

      {storeSlug && (
        <SavedAutomations
          storeSlug={storeSlug}
          configs={configs}
          onReload={() => loadConfigs(storeSlug)}
        />
      )}
    </div>
  );
}
