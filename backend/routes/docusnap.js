/**
 * routes/docusnap.js – Docusnap Asset-Verwaltung
 *
 * GET  /api/docusnap/assets          – Alle Assets laden
 * GET  /api/docusnap/stats           – Statistiken
 * POST /api/docusnap/update          – Status/Kommentar aktualisieren
 * POST /api/docusnap/import          – Import aus Docusnap-CSV
 *
 * Phase 6.1: Permission-Checks ergänzt (vorher nur requireAuth – jeder
 * eingeloggte User konnte Assets ändern/importieren, unabhängig von der
 * Rolle). Keys: docusnap:read / docusnap:update / docusnap:import.
 */

const express  = require("express");
const fs       = require("fs");
const path     = require("path");
const csv      = require("csv-parser");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");

const router = express.Router();
router.use(requireAuth);

// ─── Pfade ────────────────────────────────────────────────────────────────────

const DOCUSNAP_FILE = process.env.DOCUSNAP_CSV ||
  "\\\\epn1docusnap1\\Docusnap_Share\\Export\\Docusnap2Topdesk_Clients.csv";

const DASHBOARD_FILE = path.join(__dirname, "..", "data", "assets.csv");
const DASHBOARD_SEP  = ";";
const IMPORT_STATUS_FILE = path.join(__dirname, "..", "data", "lastImport.json");

const COLUMNS = [
  "Key", "HostName", "HostTypeID", "ActiveUser", "OS", "OSArchitecture",
  "BiosSerial", "SystemManufacturer", "LastBootUpTime", "SystemProductName",
  "BuildNumber", "ONC", "Status", "Kommentar", "LetzteAenderung", "isNew",
];

const STATUS_OPTIONS = ["Neu", "Aktiv", "IT-Büro", "Keller", "Unbekannt", "Verschrottet"];

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function loadCSV(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve([]);
    const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/)[0];
    const separator = firstLine.includes(";") ? ";" : "\t";
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({
        separator,
        quote: '"',
        mapHeaders: ({ header }) => header.replace(/^\uFEFF/, "").replace(/"/g, "").trim(),
      }))
      .on("data", (data) => results.push(data))
      .on("end",  () => resolve(results))
      .on("error", () => resolve(results));
  });
}

function createKey(entry) {
  return `${entry.HostName}__${entry.BiosSerial || entry.ServiceTag || ""}`;
}

function docusnapToAsset(d, status = "Neu") {
  return {
    Key:                createKey(d),
    HostName:           d.HostName            || "",
    HostTypeID:         d.HostTypeID          || "",
    ActiveUser:         d.ActiveUser          || "",
    OS:                 d.OS                  || "",
    OSArchitecture:     d.OSArchitecture      || "",
    BiosSerial:         d.BiosSerial          || "",
    SystemManufacturer: d.SystemManufacturer  || "",
    LastBootUpTime:     d.LastBootUpTime       || "",
    SystemProductName:  d.SystemProductName   || "",
    BuildNumber:        d.BuildNumber         || "",
    ONC:                d.ONC                 || "",
    Status:             status,
    Kommentar:          "",
    LetzteAenderung:    new Date().toISOString(),
    isNew:              true,
  };
}

function saveDashboardData(data) {
  const header = COLUMNS.join(DASHBOARD_SEP) + "\n";
  const rows   = data.map(d =>
    COLUMNS.map(col => String(d[col] ?? "").replace(/;/g, ",")).join(DASHBOARD_SEP)
  ).join("\n");

  const dir = path.dirname(DASHBOARD_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DASHBOARD_FILE, header + rows, "utf8");
}

function enrichAsset(d) {
  return {
    ...d,
    Modell: d.SystemProductName || "",
    isNew:  d.isNew === "true" || d.isNew === true,
  };
}

