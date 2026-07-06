export default function SortButton({ onClick, loading, result, error, disabled }) {
  return (
    <div className="sort-action">
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
