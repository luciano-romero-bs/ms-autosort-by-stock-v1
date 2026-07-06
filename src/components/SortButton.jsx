export default function SortButton({ onClick, loading, result, error, save, onSaveChange, disabled }) {
  return (
    <div className="sort-action">
      <label className="save-toggle">
        <input type="checkbox" checked={save} onChange={(e) => onSaveChange(e.target.checked)} />
        Guardar configuración (usada por la corrida diaria)
      </label>
      <button type="button" className="primary" onClick={onClick} disabled={loading || disabled}>
        {loading ? "Ordenando..." : "Ordenar colección"}
      </button>
      {result && (
        <p className="success-text">
          ✔ Listo — se reordenaron {result.productsReordered} productos.
        </p>
      )}
      {error && <p className="error-text">✖ {error}</p>}
    </div>
  );
}
