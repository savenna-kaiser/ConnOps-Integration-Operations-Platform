/**
 * deleteChange.js – Entfernt EINEN einzelnen Change-Datensatz
 * unwiderruflich aus der ConnOps-Datenbank.
 *
 * ACHTUNG: Bewusst nur fuer den Ausnahmefall gedacht (z.B. Testdaten,
 * oder ein Change wurde in TopDesk geloescht und soll nicht mehr in
 * ConnOps auftauchen). Im Normalfall wird in ConnOps NICHTS geloescht -
 * die Audit-Historie (wer hat wann was gemacht) bleibt sonst immer
 * erhalten. Dieses Skript zerstoert diese Historie fuer die betroffene
 * Zeile UNWIDERRUFLICH.
 *
 * Sicherheitsbremse: Changes mit Status DONE/PARTIAL (also bereits
 * ausgefuehrt) werden NICHT geloescht, auch nicht mit --apply - dort
 * ist die Historie besonders wichtig. Fuer diesen Fall stattdessen
 * Ruecksprache halten, bevor irgendetwas geloescht wird.
 *
 * Nutzung:
 *   node tools/deleteChange.js CH-XXXXXX-XXX           (Trockenlauf, zeigt nur an)
 *   node tools/deleteChange.js CH-XXXXXX-XXX --apply   (loescht tatsaechlich)
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');

async function main() {
  const changeNumber = process.argv[2];
  const apply = process.argv.includes('--apply');

  if (!changeNumber) {
    console.error('Nutzung: node tools/deleteChange.js <changeNumber> [--apply]');
    process.exit(1);
  }

  const { rows } = await db.query(
    `SELECT change_id, type, status, received_at FROM topdesk_changes WHERE change_id = $1`,
    [changeNumber]
  );

  if (!rows.length) {
    console.error(`Change ${changeNumber} nicht in der ConnOps-Datenbank gefunden - nichts zu tun.`);
    process.exit(1);
  }

  const row = rows[0];
  console.log(`Gefunden: ${row.change_id}  Typ: ${row.type}  Status: ${row.status}  Erfasst: ${row.received_at}`);

  if (['DONE', 'PARTIAL'].includes(row.status)) {
    console.error(`\nStatus ${row.status} - bereits (teilweise) ausgefuehrt.`);
    console.error('Wird aus Sicherheitsgruenden NICHT geloescht, auch nicht mit --apply.');
    console.error('Falls das trotzdem noetig ist: bitte manuell/mit Ruecksprache klaeren.');
    process.exit(1);
  }

  if (!apply) {
    console.log('\nTrockenlauf (kein --apply) - es wurde NICHTS geloescht.');
    console.log(`Zum tatsaechlichen Loeschen: node tools/deleteChange.js ${changeNumber} --apply`);
    return;
  }

  await db.query(`DELETE FROM topdesk_changes WHERE change_id = $1`, [changeNumber]);
  console.log(`\n[OK] ${changeNumber} wurde unwiderruflich aus der ConnOps-Datenbank entfernt.`);
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
