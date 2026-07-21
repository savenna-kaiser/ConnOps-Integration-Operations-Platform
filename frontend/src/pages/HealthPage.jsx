import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, CheckCircle2, AlertTriangle, Loader2,
  Cpu, RefreshCw, Clock, RotateCcw, Database,
  TicketCheck, Users, Monitor, FileClock,
} from "lucide-react";
import { health } from "../api/client";

const POLL_INTERVAL_MS = 15000;

// Tab-Definition, analog zum Muster aus AdminPage.jsx (Phase 6.2) – bewusst
// gleiches Konzept, damit sich lange Seiten im Projekt konsistent anfühlen.
const TABS = [
  { key: "system",  label: "System"  },
  { key: "betrieb", label: "Betrieb" },
];

function formatUptime(seconds) {
  if (seconds == null) return "–";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d} Tag${d === 1 ? "" : "e"}`);
  if (h) parts.push(`${h} Std.`);
  if (m) parts.push(`${m} Min.`);
  if (!d && !h) parts.push(`${s} Sek.`);
  return parts.join(" ");
}

function formatDate(dateStr) {
  if (!dateStr) return "–";
  return new Date(dateStr).toLocaleDateString("de-DE");
}

function StatusBadge({ status }) {
  if (status == null) {
    return <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />;
  }
  if (status === "ok") return <span className="badge badge-success">OK</span>;
  if (status === "warning" || status === "degraded") {
    return <span className="badge badge-warning">Warnung</span>;
  }
  return <span className="badge badge-danger">Fehler</span>;
}

function ServiceRow({ icon: Icon, label, status, detail }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
         style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
        <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{label}</span>
        {detail && (
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{detail}</span>
        )}
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function CountTile({ label, count, tone = "neutral" }) {
  const colors = {
    neutral: { bg: "var(--bg-subtle)",  text: "var(--text-primary)" },
    danger:  { bg: "var(--danger-light)", text: "var(--danger)" },
    warning: { bg: "#fef9c3",           text: "#92400e" },
    success: { bg: "#dcfce7",           text: "#15803d" },
  };
  const c = colors[count > 0 ? tone : "neutral"];
  return (
    <div className="rounded-lg p-3 text-center" style={{ backgroundColor: c.bg }}>
      <p className="text-2xl font-semibold" style={{ color: c.text }}>{count ?? "–"}</p>
      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  );
}

function CategoryCard({ icon: Icon, title, error, children }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}>
        <Icon className="w-4 h-4" /> {title}
      </h2>
      {error ? (
        <p className="text-sm flex items-center gap-2" style={{ color: "var(--danger)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      ) : children}
    </div>
  );
}

export default function HealthPage() {
  const [data,       setData]       = useState(null);
  const [overview,   setOverview]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState("system");
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const result = await health.check();
      if (!result || Object.keys(result).length === 0) {
        setError("Keine Antwort vom Server erhalten.");
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err.message || "Health-Check fehlgeschlagen.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      firstLoad.current = false;
    }

    try {
      const result = await health.overview();
      setOverview(result);
    } catch {
      // Zusatz-Checks schlagen still fehl, blockieren nicht die Hauptansicht
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const isOk       = data?.status === "ok";
  const workers    = data?.workers || [];
  const readyCount = workers.filter(w => w.ready).length;

  const sys      = overview?.systemStatus;
  const benutzer = overview?.benutzer;
  const computer = overview?.computer;
  const aufgaben = overview?.topdeskAufgaben;

  return (
    <div className="max-w-3xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}>
            <Activity className="w-6 h-6" style={{ color: "var(--brand)" }} />
            Systemstatus
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Überblick über eure Systemlandschaft
          </p>
        </div>
        <button onClick={load} disabled={loading || refreshing}
                className="btn-secondary text-sm disabled:opacity-40">
          {refreshing
            ? <Loader2   className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          Aktualisieren
        </button>
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
              Status konnte nicht abgerufen werden
            </p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Status-Banner – betrifft den Gesamtzustand, bleibt tab-übergreifend oben */}
          <div className="card p-5 flex items-center gap-4"
               style={{
                 backgroundColor: isOk ? "#dcfce7" : "var(--danger-light)",
                 borderColor:     isOk ? "#86efac" : "var(--danger)",
               }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                 style={{ backgroundColor: isOk ? "#16a34a" : "var(--danger)" }}>
              {isOk
                ? <CheckCircle2  className="w-6 h-6 text-white" />
                : <AlertTriangle className="w-6 h-6 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold"
                 style={{ color: isOk ? "#15803d" : "var(--danger)" }}>
                {isOk ? "Alle Systeme betriebsbereit" : "Eingeschränkter Betrieb"}
              </p>
              <p className="text-sm" style={{ color: isOk ? "#15803d" : "var(--danger)" }}>
                {isOk
                  ? `${readyCount} von ${workers.length} PowerShell-Workern bereit`
                  : `Nur ${readyCount} von ${workers.length} PowerShell-Workern bereit`}
              </p>
            </div>
            <span className="badge shrink-0" style={{
              backgroundColor: "rgba(255,255,255,0.6)",
              color: isOk ? "#15803d" : "var(--danger)",
            }}>
              {data?.status}
            </span>
          </div>

          {/* Kennzahlen – ebenfalls tab-übergreifend */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1"
                   style={{ color: "var(--text-muted)" }}>
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Server-Laufzeit</span>
              </div>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatUptime(data?.uptime)}
              </p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1"
                   style={{ color: "var(--text-muted)" }}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">Letzte Prüfung</span>
              </div>
              <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {data?.ts ? new Date(data.ts).toLocaleTimeString("de-DE") : "–"}
              </p>
            </div>
          </div>

          {/* Tab-Navigation */}
          <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
                style={{
                  borderColor: activeTab === tab.key ? "var(--brand)" : "transparent",
                  color:       activeTab === tab.key ? "var(--brand)" : "var(--text-muted)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── Tab: System — "Läuft die Infrastruktur?" ─────────────────── */}
          {activeTab === "system" && (
            <div className="space-y-4">
              <CategoryCard icon={Cpu} title="Systemstatus">
                <ServiceRow icon={Cpu}          label="PowerShell-Worker (AD/Exchange)" status={sys?.worker?.status}
                            detail={sys ? `${sys.worker.ready}/${sys.worker.total}` : ""} />
                <ServiceRow icon={TicketCheck}  label="TopDesk-API"    status={sys?.topdesk?.status} />
                <ServiceRow icon={Database}     label="PostgreSQL"     status={sys?.postgres?.status} />
                <ServiceRow icon={RefreshCw}    label="TopDesk-Sync"   status={sys?.topdeskCron?.status}
                            detail={sys?.topdeskCron?.enabled
                              ? `alle ${sys.topdeskCron.intervalMin} Min.`
                              : "deaktiviert"} />
                <ServiceRow icon={Database}     label="Audit-DB (WAL)" status={overview?.system?.auditDb?.status} />
                <ServiceRow icon={FileClock}    label="Docusnap-Import" status={overview?.docusnap?.status}
                            detail={overview?.docusnap?.sourceFile?.mtime
                              ? `zuletzt ${formatDate(overview.docusnap.sourceFile.mtime)}`
                              : ""} />
              </CategoryCard>

              <div className="card p-4">
                <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"
                    style={{ color: "var(--text-secondary)" }}>
                  <Cpu className="w-4 h-4" /> PowerShell-Worker ({workers.length})
                </h2>
                {workers.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Keine Worker-Informationen verfügbar
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {workers.map((w) => (
                      <div key={w.id}
                           className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg"
                           style={{ backgroundColor: "var(--bg-subtle)" }}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate"
                             style={{ color: "var(--text-primary)" }}>
                            Worker {w.id}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`badge ${w.ready ? "badge-success" : "badge-danger"}`}>
                              {w.ready ? "Bereit" : "Nicht bereit"}
                            </span>
                            {w.busy && <span className="badge badge-warning">Aktiv</span>}
                          </div>
                        </div>
                        {w.restarts > 0 && (
                          <div className="flex items-center gap-1 shrink-0 text-xs"
                               style={{ color: "var(--warning)" }}
                               title="Anzahl Neustarts">
                            <RotateCcw className="w-3 h-3" />
                            {w.restarts}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Tab: Betrieb — "Was braucht menschliche Aufmerksamkeit?" ──── */}
          {activeTab === "betrieb" && (
            <div className="space-y-4">
              <CategoryCard icon={TicketCheck} title="TopDesk-Aufgaben" error={aufgaben?.error}>
                <div className="grid grid-cols-4 gap-2">
                  <CountTile label="Überfällig" count={aufgaben?.counts.ueberfaellig} tone="danger" />
                  <CountTile label="Anstehend"  count={aufgaben?.counts.anstehend}    tone="warning" />
                  <CountTile label="Geplant"    count={aufgaben?.counts.geplant}      tone="neutral" />
                  <CountTile label="Fehler"     count={aufgaben?.counts.fehler}       tone="danger" />
                </div>
                {aufgaben && (
                  <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                    „Anstehend" = fällig innerhalb {aufgaben.thresholds.upcomingDays} Tagen
                  </p>
                )}
              </CategoryCard>

              <CategoryCard icon={Users} title="Benutzer" error={benutzer?.error}>
                <div className="grid grid-cols-2 gap-2">
                  <CountTile label="Gesperrt" count={benutzer?.locked?.length} tone="danger" />
                  <CountTile label={`Inaktiv (>${overview?.thresholds.inactiveDays}T.)`}
                             count={benutzer?.inactive?.length} tone="warning" />
                </div>
              </CategoryCard>

              <CategoryCard icon={Monitor} title="Computer" error={computer?.error}>
                <div className="grid grid-cols-3 gap-2">
                  <CountTile label="Ohne Status" count={computer?.withoutStatus?.length} tone="warning" />
                  <CountTile label={`Inaktiv (>${overview?.thresholds.inactiveDays}T.)`}
                             count={computer?.inactive?.length} tone="warning" />
                  <CountTile label="Ohne Docusnap" count={computer?.notInDocusnap?.length} tone="neutral" />
                </div>
              </CategoryCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
