/**
 * routes/health.js – Health-Dashboard für Admins
 *
 * GET /api/health/overview
 *   Kategorisiert für den Admin-Überblick nach dem Login:
 *   - systemStatus: Worker (AD/Exchange laufen über denselben PS-Pool),
 *                   TopDesk-API, PostgreSQL, TopDesk-Cron
 *   - benutzer:     gesperrte Accounts, >N Tage inaktiv
 *   - computer:     Assets ohne Status, >N Tage inaktiv, AD-Computer ohne Docusnap-Eintrag
 *   - topdeskAufgaben: überfällig / anstehend / geplant / Fehler (aus topdesk_changes)
 *   - docusnap:     Import-Status (letzter Lauf + Alter der Quelldatei)
 *   - system:       Audit-DB / WAL-Größe
 *
 * Nur für it-admin / it-lead (Permission "health:read").
 *
 * Phase 6.2 (Health-Tab): inactive_days, topdesk_upcoming_days und
 * wal_warn_bytes kommen jetzt aus platform_settings (Kategorie "health"),
 * damit sie über die Konfigseite ohne Serverneustart änderbar sind. Die
 * beiden Timeout-Werte (TOPDESK_PING_TIMEOUT_MS, PG_PING_TIMEOUT_MS) bleiben
 * bewusst in .env – technische Werte, keine fachliche Konfiguration.
 * Fallback auf die bisherigen .env-Defaults, falls in platform_settings
 * (noch) kein Eintrag existiert.
 */

const express  = require("express");
const fs       = require("fs");
const path     = require("path");

const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const { getPoolStatus }      = require("../services/powershellBridge");
const adClient                = require("../services/adClient");
const topdesk                 = require("../services/topdeskClient");
const docusnapInternals       = require("./docusnap");
const { queryAuditLog }       = require("../services/auditLog");
const db                      = require("../data/db");
const scheduler                = require("../jobs/scheduler");

const router = express.Router();
router.use(requireAuth, requirePermission("health:read"));

// ─── Konfiguration ────────────────────────────────────────────────────────────
// Nur noch die beiden technischen Timeouts bleiben feste .env-Werte.
const TOPDESK_PING_TIMEOUT_MS   = parseInt(process.env.HEALTH_TOPDESK_TIMEOUT       || "8000", 10);
const PG_PING_TIMEOUT_MS        = parseInt(process.env.HEALTH_PG_TIMEOUT           || "5000", 10);

// .env-Werte dienen nur noch als Fallback, falls platform_settings leer ist
// (z. B. direkt nach einem frischen Deploy vor dem ersten migrate.js-Lauf).
const FALLBACK_DEFAULTS = {
  "health.inactive_days":         parseInt(process.env.HEALTH_INACTIVE_DAYS         || "90",   10),
  "health.topdesk_upcoming_days": parseInt(process.env.HEALTH_TOPDESK_UPCOMING_DAYS || "7",    10),
  "health.wal_warn_bytes":        parseInt(process.env.HEALTH_WAL_WARN_BYTES || String(8 * 1024 * 1024), 10),
};

const AUDIT_DB_FILE  = path.join(__dirname, "..", "data", "audit.db");
const AUDIT_WAL_FILE = path.join(__dirname, "..", "data", "audit.db-wal");

/**
 * Liest die drei Health-Settings aus platform_settings. Wird pro Request neu
 * abgefragt (kein Cache wie bei RBAC) – /overview wird nur alle 15s gepollt,
 * eine einzelne Key-Value-Abfrage fällt dabei performancemäßig nicht ins
 * Gewicht, macht die Konfigseite aber sofort wirksam ohne Serverneustart.
 */
