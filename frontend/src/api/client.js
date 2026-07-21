/**
 * api/client.js – Zentraler API-Client
 * Alle Requests gehen über /api (Vite-Proxy → localhost:3000)
 */

const BASE = "/api";

async function request(method, path, body = null) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    if (!window.location.pathname.includes("/login")) {
      window.location.href = "/login";
    }
    return;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error || `Fehler ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  login:  (username, password) => request("POST", "/auth/login",  { username, password }),
  logout: ()                   => request("POST", "/auth/logout"),
  me:     ()                   => request("GET",  "/auth/me"),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = {
  search:        (q)            => request("GET",    `/users/search?q=${encodeURIComponent(q)}`),
  enable:        (sam)          => request("POST",   `/users/${sam}/enable`),
  disable:       (sam)          => request("POST",   `/users/${sam}/disable`),
  unlock:        (sam)          => request("POST",   `/users/${sam}/unlock`),
  resetPassword: (sam, body)    => request("POST",   `/users/${sam}/reset-password`, body),
  edit:          (sam, changes) => request("PUT",    `/users/${sam}/edit`, changes),
  getGroups:     (sam)          => request("GET",    `/users/${sam}/groups`),
  getAllGroups:   ()             => request("GET",    "/users/groups/all"),
  addGroup:      (sam, groupDn) => request("POST",   `/users/${sam}/groups`, { groupDn }),
  removeGroup:   (sam, groupDn) => request("DELETE", `/users/${sam}/groups/${encodeURIComponent(groupDn)}`),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const audit = {
  get: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/audit${qs ? "?" + qs : ""}`);
  },
  meta:   ()          => request("GET", "/audit/meta"),
  export: (params={}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/audit/export${qs ? "?" + qs : ""}`);
  },
};

// ─── Computers ───────────────────────────────────────────────────────────────
export const computers = {
  search:  (q)    => request("GET",  `/computers/search?q=${encodeURIComponent(q)}`),
  enable:  (name) => request("POST", `/computers/${name}/enable`),
  disable: (name) => request("POST", `/computers/${name}/disable`),
};

// ─── Citrix ──────────────────────────────────────────────────────────────────
export const citrix = {
  sessionForUser:   (sam)  => request("GET",  `/citrix/session/${sam}`),
  sessionForClient: (name) => request("GET",  `/citrix/client/${encodeURIComponent(name)}`),
  activeSessions:   ()     => request("GET",  "/citrix/active"),
  logoff: (sessionUid, userName) =>
    request("POST", "/citrix/logoff", { sessionUid, userName }),
};

// ─── Docusnap ────────────────────────────────────────────────────────────────
export const docusnap = {
  assets: ()                                          => request("GET",  "/docusnap/assets"),
  stats:  ()                                          => request("GET",  "/docusnap/stats"),
  update: (HostName, BiosSerial, status, kommentar)  =>
    request("POST", "/docusnap/update", { HostName, BiosSerial, status, kommentar }),
  import: ()                                          => request("POST", "/docusnap/import"),
};

// ─── TopDesk ─────────────────────────────────────────────────────────────────
export const topdesk = {
  active:   ()               => request("GET",   "/topdesk/changes/active"),
  upcoming: ()               => request("GET",   "/topdesk/changes/upcoming"),
  history:  (params = {})    => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/topdesk/changes/history${qs ? "?" + qs : ""}`);
  },
  validate: (changeId)       => request("GET",   `/topdesk/changes/${changeId}/validate`),
  execute:  (changeId)       => request("POST",  `/topdesk/changes/${changeId}/execute`),
  override: (changeId, body) => request("PUT",   `/topdesk/changes/${changeId}/override`, body),
  // pending()/process() werden aktuell in der UI nicht mehr aufgerufen
  // (Scheduler holt seit der Umstellung nur noch ab, führt nicht mehr automatisch aus).
  // Kein passender Backend-Endpunkt vorhanden — vor Reaktivierung erst prüfen/ergänzen.
  pending:  ()               => request("GET",   "/topdesk/pending"),
  process:  ()               => request("POST",  "/topdesk/process"),
};

