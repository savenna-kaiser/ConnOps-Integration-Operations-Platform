/**
 * overrideChange.js – Manueller Override des resolved-Zustands vor Ausführung
 *
 * Admin kann einzelne Felder in `resolved` überschreiben.
 * Überschriebene Felder werden als overridden: true markiert.
 * Änderung landet im Audit-Log.
 */

const db = require('../../data/db');
const { ACTION_TYPES } = require('../../services/auditLog');

async function execute({ changeId, overrides }, audit) {
  if (!changeId || !overrides || typeof overrides !== 'object') {
    throw new Error('changeId und overrides sind erforderlich.');
  }

  const { rows } = await db.query(
    'SELECT * FROM topdesk_changes WHERE change_id = $1',
    [changeId]
  );
  if (!rows.length) throw new Error(`Change ${changeId} nicht gefunden.`);

  const change = rows[0];

  if (['DONE', 'PROCESSING'].includes(change.status)) {
    throw new Error(`Change ${changeId} kann nicht überschrieben werden (Status: ${change.status}).`);
  }

  const before   = change.resolved || {};
  const updated  = { ...before };

  // Überschriebene Felder markieren
  for (const [key, value] of Object.entries(overrides)) {
    updated[key] = value;
    updated[`_overridden_${key}`] = true;
  }

  await db.query(
    `UPDATE topdesk_changes
     SET resolved = $1, status = CASE WHEN status = 'CONFLICT' THEN 'WARNING' ELSE status END
     WHERE change_id = $2`,
    [JSON.stringify(updated), changeId]
  );

  audit.log({
    action:     ACTION_TYPES.TOPDESK_OVERRIDE,
    target:     changeId,
    targetType: 'topdesk',
    result:     'success',
    details:    {
      before:    before,
      overrides: overrides,
      actor:     audit.actor,
    },
  });

  return { ok: true, resolved: updated };
}

module.exports = { execute };