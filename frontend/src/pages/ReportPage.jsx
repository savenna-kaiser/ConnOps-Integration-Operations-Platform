import { useState, useEffect, useCallback } from "react";
import {
  FileBarChart, Loader2, AlertTriangle, RefreshCw,
  Users, Monitor, TicketCheck, Calendar, Download,
} from "lucide-react";
import { report } from "../api/client";

const RANGE_OPTIONS = [
  { key: "7d",  label: "7 Tage" },
  { key: "14d", label: "2 Wochen" },
  { key: "21d", label: "3 Wochen" },
  { key: "1m",  label: "1 Monat" },
  { key: "custom", label: "Freier Zeitraum" },
];

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
         style={{ borderColor: "var(--border)" }}>
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
      <span className="text-lg font-semibold" style={{ color: "var(--brand)" }}>
        {value ?? 0}
      </span>
    </div>
  );
}

function CategoryCard({ icon: Icon, title, children }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}>
        <Icon className="w-4 h-4" /> {title}
      </h2>
      {children}
    </div>
  );
}

export default function ReportPage() {
  const [range,      setRange]      = useState("7d");
  const [customFrom,  setCustomFrom]  = useState("");
  const [customTo,    setCustomTo]    = useState("");
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  const load = useCallback(async () => {
    if (range === "custom" && (!customFrom || !customTo)) return;

    setLoading(true);
    setError("");
    try {
      const params = { range };
      if (range === "custom") {
        params.from = customFrom;
        params.to   = customTo;
      }
      const result = await report.get(params);
      setData(result);
    } catch (err) {
      setError(err.message || "Report konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [range, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  // Gleiche Parameter-Logik wie im load()-Aufruf, damit der Export exakt
  // den Zeitraum trifft, der gerade angezeigt wird.
  const exportParams = { range };
  if (range === "custom") {
    exportParams.from = customFrom;
    exportParams.to   = customTo;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}>
            <FileBarChart className="w-6 h-6" style={{ color: "var(--brand)" }} />
            Report
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {data?.range?.label || "Zeitraum wählen"}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-sm disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Aktualisieren
        </button>
      </div>

      {/* Export – exportiert denselben Zeitraum, der gerade angezeigt wird.
          Kein request()-Aufruf: direkter Download-Link, Browser laedt die
          Datei mit Session-Cookie (siehe api/client.js exportUrl()). */}
      {!loading && !error && data && (
        <div className="flex gap-2 justify-end -mt-2">
          <a
            href={report.exportUrl("pdf", exportParams)}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
          <a
            href={report.exportUrl("csv", exportParams)}
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
        </div>
      )}

      {/* Zeitraum-Filter */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={range === opt.key ? "btn-primary text-xs py-1.5 px-3" : "btn-secondary text-xs py-1.5 px-3"}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                   className="input text-sm py-1" />
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>bis</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                   className="input text-sm py-1" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
        </div>
      ) : error ? (
        <div className="card p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Report konnte nicht geladen werden
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{error}</p>
          </div>
        </div>
      ) : (
        <>
          <CategoryCard icon={Users} title="Benutzer">
            <StatRow label="Benutzer angelegt"          value={data?.benutzer?.angelegt} />
            <StatRow label="Benutzer deaktiviert"       value={data?.benutzer?.deaktiviert} />
            <StatRow label="Passwort zurückgesetzt"     value={data?.benutzer?.passwortZurueckgesetzt} />
            <StatRow label="Benutzer entsperrt"         value={data?.benutzer?.entsperrt} />
          </CategoryCard>

          <CategoryCard icon={Monitor} title="Computer">
            <StatRow label="Geräte deaktiviert" value={data?.computer?.deaktiviert} />
          </CategoryCard>

          <CategoryCard icon={TicketCheck} title="TopDesk">
            <StatRow label="Eintritte"   value={data?.topdesk?.eintritte} />
            <StatRow label="Austritte"   value={data?.topdesk?.austritte} />
            <StatRow label="Änderungen"  value={data?.topdesk?.aenderungen} />
            {data?.topdesk?.error && (
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--danger)" }}>
                <AlertTriangle className="w-3 h-3" /> {data.topdesk.error}
              </p>
            )}
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Nur erfolgreich abgeschlossene Changes (Status „DONE")
            </p>
          </CategoryCard>
        </>
      )}
    </div>
  );
}
