/**
 * auditLog.js – Enterprise Audit-Log
 *
 * Zwei Schreibsenken parallel:
 *   1. Winston  → logs/audit-YYYY-MM-DD.log (30 Tage Rotation, gzip)
 *   2. SQLite   → data/audit.db (durchsuchbar, paginierbar, indiziert)
 *
 * Lesen erfolgt ausschließlich aus SQLite.
 */

const winston = require("winston");
require("winston-daily-rotate-file");
const path   = require("path");
const fs     = require("fs");
const pgPool = require("../data/db"); // Umbenannt, da "db" bereits für die lokale SQLite-Instanz vergeben ist

// ─── Pfade ────────────────────────────────────────────────────────────────────

const logDir = path.join(__dirname, "../logs");
const dbDir  = path.join(__dirname, "../data");

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
if (!fs.existsSync(dbDir))  fs.mkdirSync(dbDir,  { recursive: true });

// ─── ACTION_TYPES ─────────────────────────────────────────────────────────────

const ACTION_TYPES = {
  LOGIN:           "AUTH_LOGIN",
  LOGOUT:          "AUTH_LOGOUT",
  LOGIN_FAILED:    "AUTH_LOGIN_FAILED",
  USER_SEARCH:     "USER_SEARCH",
  USER_ENABLE:     "USER_ENABLE",
  USER_CREATE:     "USER_CREATE",
  USER_DISABLE:    "USER_DISABLE",
  USER_UNLOCK:     "USER_UNLOCK",
  USER_RESET_PWD:  "USER_RESET_PASSWORD",
  USER_EDIT:       "USER_EDIT",
  USER_MOVE:       "USER_MOVE",
  GROUP_ADD:       "GROUP_ADD_MEMBER",
  GROUP_REMOVE:    "GROUP_REMOVE_MEMBER",
  COMPUTER_SEARCH: "COMPUTER_SEARCH",
  COMPUTER_ENABLE: "COMPUTER_ENABLE",
  COMPUTER_DISABLE:"COMPUTER_DISABLE",
  COMPUTER_MOVE:   "COMPUTER_MOVE",
  CITRIX_LOGOFF:      "CITRIX_LOGOFF",
  HANDOVER_CREATED:   "HANDOVER_CREATED",
  TEAMVIEWER_OPEN: "TEAMVIEWER_OPEN",
  OOO_SET:         "OUT_OF_OFFICE_SET",
  ACCESS_DENIED:   "ACCESS_DENIED",
  TOPDESK_INGEST:       "TOPDESK_INGEST",
  TOPDESK_EXECUTE:      "TOPDESK_EXECUTE",
  TOPDESK_STEP_OK:      "TOPDESK_STEP_OK",
  TOPDESK_STEP_FAIL:    "TOPDESK_STEP_FAIL",
  TOPDESK_OVERRIDE:     "TOPDESK_OVERRIDE",
  TOPDESK_MANUAL_DONE:  "TOPDESK_MANUAL_DONE",
};

// ─── Kategorisierung für die 4 Audit-Tabs ────────────────────────────────────
// Grundregel (siehe getCategoryFilter): result="failure" sticht immer und
// landet unter "fehler", unabhängig vom Aktionstyp. Die Listen hier gelten
// nur für result="success". USER_SEARCH/COMPUTER_SEARCH bewusst in keiner
// Kategorie enthalten (reine Lesezugriffe, nicht Teil der kategorisierten
// Tabs — über die normale, ungefilterte Suche weiterhin auffindbar).
const CATEGORY_ACTIONS = {
  audit: [
    "USER_CREATE", "USER_ENABLE", "USER_DISABLE", "USER_UNLOCK",
    "USER_RESET_PASSWORD", "USER_EDIT", "USER_MOVE",
    "GROUP_ADD_MEMBER", "GROUP_REMOVE_MEMBER",
    "COMPUTER_ENABLE", "COMPUTER_DISABLE", "COMPUTER_MOVE",
    "CITRIX_LOGOFF", "HANDOVER_CREATED", "TEAMVIEWER_OPEN", "OUT_OF_OFFICE_SET",
    "ORG_DEPARTMENT_CREATE", "ORG_DEPARTMENT_UPDATE", "ORG_DEPARTMENT_DELETE",
    "ORG_ROLE_CREATE", "ORG_ROLE_UPDATE", "ORG_ROLE_DELETE",
    "TOPDESK_OVERRIDE", "TOPDESK_MANUAL_DONE",
  ],
  system: [
    "TOPDESK_INGEST", "TOPDESK_EXECUTE", "TOPDESK_STEP_OK", "TOPDESK_CRON_RUN",
  ],
  sicherheit: [
    "AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_SESSION_EXPIRED",
  ],
};

