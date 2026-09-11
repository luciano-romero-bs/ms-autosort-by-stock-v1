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

function CategoryItem({ id, index, manualOrderAvailable, manualEntry, isActive, onToggleManual, onOpenCategory }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const enabled = Boolean(manualEntry?.enabled);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={"product-type-item" + (isActive ? " is-active" : "")}
      {...attributes}
      {...listeners}
    >
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
          onClick={() => onOpenCategory(isActive ? null : id)}
        >
          {isActive ? "Editando →" : "Ordenar productos"}
        </button>
      )}
    </li>
  );
}

/**
 * Drag-and-drop list of productType groups (R2), extended for R12: when
 * `manualOrderAvailable` is true, each category shows an "Orden manual"
 * toggle that, once on, exposes "Ordenar productos" — clicking it asks the
 * parent (via `onOpenCategory`) to open that category's manual-order column
 * (see CollectionEditorPanel/ManualOrderColumn), it doesn't render the
 * product grid inline here. `activeCategory` highlights whichever category
 * currently has that column open.
 *
 * `manualOrders` shape: { [productType]: { enabled: boolean, order: string[] } }.
 */
export default function ProductTypeList({
  items,
  onChange,
  manualOrderAvailable = false,
  manualOrders = {},
  onManualOrdersChange,
  activeCategory = null,
  onOpenCategory,
}) {
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
    // Turning a category's manual order off while its column is open closes it.
    if (!checked && activeCategory === type) onOpenCategory?.(null);
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
              manualOrderAvailable={manualOrderAvailable}
              manualEntry={manualOrders[item]}
              isActive={activeCategory === item}
              onToggleManual={handleToggleManual}
              onOpenCategory={onOpenCategory}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
