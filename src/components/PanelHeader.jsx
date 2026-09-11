/**
 * Shared header for a Finder-style drill-down column (CollectionEditorPanel,
 * ManualOrderColumn): title + optional subtitle on the left, a close button
 * on the right. `onClose` collapses just that column back to the one before
 * it — it never navigates away, the columns to its left stay exactly as they
 * were.
 */
export default function PanelHeader({ title, subtitle, onClose, closeLabel = "Cerrar" }) {
  return (
    <div className="panel-header">
      <div className="panel-header-text">
        <h3>{title}</h3>
        {subtitle && <p className="panel-header-subtitle">{subtitle}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          className="icon-button panel-close"
          onClick={onClose}
          title={closeLabel}
          aria-label={closeLabel}
        >
          ✕
        </button>
      )}
    </div>
  );
}
