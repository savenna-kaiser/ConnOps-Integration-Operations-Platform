import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Generischer Bestätigungsdialog für destruktive (oder andere) Aktionen.
 *
 * Verwendung:
 *   <ConfirmDialog
 *     title="Gruppe entfernen?"
 *     message={`„${group.Name}" wirklich aus den Gruppen entfernen?`}
 *     onConfirm={...}
 *     onCancel={() => setConfirmTarget(null)}
 *   />
 */
export default function ConfirmDialog({
  title = "Bist du sicher?",
  message,
  confirmLabel = "Bestätigen",
  cancelLabel  = "Abbrechen",
  danger       = true,
  loading      = false,
  onConfirm,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: danger ? "var(--danger-light)" : "var(--brand-light)" }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: danger ? "var(--danger)" : "var(--brand)" }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                {title}
              </h2>
              {message && (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <button onClick={onCancel} disabled={loading} className="btn-secondary text-sm disabled:opacity-40">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`${danger ? "btn-danger" : "btn-primary"} text-sm disabled:opacity-40`}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
