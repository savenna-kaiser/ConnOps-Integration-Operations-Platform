import { useState, useEffect } from "react";
import { FileText, Download, Loader2, Plus, User, Calendar, Monitor, PenLine, CheckCircle2 } from "lucide-react";
import { handover } from "../../api/client";
import HandoverModal from "./HandoverModal";
import HandoverFromUserModal from "./HandoverFromUserModal";
import SignatureModal from "./SignatureModal";

/**
 * HandoverList – zeigt Übergabedokumente
 *
 * Modi:
 *   asset-Modus: asset={{ HostName, BiosSerial, Modell }} → Dokumente dieses Geräts
 *   user-Modus:  sam="100001"                             → Dokumente dieses Benutzers
 *
 * Beide Modi haben einen "Neue Übergabe"-Button. Im asset-Modus öffnet er
 * HandoverModal (Gerät ist schon bekannt), im user-Modus öffnet er
 * HandoverFromUserModal (führt zusätzlich durch eine Geräteauswahl, da der
 * Startpunkt hier der Benutzer ist, nicht das Gerät).
 */
export default function HandoverList({ asset, sam, mitarbeiter }) {
  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal,     setShowModal]     = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [signModalDoc,  setSignModalDoc]  = useState(null); // Dokument, das gerade signiert wird

  const isAssetMode = !!asset;

  const load = async () => {
    setLoading(true);
    try {
      const res = isAssetMode
        ? await handover.list(asset.HostName)
        : await handover.listByUser(sam);
      setDocs(res.docs || []);
    } catch { setDocs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [asset?.HostName, sam]);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: "var(--brand)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Übergabedokumente ({docs.length})
          </h2>
        </div>
        {isAssetMode ? (
          <button onClick={() => setShowModal(true)} className="btn-primary text-xs py-1">
            <Plus className="w-3 h-3" /> Neue Übergabe
          </button>
        ) : (
          <button onClick={() => setShowUserModal(true)} className="btn-primary text-xs py-1">
            <Plus className="w-3 h-3" /> Neue Übergabe
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand)" }} />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-20"
                    style={{ color: "var(--text-muted)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {isAssetMode
              ? "Noch keine Übergabedokumente für dieses Gerät"
              : "Keine Übergabedokumente für diesen Benutzer"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.filename}
                 className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                 style={{ backgroundColor: "var(--bg-subtle)",
                          border: "1px solid var(--border)" }}>
              <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Im User-Modus: Gerätename anzeigen */}
                  {!isAssetMode && (
                    <span className="flex items-center gap-1 text-xs font-medium font-mono"
                          style={{ color: "var(--text-primary)" }}>
                      <Monitor className="w-3 h-3" />
                      {doc.hostname}
                    </span>
                  )}
                  {/* Im Asset-Modus: SAM anzeigen */}
                  {isAssetMode && (
                    <span className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: "var(--text-primary)" }}>
                      <User className="w-3 h-3" />
                      {doc.sam}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs"
                        style={{ color: "var(--text-muted)" }}>
                    <Calendar className="w-3 h-3" />
                    {doc.datum
                      ? new Date(doc.datum).toLocaleDateString("de-DE")
                      : "–"}
                  </span>
                </div>
              </div>
              <a
                href={`/api/handover/${doc.hostname}/${doc.filename}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary text-xs py-1 shrink-0"
                title="PDF öffnen">
                <Download className="w-3 h-3" /> PDF
              </a>
              {doc.signed ? (
                <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: "var(--success)" }}
                      title="Unterschrieben">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Signiert
                </span>
              ) : (
                <button
                  onClick={() => setSignModalDoc(doc)}
                  className="btn-secondary text-xs py-1 shrink-0 flex items-center gap-1"
                  title="Unterschrift ergänzen">
                  <PenLine className="w-3 h-3" /> Unterschrift ergänzen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && asset && (
        <HandoverModal
          asset={asset}
          onClose={() => setShowModal(false)}
          onCreated={() => load()}
        />
      )}

      {showUserModal && (
        <HandoverFromUserModal
          mitarbeiter={mitarbeiter || { name: sam, sam, abteilung: "" }}
          onClose={() => setShowUserModal(false)}
          onCreated={() => load()}
        />
      )}

      {signModalDoc && (
        <SignatureModal
          hostname={signModalDoc.hostname}
          filename={signModalDoc.filename}
          onClose={() => setSignModalDoc(null)}
          onSigned={() => load()}
        />
      )}
    </div>
  );
}
