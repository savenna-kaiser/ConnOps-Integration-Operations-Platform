/**
 * dumpRawFields.js – Rein lesend: zeigt die rohen optionalFields1/2
 * bestimmter Changes, um zu pruefen ob ein Datumsfeld tatsaechlich
 * befuellt ist oder schlicht leer.
 *
 * WICHTIG (korrigiert 12.09.2026): Holt die TopDesk-UUID aus dem
 * bereits in der ConnOps-Datenbank gespeicherten payload und fragt
 * DIREKT per ID ab (wie reingestChange.js) - NICHT ueber die
 * gefilterte "wartende Changes"-Liste. Ein Change kann in ConnOps
 * weiterhin CONFLICT sein, in TopDesk selbst aber laengst einen
 * anderen Bearbeitungsstatus haben und dadurch aus der "wartend"-Liste
 * verschwunden sein - der direkte Abruf per ID funktioniert davon
 * unabhaengig.
 *
 * Nutzung:
 *   node tools/dumpRawFields.js CH-202607-002 CH-202607-005
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db      = require('../data/db');
const topdesk = require('../services/topdeskClient');

async function main() {
  const wanted = process.argv.slice(2);
  if (!wanted.length) {
    console.error('Nutzung: node tools/dumpRawFields.js CH-XXXXXX-XXX [weitere...]');
    process.exit(1);
  }

  for (const number of wanted) {
    const { rows } = await db.query(
      `SELECT payload FROM topdesk_changes WHERE change_id = $1`,
      [number]
    );
    if (!rows.length) {
      console.log(`${number}: nicht in der ConnOps-Datenbank gefunden\n`);
      continue;
    }

    const storedPayload = rows[0].payload;
    const uuid = storedPayload?.id;
    if (!uuid) {
      console.log(`${number}: keine TopDesk-UUID im gespeicherten payload gefunden\n`);
      continue;
    }

    try {
      const change = await topdesk.getChangeById(uuid);
      console.log(`── ${number} (${change.briefDescription || 'ohne Beschreibung'}) — aktueller TopDesk-Status: ${change.status?.name || '?'} ──`);
      console.log('optionalFields1:', JSON.stringify(change.optionalFields1, null, 2));
      console.log('optionalFields2:', JSON.stringify(change.optionalFields2, null, 2));
      console.log('');
    } catch (err) {
      console.log(`${number}: Abruf per ID fehlgeschlagen - ${err.message}\n`);
    }
  }
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());

