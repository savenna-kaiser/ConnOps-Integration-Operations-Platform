import { useState, useEffect, useCallback } from "react";
import {
  TicketCheck, AlertTriangle, Clock, CheckCircle,
  XCircle, ChevronDown, ChevronUp, Loader2, RefreshCw,
  Play, Edit2, Check, AlertCircle, ClipboardList,
  Plus, Trash2, Save, Building2, Shield, Search,
} from "lucide-react";
import { topdesk, org, users } from "../api/client";
import { useAuth } from "../hooks/useAuth";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

// hasPermission() kommt jetzt aus useAuth() (Backend-Cache via /api/auth/me),
// keine lokale Kopie der Rolle→Permission-Zuordnung mehr (Phase 6.2).

function StatusBadge({ status }) {
  const map = {
    PENDING:    { color: "var(--text-muted)",  bg: "var(--bg-subtle)",    label: "Ausstehend"     },
    CONFLICT:   { color: "var(--danger)",       bg: "var(--danger-light)", label: "Konflikt"       },
    WARNING:    { color: "#b45309",             bg: "#fef3c7",             label: "Warnung"        },
    PROCESSING: { color: "var(--brand)",        bg: "var(--brand-light)",  label: "In Arbeit"      },
    DONE:       { color: "var(--success)",      bg: "#dcfce7",             label: "Erledigt"       },
    PARTIAL:    { color: "#b45309",             bg: "#fef3c7",             label: "Teilweise"      },
    FAILED:     { color: "var(--danger)",       bg: "var(--danger-light)", label: "Fehlgeschlagen" },
  };
  const s = map[status] || { color: "var(--text-muted)", bg: "var(--bg-subtle)", label: status };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const map = {
    EINTRITT:    { label: "Eintritt",          color: "var(--brand)"  },
    AUSTRITT:    { label: "Austritt",           color: "var(--danger)" },
    ABT_WECHSEL: { label: "Abteilungswechsel", color: "#7c3aed"       },
  };
  const t = map[type] || { label: type, color: "var(--text-muted)" };
  return <span className="text-xs font-medium" style={{ color: t.color }}>{t.label}</span>;
}

function formatDate(d) {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("de-DE");
}

// ─── Validierungs-Anzeige ─────────────────────────────────────────────────────

function ValidationRow({ label, check }) {
  if (!check) return null;
  const icon = check.skipped
    ? <span className="w-3.5 text-center text-xs" style={{ color: "var(--text-muted)" }}>–</span>
    : check.ok
      ? <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} />
      : <XCircle     className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--danger)"  }} />;
  return (
    <div className="flex items-center gap-2 text-xs">
      {icon}
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {check.message && (
        <span style={{ color: check.ok ? "var(--text-muted)" : "var(--danger)" }}>
          — {check.message}
        </span>
      )}
    </div>
  );
}

// ─── Change-Karte ─────────────────────────────────────────────────────────────

