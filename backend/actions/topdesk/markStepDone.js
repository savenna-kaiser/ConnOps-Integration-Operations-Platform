/**
 * markStepDone.js – Fehlgeschlagenen Step manuell als erledigt markieren
 *
 * Ermöglicht Change von PARTIAL auf DONE zu setzen mit Begründung.
 */

const db = require('../../data/db');
const { ACTION_TYPES } = require('../../services/auditLog');

async function execute({ changeId, stepName, reason }, audit) {
  if (!changeId || !stepName) {
    throw new Error('changeId und stepName sind erforderlich.');
  }

  // Step prüfen
  const stepResult = await db.query(
    `SELECT * FROM topdesk_change_steps
     WHERE change_id = $1 AND step_name = $2
     ORDER BY executed_at DESC LIMIT 1`,
    [changeId, stepName]
  );
  if (!stepResult.rows.length) {
    throw new Error(`Step "${stepName}" nicht gefunden für Change ${changeId}.`);
  }

  const step = stepResult.rows[0];
  if (step.status === 'OK') {
    throw new Error(`Step "${stepName}" ist bereits erfolgreich — kein Override nötig.`);
  }

  // Step als MANUAL markieren
  await db.query(
    `UPDATE topdesk_change_steps
     SET status = 'MANUAL', error_message = $1
     WHERE id = $2`,
    [reason ? `Manuell erledigt: ${reason}` : 'Manuell erledigt', step.id]
  );

  // Prüfen ob noch offene FAILED-Steps übrig sind
  const remaining = await db.query(
    `SELECT COUNT(*) as count FROM topdesk_change_steps
     WHERE change_id = $1 AND status = 'FAILED'`,
    [changeId]
  );
  const stillFailed = parseInt(remaining.rows[0].count, 10);

  // Change-Status anpassen wenn keine FAILED-Steps mehr
  let newStatus = null;
  if (stillFailed === 0) {
    await db.query(
      `UPDATE topdesk_changes
       SET status = 'DONE'
       WHERE change_id = $1 AND status = 'PARTIAL'`,
      [changeId]
    );
    newStatus = 'DONE';
  }

  audit.log({
    action:     ACTION_TYPES.TOPDESK_MANUAL_DONE,
    target:     changeId,
    targetType: 'topdesk',
    result:     'success',
    details:    {
      stepName,
      reason:    reason || null,
      newStatus: newStatus || 'PARTIAL',
      actor:     audit.actor,
    },
  });

  return {
    ok:        true,
    stepName,
    newStatus: newStatus || 'PARTIAL',
    remaining: stillFailed,
  };
}

module.exports = { execute };