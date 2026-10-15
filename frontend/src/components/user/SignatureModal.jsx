import { useRef, useEffect, useState } from "react";
import SignaturePad from "signature_pad";
import { X, RotateCcw, Check, Loader2 } from "lucide-react";
import { handover } from "../../api/client";

/**
 * SignatureModal – Signatur-Erfassung per Touch/Maus, fuegt sie nachtraeglich
 * in ein bereits erstelltes Uebergabedokument ein.
 *
 * Bewusst: einmal signiert = unveraenderlich (siehe addSignature() im Backend,
 * das einen zweiten Versuch mit 409 ablehnt).
 */
export default function SignatureModal({ hostname, filename, onClose, onSigned }) {
  const canvasRef = useRef(null);
  const padRef    = useRef(null);
  const [empty, setEmpty]     = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    // Canvas-Aufloesung an die tatsaechliche Anzeigegroesse anpassen
    // (sonst wirkt die Linie auf hochaufloesenden iPad-Displays verpixelt/verschoben)
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);

    padRef.current = new SignaturePad(canvas, {
      backgroundColor: "rgb(255,255,255)",
      penColor: "rgb(17,24,39)",
    });
    padRef.current.addEventListener("endStroke", () => setEmpty(padRef.current.isEmpty()));

    return () => padRef.current?.off();
  }, []);

  function clear() {
    padRef.current?.clear();
    setEmpty(true);
    setError("");
  }

  async function save() {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSaving(true);
    setError("");
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      await handover.addSignature(hostname, filename, dataUrl);
      onSigned();
      onClose();
    } catch (err) {
      setError(err.message || "Signatur konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="card w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Unterschrift ergänzen
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Bitte hier unterschreiben (Finger oder Eingabestift). Kann danach
          nicht mehr geändert werden.
        </p>

        <div className="rounded-xl overflow-hidden mb-3"
             style={{ border: "2px solid var(--border-strong)" }}>
          <canvas
            ref={canvasRef}
            className="w-full touch-none"
            style={{ height: "200px", backgroundColor: "#fff" }}
          />
        </div>

        {error && (
          <p className="text-xs mb-3" style={{ color: "var(--danger)" }}>{error}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <button onClick={clear} className="btn-secondary text-sm flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Löschen
          </button>
          <button
            onClick={save}
            disabled={empty || saving}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
