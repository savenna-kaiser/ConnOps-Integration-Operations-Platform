/**
 * routes/adminConfig.js – Administrationsbereich (Phase 6.2)
 *
 * Erster Ausbauschritt: nur der Rollen-Tab (Rolle → Permission-Zuordnung).
 * Weitere Tabs (Health, Audit, TopDesk, System, Informationen) kommen als
 * eigene Routen-Abschnitte hinzu, sobald sie dran sind (siehe ROADMAP.md 6.2) –
 * diese Datei ist bewusst so benannt und strukturiert, dass sie wachsen kann,
 * ohne zu einem Strukturbruch zu führen.
 *
 * GET  /api/admin/permissions        – alle verfügbaren Permission-Keys (fest, aus DB)
 * GET  /api/admin/roles              – alle Rollen inkl. zugeordneter Permissions
 * PUT  /api/admin/roles/:id/permissions – Zuordnung einer Rolle überschreiben
 *
 * Alle Endpunkte erfordern "rbac:manage" (nur it-lead per Start-Zuordnung).
 */

const express               = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission, reloadCache } = require("../middleware/rbac");
const { applyRetentionSetting }          = require("../services/auditLog");
const scheduler                          = require("../jobs/scheduler");
const db                    = require("../data/db");

const router = express.Router();
router.use(requireAuth, requirePermission("rbac:manage"));

