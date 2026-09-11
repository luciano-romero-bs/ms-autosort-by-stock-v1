import PanelHeader from "./PanelHeader.jsx";
import CategoryProductOrder from "./CategoryProductOrder.jsx";

/**
 * Rightmost drill-down column (R12): the manual product-order grid for one
 * category, opened from `ProductTypeList`'s "Ordenar productos" inside
 * `CollectionEditorPanel`. Closing it (`onClose`) only collapses this
 * column — the editor column to its left stays exactly as it was.
 */
export default function ManualOrderColumn({ category, products, order, onChange, onClose }) {
  return (
    <section className="col col-manual-order">
      <PanelHeader title="Orden manual" subtitle={category} onClose={onClose} closeLabel="Volver" />
      <div className="col-body">
        <CategoryProductOrder products={products} order={order} onChange={onChange} />
      </div>
    </section>
  );
}
