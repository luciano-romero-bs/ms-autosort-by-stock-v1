import { useState } from "react";
import { isLoggedIn, logout, fetchStoreConfigs } from "./api.js";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import CollectionLoader from "./components/CollectionLoader.jsx";
import CollectionEditorPanel from "./components/CollectionEditorPanel.jsx";
import SavedAutomations from "./components/SavedAutomations.jsx";
import UnautomatedCollections from "./components/UnautomatedCollections.jsx";

function numericId(gid) {
  return gid.split("/").pop();
}

/**
 * Shell layout: a fixed-height app (no page scroll — each panel scrolls on
 * its own), a store sidebar on the left, a home column (collection-by-ID
 * loader + saved automations + pending collections), and up to two
 * Finder-style drill-down columns opened from the home column: the
 * collection editor, and — from inside it — one category's manual order.
 * Both of those live entirely inside `CollectionEditorPanel`; this
 * component only tracks *which* collection id is open.
 */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [storeSlug, setStoreSlug] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [editorId, setEditorId] = useState(null);

  async function loadConfigs(slug) {
    try {
      const { configs } = await fetchStoreConfigs(slug);
      setConfigs(configs);
    } catch {
      // Non-fatal: the automations section just shows empty; individual
      // actions surface their own errors.
      setConfigs([]);
    }
  }

  function handleStoreChange(slug) {
    setStoreSlug(slug);
    setEditorId(null);
    setConfigs([]);
    if (slug) loadConfigs(slug);
  }

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div className="shell-page">
      <header className="navbar">
        <div className="navbar-inner">
          <h1>Ordenador de colecciones</h1>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              logout();
              setLoggedIn(false);
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="shell">
        <Sidebar storeSlug={storeSlug} onChange={handleStoreChange} />

        {!storeSlug ? (
          <main className="shell-main shell-empty">
            <p className="empty-hint">Seleccioná o agregá una tienda para empezar.</p>
          </main>
        ) : (
          <>
            <main className={"shell-main" + (editorId ? " is-narrow" : "")}>
              <section>
                <CollectionLoader onLoad={(id) => setEditorId(String(id))} />
              </section>

              <SavedAutomations
                storeSlug={storeSlug}
                configs={configs}
                onReload={() => loadConfigs(storeSlug)}
                onEdit={(gid) => setEditorId(numericId(gid))}
              />

              <UnautomatedCollections
                storeSlug={storeSlug}
                configs={configs}
                onReloadConfigs={() => loadConfigs(storeSlug)}
                onConfigure={(id) => setEditorId(String(id))}
              />
            </main>

            {editorId && (
              <CollectionEditorPanel
                key={`${storeSlug}:${editorId}`}
                storeSlug={storeSlug}
                collectionId={editorId}
                onClose={() => setEditorId(null)}
                onSaved={() => loadConfigs(storeSlug)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
