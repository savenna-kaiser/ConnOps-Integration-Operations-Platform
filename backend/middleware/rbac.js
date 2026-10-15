/**
 * rbac.js – Role-Based Access Control (Phase 6.1)
 *
 * Architektur (Entkopplung in vier Stufen):
 *   AD-Gruppe → interne Rolle → Permissions → Middleware → API
 *
 * Rollen und Permissions liegen jetzt in PostgreSQL (roles, permissions,
 * role_permissions, ad_group_roles) statt im Code / in .env. Ein
 * In-Memory-Cache (Map<Role, Set<Permission>>) wird beim Server-Start aus
 * der DB geladen – hasPermission()/requirePermission() greifen NUR auf
 * diesen Cache zu, nie direkt auf die DB (keine DB-Abfrage pro Request).
 *
 * Rollenzuweisung (Login-Zeitpunkt, siehe getRoleForUser):
 *   memberOf → ad_group_roles (Tabelle). Kein Treffer → explizite Ablehnung
 *   (null), kein Login. Security-Review 3.1 (16.07.2026): .env-Fallback und
 *   Default-Rolle bei fehlendem Treffer wurden entfernt — vorher erhielt
 *   jeder gueltige AD-Account mit korrektem Passwort Zugriff, auch ausserhalb
 *   der vorgesehenen AD-Gruppen.
 */

const db = require("../data/db");

// ─── Rollen-Konstanten ────────────────────────────────────────────────────────
// Bleiben als benannte Konstanten bestehen, damit bestehender Code (Vergleiche
// wie role === ROLES.IT_LEAD in health.js/auditRoute.js) unverändert funktioniert.
// Die eigentliche Permission-Zuordnung kommt jetzt aus der DB, nicht mehr aus
// einem hartkodierten Objekt.

const ROLES = {
  HELPDESK: "helpdesk",
  IT_ADMIN: "it-admin",
  IT_LEAD:  "it-lead",
};

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

/** @type {Map<string, Set<string>>} */
let roleCache = new Map();
let cacheReady = false;

/**
 * Lädt roles + permissions + role_permissions aus PostgreSQL neu in den
 * In-Memory-Cache. Wird beim Server-Start aufgerufen (siehe server.js) und
 * später von der Konfigurationsseite (Phase 6.2) nach Änderungen an
 * role_permissions – dann ohne Serverneustart.
 */
async function reloadCache() {
  const { rows } = await db.query(
    `SELECT r.name AS role_name, p.key AS permission_key
     FROM roles r
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p       ON p.id = rp.permission_id`
  );

  const next = new Map();
  for (const row of rows) {
    if (!next.has(row.role_name)) next.set(row.role_name, new Set());
    next.get(row.role_name).add(row.permission_key);
  }

  roleCache = next;
  cacheReady = true;
  console.log(`[RBAC] Cache geladen: ${roleCache.size} Rolle(n), ${rows.length} Zuordnung(en).`);
}

/**
 * Initialer Cache-Aufbau beim Server-Start. Wirft bei Fehler, damit der
 * Server nicht ohne funktionierendes RBAC hochfährt (fail-fast, analog zur
 * bestehenden REQUIRED_ENV-Prüfung in server.js).
 */
async function initCache() {
  await reloadCache();
}

// ─── Rollenzuweisung ─────────────────────────────────────────────────────────

/**
 * Ermittelt die Rolle anhand der AD-Gruppenmitgliedschaft des Users.
 * Wird beim Login aufgerufen – das Ergebnis landet in der Session.
 *
 * ACHTUNG: async (DB-Abfrage gegen ad_group_roles) – anders als vorher.
 * Aufrufer (routes/auth.js) muss dies awaiten.
 *
 * @param {string}   samAccountName
 * @param {string[]} [memberOf]  – DN-Liste der Gruppen aus dem Login-Response
 * @returns {Promise<string>} Rolle
 */
