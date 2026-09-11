import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { groupKey } from "../../shared/sortCollection.mjs";
import CategoryProductOrder from "./CategoryProductOrder.jsx";

function CategoryItem({ id, index, products, manualEntry, onToggleManual, onReorderProducts }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [expanded, setExpanded] = useState(false);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // `products` (the full collection) is only passed from the main panel,
  // where a Collection ID is already loaded — the "Automatizaciones
  // guardadas" editor doesn't have live product data, so it renders the
  // plain category row without the manual-order toggle (R12 is scoped to
  // the panel that already fetched Shopify's product list).
  const manualOrderAvailable = Boolean(products);
  const enabled = Boolean(manualEntry?.enabled);
  const categoryProducts = manualOrderAvailable
    ? products.filter((p) => groupKey(p.productType) === id)
    : [];

  return (
    <li ref={setNodeRef} style={style} className="product-type-item-wrapper">
      <div className="product-type-item" {...attributes} {...listeners}>
        <span className="drag-handle">⠿</span>
        <span className="index">{index + 1}</span>
        <span className="label">{id}</span>
        {manualOrderAvailable && (
          <label className="manual-toggle" onPointerDown={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleManual(id, e.target.checked)}
            />
            Orden manual
          </label>
        )}
        {manualOrderAvailable && enabled && (
          <button
            type="button"
            className="link-button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Ocultar productos" : "Ordenar productos"}
          </button>
        )}
      </div>

      {manualOrderAvailable && enabled && expanded && (
        <CategoryProductOrder
          products={categoryProducts}
          order={manualEntry?.order || []}
          onChange={(order) => onReorderProducts(id, order)}
        />
      )}
    </li>
  );
}

/**
 * Drag-and-drop list of productType groups (R2), extended for R12: when
 * `products` is supplied, each category shows an "Orden manual" toggle that,
 * once on, expands to a nested drag-and-drop list of that category's
 * products (`CategoryProductOrder`) overriding the stock-desc sort for it.
 * `manualOrders` shape: { [productType]: { enabled: boolean, order: string[] } }.
 */
export default function ProductTypeList({ items, onChange, products, manualOrders = {}, onManualOrdersChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id);
    const newIndex = items.indexOf(over.id);
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  function handleToggleManual(type, checked) {
    if (!onManualOrdersChange) return;
    onManualOrdersChange({
      ...manualOrders,
      [type]: { enabled: checked, order: manualOrders[type]?.order || [] },
    });
  }

  function handleReorderProducts(type, order) {
    if (!onManualOrdersChange) return;
    onManualOrdersChange({ ...manualOrders, [type]: { enabled: true, order } });
  }

  if (!items.length) return <p className="empty-hint">No hay productType para ordenar todavía.</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="product-type-list">
          {items.map((item, index) => (
            <CategoryItem
              key={item}
              id={item}
              index={index}
              products={products}
              manualEntry={manualOrders[item]}
              onToggleManual={handleToggleManual}
              onReorderProducts={handleReorderProducts}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
