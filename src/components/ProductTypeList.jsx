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

function SortableItem({ id, index }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="product-type-item" {...attributes} {...listeners}>
      <span className="drag-handle">⠿</span>
      <span className="index">{index + 1}</span>
      <span className="label">{id}</span>
    </li>
  );
}

export default function ProductTypeList({ items, onChange }) {
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

  if (!items.length) return <p className="empty-hint">No hay productType para ordenar todavía.</p>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="product-type-list">
          {items.map((item, index) => (
            <SortableItem key={item} id={item} index={index} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
