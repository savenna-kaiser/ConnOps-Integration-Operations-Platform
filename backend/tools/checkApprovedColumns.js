/**
 * checkApprovedColumns.js – Rein lesend: prueft, ob die drei neuen
 * approved_*-Spalten in topdesk_changes tatsaechlich angelegt wurden
 * (Migration vom 09.09.2026, "Freigabe von Ausfuehrung entkoppeln").
 *
 * Nutzung:
 *   node tools/checkApprovedColumns.js
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');

db.query(
  `SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'topdesk_changes' AND column_name LIKE 'approved%'
   ORDER BY column_name`
).then(r => {
  console.log(`${r.rows.length} passende Spalte(n) gefunden:`);
  r.rows.forEach(row => console.log(`  ${row.column_name} (${row.data_type})`));
  db.end();
}).catch(err => {
  console.error('Fehler:', err.message);
  db.end();
});
