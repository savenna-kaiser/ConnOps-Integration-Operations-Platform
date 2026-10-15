/**
 * routes/report.js – Zeitraum-Report für Admins
 *
 * GET /api/report?range=7d|14d|21d|1m|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /api/report/export?format=pdf|csv&range=...&from=...&to=...
 *
 *   - Benutzer:  angelegt, deaktiviert, Passwort zurückgesetzt, entsperrt
 *   - Computer:  deaktiviert
 *   - TopDesk:   Eintritte, Austritte, Änderungen (nur status = DONE)
 *
 * Nur für it-admin / it-lead (Permission "report:read").
 *
 * Export-Funktion (statt Mail-Versand, siehe Gespräch zu Phase 8.3): manueller
 * Download als PDF oder CSV, exportiert denselben Zeitraum, der gerade in der
 * UI angezeigt wird. CSV im gleichen Stil wie der bestehende Audit-Export
 * (Semikolon-getrennt, UTF-8 BOM für Excel), PDF via pdfkit.
 */

const express  = require("express");
const PDFDocument = require("pdfkit");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const { ACTION_TYPES, countActions } = require("../services/auditLog");
const { applyLetterhead, CONTENT_TOP, CONTENT_BOTTOM } = require("../services/pdfLetterhead");
const { sanitizeCsvCell } = require("../services/csvUtils");
const db = require("../data/db");

const router = express.Router();
router.use(requireAuth, requirePermission("report:read"));

const RANGE_DAYS = { "7d": 7, "14d": 14, "21d": 21, "1m": 30 };

function resolveRange(query) {
  const { range = "7d", from, to } = query;

  if (range === "custom") {
    if (!from || !to) {
      throw new Error('Bei range=custom sind "from" und "to" (YYYY-MM-DD) erforderlich.');
    }
    return { dateFrom: from, dateTo: to, label: `${from} – ${to}` };
  }

  const days = RANGE_DAYS[range];
  if (!days) {
    throw new Error(`Unbekannter Zeitraum: ${range}. Erlaubt: 7d, 14d, 21d, 1m, custom.`);
  }
  const toDate   = new Date();
  const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(fromDate), dateTo: iso(toDate), label: `letzte ${days} Tage` };
}

/**
 * Ermittelt die Report-Daten für einen Zeitraum. Ausgelagert aus der
 * GET /-Route, damit GET /export dieselbe Logik ohne Duplikat nutzen kann.
 */
async function buildReportData(query) {
  const range = resolveRange(query);
  const { dateFrom, dateTo, label } = range;

  const userCounts = countActions({
    actions: [
      ACTION_TYPES.USER_CREATE,
      ACTION_TYPES.USER_DISABLE,
      ACTION_TYPES.USER_RESET_PWD,
      ACTION_TYPES.USER_UNLOCK,
    ],
    dateFrom, dateTo, result: "success",
  });

  const computerCounts = countActions({
    actions: [ACTION_TYPES.COMPUTER_DISABLE],
    dateFrom, dateTo, result: "success",
  });

  let topdeskCounts = { EINTRITT: 0, AUSTRITT: 0, ABT_WECHSEL: 0 };
  let topdeskError = null;
  try {
    const result = await db.query(
      `SELECT type, COUNT(*) as n
       FROM topdesk_changes
       WHERE status = 'DONE'
         AND processed_at >= $1::date
         AND processed_at <  ($2::date + INTERVAL '1 day')
       GROUP BY type`,
      [dateFrom, dateTo]
    );
    for (const row of result.rows) {
      topdeskCounts[row.type] = parseInt(row.n, 10);
    }
  } catch (err) {
    topdeskError = err.message;
  }

  return {
    range: { key: query.range || "7d", dateFrom, dateTo, label },
    benutzer: {
      angelegt:               userCounts[ACTION_TYPES.USER_CREATE],
      deaktiviert:            userCounts[ACTION_TYPES.USER_DISABLE],
      passwortZurueckgesetzt: userCounts[ACTION_TYPES.USER_RESET_PWD],
      entsperrt:              userCounts[ACTION_TYPES.USER_UNLOCK],
    },
    computer: {
      deaktiviert: computerCounts[ACTION_TYPES.COMPUTER_DISABLE],
    },
    topdesk: {
      eintritte:   topdeskCounts.EINTRITT,
      austritte:   topdeskCounts.AUSTRITT,
      aenderungen: topdeskCounts.ABT_WECHSEL,
      error: topdeskError,
    },
  };
}

