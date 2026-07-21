import { useState, useEffect } from "react";
import {
  X, FileText, Monitor, Package, Loader2,
  CheckSquare, Square, Search,
} from "lucide-react";
import { docusnap, handover } from "../../api/client";
import AdUserSearchField from "./AdUserSearchField";

const ZUBEHOER_OPTIONS = [
  "Monitor",
  "Netzteil",
  "Dockingstation",
  "Tasche / Rucksack",
  "Maus",
  "Tastatur",
  "Headset",
  "Netzwerkkabel",
  "USB-Hub",
  "Sonstiges",
];

export default function HandoverFromUserModal({ mitarbeiter, onClose, onCreated }) {
  const [step,             setStep]             = useState(1); // 1=Gerät, 2=Zubehör, 3=Bestätigung
  const [assets,           setAssets]           = useState([]);
  const [loadingAssets,    setLoadingAssets]    = useState(true);
  const [assetSearch,      setAssetSearch]      = useState("");
  const [selectedAsset,    setSelectedAsset]    = useState(null);
  const [zubehoer,         setZubehoer]         = useState(
    ZUBEHOER_OPTIONS.map(label => ({ label, checked: false }))
  );
  const [bemerkung,        setBemerkung]        = useState("");
  const [ausgehaendigtVon, setAusgehaendigtVon] = useState("");
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState("");

  // Assets laden (gefiltert auf IT-Büro)
  useEffect(() => {
    (async () => {
      setLoadingAssets(true);
      try {
        const res = await docusnap.assets();
        const pool = (res.assets || []).filter(a => a.Status === "IT-Büro");
        setAssets(pool);
      } catch { setAssets([]); }
      finally { setLoadingAssets(false); }
    })();
  }, []);

  const filteredAssets = assets.filter(a => {
    const q = assetSearch.toLowerCase();
    return !q
      || a.HostName?.toLowerCase().includes(q)
      || a.SystemProductName?.toLowerCase().includes(q)
      || a.BiosSerial?.toLowerCase().includes(q);
  });

  const toggleZubehoer = (label) => {
    setZubehoer(z => z.map(item =>
      item.label === label ? { ...item, checked: !item.checked } : item
    ));
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await handover.create({
        hostname:         selectedAsset.HostName,
        biosSerial:       selectedAsset.BiosSerial,
        modell:           selectedAsset.SystemProductName,
        mitarbeiter,
        datum:            new Date().toISOString().slice(0, 10),
        ausgehaendigtVon,
        zubehoer,
        bemerkung,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>

      <div
        className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b"
             style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: "var(--brand)" }}>
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                Übergabedokument erstellen
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {mitarbeiter.name} · {mitarbeiter.sam}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step-Indicator */}
        <div className="flex items-center gap-0 px-6 pt-4">
          {[
            { n: 1, label: "Gerät wählen" },
            { n: 2, label: "Zubehör" },
            { n: 3, label: "Bestätigung" },
          ].map(({ n, label }, i) => (
            <div key={n} className="flex items-center flex-1">
              <button
                onClick={() => { if (n < step || (n === 2 && selectedAsset)) setStep(n); }}
                className="flex items-center gap-2 text-xs font-medium">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: step >= n ? "var(--brand)" : "var(--bg-subtle)",
                    color: step >= n ? "white" : "var(--text-muted)",
                  }}>
                  {n}
                </span>
                <span style={{ color: step === n ? "var(--brand)" : "var(--text-muted)" }}>
                  {label}
                </span>
              </button>
              {i < 2 && (
                <div className="flex-1 h-px mx-2" style={{ backgroundColor: "var(--border)" }} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── Schritt 1: Gerät wählen ───────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Geräte mit Status <strong>IT-Büro</strong> ({assets.length} verfügbar):
              </p>

              {/* Suche */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: "var(--text-muted)" }} />
                <input
                  className="input pl-10 w-full"
                  placeholder="Hostname, Modell oder Service Tag…"
                  value={assetSearch}
                  onChange={e => setAssetSearch(e.target.value)}
                  autoFocus
                />
              </div>

              {loadingAssets ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
                </div>
              ) : filteredAssets.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                  {assetSearch ? "Kein Gerät gefunden." : "Keine Geräte im IT-Büro verfügbar."}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {filteredAssets.map(a => (
                    <button
                      key={a.HostName + a.BiosSerial}
                      onClick={() => setSelectedAsset(a)}
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
                      style={{
                        backgroundColor: selectedAsset?.HostName === a.HostName
                          ? "color-mix(in srgb, var(--brand) 10%, transparent)"
                          : "var(--bg-subtle)",
                        border: `1px solid ${selectedAsset?.HostName === a.HostName
                          ? "color-mix(in srgb, var(--brand) 40%, transparent)"
                          : "var(--border)"}`,
                      }}>
                      <Monitor className="w-4 h-4 shrink-0"
                               style={{ color: selectedAsset?.HostName === a.HostName
                                 ? "var(--brand)" : "var(--text-muted)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-mono truncate"
                           style={{ color: "var(--text-primary)" }}>
                          {a.HostName}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                          {a.SystemProductName || "–"}
                          {a.BiosSerial ? ` · ${a.BiosSerial}` : ""}
                        </p>
                      </div>
                      {selectedAsset?.HostName === a.HostName && (
                        <span className="text-xs font-medium shrink-0"
                              style={{ color: "var(--brand)" }}>✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Ausgehändigt von */}
              <div className="pt-2">
                <AdUserSearchField
                  label="Ausgehändigt von (IT-Mitarbeiter)"
                  placeholder="Name des IT-Mitarbeiters…"
                  value={ausgehaendigtVon}
                  onChange={setAusgehaendigtVon}
                />
              </div>
            </div>
          )}

          {/* ── Schritt 2: Zubehör ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Wähle das mitgelieferte Zubehör aus:
              </p>
              <div className="space-y-1">
                {zubehoer.map(item => (
                  <button
                    key={item.label}
                    onClick={() => toggleZubehoer(item.label)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                    style={{
                      backgroundColor: item.checked
                        ? "color-mix(in srgb, var(--brand) 8%, transparent)"
                        : "var(--bg-subtle)",
                      border: `1px solid ${item.checked
                        ? "color-mix(in srgb, var(--brand) 30%, transparent)"
                        : "var(--border)"}`,
                    }}>
                    {item.checked
                      ? <CheckSquare className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
                      : <Square      className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
                    <span className="text-sm" style={{
                      color: item.checked ? "var(--brand)" : "var(--text-primary)",
                      fontWeight: item.checked ? 500 : 400,
                    }}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <label className="block text-xs font-medium mb-1.5"
                       style={{ color: "var(--text-secondary)" }}>
                  Bemerkung (optional)
                </label>
                <textarea
                  className="input w-full resize-none"
                  rows={3}
                  placeholder="Weitere Hinweise zur Übergabe…"
                  value={bemerkung}
                  onChange={e => setBemerkung(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ── Schritt 3: Bestätigung ────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl p-4 space-y-3"
                   style={{ backgroundColor: "var(--bg-subtle)",
                            border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
                     style={{ color: "var(--text-muted)" }}>
                  <FileText className="w-3.5 h-3.5" /> Zusammenfassung
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Mitarbeiter</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {mitarbeiter.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Abteilung</span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {mitarbeiter.abteilung || "–"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Gerät</span>
                    <span className="font-medium font-mono" style={{ color: "var(--text-primary)" }}>
                      {selectedAsset?.HostName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Modell</span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {selectedAsset?.SystemProductName || "–"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Service Tag</span>
                    <span className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                      {selectedAsset?.BiosSerial || "–"}
                    </span>
                  </div>
                </div>
                {zubehoer.filter(z => z.checked).length > 0 && (
                  <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Zubehör:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {zubehoer.filter(z => z.checked).map(z => (
                        <span key={z.label}
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "var(--brand)", color: "white" }}>
                          {z.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {bemerkung && (
                  <div className="pt-2 border-t text-xs"
                       style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <span className="font-medium">Bemerkung:</span> {bemerkung}
                  </div>
                )}
              </div>

              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Nach dem Bestätigen wird ein PDF generiert und beim Gerät sowie beim
                Benutzer hinterlegt.
              </p>

              {error && (
                <p className="text-xs px-3 py-2 rounded-lg"
                   style={{ backgroundColor: "var(--danger-light)", color: "var(--danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t"
             style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="btn-secondary text-sm">
            {step > 1 ? "Zurück" : "Abbrechen"}
          </button>

          {step < 3 ? (
            <button
              disabled={step === 1 && !selectedAsset}
              onClick={() => setStep(s => s + 1)}
              className="btn-primary text-sm disabled:opacity-40">
              Weiter
            </button>
          ) : (
            <button
              disabled={saving}
              onClick={handleSave}
              className="btn-primary text-sm disabled:opacity-40">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> PDF wird erstellt…</>
                : <><FileText className="w-4 h-4" /> Dokument erstellen</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
