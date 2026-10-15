/**
 * citrix.js – Citrix Session Routen
 *
 * GET  /api/citrix/session/:sam  – Session eines Users
 * GET  /api/citrix/client/:name  – User auf einem Client-PC
 * GET  /api/citrix/active        – Alle aktiven Sessions
 * POST /api/citrix/logoff        – Session abmelden (via PS)
 *
 * Phase 6.1: Keys korrigiert. Vorher hingen alle vier Routen – inkl. der
 * destruktiven /logoff-Route – an "user:search" (reiner Lesekey für die
 * Benutzersuche). Jetzt eigene, semantisch passende Keys: citrix:read für
 * die drei Leseoperationen, citrix:logoff für die destruktive Aktion.
 */

const express  = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const adClient              = require("../services/adClient");
const { ACTION_TYPES }      = require("../services/auditLog");
const {
  getSessionForUser,
  getSessionForClient,
  getActiveSessions,
} = require("../services/citrixService");

const router = express.Router();
router.use(requireAuth);

// Session eines Users
router.get("/session/:sam", requirePermission("citrix:read"), async (req, res) => {
  try {
    const session = await getSessionForUser(req.params.sam);
    res.json({ session });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// User auf einem Client-PC
router.get("/client/:name", requirePermission("citrix:read"), async (req, res) => {
  try {
    const session = await getSessionForClient(req.params.name);
    res.json({ session });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Alle aktiven Sessions
router.get("/active", requirePermission("citrix:read"), async (req, res) => {
  try {
    const sessions = await getActiveSessions();
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/citrix/logoff – Session abmelden (Nachricht → 60s → Stop)
// Läuft async durch (PS-Befehl dauert >60s) – Client bekommt sofort Bestätigung
router.post("/logoff", requirePermission("citrix:logoff"), async (req, res) => {
  const { sessionUid, userName } = req.body;
  if (!sessionUid) return res.status(400).json({ error: "sessionUid fehlt" });

  try {
    // Sofort antworten – der PS-Job läuft im Hintergrund weiter
    res.json({ ok: true, message: "Abmeldung eingeleitet. Benutzer erhält 60s Vorwarnung." });

    // Hintergrund-Job: Nachricht + Warten + Logoff
    adClient.citrixLogoff(sessionUid, userName || "")
      .then(() => {
        req.audit.log({
          action:     ACTION_TYPES.CITRIX_LOGOFF,
          target:     userName || sessionUid,
          targetType: "user",
          result:     "success",
          details:    { sessionUid },
        });
      })
      .catch((err) => {
        req.audit.log({
          action:     ACTION_TYPES.CITRIX_LOGOFF,
          target:     userName || sessionUid,
          targetType: "user",
          result:     "failure",
          error:      err.message,
          details:    { sessionUid },
        });
        console.error("[Citrix] Logoff fehlgeschlagen:", err.message);
      });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;