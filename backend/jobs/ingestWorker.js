/**
 * ingestWorker.js – Gemeinsame Ingest-Logik für Webhook und Scheduler
 */

const topdesk                        = require('../services/topdeskClient');
const { resolveChange, ResolveError } = require('../services/resolveChange');
const db                             = require('../data/db');

async function detectConflicts(resolved, changeId) {
  if (!resolved.sam) return null;

  const hard = await db.query(
    `SELECT change_id, type, status FROM topdesk_changes
     WHERE change_id != $1
       AND status NOT IN ('DONE', 'FAILED')
       AND (resolved->>'sam') = $2`,
    [changeId, resolved.sam]
  );
  if (hard.rows.length) {
    return {
      level:     'CONFLICT',
      reason:    `SAM-Account "${resolved.sam}" bereits in Change ${hard.rows[0].change_id} (${hard.rows[0].status})`,
      changeRef: hard.rows[0].change_id,
    };
  }

  if (resolved.firstName && resolved.lastName && resolved.department && resolved.targetDate) {
    const soft = await db.query(
      `SELECT change_id FROM topdesk_changes
       WHERE change_id != $1
         AND status NOT IN ('DONE', 'FAILED')
         AND (resolved->>'firstName')  = $2
         AND (resolved->>'lastName')   = $3
         AND (resolved->>'department') = $4
         AND ABS(EXTRACT(EPOCH FROM (target_date - $5::date)) / 86400) <= 7`,
      [changeId, resolved.firstName, resolved.lastName, resolved.department, resolved.targetDate]
    );
    if (soft.rows.length) {
      return {
        level:     'WARNING',
        reason:    `Mögliches Duplikat: gleicher Name + Abteilung + Zieldatum ±7 Tage (${soft.rows[0].change_id})`,
        changeRef: soft.rows[0].change_id,
      };
    }
  }

  return null;
}

async function ingestChange(changeId) {
  const change = await topdesk.getChangeById(changeId);
  const type   = topdesk.getTypeFromChange(change);

  if (!type) {
    console.warn(`[Ingest] Unbekannte templateId ${change.templateId} — ignoriert`);
    return;
  }

  // In DB speichern — ON CONFLICT ignorieren (bereits vorhanden)
  await db.query(
    `INSERT INTO topdesk_changes
       (change_id, type, status, target_date, payload)
     VALUES ($1, $2, 'PENDING', $3, $4)
     ON CONFLICT (change_id) DO NOTHING`,
    [
      change.number,
      type,
      change.optionalFields1?.date1 || null,
      JSON.stringify(change),
    ]
  );

  // Bereits in DB und nicht mehr PENDING → nicht neu auflösen
  const existing = await db.query(
    `SELECT status FROM topdesk_changes WHERE change_id = $1`,
    [change.number]
  );
  if (existing.rows[0]?.status !== 'PENDING') return;

  // resolveChange
  let resolved = null;
  try {
    resolved = await resolveChange(change);
  } catch (err) {
    if (err instanceof ResolveError) {
      await db.query(
        `UPDATE topdesk_changes
         SET status = 'CONFLICT', resolved = $1
         WHERE change_id = $2`,
        [JSON.stringify({ error: err.message, context: err.context }), change.number]
      );
      return;
    }
    throw err;
  }

  // Konflikt-Erkennung
  const conflict = await detectConflicts(resolved, change.number);
  const status   = conflict ? conflict.level : 'PENDING';

  await db.query(
    `UPDATE topdesk_changes
     SET resolved = $1, status = $2
     WHERE change_id = $3`,
    [JSON.stringify(resolved), status, change.number]
  );
}

module.exports = { ingestChange };