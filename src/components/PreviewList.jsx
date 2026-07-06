export default function PreviewList({ orderedProducts, bottomIds }) {
  if (!orderedProducts.length) return null;

  return (
    <div className="preview-list">
      <h2>Vista previa ({orderedProducts.length} productos)</h2>
      <ol>
        {orderedProducts.map((p) => (
          <li key={p.id} className={bottomIds.has(p.id) ? "bottom" : ""}>
            <span className="title">{p.title}</span>
            <span className="type">{p.productType || "(sin categoría)"}</span>
            <span className="stock">stock: {p.totalInventory}</span>
            {bottomIds.has(p.id) && <span className="bottom-tag">fondo</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