/**
 * Übersetzt einen Tab-Namen (audit/system/sicherheit/fehler) in einen
 * Filter für queryAuditLog(). "fehler" ignoriert die Aktionsliste bewusst:
 * jede fehlgeschlagene Aktion gehört dorthin, unabhängig vom Typ.
 */
function getCategoryFilter(category) {
  if (category === "fehler") {
    return { result: "failure" };
  }
  if (CATEGORY_ACTIONS[category]) {
    return { actions: CATEGORY_ACTIONS[category], result: "success" };
  }
  return null; // unbekannte Kategorie → kein Filter (Aufrufer sollte das prüfen)
}

// ─── SQLite ───────────────────────────────────────────────────────────────────

let db = null;
let insertStmt = null;

function getDb() {
  if (db) return db;
  try {
    const Database = require("better-sqlite3");
    db = new Database(path.join(dbDir, "audit.db"));

    // WAL-Mode für bessere Concurrent-Write-Performance
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT    NOT NULL,
        actor       TEXT    NOT NULL DEFAULT 'unknown',
        role        TEXT,
        action      TEXT    NOT NULL,
        target      TEXT,
        target_type TEXT,
        result      TEXT    NOT NULL DEFAULT 'success',
        error       TEXT,
        ip          TEXT,
        request_id  TEXT,
        details     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ts         ON audit_log(ts);
      CREATE INDEX IF NOT EXISTS idx_actor      ON audit_log(actor);
      CREATE INDEX IF NOT EXISTS idx_action     ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_target     ON audit_log(target);
      CREATE INDEX IF NOT EXISTS idx_result     ON audit_log(result);
    `);

    insertStmt = db.prepare(`
      INSERT INTO audit_log
        (ts, actor, role, action, target, target_type, result, error, ip, request_id, details)
      VALUES
        (@ts, @actor, @role, @action, @target, @target_type, @result, @error, @ip, @request_id, @details)
    `);

    console.log("[Audit] SQLite-Datenbank bereit:", path.join(dbDir, "audit.db"));
  } catch (err) {
    console.error("[Audit] SQLite nicht verfügbar – nur Winston-Logging aktiv:", err.message);
    console.error("[Audit] Bitte 'npm install better-sqlite3' im Backend ausführen.");
  }
  return db;
}

// ─── Winston ──────────────────────────────────────────────────────────────────
// fileTransport wird über eine Factory erzeugt (statt einmal als Konstante),
// damit applyRetentionSetting() ihn zur Laufzeit mit geändertem maxFiles neu
// erzeugen und im Logger austauschen kann (Phase 6.2, Audit-Tab).
const DEFAULT_RETENTION_DAYS = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || "30", 10);

function makeFileTransport(retentionDays) {
  return new winston.transports.DailyRotateFile({
    dirname:       logDir,
    filename:      "audit-%DATE%.log",
    datePattern:   "YYYY-MM-DD",
    maxFiles:      `${retentionDays}d`,
    zippedArchive: true,
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
      winston.format.json()
    ),
  });
}

let fileTransport = makeFileTransport(DEFAULT_RETENTION_DAYS);
let currentRetentionDays = DEFAULT_RETENTION_DAYS;

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize({ level: true }),
    winston.format.printf((info) => {
      const actor  = info.actor  || "-";
      const action = info.action || info.message || "-";
      const target = info.target || "-";
      const result = info.result || "-";
      return `${info.timestamp} [${info.level}] ${actor} | ${action} | ${target} | ${result}`;
    })
  ),
});

const logger = winston.createLogger({
  level: "info",
  transports: [
    fileTransport,
    ...(process.env.NODE_ENV !== "production" ? [consoleTransport] : []),
  ],
});

/**
 * Liest audit.retention_days aus platform_settings und tauscht bei
 * abweichendem Wert den fileTransport aus (alten entfernen, neuen anlegen
 * + hinzufügen). Wird beim Serverstart aufgerufen (server.js, analog zum
 * RBAC-Cache) und nach jeder Änderung über den Audit-Tab (adminConfig.js) –
 * wirkt dadurch ohne Serverneustart. Nicht-fatal: schlägt der DB-Zugriff
 * fehl, bleibt der .env-/Default-Wert aktiv.
 */
async function applyRetentionSetting() {
  let retentionDays = DEFAULT_RETENTION_DAYS;
  try {
    const { rows } = await pgPool.query(
      "SELECT value FROM platform_settings WHERE key = 'audit.retention_days'"
    );
    if (rows.length > 0 && Number.isInteger(rows[0].value) && rows[0].value > 0) {
      retentionDays = rows[0].value;
    }
  } catch (err) {
    console.error("[Audit] platform_settings nicht lesbar, behalte aktuelle Aufbewahrung:", err.message);
    return currentRetentionDays;
  }

  if (retentionDays === currentRetentionDays) return currentRetentionDays;

  const oldTransport = fileTransport;
  fileTransport = makeFileTransport(retentionDays);
  logger.add(fileTransport);
  logger.remove(oldTransport);
  currentRetentionDays = retentionDays;

  console.log(`[Audit] Log-Aufbewahrung geändert: ${retentionDays} Tage.`);
  return currentRetentionDays;
}

// ─── Schreiben ────────────────────────────────────────────────────────────────

function writeAuditLog(entry) {
  const {
    action,
    actor      = "unknown",
    role       = "",
    target     = "",
    targetType = "",
    result     = "success",
    details    = {},
    requestId  = "",
    ip         = "",
    error      = "",
  } = entry;

  if (!action) throw new Error("auditLog.writeAuditLog: 'action' ist Pflichtfeld");

  const ts    = new Date().toISOString();
  const level = result === "failure" ? "warn" : "info";

  // 1) Winston (Datei + Konsole)
  logger.log(level, action, {
    action, actor, role, target, targetType,
    result, requestId, ip, details,
    ...(error ? { error } : {}),
  });

  // 2) SQLite
  const database = getDb();
  if (database && insertStmt) {
    try {
      insertStmt.run({
        ts,
        actor,
        role,
        action,
        target,
        target_type: targetType,
        result,
        error:       error || null,
        ip:          ip    || null,
        request_id:  requestId || null,
        details:     Object.keys(details).length > 0 ? JSON.stringify(details) : null,
      });
    } catch (dbErr) {
      console.error("[Audit] SQLite-Schreibfehler:", dbErr.message);
    }
  }
}

// ─── Convenience-Wrapper ──────────────────────────────────────────────────────

function logSuccess(action, actor, target, targetType, details = {}, requestId = "", ip = "") {
  writeAuditLog({ action, actor, target, targetType, result: "success", details, requestId, ip });
}

function logFailure(action, actor, target, targetType, error = "", details = {}, requestId = "", ip = "") {
  writeAuditLog({ action, actor, target, targetType, result: "failure", error, details, requestId, ip });
}

// ─── Lesen aus SQLite ─────────────────────────────────────────────────────────

/**
 * Liest Audit-Einträge aus SQLite mit Pagination und Filtern.
 *
 * @param {object} opts
 * @param {number}  opts.page       – Seite (1-basiert)
 * @param {number}  opts.pageSize   – Einträge pro Seite
 * @param {string}  opts.actor      – exakter SAM-Account (optional)
 * @param {string}  opts.action     – exakte ACTION_TYPE (optional)
 * @param {string}  opts.target     – Partial-Match (optional)
 * @param {string}  opts.result     – "success" | "failure" (optional)
 * @param {string}  opts.dateFrom   – ISO-Datum von (optional)
 * @param {string}  opts.dateTo     – ISO-Datum bis (optional)
 * @param {string}  opts.q          – Freitext über actor, target, action, error (optional)
 * @param {boolean} opts.onlyOwn    – nur eigene Einträge (helpdesk-Einschränkung)
 * @returns {{ entries: object[], total: number, page: number, pageSize: number, pages: number }}
 */
function queryAuditLog({
  page     = 1,
  pageSize = 50,
  actor,
  action,
  actions,
  target,
  result,
  dateFrom,
  dateTo,
  q,
  onlyOwn  = false,
} = {}) {
  const database = getDb();

  // Fallback: wenn SQLite nicht verfügbar → leere Antwort
  if (!database) {
    return { entries: [], total: 0, page, pageSize, pages: 0 };
  }

  const conditions = [];
  const params     = {};

  if (actor || onlyOwn) {
    conditions.push("actor = @actor");
    params.actor = actor || "";
  }
  if (action) {
    conditions.push("action = @action");
    params.action = action;
  }
  if (actions && actions.length > 0) {
    const placeholders = actions.map((_, i) => `@act${i}`).join(",");
    actions.forEach((a, i) => { params[`act${i}`] = a; });
    conditions.push(`action IN (${placeholders})`);
  }
  if (target) {
    conditions.push("target LIKE @target");
    params.target = `%${target}%`;
  }
  if (result) {
    conditions.push("result = @result");
    params.result = result;
  }
  if (dateFrom) {
    conditions.push("ts >= @dateFrom");
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    // dateTo bis Ende des Tages
    params.dateTo = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push("ts <= @dateTo");
  }
  if (q) {
    conditions.push("(actor LIKE @q OR target LIKE @q OR action LIKE @q OR error LIKE @q)");
    params.q = `%${q}%`;
  }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (Math.max(1, page) - 1) * pageSize;

  const total   = database.prepare(`SELECT COUNT(*) as n FROM audit_log ${where}`).get(params).n;
  const entries = database.prepare(
    `SELECT * FROM audit_log ${where} ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}`
  ).all(params).map(row => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : {},
  }));

  return {
    entries,
    total,
    page:     Math.max(1, page),
    pageSize,
    pages:    Math.ceil(total / pageSize),
  };
}

// Zählt Aktionen gruppiert nach Typ in einem Zeitraum – Grundlage für den Report.
function countActions({ actions = [], dateFrom, dateTo, result } = {}) {
  const database = getDb();
  const out = {};
  actions.forEach(a => { out[a] = 0; });
  if (!database || actions.length === 0) return out;

  const placeholders = actions.map((_, i) => `@a${i}`).join(",");
  const params = {};
  actions.forEach((a, i) => { params[`a${i}`] = a; });

  const conditions = [`action IN (${placeholders})`];
  if (result) {
    conditions.push("result = @result");
    params.result = result;
  }
  if (dateFrom) {
    conditions.push("ts >= @dateFrom");
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    params.dateTo = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push("ts <= @dateTo");
  }

  const rows = database.prepare(
    `SELECT action, COUNT(*) as n FROM audit_log WHERE ${conditions.join(" AND ")} GROUP BY action`
  ).all(params);

  rows.forEach(r => { out[r.action] = r.n; });
  return out;
}

// Alle eindeutigen ACTION_TYPES in der DB – für Filter-Dropdown
function getDistinctActions() {
  const database = getDb();
  if (!database) return Object.values(ACTION_TYPES);
  return database.prepare("SELECT DISTINCT action FROM audit_log ORDER BY action").all().map(r => r.action);
}

// Alle eindeutigen Akteure – für Filter-Dropdown (nur it-admin/it-lead)
function getDistinctActors() {
  const database = getDb();
  if (!database) return [];
  return database.prepare("SELECT DISTINCT actor FROM audit_log ORDER BY actor").all().map(r => r.actor);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  ACTION_TYPES,
  writeAuditLog,
  logSuccess,
  logFailure,
  // Legacy-Kompatibilität (alte Route nutzt getRecentEntries)
  getRecentEntries: (opts = {}) => queryAuditLog({
    page: 1, pageSize: opts.limit || 200,
    actor: opts.actor, action: opts.action,
    target: opts.target, result: opts.result,
  }).entries,
  queryAuditLog,
  countActions,
  getCategoryFilter,
  CATEGORY_ACTIONS,
  getDistinctActions,
  getDistinctActors,
  applyRetentionSetting,
};