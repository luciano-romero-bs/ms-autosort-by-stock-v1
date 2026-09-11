import { useEffect, useMemo, useState } from "react";
import { sortCollection, isBelowThreshold, isManualOrderEnabled, groupKey } from "../../shared/sortCollection.mjs";
import { fetchCollectionProducts, fetchConfig, reorderCollection, saveConfig } from "../api.js";
import PanelHeader from "./PanelHeader.jsx";
import ProductTypeList from "./ProductTypeList.jsx";
import ThresholdInput from "./ThresholdInput.jsx";
import PreviewList from "./PreviewList.jsx";
import SortButton from "./SortButton.jsx";
import ManualOrderColumn from "./ManualOrderColumn.jsx";

function toCollectionGid(id) {
  return `gid://shopify/Collection/${id}`;
}

/**
 * Column 2 of the drill-down: load one collection (by numeric id — either
 * typed via "Cargar colección por ID" or taken from an existing
 * automation's saved gid, both funnel into this same panel) and edit its
 * category order, threshold and per-category manual order, then reorder
 * Shopify live and/or save it as an automation. Owns all of that state
 * itself — `App.jsx` only knows which collection id is open, nothing about
 * what's inside it — and remounts fresh (via the `key` App.jsx sets) every
 * time the target collection changes, so there's no stale-state carryover
 * between one collection and the next.
 *
 * Also owns column 3 (`ManualOrderColumn`, R12): which category's manual
 * order is open is local to this panel too, since it's just a detail view
 * over data already loaded here.
 */
export default function CollectionEditorPanel({ storeSlug, collectionId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [collectionData, setCollectionData] = useState(null);
  const [hasAutomation, setHasAutomation] = useState(false);

  const [productTypeOrder, setProductTypeOrder] = useState([]);
  const [stockThreshold, setStockThreshold] = useState(0);
  const [manualProductOrder, setManualProductOrder] = useState({});
  const [openCategory, setOpenCategory] = useState(null);

  const [reordering, setReordering] = useState(false);
  const [reorderResult, setReorderResult] = useState(null);
  const [reorderError, setReorderError] = useState(null);

  const [automating, setAutomating] = useState(false);
  const [automateDone, setAutomateDone] = useState(false);
  const [automateError, setAutomateError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchCollectionProducts(storeSlug, collectionId);
        if (cancelled) return;
        setCollectionData(data);

        let savedOrder = data.productTypes;
        let savedThreshold = 0;
        let savedManualOrder = {};
        let found = false;
        try {
          const { config } = await fetchConfig(storeSlug, toCollectionGid(collectionId));
          const known = (config.product_type_order || []).filter((t) => data.productTypes.includes(t));
          const missing = data.productTypes.filter((t) => !known.includes(t)).sort((a, b) => a.localeCompare(b));
          savedOrder = [...known, ...missing];
          savedThreshold = config.stock_threshold || 0;
          savedManualOrder = config.manual_product_order || {};
          found = true;
        } catch {
          // No saved config for this collection yet — that's expected the first time.
        }
        if (cancelled) return;

        setHasAutomation(found);
        setProductTypeOrder(savedOrder);
        setStockThreshold(savedThreshold);
        setManualProductOrder(savedManualOrder);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // storeSlug/collectionId are fixed for the lifetime of this panel — the
    // parent remounts it via `key` when the target collection changes, so
    // this effect only ever needs to run once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = useMemo(() => {
    if (!collectionData) return { orderedProducts: [], bottomIds: new Set() };
    const { finalOrder } = sortCollection(collectionData.products, productTypeOrder, stockThreshold, manualProductOrder);
    const byId = new Map(collectionData.products.map((p) => [p.id, p]));
    const orderedProducts = finalOrder.map((id) => byId.get(id));
    const bottomIds = new Set(
      collectionData.products
        .filter((p) => !isManualOrderEnabled(manualProductOrder, p.productType) && isBelowThreshold(p, stockThreshold))
        .map((p) => p.id)
    );
    return { orderedProducts, bottomIds };
  }, [collectionData, productTypeOrder, stockThreshold, manualProductOrder]);

  const openCategoryProducts = useMemo(() => {
    if (!openCategory || !collectionData) return [];
    return collectionData.products.filter((p) => groupKey(p.productType) === openCategory);
  }, [openCategory, collectionData]);

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
        manualProductOrder,
        save: false,
      });
      setReorderResult(result);
    } catch (err) {
      setReorderError(err.message);
    } finally {
      setReordering(false);
    }
  }

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
        manualProductOrder,
        enabled: true,
        newProductTypes: [],
      });
      setHasAutomation(true);
      setAutomateDone(true);
      onSaved?.();
    } catch (err) {
      setAutomateError(err.message);
    } finally {
      setAutomating(false);
    }
  }

  return (
    <>
      <section className={"col col-editor" + (openCategory ? " is-narrow" : "")}>
        <PanelHeader
          title={loading ? "Cargando…" : collectionData?.collectionTitle || "Colección"}
          subtitle={`ID ${collectionId}`}
          onClose={onClose}
        />
        <div className="col-body">
          {loading && (
            <div className="panel-loader" role="status">
              <span className="spinner" aria-hidden="true" />
              Cargando categorías detectadas...
            </div>
          )}

          {!loading && loadError && <p className="error-text" role="alert">✖ {loadError}</p>}

          {!loading && !loadError && collectionData && (
            <>
              {!collectionData.isManual && (
                <p className="warning-text" role="status">
                  ⚠ Esta colección tiene sortOrder <code>{collectionData.sortOrder}</code>. Cambiala a
                  "Manual" en el admin de Shopify antes de poder reordenar.
                </p>
              )}

              <section>
                <h3>Orden de categorías (productType)</h3>
                <p className="section-hint">
                  Activá "Orden manual" en una categoría para fijar el orden de sus productos a mano
                  (arrastrando) en vez de por stock.
                </p>
                <ProductTypeList
                  items={productTypeOrder}
                  onChange={setProductTypeOrder}
                  manualOrderAvailable
                  manualOrders={manualProductOrder}
                  onManualOrdersChange={setManualProductOrder}
                  activeCategory={openCategory}
                  onOpenCategory={setOpenCategory}
                />
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
                      <p className="success-text" role="status">
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
                    {automateError && <p className="error-text" role="alert">✖ {automateError}</p>}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>

      {openCategory && (
        <ManualOrderColumn
          category={openCategory}
          products={openCategoryProducts}
          order={manualProductOrder[openCategory]?.order || []}
          onChange={(order) =>
            setManualProductOrder({ ...manualProductOrder, [openCategory]: { enabled: true, order } })
          }
          onClose={() => setOpenCategory(null)}
        />
      )}
    </>
  );
}
