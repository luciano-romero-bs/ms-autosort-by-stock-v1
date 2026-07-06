import { useState } from "react";

export default function CollectionLoader({ onLoad, loading }) {
  const [id, setId] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!id) return;
    onLoad(id);
  }

  return (
    <form className="collection-loader" onSubmit={handleSubmit}>
      <label>
        Collection ID
        <input
          type="number"
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="655386214692"
          required
        />
      </label>
      <button type="submit" disabled={loading || !id}>
        {loading ? "Cargando..." : "Cargar"}
      </button>
    </form>
  );
}
