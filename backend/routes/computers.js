/**
 * computers.js – Computer-Routen
 *
 * GET  /api/computers/search?q=…
 * POST /api/computers/:name/enable
 * POST /api/computers/:name/disable
 * GET  /api/computers/:name/localuser
 * GET  /api/computers/:name/filedeploy/folders?path=C:\
 * POST /api/computers/:name/filedeploy   { source, destDir }
 */

const express               = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const { ACTION_TYPES }      = require("../services/auditLog");
const { withAudit }         = require("../services/withAudit");
const adClient              = require("../services/adClient");

const router = express.Router();
router.use(requireAuth);

// Computername-Validierung
function validateName(req, res, next) {
  if (!/^[a-zA-Z0-9._-]+$/.test(req.params.name)) {
    return res.status(400).json({ error: "Ungültiger Computername" });
  }
  next();
}

// ─── Suche ───────────────────────────────────────────────────────────────────
router.get("/search", requirePermission("computer:search"), async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: "Suchbegriff fehlt (min. 2 Zeichen)" });

  try {
    const credential = req.audit.getCredential();
    const results    = await adClient.searchComputers(q, credential);
    req.audit.log({
      action: ACTION_TYPES.COMPUTER_SEARCH, target: q,
      targetType: "computer", result: "success",
      details: { count: results.length },
    });
    res.json({ results });
  } catch (err) {
    req.audit.log({ action: ACTION_TYPES.COMPUTER_SEARCH, target: q,
                    targetType: "computer", result: "failure", error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Aktivieren ──────────────────────────────────────────────────────────────
router.post("/:name/enable", validateName, requirePermission("computer:enable"), async (req, res) => {
  try {
    const credential = req.audit.getCredential();
    await withAudit(
      () => adClient.enableComputer(req.params.name, null, credential),
      { action: ACTION_TYPES.COMPUTER_ENABLE, target: req.params.name, targetType: "computer" },
      req.audit
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Deaktivieren ─────────────────────────────────────────────────────────────
router.post("/:name/disable", validateName, requirePermission("computer:disable"), async (req, res) => {
  try {
    const credential = req.audit.getCredential();
    await withAudit(
      () => adClient.disableComputer(req.params.name, credential),
      { action: ACTION_TYPES.COMPUTER_DISABLE, target: req.params.name, targetType: "computer" },
      req.audit
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Lokal angemeldeter Benutzer ─────────────────────────────────────────────
// Rein lesend; nutzt die Zugangsdaten des angemeldeten Benutzers (CIM/DCOM).
router.get("/:name/localuser", validateName, requirePermission("computer:search"), async (req, res) => {
  try {
    const credential = req.audit.getCredential();
    res.json({ localUser: await adClient.getLocalUser(req.params.name, credential) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── FileDeploy ──────────────────────────────────────────────────────────────
// Kopiert eine Datei (UNC-Quelle) auf einen Computer. Zugriff auf Quelle und
// \\PC\<Laufwerk>$ laeuft mit den Zugangsdaten des angemeldeten Benutzers
// (kein Dienstkonto) - das Audit-Log nennt daher den tatsaechlich Handelnden.
// Pfade werden hier UND im PowerShell-Worker geprueft.
const DEST_DIR_RE = /^[A-Za-z]:\\([^\\/:*?"<>|]+\\)*[^\\/:*?"<>|]*$/;
const SOURCE_RE   = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(\\[^\\/:*?"<>|]+)+$/;
const hasDotDot   = (p) => /(^|\\)\.\.?(\\|$)/.test(p);

function validDestDir(p) { return typeof p === "string" && p.length <= 260 && DEST_DIR_RE.test(p) && !hasDotDot(p); }
function validSource(p)  { return typeof p === "string" && p.length <= 520 && SOURCE_RE.test(p.trim()) && !hasDotDot(p); }

// Quelle-Browser: Ordner + Dateien einer UNC-Freigabe (nicht computerbezogen).
const SOURCE_FOLDER_RE = /^\\\\[^\\/:*?"<>|]+\\[^\\/:*?"<>|]+(\\[^\\/:*?"<>|]+)*$/;
router.get("/filedeploy/source", requirePermission("computer:filedeploy"), async (req, res) => {
  const p = req.query.path;
  if (typeof p !== "string" || p.length > 520 || !SOURCE_FOLDER_RE.test(p.trim()) || hasDotDot(p)) {
    return res.status(400).json({ error: "Ungültiger Pfad (erwartet: \\\\server\\share[\\ordner])" });
  }
  try {
    const credential = req.audit.getCredential();
    res.json(await adClient.fileDeployListSource(p.trim(), credential));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:name/filedeploy/folders", validateName, requirePermission("computer:filedeploy"), async (req, res) => {
  const p = req.query.path;
  if (!validDestDir(p)) return res.status(400).json({ error: "Ungültiger Pfad" });
  try {
    const credential = req.audit.getCredential();
    const data = await adClient.fileDeployListFolders(req.params.name, p, credential);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:name/filedeploy", validateName, requirePermission("computer:filedeploy"), async (req, res) => {
  const { source, destDir } = req.body || {};
  if (!validSource(source))   return res.status(400).json({ error: "Ungültiger Quellpfad (erwartet: \\\\server\\share\\...\\datei)" });
  if (!validDestDir(destDir)) return res.status(400).json({ error: "Ungültiger Zielordner (erwartet z. B. C:\\install)" });

  const base = { source: source.trim(), destDir };
  try {
    const credential = req.audit.getCredential();
    const result = await adClient.fileDeployCopy(req.params.name, source.trim(), destDir, credential);
    const ok = result.overall === "Success";
    req.audit.log({
      action: ACTION_TYPES.COMPUTER_FILEDEPLOY, target: req.params.name, targetType: "computer",
      result: ok ? "success" : "failure",
      ...(ok ? {} : { error: result.errorMessage || "FileDeploy fehlgeschlagen" }),
      details: {
        ...base,
        fileName:  result.fileName,
        sizeBytes: result.sizeBytes,
        sha256:    result.sha256,
        steps:     Object.fromEntries(Object.entries(result.steps || {}).map(([k, v]) => [k, v.state])),
        ...(ok ? {} : { detail: result.detail }),
      },
    });
    res.json({ result });
  } catch (err) {
    req.audit.log({
      action: ACTION_TYPES.COMPUTER_FILEDEPLOY, target: req.params.name, targetType: "computer",
      result: "failure", error: err.message, details: base,
    });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