async function getHealthSettings() {
  try {
    const { rows } = await db.query(
      "SELECT key, value FROM platform_settings WHERE category = 'health'"
    );
    const fromDb = {};
    for (const row of rows) fromDb[row.key] = row.value;

    return {
      inactiveDays:  fromDb["health.inactive_days"]         ?? FALLBACK_DEFAULTS["health.inactive_days"],
      upcomingDays:  fromDb["health.topdesk_upcoming_days"] ?? FALLBACK_DEFAULTS["health.topdesk_upcoming_days"],
      walWarnBytes:  fromDb["health.wal_warn_bytes"]        ?? FALLBACK_DEFAULTS["health.wal_warn_bytes"],
    };
  } catch (err) {
    // platform_settings nicht erreichbar (z. B. DB-Problem) → .env-Defaults,
    // damit die Health-Seite selbst nicht komplett ausfällt.
    console.error("[Health] platform_settings nicht lesbar, nutze .env-Defaults:", err.message);
    return {
      inactiveDays: FALLBACK_DEFAULTS["health.inactive_days"],
      upcomingDays: FALLBACK_DEFAULTS["health.topdesk_upcoming_days"],
      walWarnBytes: FALLBACK_DEFAULTS["health.wal_warn_bytes"],
    };
  }
}

// ─── Helfer ───────────────────────────────────────────────────────────────────

function getServiceCredential() {
  const u = process.env.AD_SERVICE_ACCOUNT;
  const p = process.env.AD_SERVICE_PASSWORD;
  if (!u || !p) return null;
  return { username: u, password: p };
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

/**
 * AD-Erreichbarkeit anhand des PS-Worker-Pools.
 * status: "ok" – alle Worker bereit | "degraded" – mind. einer bereit | "down" – keiner bereit
 */
function checkAd() {
  let workers = [];
  try { workers = getPoolStatus(); } catch { /* Pool noch nicht initialisiert */ }

  const ready = workers.filter(w => w.ready).length;
  const total = workers.length;

  let status = "down";
  if (total > 0 && ready === total) status = "ok";
  else if (ready > 0) status = "degraded";

  return { status, ready, total, workers };
}

/**
 * TopDesk-API-Erreichbarkeit via leichtem GET mit Timeout.
 */
async function checkTopdesk() {
  const started = Date.now();
  try {
    await Promise.race([
      topdesk.ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), TOPDESK_PING_TIMEOUT_MS)
      ),
    ]);
    return { status: "ok", latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, error: err.message };
  }
}

/**
 * PostgreSQL-Erreichbarkeit via einfachem SELECT 1 mit Timeout.
 */
async function checkPostgres() {
  const started = Date.now();
  try {
    await Promise.race([
      db.query("SELECT 1"),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), PG_PING_TIMEOUT_MS)
      ),
    ]);
    return { status: "ok", latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return { status: "down", latencyMs: Date.now() - started, error: err.message };
  }
}

/**
 * TopDesk-Cron: aktiviert? Intervall? letzter Lauf laut Audit-Log?
 * Zustand kommt jetzt vom Scheduler-Modul selbst (live), nicht mehr direkt
 * aus process.env — sonst wäre die Anzeige nach einer Änderung über die
 * Konfigseite (System-Tab, Phase 6.2) veraltet.
 */
function checkTopdeskCron() {
  const { enabled, intervalMin } = scheduler.getCronStatus();

  let lastRun = null;
  try {
    const result = queryAuditLog({ page: 1, pageSize: 1, action: "TOPDESK_CRON_RUN" });
    if (result.entries.length > 0) {
      const entry = result.entries[0];
      lastRun = { ts: entry.ts, result: entry.result, details: entry.details };
    }
  } catch { /* Audit-DB nicht verfügbar */ }

  let status = "ok";
  if (enabled && !lastRun) status = "warning"; // aktiviert, aber noch nie gelaufen
  if (enabled && lastRun?.result === "failure") status = "warning";

  return { status, enabled, intervalMin, lastRun };
}

/**
 * Docusnap-Import-Status: letzter Lauf + Alter der Quelldatei.
 */