/**
 * Ermittelt die Rolle anhand der AD-Gruppenmitgliedschaft des Users.
 * Wird beim Login aufgerufen – das Ergebnis landet in der Session.
 *
 * SECURITY-REVIEW 3.1 (16.07.2026): Vorher gab es zwei riskante Fallbacks —
 * einen .env-SAM-Listen-Fallback und einen Default auf ROLES.HELPDESK, wenn
 * gar nichts traf. Damit erhielt JEDER gueltige AD-Account mit korrektem
 * Passwort Zugriff, auch wenn er in keiner der vorgesehenen AD-Gruppen war.
 * Beide Fallbacks sind jetzt entfernt: kein Treffer in ad_group_roles fuehrt
 * zu einer expliziten Ablehnung (Rueckgabewert null) statt einer Rolle.
 * routes/auth.js muss das behandeln (403, kein automatischer Login).
 *
 * @param {string}   samAccountName
 * @param {string[]} [memberOf]  – DN-Liste der Gruppen aus dem Login-Response
 * @returns {Promise<string|null>} Rolle, oder null wenn keine AD-Gruppen-Zuordnung existiert
 */
async function getRoleForUser(samAccountName, memberOf = []) {
  if (memberOf.length === 0) return null;

  const groupNames = memberOf
    .map(dn => {
      const match = dn.match(/^CN=([^,]+)/i);
      return match ? match[1].toLowerCase() : "";
    })
    .filter(Boolean);

  if (groupNames.length === 0) return null;

  const { rows } = await db.query(
    `SELECT r.name AS role_name
     FROM ad_group_roles agr
     JOIN roles r ON r.id = agr.role_id
     WHERE LOWER(agr.ad_group_name) = ANY($1::text[])`,
    [groupNames]
  );
  if (rows.length === 0) return null;

  // Höchste Berechtigungsstufe gewinnt, falls ein User (theoretisch)
  // in mehreren zugeordneten Gruppen gleichzeitig ist.
  const found = rows.map(r => r.role_name);
  if (found.includes(ROLES.IT_LEAD))  return ROLES.IT_LEAD;
  if (found.includes(ROLES.IT_ADMIN)) return ROLES.IT_ADMIN;
  if (found.includes(ROLES.HELPDESK)) return ROLES.HELPDESK;
  return found[0]; // benutzerdefinierte Rolle jenseits der drei Standardrollen
}

/**
 * Prüft ob eine Rolle eine bestimmte Berechtigung hat.
 * SYNCHRON – liest nur aus dem In-Memory-Cache, kein DB-Zugriff.
 */
function hasPermission(role, permission) {
  if (!cacheReady) {
    // Sollte nie passieren, wenn initCache() beim Start korrekt awaitet wurde.
    console.error("[RBAC] hasPermission() aufgerufen, bevor der Cache geladen war!");
    return false;
  }
  const perms = roleCache.get(role);
  return perms ? perms.has(permission) : false;
}

/**
 * Liefert alle Permission-Keys einer Rolle als Array.
 * Für /api/auth/me – das Frontend bekommt die tatsächliche Permission-Liste
 * statt selbst eine Kopie der Rolle→Permission-Zuordnung zu pflegen
 * (behebt das Duplikat-Problem aus UserPage.jsx & Co., siehe Phase 6.2).
 * SYNCHRON – liest nur aus dem In-Memory-Cache.
 */
function getPermissionsForRole(role) {
  if (!cacheReady) return [];
  const perms = roleCache.get(role);
  return perms ? Array.from(perms) : [];
}

// ─── Express-Middleware ───────────────────────────────────────────────────────

/**
 * Gibt eine Middleware zurück die prüft ob der eingeloggte User
 * die geforderte Berechtigung hat.
 *
 * Verwendung in Routen:
 *   router.post("/:sam/disable", requirePermission("user:disable"), async (req, res) => { ... })
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session?.user?.role;
    if (!role) {
      return res.status(401).json({ error: "Nicht angemeldet." });
    }
    if (!hasPermission(role, permission)) {
      req.audit?.log({
        action:     "ACCESS_DENIED",
        target:     req.path,
        targetType: "route",
        result:     "failure",
        details:    { requiredPermission: permission, userRole: role },
      });
      return res.status(403).json({
        error: `Fehlende Berechtigung: ${permission}`,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  getRoleForUser,
  hasPermission,
  getPermissionsForRole,
  requirePermission,
  initCache,
  reloadCache,
};
