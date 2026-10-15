/**
 * topdesk.js – TopDesk-Routen
 *
 * Phase 3.1: Webhook speichert Change in DB via ingestWorker.
 * Phase 3.2: Validitätsprüfung pro Change.
 * Phase 3.3: Ausführungs-Pipeline.
 * Phase 3.5: Manueller Override.
 * Phase 3.6: Manuelle Schritt-Nachbearbeitung.
 */

const express  = require('express');
const crypto   = require('crypto');
const { requireAuth }       = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbac');
const db                    = require('../data/db');
const { ingestChange, syncPendingChanges } = require('../jobs/ingestWorker');
const { validateChange }    = require('../services/validateChange');
const executeChange         = require('../actions/topdesk/executeChange');
const overrideChange        = require('../actions/topdesk/overrideChange');
const markStepDone          = require('../actions/topdesk/markStepDone');
const { computeFingerprint } = require('../services/changeFingerprint');
const { ACTION_TYPES }      = require('../services/auditLog');

const router = express.Router();

// ─── Startup-Prüfung ─────────────────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.TOPDESK_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error('[FATAL] TOPDESK_WEBHOOK_SECRET ist nicht gesetzt.');
  if (process.env.NODE_ENV === 'production') process.exit(1);
}

// ─── Deduplication-Cache ─────────────────────────────────────────────────────
const DEDUP_TTL_MS    = 5 * 60 * 1000;
const inProgressCache = new Map();

function isAlreadyProcessing(changeId) {
  const ts = inProgressCache.get(changeId);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) { inProgressCache.delete(changeId); return false; }
  return true;
}
function markProcessing(changeId)  { inProgressCache.set(changeId, Date.now()); }
function clearProcessing(changeId) { inProgressCache.delete(changeId); }

// ─── Routes ───────────────────────────────────────────────────────────────────

