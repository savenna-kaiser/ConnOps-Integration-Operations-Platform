import { useState, useEffect } from "react";
import { Shield, Loader2, AlertCircle, Save, Check } from "lucide-react";
import { admin } from "../api/client";
import { formatRoleLabel } from "../utils/roleLabels";

// ─── Tab-Definition ───────────────────────────────────────────────────────────
// Bewusst als Array vorbereitet, auch wenn aktuell nur ein Tab existiert –
// Health/Audit/TopDesk/System/Informationen kommen hier dazu (Phase 6.2),
// ohne dass die Grundstruktur der Seite sich ändern muss.
const TABS = [
  { key: "roles",   label: "Rollen"  },
  { key: "health",  label: "Health"  },
  { key: "audit",   label: "Audit"   },
  { key: "system",  label: "System"  },
  { key: "topdesk", label: "TopDesk" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("roles");

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold mb-1 flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}>
          <Shield className="w-5 h-5" style={{ color: "var(--brand)" }} />
          Einstellungen
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Plattform-Konfiguration — nur für IT-Lead
        </p>
      </div>

      {/* Tab-Navigation */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--border)" }}>
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

      {activeTab === "roles" && <RolesTab />}
      {activeTab === "health" && <HealthTab />}
      {activeTab === "audit" && <AuditTab />}
      {activeTab === "system" && <SystemTab />}
      {activeTab === "topdesk" && <TopdeskInfoTab />}
    </div>
  );
}

// ─── Rollen-Tab ────────────────────────────────────────────────────────────────