function checkDocusnap() {
  const { IMPORT_STATUS_FILE, DOCUSNAP_FILE } = docusnapInternals;

  let lastImport = null;
  try {
    if (fs.existsSync(IMPORT_STATUS_FILE)) {
      lastImport = JSON.parse(fs.readFileSync(IMPORT_STATUS_FILE, "utf8"));
    }
  } catch { /* ignore */ }

  let sourceFile = { exists: false, mtime: null, ageHours: null };
  try {
    if (fs.existsSync(DOCUSNAP_FILE)) {
      const stat = fs.statSync(DOCUSNAP_FILE);
      sourceFile = {
        exists: true,
        mtime: stat.mtime.toISOString(),
        ageHours: Math.round((Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60) * 10) / 10,
      };
    }
  } catch { /* UNC-Pfad evtl. nicht erreichbar */ }

  // Ampel-Status:
  //  - "down"     Quelldatei nicht erreichbar ODER letzter Import fehlgeschlagen
  //  - "warning"  noch kein Import ODER Quelldatei seit >48h nicht aktualisiert
  //  - "ok"       letzter Import erfolgreich UND Quelldatei < 48h alt
  let status;
  if (!sourceFile.exists || lastImport?.ok === false) {
    status = "down";
  } else if (!lastImport || (sourceFile.ageHours !== null && sourceFile.ageHours > 48)) {
    status = "warning";
  } else {
    status = "ok";
  }

  return { status, lastImport, sourceFile };
}

/**
 * TopDesk-Aufgaben kategorisiert für den Admin-Überblick:
 *   - überfällig: PENDING, target_date in der Vergangenheit
 *   - anstehend:  PENDING, target_date fällig innerhalb upcomingDays
 *   - geplant:    PENDING, target_date weiter in der Zukunft
 *   - fehler:     CONFLICT / WARNING / PARTIAL / FAILED
 */
async function checkTopdeskTasks(upcomingDays) {
  try {
    const result = await db.query(
      `SELECT
         change_id, type, status, target_date,
         CASE
           WHEN status = 'PENDING' AND target_date IS NOT NULL AND target_date < CURRENT_DATE
             THEN 'ueberfaellig'
           WHEN status = 'PENDING' AND (target_date IS NULL OR target_date <= CURRENT_DATE + $1::int)
             THEN 'anstehend'
           WHEN status = 'PENDING'
             THEN 'geplant'
           WHEN status IN ('CONFLICT', 'WARNING', 'PARTIAL', 'FAILED')
             THEN 'fehler'
           ELSE NULL
         END AS bucket
       FROM topdesk_changes
       WHERE status NOT IN ('DONE')`,
      [upcomingDays]
    );

    const buckets = { ueberfaellig: [], anstehend: [], geplant: [], fehler: [] };
    for (const row of result.rows) {
      if (row.bucket && buckets[row.bucket]) {
        buckets[row.bucket].push({
          changeId:   row.change_id,
          type:       row.type,
          status:     row.status,
          targetDate: row.target_date,
        });
      }
    }

    return {
      status: buckets.ueberfaellig.length > 0 || buckets.fehler.length > 0 ? "warning" : "ok",
      thresholds: { upcomingDays },
      counts: {
        ueberfaellig: buckets.ueberfaellig.length,
        anstehend:    buckets.anstehend.length,
        geplant:      buckets.geplant.length,
        fehler:       buckets.fehler.length,
      },
      ...buckets,
      error: null,
    };
  } catch (err) {
    return {
      status: "warning",
      thresholds: { upcomingDays },
      counts: { ueberfaellig: 0, anstehend: 0, geplant: 0, fehler: 0 },
      ueberfaellig: [], anstehend: [], geplant: [], fehler: [],
      error: err.message,
    };
  }
}

/**
 * Audit-DB / WAL-Größe – Hinweis falls WAL ungewöhnlich groß wird
 * (kann auf fehlende Checkpoints hindeuten).
 */
