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
import { byInventoryDescThenTitle } from "../../shared/sortCollection.mjs";

function Thumbnail({ product }) {
  const url = product.featuredImage?.url;
  if (!url) {
    return (
      <span className="manual-product-thumb manual-product-thumb-empty" aria-hidden="true">
        ✕
      </span>
    );
  }
  return (
    <img
      className="manual-product-thumb"
      src={url}
      alt={product.featuredImage?.altText || product.title}
      loading="lazy"
    />
  );
}

function ProductRow({ product, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="manual-product-item" {...attributes} {...listeners}>
      <span className="drag-handle">⠿</span>
      <span className="index">{index + 1}</span>
      <Thumbnail product={product} />
      <span className="title">{product.title}</span>
      <span className="stock">stock: {product.totalInventory}</span>
    </li>
  );
}

/**
 * Drag-and-drop reordering of the products inside one productType group
 * (R12). `order` is the saved manual order (product ids, possibly stale or
 * incomplete); any product not in it yet is appended sorted by inventory
 * desc — the exact same fallback `sortCollection.mjs` applies at reorder
 * time, so this panel never hides a product and always matches the preview.
 */
export default function CategoryProductOrder({ products, order, onChange }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byId = new Map(products.map((p) => [p.id, p]));
  const positioned = order.filter((id) => byId.has(id));
  const positionedIds = new Set(positioned);
  const rest = products
    .filter((p) => !positionedIds.has(p.id))
    .slice()
    .sort(byInventoryDescThenTitle)
    .map((p) => p.id);
  const effectiveOrder = [...positioned, ...rest];

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = effectiveOrder.indexOf(active.id);
    const newIndex = effectiveOrder.indexOf(over.id);
    onChange(arrayMove(effectiveOrder, oldIndex, newIndex));
  }

  if (!products.length) return <p className="empty-hint">Sin productos en esta categoría.</p>;

  return (
    <div className="manual-product-order" onPointerDown={(e) => e.stopPropagation()}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={effectiveOrder} strategy={verticalListSortingStrategy}>
          <ul className="manual-product-list">
            {effectiveOrder.map((id, index) => (
              <ProductRow key={id} product={byId.get(id)} index={index} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