// ─── GET /api/report ──────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const data = await buildReportData(req.query);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/report/export ───────────────────────────────────────────────────

router.get("/export", async (req, res) => {
  const format = req.query.format;
  if (format !== "pdf" && format !== "csv") {
    return res.status(400).json({ error: "format muss 'pdf' oder 'csv' sein." });
  }

  let data;
  try {
    data = await buildReportData(req.query);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const filenameSafe = data.range.label.replace(/[^a-zA-Z0-9-]/g, "_");

  if (format === "csv") {
    const rows = [
      ["Kategorie", "Kennzahl", "Wert"],
      ["Benutzer", "Angelegt", data.benutzer.angelegt],
      ["Benutzer", "Deaktiviert", data.benutzer.deaktiviert],
      ["Benutzer", "Passwort zurueckgesetzt", data.benutzer.passwortZurueckgesetzt],
      ["Benutzer", "Entsperrt", data.benutzer.entsperrt],
      ["Computer", "Deaktiviert", data.computer.deaktiviert],
      ["TopDesk", "Eintritte", data.topdesk.eintritte],
      ["TopDesk", "Austritte", data.topdesk.austritte],
      ["TopDesk", "Aenderungen", data.topdesk.aenderungen],
    ];
    const csv = rows.map(r => r.map(sanitizeCsvCell).join(";")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="report-${filenameSafe}.csv"`);
    return res.send("\uFEFF" + `"Zeitraum";"${data.range.label}"\n` + csv);
  }

  // ─── PDF ────────────────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="report-${filenameSafe}.pdf"`);

  const doc = new PDFDocument({
    margins: { top: CONTENT_TOP, bottom: CONTENT_BOTTOM, left: 50, right: 50 },
  });
  doc.pipe(res);
  applyLetterhead(doc); // MUSS vor dem ersten Inhalt aufgerufen werden

  doc.fontSize(20).text("ConnOps – Report", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor("#666666").text(`Zeitraum: ${data.range.label}`);
  doc.text(`Erstellt am: ${new Date().toLocaleString("de-DE")}`);
  doc.moveDown(1.5);
  doc.fillColor("#000000");

  function section(title, rows) {
    doc.fontSize(14).text(title, { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    rows.forEach(([label, value]) => {
      doc.text(`${label}:`, { continued: true, width: 300 });
      doc.text(`  ${value ?? 0}`, { align: "left" });
    });
    doc.moveDown(1);
  }

  section("Benutzer", [
    ["Benutzer angelegt", data.benutzer.angelegt],
    ["Benutzer deaktiviert", data.benutzer.deaktiviert],
    ["Passwort zurueckgesetzt", data.benutzer.passwortZurueckgesetzt],
    ["Benutzer entsperrt", data.benutzer.entsperrt],
  ]);

  section("Computer", [
    ["Geraete deaktiviert", data.computer.deaktiviert],
  ]);

  section("TopDesk", [
    ["Eintritte", data.topdesk.eintritte],
    ["Austritte", data.topdesk.austritte],
    ["Aenderungen", data.topdesk.aenderungen],
  ]);

  if (data.topdesk.error) {
    doc.fontSize(9).fillColor("#dc2626").text(`Hinweis: ${data.topdesk.error}`);
  }

  doc.end();
});

module.exports = router;