function checkAuditDb(walWarnBytes) {
  const dbBytes  = fileSizeBytes(AUDIT_DB_FILE);
  const walBytes = fileSizeBytes(AUDIT_WAL_FILE);

  let status = "ok";
  if (dbBytes === null) status = "warning"; // DB-Datei nicht gefunden
  else if (walBytes !== null && walBytes > walWarnBytes) status = "warning";

  return { status, dbBytes, walBytes, warnThresholdBytes: walWarnBytes };
}

// ─── Route ───────────────────────────────────────────────────────────────────

router.get("/overview", async (req, res) => {
  const { inactiveDays, upcomingDays, walWarnBytes } = await getHealthSettings();
  const credential = getServiceCredential();

  // Asset-CSV einmal laden – wird für "ohne Status" und "nicht in Docusnap" gebraucht
  let assetRows = [];
  let assetsError = null;
  try {
    assetRows = await docusnapInternals.loadCSV(docusnapInternals.DASHBOARD_FILE);
  } catch (err) {
    assetsError = err.message;
  }

  const [healthUsersResult, healthComputersResult] = await Promise.allSettled([
    adClient.getHealthUsers(
      { thresholdDays: inactiveDays },
      credential
    ),
    adClient.getHealthComputers(
      { thresholdDays: inactiveDays },
      credential
    ),
  ]);

  const adStatus         = checkAd();
  const topdeskStatus    = await checkTopdesk();
  const postgresStatus   = await checkPostgres();
  const topdeskCron      = checkTopdeskCron();
  const docusnapStatus   = checkDocusnap();
  const auditDbStatus    = checkAuditDb(walWarnBytes);
  const topdeskAufgaben  = await checkTopdeskTasks(upcomingDays);

  // ── Benutzer-Sektion ─────────────────────────────────────────────────────
  let users = { locked: [], inactive: [], error: null };
  if (healthUsersResult.status === "fulfilled") {
    const { locked, inactive } = healthUsersResult.value;
    users = { locked, inactive, error: null };
  } else {
    users.error = healthUsersResult.reason?.message || "Fehler beim Laden der Benutzer-Daten";
  }

  // ── Computer-Sektion ─────────────────────────────────────────────────────
  const computers = { inactive: [], withoutStatus: [], notInDocusnap: [], error: assetsError };

  computers.withoutStatus = assetRows
    .filter(d => !d.Status || d.Status === "Neu" || d.Status === "")
    .map(d => ({
      HostName:   d.HostName,
      BiosSerial: d.BiosSerial,
      Status:     d.Status || "",
      ActiveUser: d.ActiveUser || "",
    }));

  if (healthComputersResult.status === "fulfilled") {
    computers.inactive = healthComputersResult.value.inactive || [];

    const assetHostNames = new Set(
      assetRows.map(d => String(d.HostName || "").toUpperCase()).filter(Boolean)
    );
    const adComputerNames = healthComputersResult.value.allNames || [];
    computers.notInDocusnap = adComputerNames.filter(
      name => !assetHostNames.has(String(name).toUpperCase())
    );
  } else if (!computers.error) {
    computers.error = healthComputersResult.reason?.message || "Fehler beim Laden der Computer-Daten";
  }

  res.json({
    ts: new Date().toISOString(),
    thresholds: {
      inactiveDays,
      topdeskUpcomingDays: upcomingDays,
    },
    systemStatus: {
      worker:      adStatus,        // AD + Exchange laufen über denselben PS-Worker-Pool
      topdesk:     topdeskStatus,
      postgres:    postgresStatus,
      topdeskCron: topdeskCron,
    },
    benutzer: users,
    computer: computers,
    topdeskAufgaben,
    docusnap: docusnapStatus,
    system: {
      auditDb: auditDbStatus,
    },
  });
});

module.exports = router;