// Manueller Sync: alle aktuell bei TopDesk wartenden Changes abrufen und
// neu bewerten (echter Netzwerkzugriff auf TopDesk, potenziell laenger
// laufend als die reinen Lese-Routen unten - siehe Projektnotizen
// 07.09.2026, "Von TopDesk abrufen" vs. reines "Aktualisieren").
router.post('/changes/sync', requireAuth, requirePermission('topdesk:read'), async (req, res) => {
  try {
    const result = await syncPendingChanges();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current/Active
router.get('/changes/active', requireAuth, requirePermission('topdesk:read'), async (req, res) => {
  try {
    // WICHTIG (Klarstellung 10.09.2026): Ein Change gehoert unter
    // "Aktuell", solange er entweder Aufmerksamkeit braucht
    // (CONFLICT/WARNING/PARTIAL/FAILED) ODER noch nicht freigegeben
    // wurde - UNABHAENGIG vom Zieldatum. Ein Change wandert erst nach
    // erfolgter Freigabe UND solange das Zieldatum noch in der Zukunft
    // liegt nach "Ausstehend". Ist das Zieldatum bereits erreicht
    // (auch wenn freigegeben), bleibt er bewusst unter "Aktuell" -
    // schliesst die Luecke bis zum naechsten automatischen
    // Poll-Durchlauf, statt in keinem Tab sichtbar zu sein.
    const { rows } = await db.query(
      `SELECT * FROM topdesk_changes
       WHERE status IN ('CONFLICT','WARNING','PARTIAL','FAILED')
          OR (status = 'PENDING' AND (
                approved_at IS NULL
                OR target_date IS NULL
                OR target_date <= NOW()
              ))
       ORDER BY target_date ASC NULLS FIRST`
    );
    res.json({ changes: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ausstehend
router.get('/changes/upcoming', requireAuth, requirePermission('topdesk:read'), async (req, res) => {
  try {
    // Gegenstueck zu /changes/active oben: ausschliesslich Changes,
    // die BEREITS freigegeben wurden UND deren Zieldatum noch in der
    // Zukunft liegt - reine "wartet auf den Scheduler"-Ansicht.
    const { rows } = await db.query(
      `SELECT * FROM topdesk_changes
       WHERE status = 'PENDING' AND approved_at IS NOT NULL AND target_date > NOW()
       ORDER BY target_date ASC`
    );
    res.json({ changes: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verlauf
router.get('/changes/history', requireAuth, requirePermission('topdesk:read'), async (req, res) => {
  try {
    const { from, to, type, status } = req.query;
    const conditions = [`c.status IN ('DONE','PARTIAL','FAILED')`];
    const values     = [];
    let   i          = 1;

    if (from)   { conditions.push(`c.target_date >= $${i++}`); values.push(from); }
    if (to)     { conditions.push(`c.target_date <= $${i++}`); values.push(to); }
    if (type)   { conditions.push(`c.type = $${i++}`);         values.push(type); }
    if (status) { conditions.push(`c.status = $${i++}`);       values.push(status); }

    const { rows } = await db.query(
      `SELECT c.*, json_agg(s ORDER BY s.executed_at) FILTER (WHERE s.id IS NOT NULL) as steps
       FROM topdesk_changes c
       LEFT JOIN topdesk_change_steps s ON s.change_id = c.change_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id
       ORDER BY c.processed_at DESC NULLS LAST`,
      values
    );
    res.json({ changes: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Badge-Counter
router.get('/changes/count', requireAuth, requirePermission('topdesk:read'), async (req, res) => {
  try {
    // Konsistent mit /changes/active (Klarstellung 10.09.2026) -
    // siehe dortigen Kommentar zur Begruendung.
    const { rows } = await db.query(
      `SELECT COUNT(*) as count FROM topdesk_changes
       WHERE status IN ('CONFLICT','WARNING','PARTIAL','FAILED')
          OR (status = 'PENDING' AND (
                approved_at IS NULL
                OR target_date IS NULL
                OR target_date <= NOW()
              ))`
    );
    res.json({ count: parseInt(rows[0].count, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validierung
router.get('/changes/:changeId/validate',
  requireAuth, requirePermission('topdesk:read'),
  async (req, res) => {
    try {
      const { rows } = await db.query(
        'SELECT * FROM topdesk_changes WHERE change_id = $1',
        [req.params.changeId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Change nicht gefunden.' });

      const change   = rows[0];
      const resolved = change.resolved;

      if (!resolved || resolved.error) {
        return res.json({ valid: false, checks: {}, reason: 'Change nicht aufgelöst' });
      }

      const result = await validateChange(resolved, change.type);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Freigeben (entkoppelt von der eigentlichen Ausführung, siehe
// Projektnotizen 09.09.2026) - bindet die Freigabe an den Fingerabdruck
// der AKTUELLEN resolved-Version. Kein neuer Status - approved_at/
// approved_by sind reine Zusatzinformation neben dem bestehenden status.
router.post('/changes/:changeId/approve',
  requireAuth, requirePermission('topdesk:process-single'),
  async (req, res) => {
    const { changeId } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(changeId)) {
      return res.status(400).json({ error: 'Ungültige Change-ID' });
    }
    try {
      const { rows } = await db.query(
        'SELECT * FROM topdesk_changes WHERE change_id = $1',
        [changeId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Change nicht gefunden.' });

      const change = rows[0];
      if (!change.resolved || change.resolved.error) {
        return res.status(400).json({ error: 'Change ist nicht aufgelöst — Freigabe nicht möglich.' });
      }
      if (['DONE', 'PROCESSING', 'PARTIAL'].includes(change.status)) {
        return res.status(400).json({ error: `Status ${change.status} — Freigabe nicht mehr sinnvoll.` });
      }

      const fingerprint = computeFingerprint(change.resolved);
      const actor = req.audit.actor;

      await db.query(
        `UPDATE topdesk_changes
         SET approved_at = NOW(), approved_by = $1, approved_fingerprint = $2
         WHERE change_id = $3`,
        [actor, fingerprint, changeId]
      );

      req.audit.log({ action: ACTION_TYPES.TOPDESK_OVERRIDE, target: changeId,
                      targetType: 'topdesk', result: 'success',
                      details: { action: 'approve', fingerprint } });

      res.json({ ok: true, approvedAt: new Date().toISOString(), approvedBy: actor });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Ausführen
router.post('/changes/:changeId/execute',
  requireAuth, requirePermission('topdesk:process-single'),
  async (req, res) => {
    const { changeId } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(changeId)) {
      return res.status(400).json({ error: 'Ungültige Change-ID' });
    }
    try {
      const result = await executeChange.execute({ changeId }, req.audit);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Manueller Override
router.put('/changes/:changeId/override',
  requireAuth, requirePermission('topdesk:process-single'),
  async (req, res) => {
    const { changeId } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(changeId)) {
      return res.status(400).json({ error: 'Ungültige Change-ID' });
    }
    try {
      const result = await overrideChange.execute(
        { changeId, overrides: req.body },
        req.audit
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Step manuell erledigt markieren
router.post('/changes/:changeId/steps/:stepName/done',
  requireAuth, requirePermission('topdesk:process-single'),
  async (req, res) => {
    const { changeId, stepName } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(changeId)) {
      return res.status(400).json({ error: 'Ungültige Change-ID' });
    }
    try {
      const result = await markStepDone.execute(
        { changeId, stepName, reason: req.body?.reason || null },
        req.audit
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Webhook
router.post('/webhook', (req, res) => {
  const incoming = req.headers['x-topdesk-secret'] || '';
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(incoming.padEnd(WEBHOOK_SECRET.length, '\0')),
      Buffer.from(WEBHOOK_SECRET)
    );
  } catch { valid = false; }

  if (!valid) return res.status(401).end();

  const changeId = req.body?.changeId || req.body?.number;
  if (!changeId || !/^[a-zA-Z0-9_-]+$/.test(String(changeId))) {
    return res.status(400).json({ error: 'changeId fehlt oder ungültig' });
  }

  if (isAlreadyProcessing(changeId)) {
    return res.json({ ok: true, queued: false, reason: 'already_processing' });
  }

  res.json({ ok: true, queued: true });

  markProcessing(changeId);
  setImmediate(async () => {
    try {
      await ingestChange(changeId);
    } catch (err) {
      console.error('[TopDesk Webhook] Fehler:', err.message);
    } finally {
      clearProcessing(changeId);
    }
  });
});

module.exports = router;