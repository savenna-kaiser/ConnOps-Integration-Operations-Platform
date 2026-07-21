/**
 * handover.js – Übergabedokument Routen
 *
 * POST /api/handover              – Neues Übergabedokument erstellen + PDF speichern
 * GET  /api/handover/:hostname    – Alle Dokumente eines Assets auflisten
 * GET  /api/handover/:hostname/:filename – PDF herunterladen
 */

const express  = require("express");
const path     = require("path");
const { requireAuth }       = require("../middleware/authMiddleware");
// HINWEIS: Signatur-PNGs (Base64) koennen das urspruengliche 64kb-Limit aus
// server.js ueberschreiten - das globale Limit wurde dort auf 1mb angehoben,
// siehe Kommentar in server.js. Ein route-eigener Parser wuerde hier NICHT
// funktionieren, da express.json() in server.js bereits VOR allen Routen
// laeuft und einen zu grossen Body schon global ablehnen wuerde.
const { requirePermission } = require("../middleware/rbac");
const { ACTION_TYPES }      = require("../services/auditLog");
const {
  saveHandover,
  listHandovers,
  listHandoversBySam,
  getHandoverPath,
  addSignature,
} = require("../services/handoverService");
const { updateAssetStatus } = require("./docusnap");

const router = express.Router();
router.use(requireAuth);

// ─── POST /api/handover – Neues Übergabedokument ──────────────────────────────

router.post("/", requirePermission("user:search"), async (req, res) => {
  const {
    hostname,
    biosSerial,
    modell,
    mitarbeiter,      // { name, sam, abteilung }
    datum,
    ausgehaendigtVon,
    zubehoer,         // [{ label, checked }]
    bemerkung,
  } = req.body;

  if (!hostname)                return res.status(400).json({ error: "hostname fehlt" });
  if (!mitarbeiter?.sam)        return res.status(400).json({ error: "mitarbeiter.sam fehlt" });
  if (!mitarbeiter?.name)       return res.status(400).json({ error: "mitarbeiter.name fehlt" });

  try {
    const result = await saveHandover({
      hostname,
      biosSerial,
      modell,
      mitarbeiter,
      datum,
      ausgehaendigtVon,
      zubehoer,
      bemerkung,
    });

    req.audit.log({
      action:     ACTION_TYPES.HANDOVER_CREATED || "HANDOVER_CREATED",
      target:     mitarbeiter.sam,
      targetType: "user",
      result:     "success",
      details:    {
        hostname,
        filename:  result.filename,
        zubehoer:  result.zubehoer,
      },
    });

    // Docusnap-Status automatisch auf "Aktiv" setzen — Geraet wurde ja gerade
    // ausgehaendigt. Nicht-fatal: schlaegt das fehl (z.B. Asset noch nicht in
    // Docusnap importiert), soll die Uebergabe selbst trotzdem als erfolgreich
    // gelten, das Dokument ist ja schon erstellt.
    if (biosSerial) {
      try {
        await updateAssetStatus(hostname, biosSerial, "Aktiv");
      } catch (err) {
        console.warn(`[Handover] Docusnap-Status konnte nicht auf "Aktiv" gesetzt werden (${hostname}):`, err.message);
      }
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Handover] Fehler beim Erstellen:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/handover/:hostname – Dokumente eines Assets ────────────────────

router.get("/:hostname", requirePermission("user:search"), async (req, res) => {
  try {
    const docs = await listHandovers(req.params.hostname);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/handover/user/:sam – Alle Dokumente eines Benutzers ─────────────
// WICHTIG: muss VOR "/:hostname/:filename" stehen — Express prüft Routen in
// Registrierungsreihenfolge, und "/:hostname/:filename" ist ebenfalls eine
// Zwei-Segment-Route, die "/user/100001" sonst faelschlich als
// hostname="user", filename="100001" abfangen würde, bevor diese Route
// überhaupt geprüft wird.

router.get("/user/:sam", requirePermission("user:search"), async (req, res) => {
  try {
    const docs = await listHandoversBySam(req.params.sam);
    res.json({ docs, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/handover/:hostname/:filename/signature ────────────────────────
// Fuegt eine Signatur nachtraeglich in ein bestehendes Dokument ein.
// WICHTIG: hat DREI Segmente, kollidiert also nicht mit der Zwei-Segment-Route
// "/:hostname/:filename" weiter unten (anders als bei "/user/:sam" damals).

router.post("/:hostname/:filename/signature", requirePermission("user:search"), async (req, res) => {
  const { hostname, filename } = req.params;
  const { signature } = req.body; // data:image/png;base64,...

  if (!filename.endsWith(".pdf")) {
    return res.status(400).json({ error: "Ungültiger Dateityp" });
  }
  if (!signature) {
    return res.status(400).json({ error: "signature (Base64-PNG) fehlt" });
  }

  try {
    await addSignature(hostname, filename, signature);

    req.audit.log({
      action:     "HANDOVER_SIGNED",
      target:     filename,
      targetType: "handover_document",
      result:     "success",
      details:    { hostname },
    });

    res.json({ ok: true });
  } catch (err) {
    // "bereits signiert" ist ein Konflikt (409), alles andere ein Serverfehler
    const status = err.message.includes("bereits signiert") ? 409 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ─── GET /api/handover/:hostname/:filename – PDF herunterladen ────────────────

router.get("/:hostname/:filename", requirePermission("user:search"), (req, res) => {
  const { hostname, filename } = req.params;

  // Nur .pdf erlaubt
  if (!filename.endsWith(".pdf")) {
    return res.status(400).json({ error: "Ungültiger Dateityp" });
  }

  const filepath = getHandoverPath(hostname, filename);
  if (!filepath) {
    return res.status(404).json({ error: "Dokument nicht gefunden" });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.sendFile(filepath);
});

module.exports = router;