// ─── GET /api/admin/permissions ───────────────────────────────────────────────
// Feste Liste aller Permission-Keys, für die Checkbox-Matrix im Frontend.
router.get("/permissions", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT key, description FROM permissions ORDER BY key"
    );
    res.json({ permissions: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/admin/roles ──────────────────────────────────────────────────────
// Rollen inkl. der ihnen aktuell zugeordneten Permission-Keys.
router.get("/roles", async (req, res) => {
  try {
    const { rows: roles } = await db.query(
      "SELECT id, name, description FROM roles ORDER BY id"
    );
    const { rows: assignments } = await db.query(
      `SELECT rp.role_id, p.key
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id`
    );

    const byRole = {};
    for (const a of assignments) {
      if (!byRole[a.role_id]) byRole[a.role_id] = [];
      byRole[a.role_id].push(a.key);
    }

    res.json({
      roles: roles.map(r => ({ ...r, permissions: byRole[r.id] || [] })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/admin/roles/:id/permissions ─────────────────────────────────────
// Body: { permissionKeys: string[] } – überschreibt die komplette Zuordnung
// dieser Rolle (kein Merge, die Checkbox-Matrix im Frontend ist die Wahrheit).
router.put("/roles/:id/permissions", async (req, res) => {
  const roleId = parseInt(req.params.id, 10);
  const { permissionKeys } = req.body;

  if (!roleId) return res.status(400).json({ error: "Ungültige Rollen-ID." });
  if (!Array.isArray(permissionKeys)) {
    return res.status(400).json({ error: "permissionKeys muss ein Array sein." });
  }

  const client = await db.connect(); // Transaktion: DELETE + INSERT + Selbst-Aussperr-Check atomar
  try {
    await client.query("BEGIN");

    const before = await client.query(
      `SELECT p.key FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = $1`,
      [roleId]
    );

    // Neue Zuordnung schreiben
    await client.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);

    if (permissionKeys.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE key = ANY($2::text[])`,
        [roleId, permissionKeys]
      );
    }

    // ── Selbst-Aussperr-Schutz (siehe PROJECT_CONTEXT.md / Phase 6.1) ────────
    // Nach dieser Änderung muss mindestens eine Rolle "rbac:manage" behalten,
    // sonst kann niemand mehr Rollen verwalten – auch nicht über die UI.
    const { rows: stillManaged } = await client.query(
      `SELECT COUNT(*) AS n FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = 'rbac:manage'`
    );
    if (parseInt(stillManaged[0].n, 10) === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Diese Änderung würde dazu führen, dass keine Rolle mehr Rollen verwalten kann. Abgelehnt.",
      });
    }

    await client.query("COMMIT");

    // Cache neu laden – wirkt ab sofort, kein Serverneustart nötig (siehe 6.1)
    await reloadCache();

    req.audit.log({
      action:     "RBAC_ROLE_PERMISSIONS_UPDATE",
      target:     String(roleId),
      targetType: "role",
      result:     "success",
      details:    { before: before.rows.map(r => r.key), after: permissionKeys },
    });

    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Health-Tab (Phase 6.2) — Schwellenwerte für die Systemstatus-Seite
// ═══════════════════════════════════════════════════════════════════════════

const HEALTH_SETTING_KEYS = [
  "health.inactive_days",
  "health.topdesk_upcoming_days",
  "health.wal_warn_bytes",
];

// GET /api/admin/settings/health
router.get("/settings/health", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT key, value, description FROM platform_settings WHERE category = 'health' ORDER BY key"
    );
    res.json({ settings: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/health
// Body: { "health.inactive_days": 90, "health.topdesk_upcoming_days": 7, "health.wal_warn_bytes": 8388608 }
router.put("/settings/health", async (req, res) => {
  const updates = req.body || {};
  const keys = Object.keys(updates).filter(k => HEALTH_SETTING_KEYS.includes(k));

  if (keys.length === 0) {
    return res.status(400).json({ error: "Keine gültigen Health-Settings-Keys übergeben." });
  }

  // Grobe Validierung: alle drei Werte sind positive Ganzzahlen
  for (const k of keys) {
    const v = updates[k];
    if (!Number.isInteger(v) || v <= 0) {
      return res.status(400).json({ error: `${k}: muss eine positive Ganzzahl sein.` });
    }
  }

  try {
    for (const k of keys) {
      await db.query(
        `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = $2`,
        [JSON.stringify(updates[k]), k]
      );
    }

    req.audit.log({
      action:     "PLATFORM_SETTINGS_UPDATE",
      target:     "health",
      targetType: "platform_settings",
      result:     "success",
      details:    { updated: updates },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Audit-Tab (Phase 6.2) — nur Log-Aufbewahrung, NICHT die Kategorisierung
// (CATEGORY_ACTIONS bleibt bewusst fest im Code, siehe ADR-Diskussion:
// Audit-Kategorisierung ist fachliche Anwendungssicht, kein Betriebsparameter)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/settings/audit
router.get("/settings/audit", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT key, value, description FROM platform_settings WHERE category = 'audit' ORDER BY key"
    );
    res.json({ settings: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/audit
// Body: { "audit.retention_days": 30 }
router.put("/settings/audit", async (req, res) => {
  const value = req.body?.["audit.retention_days"];
  if (!Number.isInteger(value) || value <= 0) {
    return res.status(400).json({ error: "audit.retention_days: muss eine positive Ganzzahl sein." });
  }

  try {
    await db.query(
      `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = 'audit.retention_days'`,
      [JSON.stringify(value)]
    );

    // Sofort wirksam machen (Winston-Transport austauschen), kein Neustart nötig
    const applied = await applyRetentionSetting();

    req.audit.log({
      action:     "PLATFORM_SETTINGS_UPDATE",
      target:     "audit",
      targetType: "platform_settings",
      result:     "success",
      details:    { "audit.retention_days": applied },
    });

    res.json({ ok: true, appliedRetentionDays: applied });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// System-Tab (Phase 6.2) — TopDesk-Cron (Enabled + Intervall)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/settings/system
router.get("/settings/system", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT key, value, description FROM platform_settings WHERE category = 'system' ORDER BY key"
    );
    res.json({ settings: rows, cronStatus: scheduler.getCronStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/settings/system
// Body: { "system.topdesk_cron_enabled": true, "system.topdesk_cron_interval_min": 15 }
router.put("/settings/system", async (req, res) => {
  const enabled     = req.body?.["system.topdesk_cron_enabled"];
  const intervalMin = req.body?.["system.topdesk_cron_interval_min"];

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "system.topdesk_cron_enabled: muss true/false sein." });
  }
  if (!Number.isInteger(intervalMin) || intervalMin <= 0) {
    return res.status(400).json({ error: "system.topdesk_cron_interval_min: muss eine positive Ganzzahl sein." });
  }

  try {
    await db.query(
      `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = 'system.topdesk_cron_enabled'`,
      [JSON.stringify(enabled)]
    );
    await db.query(
      `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = 'system.topdesk_cron_interval_min'`,
      [JSON.stringify(intervalMin)]
    );

    // Sofort wirksam machen, kein Serverneustart nötig
    scheduler.configureCron({ enabled, intervalMin });

    req.audit.log({
      action:     "PLATFORM_SETTINGS_UPDATE",
      target:     "system",
      targetType: "platform_settings",
      result:     "success",
      details:    { enabled, intervalMin },
    });

    res.json({ ok: true, cronStatus: scheduler.getCronStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// TopDesk-Tab (Phase 6.2) — Basis-URL editierbar (mit Verbindungstest vor dem
// Speichern), Template-IDs/Status-Filter bewusst weiterhin NICHT editierbar:
// ein falscher Wert dort führt nicht zu einer sichtbaren Warnung, sondern
// dazu, dass TopDesk-Changes lautlos nicht mehr eingelesen werden. Eine
// falsche URL dagegen fällt sofort auf (Verbindungstest schlägt fehl, oder
// spätestens der bestehende Health-Check zeigt "down").
// ═══════════════════════════════════════════════════════════════════════════

const topdeskClient = require("../services/topdeskClient");

// GET /api/admin/settings/topdesk
router.get("/settings/topdesk", (req, res) => {
  let host = null;
  try { host = new URL(topdeskClient.getBaseUrl()).host; } catch { /* URL leer/ungültig */ }

  res.json({
    baseUrl: topdeskClient.getBaseUrl(),
    baseUrlHost: host,
    processStatus: topdeskClient.PROCESS_STATUS,
    templateIds: topdeskClient.TEMPLATE_IDS,
  });
});

// PUT /api/admin/settings/topdesk
// Body: { "topdesk.base_url": "https://topdesk.musterstadt.local" }
// Testet die neue URL per ping() BEVOR sie übernommen wird — bei Fehler kein
// Rollback nötig (configureAndTestBaseUrl() macht das intern selbst) und
// die DB wird gar nicht erst geschrieben.
router.put("/settings/topdesk", async (req, res) => {
  const url = req.body?.["topdesk.base_url"];
  if (typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ error: "topdesk.base_url: darf nicht leer sein." });
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("nur http/https erlaubt");
  } catch (err) {
    return res.status(400).json({ error: `Ungültige URL: ${err.message}` });
  }

  try {
    await topdeskClient.configureAndTestBaseUrl(url.trim());
  } catch (err) {
    return res.status(400).json({
      error: `Verbindungstest fehlgeschlagen, URL wurde NICHT übernommen: ${err.message}`,
    });
  }

  try {
    await db.query(
      `UPDATE platform_settings SET value = $1, updated_at = NOW() WHERE key = 'topdesk.base_url'`,
      [JSON.stringify(url.trim())]
    );

    req.audit.log({
      action:     "PLATFORM_SETTINGS_UPDATE",
      target:     "topdesk",
      targetType: "platform_settings",
      result:     "success",
      details:    { "topdesk.base_url": url.trim() },
    });

    res.json({ ok: true });
  } catch (err) {
    // Verbindungstest war ok, aber DB-Schreiben schlug fehl — Laufzeit-Wert
    // bleibt trotzdem auf der neuen URL (bewusst: der Test war ja erfolgreich).
    res.status(500).json({ error: `URL aktiv, aber Speichern fehlgeschlagen: ${err.message}` });
  }
});

module.exports = router;
