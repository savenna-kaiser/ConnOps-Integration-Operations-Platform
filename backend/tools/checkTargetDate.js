/**
 * checkTargetDate.js – Rein lesend: zeigt die rohe target_date-Spalte
 * eines Changes, im Vergleich zu resolved.targetDate.
 *
 * Nutzung:
 *   node tools/checkTargetDate.js CH-XXXXXX-XXX
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');

async function main() {
  const changeNumber = process.argv[2];
  if (!changeNumber) {
    console.error('Nutzung: node tools/checkTargetDate.js <changeNumber>');
    process.exit(1);
  }

  const { rows } = await db.query(
    `SELECT change_id, target_date, resolved->>'targetDate' as resolved_target_date
     FROM topdesk_changes WHERE change_id = $1`,
    [changeNumber]
  );

  if (!rows.length) {
    console.error(`${changeNumber} nicht gefunden.`);
    process.exit(1);
  }

  console.log('Spalte target_date:      ', rows[0].target_date);
  console.log('resolved.targetDate:     ', rows[0].resolved_target_date);
}

main()
  .catch(err => { console.error('Fehler:', err.message); process.exitCode = 1; })
  .finally(() => db.end());
