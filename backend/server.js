/**
 * server.js – AD-Manager Express Server
 */
require("dotenv").config();

// Phase 6.3: DPAPI-verschluesselte Secrets ueberschreiben die .env-Klartext-
// werte, FALLS vorhanden. Muss vor allen anderen require()s passieren, siehe
// services/loadSecrets.js fuer die Begruendung.
require("./services/loadSecrets").loadSecrets();

// ─── Startup-Validierung ─────────────────────────────────────────────────────
const REQUIRED_ENV = [
  "SESSION_SECRET",
  "AD_DC",
  "AD_SERVICE_ACCOUNT",
  "AD_SERVICE_PASSWORD",
  "TOPDESK_WEBHOOK_SECRET",
  "AD_NEW_USER_INITIAL_PASSWORD",
  "EXCHANGE_SERVICE_ACCOUNT",
  "EXCHANGE_SERVICE_PASSWORD",
  "PG_HOST",
  "PG_DATABASE",
  "PG_USER",
  "PG_PASSWORD",
];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[FATAL] Pflicht-Umgebungsvariablen fehlen: ${missing.join(", ")}`);
  console.error("Bitte .env prüfen. Server wird nicht gestartet.");
  process.exit(1);
}

const express        = require("express");
const session        = require("express-session");
const helmet         = require("helmet");
const path           = require("path");
const auditMiddleware   = require("./middleware/auditMiddleware");
const authRoutes        = require("./routes/auth");
const usersRoutes       = require("./routes/users");
const auditRoutes       = require("./routes/auditRoute");
const topdeskRoutes     = require("./routes/topdesk");
const citrixRoutes      = require("./routes/citrix");
const computerRoutes    = require("./routes/computers");
const { getPoolStatus } = require("./services/powershellBridge");
const docusnapRoutes    = require("./routes/docusnap").router;
const orgRoutes         = require("./routes/org");
const healthRoutes      = require("./routes/health");
const reportRoutes      = require("./routes/report");
const adminConfigRoutes = require("./routes/adminConfig");
const handoverRoutes    = require("./routes/handover");
const { initCache: initRbacCache } = require("./middleware/rbac");
const { applyRetentionSetting }    = require("./services/auditLog");
const scheduler                    = require("./jobs/scheduler");
const pgPool                       = require("./data/db");
const topdeskClientModule          = require("./services/topdeskClient");

const app  = express();
const PORT = process.env.PORT || 3000;

// Limit von 64kb auf 1mb erhoeht: Signatur-PNGs (Base64-kodiert, siehe
// routes/handover.js POST .../signature) koennen das alte Limit ueberschreiten.
// 1mb bleibt klein genug, um keine relevante DoS-Angriffsflaeche zu eroeffnen -
// alle Payloads in dieser App sind ansonsten deutlich kleiner.
// Security-Review 3.2 (16.07.2026): Standard-Security-Header (X-Content-
// Type-Options, X-Frame-Options, etc.). CSP bewusst deaktiviert - die
// Standardwerte wuerden vermutlich die Google-Fonts-Einbindung
// (fonts.googleapis.com) blockieren. Eine passende CSP ist ein separater,
// zu testender Folgeschritt, kein Teil dieser Aenderung.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV !== "development",
    sameSite: "strict",
    maxAge:   8 * 60 * 60 * 1000,
  },
}));
app.use(auditMiddleware);

// ─── Health-Checks ───────────────────────────────────────────────────────────
function healthHandler(req, res) {
  let psStatus = [];
  try { psStatus = getPoolStatus(); } catch {}
  const healthy = psStatus.filter(s => s.ready).length > 0;
  res.status(healthy ? 200 : 503).json({
    status:  healthy ? "ok" : "degraded",
    workers: psStatus,
    uptime:  Math.floor(process.uptime()),
    ts:      new Date().toISOString(),
  });
}
app.get("/health",     healthHandler);
app.get("/api/health", healthHandler);
// /api/health/overview (PostgreSQL, TopDesk-Aufgaben, Benutzer, Computer, ...)
// wird über routes/health.js gemountet, siehe unten bei den übrigen Routen.
// Die vormals hier inline definierten /api/health/pg und /api/health/exchange
// sind darin aufgegangen (pg) bzw. entfallen (exchange, siehe Health-Page-Überarbeitung).

// ─── Static + Routes ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth",      authRoutes);
app.use("/api/users",     usersRoutes);
app.use("/api/audit",     auditRoutes);
app.use("/api/topdesk",   topdeskRoutes);
app.use("/api/citrix",    citrixRoutes);
app.use("/api/computers", computerRoutes);
app.use("/api/docusnap",  docusnapRoutes);
app.use("/api/org",       orgRoutes);
app.use("/api/health",    healthRoutes);
app.use("/api/report",    reportRoutes);
app.use("/api/admin",     adminConfigRoutes);
app.use("/api/handover",  handoverRoutes);

// ─── Cron ────────────────────────────────────────────────────────────────────
// Wird nicht mehr hier automatisch gestartet — siehe Startup-Block unten,
// scheduler.configureCron() mit Werten aus platform_settings (Phase 6.2).

// ─── SPA Fallback ────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  const index = path.join(__dirname, "public", "index.html");
  res.sendFile(index, (err) => {
    if (err) res.status(404).json({ error: "Not found" });
  });
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Interner Serverfehler" });
});

// ─── Start ───────────────────────────────────────────────────────────────────
// RBAC-Cache MUSS geladen sein, bevor der Server Requests annimmt – sonst
// würde requirePermission() auf einen leeren Cache treffen und alles mit
// 403 ablehnen (fail-closed ist hier richtig, aber ein Serverstart ohne
// funktionierendes RBAC soll erst gar nicht "up" erscheinen).
let server;

(async () => {
  try {
    await initRbacCache();
  } catch (err) {
    console.error("[FATAL] RBAC-Cache konnte nicht geladen werden:", err.message);
    console.error("Prüfe PostgreSQL-Verbindung und ob 'node data/migrate.js' bereits gelaufen ist.");
    process.exit(1);
  }

  // Nicht-fatal: schlägt das fehl, läuft der Server mit dem .env-/Default-Wert weiter.
  try {
    await applyRetentionSetting();
  } catch (err) {
    console.error("[Audit] Aufbewahrungs-Setting konnte nicht geladen werden, nutze Default:", err.message);
  }

  // TopDesk-Cron aus platform_settings konfigurieren (Phase 6.2, System-Tab).
  // Nicht-fatal: schlägt das fehl, greift der .env-Default (siehe scheduler.js).
  try {
    const { rows } = await pgPool.query(
      "SELECT key, value FROM platform_settings WHERE category = 'system'"
    );
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    scheduler.configureCron({
      enabled:     settings["system.topdesk_cron_enabled"]      ?? scheduler.ENV_DEFAULT_ENABLED,
      intervalMin: settings["system.topdesk_cron_interval_min"] ?? scheduler.ENV_DEFAULT_INTERVAL_MIN,
    });
  } catch (err) {
    console.error("[Scheduler] System-Settings nicht lesbar, nutze .env-Default:", err.message);
    scheduler.configureCron({
      enabled:     scheduler.ENV_DEFAULT_ENABLED,
      intervalMin: scheduler.ENV_DEFAULT_INTERVAL_MIN,
    });
  }

  // TopDesk-Basis-URL aus platform_settings (Phase 6.2, TopDesk-Tab). Ohne
  // Verbindungstest beim Start (der würde einen Serverstart bei nicht
  // erreichbarem TopDesk unnötig blockieren — das zeigt bereits der
  // bestehende Health-Check sichtbar an). .env bleibt Fallback.
  try {
    const { rows } = await pgPool.query(
      "SELECT value FROM platform_settings WHERE key = 'topdesk.base_url'"
    );
    if (rows.length > 0 && rows[0].value) {
      topdeskClientModule.configureBaseUrl(rows[0].value);
    }
  } catch (err) {
    console.error("[TopDesk] Basis-URL aus platform_settings nicht lesbar, nutze .env-Default:", err.message);
  }

  server = app.listen(PORT, () => {
    console.log(`AD-Manager läuft auf http://localhost:${PORT}`);
  });
})();

function shutdown(signal) {
  console.log(`[Server] ${signal} – Graceful Shutdown...`);
  if (server) {
    server.close(() => { console.log("[Server] geschlossen."); process.exit(0); });
  } else {
    process.exit(0);
  }
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

module.exports = app;