function RolesTab() {
  const [roles, setRoles]             = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(null);   // role.id während des Speicherns
  const [savedFlash, setSavedFlash]   = useState(null);    // role.id kurz nach Erfolg
  const [saveError, setSaveError]     = useState(null);    // { roleId, message }

  // Lokaler, noch nicht gespeicherter Zustand pro Rolle: Set<permissionKey>
  const [draft, setDraft] = useState({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const [rolesRes, permsRes] = await Promise.all([
        admin.getRoles(),
        admin.getPermissions(),
      ]);
      setRoles(rolesRes.roles || []);
      setPermissions(permsRes.permissions || []);
      const initialDraft = {};
      for (const r of rolesRes.roles || []) {
        initialDraft[r.id] = new Set(r.permissions);
      }
      setDraft(initialDraft);
    } catch (err) {
      setError(err.message || "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(roleId, key) {
    setDraft(prev => {
      const next = new Set(prev[roleId]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [roleId]: next };
    });
    setSaveError(null);
  }

  function isDirty(roleId) {
    const role = roles.find(r => r.id === roleId);
    if (!role) return false;
    const original = new Set(role.permissions);
    const current  = draft[roleId] || new Set();
    if (original.size !== current.size) return true;
    for (const key of original) if (!current.has(key)) return true;
    return false;
  }

  async function save(roleId) {
    setSaving(roleId); setSaveError(null);
    try {
      const keys = Array.from(draft[roleId] || []);
      await admin.updateRolePermissions(roleId, keys);
      // Lokalen "Original"-Stand nachziehen, damit isDirty() wieder false wird
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: keys } : r));
      setSavedFlash(roleId);
      setTimeout(() => setSavedFlash(null), 2000);
    } catch (err) {
      // Greift z. B. beim Selbst-Aussperr-Schutz (409 vom Backend)
      setSaveError({ roleId, message: err.message });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {roles.map(role => (
        <div key={role.id} className="card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between"
               style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatRoleLabel(role.name)}
              </p>
              {role.description && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {role.description}
                </p>
              )}
            </div>
            <button
              onClick={() => save(role.id)}
              disabled={!isDirty(role.id) || saving === role.id}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
            >
              {saving === role.id
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : savedFlash === role.id
                  ? <Check className="w-3.5 h-3.5" />
                  : <Save className="w-3.5 h-3.5" />}
              {savedFlash === role.id ? "Gespeichert" : "Speichern"}
            </button>
          </div>

          {saveError?.roleId === role.id && (
            <div className="px-4 py-2 text-xs flex items-center gap-2"
                 style={{ backgroundColor: "var(--danger-light, #fef2f2)", color: "var(--danger)" }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {saveError.message}
            </div>
          )}

          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
            {permissions.map(perm => (
              <label
                key={perm.key}
                className="flex items-start gap-2 text-xs cursor-pointer select-none"
                title={perm.description || perm.key}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft[role.id]?.has(perm.key) || false}
                  onChange={() => toggle(role.id, perm.key)}
                />
                <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                  {perm.key}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Health-Tab ────────────────────────────────────────────────────────────────

const HEALTH_LABELS = {
  "health.inactive_days":         "Inaktivitäts-Schwelle (Tage)",
  "health.topdesk_upcoming_days": "TopDesk „anstehend“-Fenster (Tage)",
  "health.wal_warn_bytes":        "Audit-DB WAL-Warnschwelle (Bytes)",
};

function HealthTab() {
  const [settings, setSettings] = useState([]);
  const [draft, setDraft]       = useState({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await admin.getHealthSettings();
      setSettings(res.settings || []);
      const initial = {};
      for (const s of res.settings || []) initial[s.key] = s.value;
      setDraft(initial);
    } catch (err) {
      setError(err.message || "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }

  function change(key, rawValue) {
    const n = parseInt(rawValue, 10);
    setDraft(prev => ({ ...prev, [key]: Number.isNaN(n) ? "" : n }));
    setSaved(false); setSaveError("");
  }

  const isDirty = settings.some(s => draft[s.key] !== s.value);

  async function save() {
    setSaving(true); setSaveError("");
    try {
      await admin.updateHealthSettings(draft);
      setSettings(prev => prev.map(s => ({ ...s, value: draft[s.key] })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Schwellenwerte für die Systemstatus-Seite
        </p>
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved
              ? <Check className="w-3.5 h-3.5" />
              : <Save className="w-3.5 h-3.5" />}
          {saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>

      {saveError && (
        <div className="px-4 py-2 text-xs flex items-center gap-2"
             style={{ backgroundColor: "var(--danger-light, #fef2f2)", color: "var(--danger)" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="p-4 space-y-4">
        {settings.map(s => (
          <div key={s.key}>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              {HEALTH_LABELS[s.key] || s.key}
            </label>
            <input
              type="number"
              min="1"
              className="input w-48"
              value={draft[s.key] ?? ""}
              onChange={e => change(s.key, e.target.value)}
            />
            {s.description && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{s.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Audit-Tab ──────────────────────────────────────────────────────────────────
// Bewusst nur die Log-Aufbewahrung (Betriebsparameter), NICHT die Kategorisierung
// (Audit/System/Sicherheit/Fehler) — die bleibt fest im Code, siehe ADR-Notiz in
// adminConfig.js. Eine andere Aktionstyp-→-Kategorie-Zuordnung ist eine
// Produktentscheidung, keine Laufzeit-Einstellung.

function AuditTab() {
  const [setting, setSetting]     = useState(null);
  const [draft, setDraft]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await admin.getAuditSettings();
      const s = (res.settings || []).find(x => x.key === "audit.retention_days");
      setSetting(s || null);
      setDraft(s ? String(s.value) : "");
    } catch (err) {
      setError(err.message || "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }

  const isDirty = setting && draft !== "" && parseInt(draft, 10) !== setting.value;

  async function save() {
    const n = parseInt(draft, 10);
    if (!Number.isInteger(n) || n <= 0) {
      setSaveError("Bitte eine positive Ganzzahl eingeben.");
      return;
    }
    setSaving(true); setSaveError("");
    try {
      await admin.updateAuditSettings(n);
      setSetting(prev => ({ ...prev, value: n }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between"
             style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Log-Aufbewahrung
          </p>
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saved
                ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
            {saved ? "Gespeichert" : "Speichern"}
          </button>
        </div>

        {saveError && (
          <div className="px-4 py-2 text-xs flex items-center gap-2"
               style={{ backgroundColor: "var(--danger-light, #fef2f2)", color: "var(--danger)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="p-4">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Aufbewahrungsdauer (Tage)
          </label>
          <input
            type="number"
            min="1"
            className="input w-48"
            value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(false); setSaveError(""); }}
          />
          {setting?.description && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{setting.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── System-Tab ─────────────────────────────────────────────────────────────
// TopDesk-Poll-Cron: Enabled + Intervall. Wirkt sofort nach dem Speichern
// (scheduler.configureCron() auf dem Server), kein Neustart nötig.

function SystemTab() {
  const [enabled, setEnabled]         = useState(false);
  const [interval, setInterval_]      = useState("15");
  const [original, setOriginal]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState("");
  const [saved, setSaved]             = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await admin.getSystemSettings();
      const settings = res.settings || [];
      const e = settings.find(s => s.key === "system.topdesk_cron_enabled")?.value ?? false;
      const i = settings.find(s => s.key === "system.topdesk_cron_interval_min")?.value ?? 15;
      setEnabled(e);
      setInterval_(String(i));
      setOriginal({ enabled: e, interval: i });
    } catch (err) {
      setError(err.message || "Fehler beim Laden.");
    } finally {
      setLoading(false);
    }
  }

  const isDirty = original && (
    enabled !== original.enabled || parseInt(interval, 10) !== original.interval
  );

  async function save() {
    const n = parseInt(interval, 10);
    if (!Number.isInteger(n) || n <= 0) {
      setSaveError("Bitte eine positive Ganzzahl eingeben.");
      return;
    }
    setSaving(true); setSaveError("");
    try {
      await admin.updateSystemSettings(enabled, n);
      setOriginal({ enabled, interval: n });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between"
           style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          TopDesk-Poll-Cron
        </p>
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved
              ? <Check className="w-3.5 h-3.5" />
              : <Save className="w-3.5 h-3.5" />}
          {saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>

      {saveError && (
        <div className="px-4 py-2 text-xs flex items-center gap-2"
             style={{ backgroundColor: "var(--danger-light, #fef2f2)", color: "var(--danger)" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {saveError}
        </div>
      )}

      <div className="p-4 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => { setEnabled(e.target.checked); setSaved(false); setSaveError(""); }}
          />
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            Cron aktiv
          </span>
        </label>
        <p className="text-xs -mt-2" style={{ color: "var(--text-muted)" }}>
          Holt neue TopDesk-Changes und speichert sie in der Warteschlange —
          führt sie NICHT automatisch aus (Ausführung bleibt manuell im TopDesk-Tab).
        </p>

        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Intervall (Minuten)
          </label>
          <input
            type="number"
            min="1"
            className="input w-48"
            value={interval}
            disabled={!enabled}
            onChange={e => { setInterval_(e.target.value); setSaved(false); setSaveError(""); }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── TopDesk-Tab ────────────────────────────────────────────────────────────
// Bewusst reine Nur-Lese-Übersicht, kein Formular. Template-IDs und der
// Verarbeitungs-Status-Filter bleiben an .env + Neustart gebunden — ein
// falscher Wert würde TopDesk-Changes sonst lautlos nicht mehr einlesen,
// ohne sichtbare Fehlermeldung (siehe Gespräch zu Phase 6.2).

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
         style={{ borderColor: "var(--border)" }}>
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>
        {value || "–"}
      </span>
    </div>
  );
}

function TopdeskInfoTab() {
  const [info, setInfo]           = useState(null);
  const [urlDraft, setUrlDraft]   = useState("");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true); setError("");
    admin.getTopdeskInfo()
      .then(res => { setInfo(res); setUrlDraft(res.baseUrl || ""); })
      .catch(err => setError(err.message || "Fehler beim Laden."))
      .finally(() => setLoading(false));
  }

  const isDirty = info && urlDraft.trim() !== (info.baseUrl || "");

  async function save() {
    setSaving(true); setSaveError("");
    try {
      await admin.updateTopdeskUrl(urlDraft.trim());
      setInfo(prev => ({ ...prev, baseUrl: urlDraft.trim() }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      load(); // Host-Anzeige aus der neuen URL neu ableiten
    } catch (err) {
      // Verbindungstest im Backend fehlgeschlagen — URL wurde NICHT übernommen
      setSaveError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" style={{ color: "var(--danger)" }} />
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between"
             style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Verbindung
          </p>
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : saved
                ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
            {saving ? "Teste Verbindung…" : saved ? "Gespeichert" : "Speichern"}
          </button>
        </div>

        {saveError && (
          <div className="px-4 py-2 text-xs flex items-center gap-2"
               style={{ backgroundColor: "var(--danger-light, #fef2f2)", color: "var(--danger)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="p-4">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            TopDesk-API-URL
          </label>
          <input
            type="text"
            className="input w-full"
            placeholder="https://topdesk.musterstadt.local"
            value={urlDraft}
            onChange={e => { setUrlDraft(e.target.value); setSaved(false); setSaveError(""); }}
          />
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Wird vor dem Übernehmen getestet — bei fehlgeschlagenem Verbindungstest bleibt die bisherige URL aktiv.
          </p>
        </div>

        <InfoRow label="Verarbeitungs-Status-Filter" value={info?.processStatus} />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
          Template-IDs
        </h2>
        <InfoRow label="Eintritt"          value={info?.templateIds?.EINTRITT}    mono />
        <InfoRow label="Austritt"          value={info?.templateIds?.AUSTRITT}    mono />
        <InfoRow label="Abteilungswechsel" value={info?.templateIds?.ABT_WECHSEL} mono />
      </div>

      <p className="text-xs px-1" style={{ color: "var(--text-muted)" }}>
        Template-IDs und Status-Filter werden in der .env-Datei gepflegt und erfordern einen Serverneustart.
      </p>
    </div>
  );
}
