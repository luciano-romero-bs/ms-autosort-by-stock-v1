import { useEffect, useState } from "react";

export default function CollectionLoader({ onLoad, loading, presetId }) {
  const [id, setId] = useState("");

  // Filled in from outside when the user clicks "Crear automatización" in
  // the unautomated-collections list.
  useEffect(() => {
    if (presetId) setId(presetId);
  }, [presetId]);

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
