import { useState } from "react";

/**
 * Advanced/fallback path (R1): in normal use a collection is opened either
 * from "Automatizaciones guardadas" (Editar) or from "Colecciones sin
 * automatizar" (Crear automatización) — typing a numeric Collection ID by
 * hand is only needed before the first sync, or to open one collection
 * directly for testing. Collapsed behind a button so it doesn't compete
 * with those two for attention.
 */
export default function CollectionLoader({ onLoad }) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!id) return;
    onLoad(id);
    setOpen(false);
    setId("");
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        Cargar colección por ID
      </button>
    );
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
          autoFocus
        />
      </label>
      <button type="submit" disabled={!id}>
        Cargar
      </button>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </form>
  );
}
