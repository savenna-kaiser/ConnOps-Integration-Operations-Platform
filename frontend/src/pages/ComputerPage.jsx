import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Monitor, Search, Power, PowerOff, Loader2,
  AlertCircle, CheckCircle, XCircle, User,
  RefreshCw, ChevronLeft, Wifi, WifiOff, Database, LogOut,
} from "lucide-react";

// Parst ein Datum, das entweder als ISO-8601 (Backend liefert das jetzt
// standardmaessig, siehe psWorker.ps1/citrixService.js) oder im aelteren
// deutschen Format "DD.MM.YYYY HH:MM[:SS]" ankommt. ISO wird von new Date()
// nativ verstanden; das deutsche Format braucht weiterhin manuelles Parsen
// als Fallback, falls irgendwo noch unkonvertierte Altwerte auftauchen.
function parseGermanDate(str) {
  if (!str) return null;
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;
  const [date, time] = str.split(" ");
  const parts = (date || "").split(".");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const parsed = new Date(`${y}-${m}-${d}T${time || "00:00"}`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

import { computers, citrix, docusnap } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import HandoverList from "../components/user/HandoverList";
import ConfirmDialog from "../components/ConfirmDialog";

// hasPermission() kommt jetzt aus useAuth() (Backend-Cache via /api/auth/me),
// keine lokale Kopie der Rolle→Permission-Zuordnung mehr (Phase 6.2).

// ─── Suchergebnis-Zeile ───────────────────────────────────────────────────────
function ComputerRow({ computer, onClick }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors"
      style={{ borderBottom: "1px solid var(--border)" }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-subtle)"}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
      <td className="px-4 py-3 font-mono text-sm font-medium"
          style={{ color: "var(--text-primary)" }}>
        {computer.Name}
      </td>
      <td className="px-4 py-3">
        {computer.Enabled
          ? <span className="badge badge-success flex items-center gap-1 w-fit">
              <CheckCircle className="w-3 h-3" />Aktiv
            </span>
          : <span className="badge badge-danger flex items-center gap-1 w-fit">
              <XCircle className="w-3 h-3" />Deaktiviert
            </span>
        }
      </td>
      <td className="px-4 py-3 text-xs font-mono truncate max-w-xs"
          style={{ color: "var(--text-muted)" }}
          title={computer.DistinguishedName}>
        {computer.DistinguishedName}
      </td>
    </tr>
  );
}

// ─── Computer-Detailansicht ───────────────────────────────────────────────────
function ComputerDetail({ name }) {
  const navigate        = useNavigate();
  const { user: me, hasPermission } = useAuth();
  const [session, setSession]       = useState(null);
  const [actionMsg, setActionMsg]   = useState(null);
  const [actionLoading, setActionLoading] = useState("");
  const [computer, setComputer]     = useState(null);
  const [docusnapAsset, setDocusnapAsset] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [confirmAction, setConfirmAction] = useState(null); // "disable" | "enable" | null

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [searchRes, sessionRes, docusnapRes] = await Promise.allSettled([
        computers.search(name),
        citrix.sessionForClient(name),
        // Service Tag (BiosSerial) kommt nur aus Docusnap, nicht aus AD —
        // AD kennt dieses Feld nicht. Gleiche Datenquelle wie im User-Flow
        // (HandoverFromUserModal), damit das Übergabedokument unabhängig
        // vom Einstiegspunkt denselben Service Tag zeigt.
        docusnap.assets(),
      ]);
      if (searchRes.status === "fulfilled") {
        const found = searchRes.value.results?.find(
          c => c.Name?.toLowerCase() === name.toLowerCase()
        );
        setComputer(found || null);
      }
      if (sessionRes.status === "fulfilled") setSession(sessionRes.value.session);
      if (docusnapRes.status === "fulfilled") {
        const found = docusnapRes.value.assets?.find(
          a => a.HostName?.toLowerCase() === name.toLowerCase()
        );
        setDocusnapAsset(found || null);
      }
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (label, fn) => {
    setActionLoading(label); setActionMsg(null);
    try {
      await fn();
      setActionMsg({ type: "success", text: `${label} erfolgreich.` });
      await load();
    } catch (err) {
      setActionMsg({ type: "error", text: err.message });
    } finally { setActionLoading(""); }
  };

  const confirmActionNow = async () => {
    if (!confirmAction) return;
    if (confirmAction === "disable") await doAction("Deaktivieren", () => computers.disable(name));
    if (confirmAction === "enable")  await doAction("Aktivieren",   () => computers.enable(name));
    setConfirmAction(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <button onClick={() => navigate("/computer")} className="hover:underline">Computer</button>
        <span>/</span>
        <span style={{ color: "var(--text-primary)" }}>{name}</span>
        <button onClick={load} className="ml-auto"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {actionMsg && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
             style={actionMsg.type === "error"
               ? { backgroundColor: "var(--danger-light)", color: "var(--danger)" }
               : { backgroundColor: "#dcfce7", color: "#15803d" }}>
          {actionMsg.type === "success"
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {actionMsg.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">

          {/* Computer-Header */}
          <div className="card p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                   style={{ backgroundColor: computer?.Enabled ? "var(--brand)" : "var(--text-muted)" }}>
                <Monitor className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold font-mono"
                      style={{ color: "var(--text-primary)" }}>{name}</h1>
                  {computer?.Enabled
                    ? <span className="badge badge-success">Aktiv</span>
                    : <span className="badge badge-danger">Deaktiviert</span>}
                </div>
                {computer?.DistinguishedName && (
                  <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                    {computer.DistinguishedName}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Aktionen */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
              Aktionen
            </h2>
            <div className="flex gap-2">
              {hasPermission("computer:enable") && !computer?.Enabled && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => setConfirmAction("enable")}
                  className="btn-primary text-sm disabled:opacity-40">
                  {actionLoading === "Aktivieren"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Power className="w-4 h-4" />}
                  Aktivieren
                </button>
              )}
              {hasPermission("computer:disable") && computer?.Enabled && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => setConfirmAction("disable")}
                  className="btn-danger text-sm disabled:opacity-40">
                  {actionLoading === "Deaktivieren"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <PowerOff className="w-4 h-4" />}
                  Deaktivieren
                </button>
              )}
              <button
                onClick={() => navigate(`/docusnap/${name}`)}
                className="btn-secondary text-sm">
                <Database className="w-4 h-4" />
                In Docusnap öffnen
              </button>
            </div>
          </div>
        </div>

        {/* Citrix-Session / Aktueller User */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4" style={{ color: "var(--brand)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
              Aktueller Benutzer
            </h2>
          </div>

          {session ? (
            <div className="space-y-3">
              <div className="flex items-center gap-1 mb-2">
                {session.sessionState?.toLowerCase() === "active"
                  ? <Wifi className="w-3 h-3" style={{ color: "var(--success)" }} />
                  : <WifiOff className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {session.sessionState}
                </span>
              </div>

              {session.userName && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Benutzer</p>
                  <button
                    onClick={() => {
                      const sam = session.userName.includes("\\")
                        ? session.userName.split("\\")[1]
                        : session.userName;
                      navigate(`/user/${sam}`);
                    }}
                    className="text-sm font-medium hover:underline"
                    style={{ color: "var(--brand)" }}>
                    {session.userFullName || session.userName}
                  </button>
                </div>
              )}

              {session.machineName && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Citrix-Server</p>
                  <p className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                    {session.machineName}
                  </p>
                </div>
              )}

              {session.sessionStart && (
                <div>
                  <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Angemeldet seit</p>
                  <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                    {parseGermanDate(session.sessionStart)?.toLocaleString("de-DE") ?? "–"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <User className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Kein aktiver Benutzer
              </p>
            </div>
          )}

            {/* Citrix Abmelden */}
            {session && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <button
                  disabled={actionLoading === "CitrixLogoff"}
                  onClick={() => doAction("CitrixLogoff", () =>
                    citrix.logoff(
                      session.sessionUid,
                      session.userFullName || session.userName
                    )
                  )}
                  className="btn-danger w-full text-sm justify-center disabled:opacity-40">
                  {actionLoading === "CitrixLogoff"
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Abmelden läuft… (60s)</>
                    : <><LogOut className="w-4 h-4" /> Session abmelden</>}
                </button>
                <p className="text-xs mt-1.5 text-center" style={{ color: "var(--text-muted)" }}>
                  Benutzer erhält 60s Vorwarnung
                </p>
              </div>
            )}
        </div>
      </div>

      {/* ── Übergabedokumente ──────────────────────────────────────────── */}
      {computer && (
        <HandoverList asset={{
          HostName:          name,
          BiosSerial:        docusnapAsset?.BiosSerial || computer.BiosSerial || "",
          Modell:            docusnapAsset?.SystemProductName || computer.SystemProductName || computer.Name,
          SystemProductName: docusnapAsset?.SystemProductName || computer.SystemProductName || "",
        }} />
      )}

      {confirmAction === "disable" && (
        <ConfirmDialog
          title="Computer deaktivieren?"
          message={`Sind Sie sich wirklich sicher, dass Sie „${name}" deaktivieren möchten?`}
          confirmLabel="Deaktivieren"
          loading={actionLoading === "Deaktivieren"}
          onConfirm={confirmActionNow}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === "enable" && (
        <ConfirmDialog
          title="Computer aktivieren?"
          message={`„${name}" wirklich aktivieren?`}
          confirmLabel="Aktivieren"
          danger={false}
          loading={actionLoading === "Aktivieren"}
          onConfirm={confirmActionNow}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────
export default function ComputerPage() {
  const { name }        = useParams();
  const navigate        = useNavigate();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Wenn ein Name in der URL steht → Detailansicht
  if (name) return <ComputerDetail name={name} />;

  const doSearch = async (e) => {
    e?.preventDefault();
    if (query.length < 2) return;
    setLoading(true); setSearched(true);
    try {
      const data = await computers.search(query);
      setResults(data.results || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Computer
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Suche nach Computername
        </p>
      </div>

      <form onSubmit={doSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-muted)" }} />
          <input
            className="input pl-10"
            placeholder="z.B. EPN-PC-001, CLIENT123…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" disabled={loading || query.length < 2}
                className="btn-primary disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Suchen"}
        </button>
      </form>

      {searched && !loading && (
        <div className="card overflow-hidden">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <Monitor className="w-10 h-10 mx-auto mb-3 opacity-20"
                       style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Kein Computer für „{query}" gefunden
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)",
                             backgroundColor: "var(--bg-subtle)" }}>
                  {["Computername", "Status", "OU"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((c, i) => (
                  <ComputerRow
                    key={c.Name || i}
                    computer={c}
                    onClick={() => navigate(`/computer/${c.Name}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!searched && (
        <div className="text-center py-16">
          <Monitor className="w-12 h-12 mx-auto mb-3 opacity-10"
                   style={{ color: "var(--text-primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Gib einen Computernamen ein um zu suchen
          </p>
        </div>
      )}
    </div>
  );
}