// ─── Org (Abteilungen & Rollen) ──────────────────────────────────────────────
export const org = {
  getDepartments:   ()             => request("GET",    "/org/departments"),
  createDepartment: (body)         => request("POST",   "/org/departments", body),
  updateDepartment: (id, body)     => request("PUT",    `/org/departments/${id}`, body),
  deleteDepartment: (id)           => request("DELETE", `/org/departments/${id}`),
  getRoles:         (deptId)       => request("GET",    `/org/departments/${deptId}/roles`),
  createRole:       (deptId, body) => request("POST",   `/org/departments/${deptId}/roles`, body),
  updateRole:       (id, body)     => request("PUT",    `/org/roles/${id}`, body),
  deleteRole:       (id)           => request("DELETE", `/org/roles/${id}`),
};

// ─── Handover ────────────────────────────────────────────────────────────────
export const handover = {
  create:     (data)     => request("POST", "/handover", data),
  list:       (hostname) => request("GET",  `/handover/${encodeURIComponent(hostname)}`),
  listByUser: (sam)      => request("GET",  `/handover/user/${encodeURIComponent(sam)}`),
  addSignature: (hostname, filename, signatureDataUrl) =>
    request("POST", `/handover/${encodeURIComponent(hostname)}/${encodeURIComponent(filename)}/signature`,
      { signature: signatureDataUrl }),
};

// ─── Health ──────────────────────────────────────────────────────────────────
// Eigener Aufruf statt request(): ein "degraded" Status (HTTP 503) ist ein
// gültiges, informatives Ergebnis und soll nicht als Fehler geworfen werden.
export const health = {
  check: async () => {
    const res  = await fetch(`${BASE}/health`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    return data;
  },
  overview: () => request("GET", "/health/overview"),
};

// ─── Report ──────────────────────────────────────────────────────────────────
export const report = {
  get: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/report${qs ? "?" + qs : ""}`);
  },
  // Kein request() hier bewusst: liefert eine Datei (PDF/CSV), kein JSON.
  // Wird direkt als href/window.open genutzt, Browser laedt automatisch
  // mit Session-Cookie (selbes Origin ueber IIS-Reverse-Proxy).
  exportUrl: (format, params = {}) => {
    const qs = new URLSearchParams({ ...params, format }).toString();
    return `${BASE}/report/export?${qs}`;
  },
};

// ─── Admin (Konfigurationsbereich, Phase 6.2) ────────────────────────────────
// Aktuell nur der Rollen-Tab. Weitere Funktionen kommen hinzu, sobald die
// übrigen Tabs (Health, Audit, TopDesk, System) gebaut werden.
export const admin = {
  getPermissions:      ()                  => request("GET", "/admin/permissions"),
  getRoles:            ()                  => request("GET", "/admin/roles"),
  updateRolePermissions: (roleId, keys)    =>
    request("PUT", `/admin/roles/${roleId}/permissions`, { permissionKeys: keys }),
  getHealthSettings:   ()                  => request("GET", "/admin/settings/health"),
  updateHealthSettings: (values)           => request("PUT", "/admin/settings/health", values),
  getAuditSettings:    ()                  => request("GET", "/admin/settings/audit"),
  updateAuditSettings: (retentionDays)     =>
    request("PUT", "/admin/settings/audit", { "audit.retention_days": retentionDays }),
  getSystemSettings:   ()                  => request("GET", "/admin/settings/system"),
  updateSystemSettings: (enabled, intervalMin) =>
    request("PUT", "/admin/settings/system", {
      "system.topdesk_cron_enabled": enabled,
      "system.topdesk_cron_interval_min": intervalMin,
    }),
  getTopdeskInfo:      ()                  => request("GET", "/admin/settings/topdesk"),
  updateTopdeskUrl:    (url)               => request("PUT", "/admin/settings/topdesk", { "topdesk.base_url": url }),
};