function writeImportStatus(status) {
  try {
    const dir = path.dirname(IMPORT_STATUS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(IMPORT_STATUS_FILE, JSON.stringify(status, null, 2), "utf8");
  } catch (err) {
    console.error("[Docusnap] Import-Status konnte nicht geschrieben werden:", err.message);
  }
}

// ─── Initialer Import beim Start ──────────────────────────────────────────────

(async () => {
  if (!fs.existsSync(DASHBOARD_FILE)) {
    console.log("[Docusnap] assets.csv nicht vorhanden – initialer Import...");
    try {
      const docusnap = await loadCSV(DOCUSNAP_FILE);
      const assets   = docusnap.map(d => docusnapToAsset(d));
      saveDashboardData(assets);
      console.log(`[Docusnap] ${assets.length} Assets importiert.`);
    } catch (err) {
      console.warn("[Docusnap] Initialer Import fehlgeschlagen:", err.message);
    }
  }
})();

// ─── Routen ──────────────────────────────────────────────────────────────────

// GET /api/docusnap/assets
router.get("/assets", requirePermission("docusnap:read"), async (req, res) => {
  try {
    const data   = await loadCSV(DASHBOARD_FILE);
    const result = data.map(enrichAsset);
    result.sort((a, b) => (b.isNew === true) - (a.isNew === true));
    res.json({ assets: result });
  } catch (err) {
    console.error("[Docusnap] /assets Fehler:", err.message);
    res.status(500).json({ error: "Fehler beim Laden der Assets" });
  }
});

// GET /api/docusnap/stats
router.get("/stats", requirePermission("docusnap:read"), async (req, res) => {
  try {
    const data = await loadCSV(DASHBOARD_FILE);
    res.json({
      total:        data.length,
      neu:          data.filter(d => d.isNew === "true" || d.isNew === true).length,
      aktiv:        data.filter(d => d.Status === "Aktiv").length,
      verschrottet: data.filter(d => d.Status === "Verschrottet").length,
    });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Laden der Statistiken" });
  }
});

// POST /api/docusnap/update
// Eigenstaendig, damit auch routes/handover.js sie nutzen kann (automatisches
// Setzen von Status "Aktiv" bei Uebergabedokument-Erstellung), ohne die Route
// hier zu duplizieren.
async function updateAssetStatus(hostName, biosSerial, status, kommentar) {
  const existing = await loadCSV(DASHBOARD_FILE);
  const key      = `${hostName}__${biosSerial}`;
  const index    = existing.findIndex(e => e.Key === key);
  if (index < 0) throw new Error(`Asset nicht gefunden: ${hostName} / ${biosSerial}`);

  if (status    !== undefined) existing[index].Status    = status;
  if (kommentar !== undefined) existing[index].Kommentar = kommentar;
  existing[index].LetzteAenderung = new Date().toISOString();
  existing[index].isNew           = false;

  saveDashboardData(existing);
  return existing[index];
}

router.post("/update", requirePermission("docusnap:update"), async (req, res) => {
  const { HostName, BiosSerial, status, kommentar } = req.body;
  if (!HostName || !BiosSerial) {
    return res.status(400).json({ error: "HostName oder BiosSerial fehlt" });
  }
  try {
    await updateAssetStatus(HostName, BiosSerial, status, kommentar);
    res.json({ ok: true });
  } catch (err) {
    if (err.message.startsWith("Asset nicht gefunden")) {
      return res.status(404).json({ error: "Asset nicht gefunden" });
    }
    console.error("[Docusnap] /update Fehler:", err.message);
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
});

// POST /api/docusnap/import
router.post("/import", requirePermission("docusnap:import"), async (req, res) => {
  try {
    if (!fs.existsSync(DOCUSNAP_FILE)) {
      throw new Error(`Docusnap-CSV nicht erreichbar: ${DOCUSNAP_FILE}`);
    }

    const docusnap = await loadCSV(DOCUSNAP_FILE);
    const existing = await loadCSV(DASHBOARD_FILE);

    const existingMap = {};
    existing.forEach(d => { if (d.Key) existingMap[d.Key] = d; });

    let added = 0, updated = 0;
    docusnap.forEach(d => {
      const key = createKey(d);
      if (existingMap[key]) {
        const e = existingMap[key];
        e.HostTypeID         = d.HostTypeID          || e.HostTypeID;
        e.ActiveUser         = d.ActiveUser          || e.ActiveUser;
        e.OS                 = d.OS                  || e.OS;
        e.OSArchitecture     = d.OSArchitecture      || e.OSArchitecture;
        e.SystemManufacturer = d.SystemManufacturer  || e.SystemManufacturer;
        e.LastBootUpTime     = d.LastBootUpTime       || e.LastBootUpTime;
        e.SystemProductName  = d.SystemProductName   || e.SystemProductName;
        e.BuildNumber        = d.BuildNumber         || e.BuildNumber;
        e.ONC                = d.ONC                 || e.ONC;
        updated++;
      } else {
        existingMap[key] = docusnapToAsset(d);
        added++;
      }
    });

    saveDashboardData(Object.values(existingMap));

    writeImportStatus({
      ts: new Date().toISOString(),
      ok: true,
      added,
      updated,
      error: null,
    });

    res.json({ ok: true, added, updated });
  } catch (err) {
    console.error("[Docusnap] /import Fehler:", err.message);
    writeImportStatus({
      ts: new Date().toISOString(),
      ok: false,
      added: 0,
      updated: 0,
      error: err.message,
    });
    res.status(500).json({ error: "Fehler beim Import" });
  }
});

module.exports = {
  router,
  STATUS_OPTIONS,
  // Für health-Route
  loadCSV,
  enrichAsset,
  DOCUSNAP_FILE,
  DASHBOARD_FILE,
  IMPORT_STATUS_FILE,
  // Für routes/handover.js (automatisches Setzen von Status "Aktiv")
  updateAssetStatus,
};