function ChangeCard({ change, onRefresh, canExecute }) {
  const [expanded,      setExpanded]      = useState(false);
  const [validation,    setValidation]    = useState(null);
  const [validating,    setValidating]    = useState(false);
  const [executing,     setExecuting]     = useState(false);
  const [overriding,    setOverriding]    = useState(false);
  const [msg,           setMsg]           = useState(null);
  const [overrideKey,   setOverrideKey]   = useState("");
  const [overrideValue, setOverrideValue] = useState("");

  const resolved = change.resolved || {};

  const validate = async () => {
    setValidating(true); setValidation(null);
    try {
      const result = await topdesk.validate(change.change_id);
      setValidation(result);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setValidating(false);
    }
  };

  const execute = async () => {
    if (!window.confirm(`Change ${change.change_id} wirklich ausführen?`)) return;
    setExecuting(true); setMsg(null);
    try {
      const result = await topdesk.execute(change.change_id);
      setMsg({ type: "success", text: `Ausgeführt — Status: ${result.status}` });
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const submitOverride = async () => {
    if (!overrideKey.trim()) return;
    setOverriding(true);
    try {
      await topdesk.override(change.change_id, { [overrideKey.trim()]: overrideValue.trim() });
      setMsg({ type: "success", text: "Override gespeichert." });
      setOverrideKey(""); setOverrideValue("");
      onRefresh();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setOverriding(false);
    }
  };

  const canRun = canExecute &&
    !['DONE','PROCESSING','FAILED'].includes(change.status) &&
    !(resolved.error);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-medium"
                  style={{ color: "var(--text-primary)" }}>
              {change.change_id}
            </span>
            <TypeBadge   type={change.type} />
            <StatusBadge status={change.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs"
               style={{ color: "var(--text-muted)" }}>
            <span>Zieldatum: {formatDate(change.target_date)}</span>
            {resolved.sam        && <span>SAM: {resolved.sam}</span>}
            {resolved.department && <span>Abt: {resolved.department}</span>}
          </div>
          {resolved.error && (
            <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
              ⚠ {resolved.error}
            </p>
          )}
        </div>
        <button onClick={() => setExpanded(e => !e)}
                className="btn-secondary text-xs py-1 shrink-0">
          {expanded
            ? <ChevronUp   className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
          Details
        </button>
      </div>

      {msg && (
        <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
             style={{
               backgroundColor: msg.type === "success" ? "#dcfce7" : "var(--danger-light)",
               color:           msg.type === "success" ? "#15803d" : "var(--danger)",
             }}>
          {msg.type === "success"
            ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
          {msg.text}
        </div>
      )}

      {expanded && (
        <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--border)" }}>

          {/* Soll-Zustand */}
          {!resolved.error && (
            <div>
              <p className="text-xs font-semibold mb-2"
                 style={{ color: "var(--text-secondary)" }}>
                Aufgelöster Soll-Zustand
              </p>
              <div className="rounded-lg p-3 text-xs font-mono space-y-1"
                   style={{ backgroundColor: "var(--bg-subtle)" }}>
                {Object.entries(resolved)
                  .filter(([k]) => !k.startsWith('_') && !['steps','manualTasks'].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span style={{ color: "var(--text-muted)", minWidth: 140 }}>{k}:</span>
                      <span style={{ color: resolved[`_overridden_${k}`] ? "#b45309" : "var(--text-primary)" }}>
                        {Array.isArray(v) ? `[${v.length} Einträge]` : String(v ?? "–")}
                        {resolved[`_overridden_${k}`] && " ✎"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Validierung */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Validierung
              </p>
              <button onClick={validate} disabled={validating}
                      className="btn-secondary text-xs py-0.5 px-2">
                {validating
                  ? <Loader2   className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                Prüfen
              </button>
            </div>
            {validation && (
              <div className="space-y-1">
                <ValidationRow label="SAM verfügbar / vorhanden"
                               check={validation.checks.samAvailable || validation.checks.samExists} />
                <ValidationRow label="Ziel-OU"          check={validation.checks.targetOU} />
                <ValidationRow label="AD-Gruppen"       check={validation.checks.groups} />
                <ValidationRow label="Exchange-DB"      check={validation.checks.exchangeDatabase} />
                <ValidationRow label="TopDesk"          check={validation.checks.topdeskReachable} />
                <div className="pt-1">
                  <span className="text-xs font-medium"
                        style={{ color: validation.valid ? "var(--success)" : "var(--danger)" }}>
                    {validation.valid ? "✓ Alle Prüfungen bestanden" : "✗ Prüfung fehlgeschlagen"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Manueller Override */}
          {canExecute && !['DONE','PROCESSING'].includes(change.status) && (
            <div>
              <p className="text-xs font-semibold mb-2"
                 style={{ color: "var(--text-secondary)" }}>
                Manueller Override
              </p>
              <div className="flex gap-2">
                <input value={overrideKey}
                       onChange={e => setOverrideKey(e.target.value)}
                       placeholder="Feld (z.B. sam)"
                       className="input text-xs flex-1"
                       style={{ padding: "4px 8px" }} />
                <input value={overrideValue}
                       onChange={e => setOverrideValue(e.target.value)}
                       placeholder="Neuer Wert"
                       className="input text-xs flex-1"
                       style={{ padding: "4px 8px" }} />
                <button onClick={submitOverride}
                        disabled={overriding || !overrideKey.trim()}
                        className="btn-secondary text-xs py-1 disabled:opacity-40">
                  {overriding
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Edit2   className="w-3 h-3" />}
                  Setzen
                </button>
              </div>
            </div>
          )}

          {/* Ausführen */}
          {canRun && (
            <div className="pt-1">
              <button onClick={execute} disabled={executing}
                      className="btn-primary text-sm disabled:opacity-40">
                {executing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird ausgeführt…</>
                  : <><Play    className="w-4 h-4" /> Change ausführen</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Verlauf-Karte ────────────────────────────────────────────────────────────

function HistoryCard({ change }) {
  const [expanded, setExpanded] = useState(false);
  const steps = change.steps || [];

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-medium"
                  style={{ color: "var(--text-primary)" }}>
              {change.change_id}
            </span>
            <TypeBadge   type={change.type} />
            <StatusBadge status={change.status} />
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            Ausgeführt: {formatDate(change.processed_at)} · Zieldatum: {formatDate(change.target_date)}
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)}
                className="btn-secondary text-xs py-1 shrink-0">
          {expanded
            ? <ChevronUp   className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />}
          Steps
        </button>
      </div>

      {expanded && steps.length > 0 && (
        <div className="pt-2 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {s.status === 'OK'      && <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} />}
              {s.status === 'FAILED'  && <XCircle     className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--danger)"  }} />}
              {s.status === 'SKIPPED' && <span className="w-3.5 shrink-0 text-center" style={{ color: "var(--text-muted)" }}>–</span>}
              {s.status === 'MANUAL'  && <Check       className="w-3.5 h-3.5 shrink-0" style={{ color: "#b45309" }} />}
              <span style={{ color: "var(--text-primary)" }}>{s.step_name}</span>
              {s.error_message && (
                <span style={{ color: "var(--danger)" }}>— {s.error_message}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rollen-Konfiguration ─────────────────────────────────────────────────────

function GroupSearchModal({ selected, onClose, onSave }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chosen,  setChosen]  = useState(selected || []);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await users.getAllGroups();
      const filtered = (data.groups || []).filter(g =>
        g.Name?.toLowerCase().includes(query.toLowerCase()) ||
        g.SamAccountName?.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
    } catch (err) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (dn) => {
    setChosen(prev =>
      prev.includes(dn) ? prev.filter(d => d !== dn) : [...prev, dn]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="card w-full max-w-lg p-5 space-y-4 mx-4"
           style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            AD-Gruppen auswählen
          </h3>
          <button onClick={onClose} className="btn-secondary text-xs py-1">Abbrechen</button>
        </div>

        <div className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && search()}
                 placeholder="Gruppenname suchen…"
                 className="input text-sm flex-1" />
          <button onClick={search} disabled={loading} className="btn-secondary text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>

        {/* Ausgewählte */}
        {chosen.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>
              Ausgewählt ({chosen.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {chosen.map(dn => (
                <span key={dn}
                      className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                      style={{ backgroundColor: "var(--brand-light)", color: "var(--brand)" }}>
                  {dn.match(/^CN=([^,]+)/)?.[1] || dn}
                  <button onClick={() => toggle(dn)} className="hover:opacity-70">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Suchergebnisse */}
        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1">
            {results.map(g => {
              const isChosen = chosen.includes(g.DistinguishedName);
              return (
                <div key={g.DistinguishedName}
                     onClick={() => toggle(g.DistinguishedName)}
                     className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm"
                     style={{
                       backgroundColor: isChosen ? "var(--brand-light)" : "var(--bg-subtle)",
                       color: isChosen ? "var(--brand)" : "var(--text-primary)",
                     }}>
                  <span className="flex-1">{g.Name}</span>
                  {isChosen && <Check className="w-3.5 h-3.5" />}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t"
             style={{ borderColor: "var(--border)" }}>
          <button onClick={() => onSave(chosen)} className="btn-primary text-sm">
            <Save className="w-4 h-4" /> Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleForm({ role, departmentId, onSave, onCancel }) {
  const [name,        setName]        = useState(role?.name            || "");
  const [adGroups,    setAdGroups]    = useState(role?.ad_groups       || []);
  const [mailboxDb,   setMailboxDb]   = useState(role?.mailbox_database|| "");
  const [mailboxSize, setMailboxSize] = useState(role?.mailbox_size_mb || "");
  const [manualTasks, setManualTasks] = useState(role?.manual_tasks    || []);
  const [description, setDescription]= useState(role?.description      || "");
  const [saving,      setSaving]      = useState(false);
  const [showGroups,  setShowGroups]  = useState(false);
  const [newTask,     setNewTask]     = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        department_id:    departmentId,
        name:             name.trim(),
        ad_groups:        adGroups,
        mailbox_database: mailboxDb.trim() || null,
        mailbox_size_mb:  mailboxSize ? parseInt(mailboxSize, 10) : null,
        manual_tasks:     manualTasks,
        description:      description.trim() || null,
      };
      if (role?.id) await org.updateRole(role.id, body);
      else          await org.createRole(body);
      onSave();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addTask = () => {
    if (!newTask.trim()) return;
    setManualTasks(prev => [...prev, { title: newTask.trim() }]);
    setNewTask("");
  };

  return (
    <div className="space-y-3 p-4 rounded-lg border"
         style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-subtle)" }}>

      <div>
        <label className="text-xs font-medium mb-1 block"
               style={{ color: "var(--text-secondary)" }}>Rollenname *</label>
        <input value={name} onChange={e => setName(e.target.value)}
               className="input text-sm w-full" placeholder="z.B. Sachbearbeiter" />
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block"
               style={{ color: "var(--text-secondary)" }}>AD-Gruppen</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex flex-wrap gap-1 min-h-8 px-2 py-1 rounded-lg border"
               style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-primary)" }}>
            {adGroups.length === 0
              ? <span className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Gruppen</span>
              : adGroups.map(dn => (
                  <span key={dn}
                        className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                        style={{ backgroundColor: "var(--brand-light)", color: "var(--brand)" }}>
                    {dn.match(/^CN=([^,]+)/)?.[1] || dn}
                    <button onClick={() => setAdGroups(prev => prev.filter(d => d !== dn))}
                            className="hover:opacity-70">×</button>
                  </span>
                ))}
          </div>
          <button onClick={() => setShowGroups(true)} className="btn-secondary text-xs py-1 shrink-0">
            <Search className="w-3.5 h-3.5" /> Suchen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block"
                 style={{ color: "var(--text-secondary)" }}>Mailbox-Datenbank</label>
          <input value={mailboxDb} onChange={e => setMailboxDb(e.target.value)}
                 className="input text-sm w-full" placeholder="z.B. Mailbox Database 01" />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block"
                 style={{ color: "var(--text-secondary)" }}>Mailbox-Größe (MB)</label>
          <input value={mailboxSize} onChange={e => setMailboxSize(e.target.value)}
                 type="number" className="input text-sm w-full" placeholder="z.B. 2048" />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block"
               style={{ color: "var(--text-secondary)" }}>Manuelle Tasks</label>
        <div className="space-y-1 mb-2">
          {manualTasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded"
                 style={{ backgroundColor: "var(--bg-primary)" }}>
              <span className="flex-1" style={{ color: "var(--text-primary)" }}>{t.title}</span>
              <button onClick={() => setManualTasks(prev => prev.filter((_, j) => j !== i))}
                      style={{ color: "var(--danger)" }}>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newTask} onChange={e => setNewTask(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && addTask()}
                 placeholder="Neuer Task…" className="input text-xs flex-1" />
          <button onClick={addTask} className="btn-secondary text-xs py-1">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block"
               style={{ color: "var(--text-secondary)" }}>Beschreibung</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
               className="input text-sm w-full" placeholder="Optional" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving || !name.trim()}
                className="btn-primary text-sm disabled:opacity-40">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {role?.id ? "Speichern" : "Erstellen"}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">Abbrechen</button>
      </div>

      {showGroups && (
        <GroupSearchModal
          selected={adGroups}
          onClose={() => setShowGroups(false)}
          onSave={(groups) => { setAdGroups(groups); setShowGroups(false); }}
        />
      )}
    </div>
  );
}

function OrgTab({ canWrite }) {
  const [departments, setDepartments] = useState([]);
  const [roles,       setRoles]       = useState({});
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState({});
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptOU,   setNewDeptOU]   = useState("");
  const [addingDept,  setAddingDept]  = useState(false);
  const [showDeptForm,setShowDeptForm]= useState(false);
  const [editDept,    setEditDept]    = useState(null);
  const [addingRole,  setAddingRole]  = useState(null);
  const [editRole,    setEditRole]    = useState(null);
  const [msg,         setMsg]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const deptRes = await org.getDepartments();
      setDepartments(deptRes.departments || []);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRoles = async (deptId) => {
    try {
      const res = await org.getRoles(deptId);
      setRoles(prev => ({ ...prev, [deptId]: res.roles || [] }));
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
  };

  const toggleDept = (id) => {
    setExpanded(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id] && !roles[id]) loadRoles(id);
      return next;
    });
  };

  const createDept = async () => {
    if (!newDeptName.trim() || !newDeptOU.trim()) return;
    setAddingDept(true);
    try {
      await org.createDepartment({ name: newDeptName.trim(), ad_ou: newDeptOU.trim() });
      setNewDeptName(""); setNewDeptOU(""); setShowDeptForm(false);
      setMsg({ type: "success", text: "Abteilung erstellt." });
      await load();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setAddingDept(false);
    }
  };

  const deleteDept = async (id) => {
    if (!window.confirm("Abteilung wirklich löschen? Alle Rollen werden ebenfalls gelöscht.")) return;
    try {
      await org.deleteDepartment(id);
      setMsg({ type: "success", text: "Abteilung gelöscht." });
      await load();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
  };

  const deleteRole = async (id, deptId) => {
    if (!window.confirm("Rolle wirklich löschen?")) return;
    try {
      await org.deleteRole(id);
      setMsg({ type: "success", text: "Rolle gelöscht." });
      await loadRoles(deptId);
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  return (
    <div className="space-y-4">

      {msg && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
             style={{
               backgroundColor: msg.type === "success" ? "#dcfce7" : "var(--danger-light)",
               color:           msg.type === "success" ? "#15803d" : "var(--danger)",
             }}>
          {msg.type === "success"
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Abteilungen und Rollen verwalten
        </p>
        {canWrite && (
          <button onClick={() => setShowDeptForm(f => !f)}
                  className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Abteilung
          </button>
        )}
      </div>

      {/* Neue Abteilung */}
      {showDeptForm && (
        <div className="card p-4 space-y-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Neue Abteilung
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Name *</label>
              <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)}
                     className="input text-sm w-full" placeholder="z.B. Finanzen" />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>AD-OU *</label>
              <input value={newDeptOU} onChange={e => setNewDeptOU(e.target.value)}
                     className="input text-sm w-full"
                     placeholder="OU=Finanzen,DC=musterstadt,DC=example,DC=de" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createDept} disabled={addingDept || !newDeptName.trim() || !newDeptOU.trim()}
                    className="btn-primary text-sm disabled:opacity-40">
              {addingDept ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Erstellen
            </button>
            <button onClick={() => setShowDeptForm(false)} className="btn-secondary text-sm">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Abteilungsliste */}
      {departments.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="w-8 h-8 mx-auto mb-2 opacity-20"
                     style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Noch keine Abteilungen angelegt
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map(dept => (
            <div key={dept.id} className="card overflow-hidden">

              {/* Abteilungs-Header */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                   onClick={() => toggleDept(dept.id)}
                   style={{ backgroundColor: "var(--bg-subtle)" }}>
                <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {dept.name}
                  </p>
                  <p className="text-xs font-mono truncate" style={{ color: "var(--text-muted)" }}>
                    {dept.ad_ou}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditDept(dept)}
                            className="btn-secondary text-xs py-0.5 px-2">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => deleteDept(dept.id)}
                            className="text-xs py-0.5 px-2 rounded"
                            style={{ color: "var(--danger)" }}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {expanded[dept.id]
                  ? <ChevronUp   className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
                  : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
              </div>

              {/* Abteilung bearbeiten */}
              {editDept?.id === dept.id && (
                <div className="px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Name</label>
                      <input value={editDept.name}
                             onChange={e => setEditDept(d => ({ ...d, name: e.target.value }))}
                             className="input text-sm w-full" />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>AD-OU</label>
                      <input value={editDept.ad_ou}
                             onChange={e => setEditDept(d => ({ ...d, ad_ou: e.target.value }))}
                             className="input text-sm w-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={async () => {
                      try {
                        await org.updateDepartment(editDept.id, {
                          name: editDept.name, ad_ou: editDept.ad_ou
                        });
                        setEditDept(null);
                        setMsg({ type: "success", text: "Abteilung aktualisiert." });
                        await load();
                      } catch (err) {
                        setMsg({ type: "error", text: err.message });
                      }
                    }} className="btn-primary text-sm">
                      <Save className="w-4 h-4" /> Speichern
                    </button>
                    <button onClick={() => setEditDept(null)} className="btn-secondary text-sm">
                      Abbrechen
                    </button>
                  </div>
                </div>
              )}

              {/* Rollen */}
              {expanded[dept.id] && (
                <div className="px-4 py-3 space-y-2 border-t"
                     style={{ borderColor: "var(--border)" }}>

                  {(roles[dept.id] || []).map(role => (
                    <div key={role.id}>
                      {editRole?.id === role.id ? (
                        <RoleForm
                          role={editRole}
                          departmentId={dept.id}
                          onSave={async () => {
                            setEditRole(null);
                            setMsg({ type: "success", text: "Rolle aktualisiert." });
                            await loadRoles(dept.id);
                          }}
                          onCancel={() => setEditRole(null)}
                        />
                      ) : (
                        <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                             style={{ backgroundColor: "var(--bg-subtle)" }}>
                          <Shield className="w-4 h-4 shrink-0 mt-0.5"
                                  style={{ color: "var(--text-muted)" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium"
                               style={{ color: "var(--text-primary)" }}>
                              {role.name}
                            </p>
                            <div className="text-xs mt-0.5 space-y-0.5"
                                 style={{ color: "var(--text-muted)" }}>
                              <p>{(role.ad_groups || []).length} Gruppe(n)</p>
                              {role.mailbox_database && (
                                <p>Mailbox: {role.mailbox_database}
                                  {role.mailbox_size_mb && ` (${role.mailbox_size_mb} MB)`}
                                </p>
                              )}
                              {(role.manual_tasks || []).length > 0 && (
                                <p>{role.manual_tasks.length} manueller Task(s)</p>
                              )}
                            </div>
                          </div>
                          {canWrite && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => setEditRole(role)}
                                      className="btn-secondary text-xs py-0.5 px-2">
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => deleteRole(role.id, dept.id)}
                                      className="text-xs py-0.5 px-2 rounded"
                                      style={{ color: "var(--danger)" }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Neue Rolle */}
                  {addingRole === dept.id ? (
                    <RoleForm
                      departmentId={dept.id}
                      onSave={async () => {
                        setAddingRole(null);
                        setMsg({ type: "success", text: "Rolle erstellt." });
                        await loadRoles(dept.id);
                      }}
                      onCancel={() => setAddingRole(null)}
                    />
                  ) : canWrite && (
                    <button onClick={() => setAddingRole(dept.id)}
                            className="btn-secondary text-xs py-1 w-full justify-center">
                      <Plus className="w-3.5 h-3.5" /> Rolle hinzufügen
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export default function TopDeskPage() {
  const { user, hasPermission } = useAuth();
  const canExecute = hasPermission("topdesk:process-single");
  const canWrite   = hasPermission("org:write");
  const canOrgRead = hasPermission("org:read");

  const [tab,      setTab]      = useState("active");
  const [active,   setActive]   = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterFrom,   setFilterFrom]   = useState("");
  const [filterTo,     setFilterTo]     = useState("");

  const loadActive = useCallback(async () => {
    try {
      const r = await topdesk.active();
      setActive(r.changes || []);
    } catch (err) { setError(err.message); }
  }, []);

  const loadUpcoming = useCallback(async () => {
    try {
      const r = await topdesk.upcoming();
      setUpcoming(r.changes || []);
    } catch (err) { setError(err.message); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const params = {};
      if (filterType)   params.type   = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterFrom)   params.from   = filterFrom;
      if (filterTo)     params.to     = filterTo;
      const r = await topdesk.history(params);
      setHistory(r.changes || []);
    } catch (err) { setError(err.message); }
  }, [filterType, filterStatus, filterFrom, filterTo]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (tab === "active")   await loadActive();
    if (tab === "upcoming") await loadUpcoming();
    if (tab === "history")  await loadHistory();
    setLoading(false);
  }, [tab, loadActive, loadUpcoming, loadHistory]);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { id: "active",   label: "Aktuell",              count: active.length   },
    { id: "upcoming", label: "Ausstehend",            count: upcoming.length },
    { id: "history",  label: "Verlauf",               count: null            },
    ...(canOrgRead ? [{ id: "org", label: "Rollen-Konfiguration", count: null }] : []),
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TicketCheck className="w-5 h-5" style={{ color: "var(--brand)" }} />
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            TopDesk Changes
          </h1>
        </div>
        {tab !== "org" && (
          <button onClick={load} disabled={loading} className="btn-secondary text-sm">
            {loading
              ? <Loader2   className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            Aktualisieren
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
             style={{ backgroundColor: "var(--danger-light)", color: "var(--danger)" }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className="px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5"
                  style={{
                    color:        tab === t.id ? "var(--brand)"            : "var(--text-muted)",
                    borderBottom: tab === t.id ? "2px solid var(--brand)"  : "2px solid transparent",
                  }}>
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: "var(--brand-light)", color: "var(--brand)" }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Aktuell */}
      {tab === "active" && (
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
            </div>
          )}
          {!loading && active.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-20"
                           style={{ color: "var(--success)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Keine aktiven Changes</p>
            </div>
          )}
          {!loading && active.map(c => (
            <ChangeCard key={c.change_id} change={c}
                        onRefresh={loadActive} canExecute={canExecute} />
          ))}
        </div>
      )}

      {/* Tab: Ausstehend */}
      {tab === "upcoming" && (
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
            </div>
          )}
          {!loading && upcoming.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-20"
                     style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Keine ausstehenden Changes
              </p>
            </div>
          )}
          {!loading && upcoming.map(c => (
            <div key={c.change_id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium"
                          style={{ color: "var(--text-primary)" }}>
                      {c.change_id}
                    </span>
                    <TypeBadge type={c.type} />
                  </div>
                  <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Zieldatum: {formatDate(c.target_date)}
                    {c.resolved?.sam        && ` · SAM: ${c.resolved.sam}`}
                    {c.resolved?.department && ` · Abt: ${c.resolved.department}`}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Verlauf */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="card p-3 flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Typ</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                      className="input text-xs" style={{ padding: "4px 8px" }}>
                <option value="">Alle</option>
                <option value="EINTRITT">Eintritt</option>
                <option value="AUSTRITT">Austritt</option>
                <option value="ABT_WECHSEL">Abteilungswechsel</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                      className="input text-xs" style={{ padding: "4px 8px" }}>
                <option value="">Alle</option>
                <option value="DONE">Erledigt</option>
                <option value="PARTIAL">Teilweise</option>
                <option value="FAILED">Fehlgeschlagen</option>
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Von</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                     className="input text-xs" style={{ padding: "4px 8px" }} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--text-muted)" }}>Bis</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                     className="input text-xs" style={{ padding: "4px 8px" }} />
            </div>
            <button onClick={loadHistory} className="btn-secondary text-xs py-1.5">
              Filtern
            </button>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
            </div>
          )}
          {!loading && history.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-20"
                             style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Keine Einträge</p>
            </div>
          )}
          {!loading && history.map(c => (
            <HistoryCard key={c.change_id} change={c} />
          ))}
        </div>
      )}

      {/* Tab: Rollen-Konfiguration */}
      {tab === "org" && canOrgRead && (
        <OrgTab canWrite={canWrite} />
      )}
    </div>
  );
}