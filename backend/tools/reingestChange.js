/**
 * reingestChange.js – Setzt einen einzelnen, feststeckenden Change auf
 * PENDING zurueck und loest ihn erneut auf (echte ingestChange()-Funktion,
 * kein Duplikat-Code).
 *
 * Hintergrund (29.07.2026): ingestWorker.js loest einen Change nur dann
 * erneut auf, wenn sein aktueller Status PENDING ist:
 *   if (existing.rows[0]?.status !== 'PENDING') return;
 * Changes, die VOR dem SAM-Feldmapping-Fix in resolveChange.js bereits
 * mit CONFLICT (falscher, alter Fehlermeldung) in der DB gelandet sind,
 * wuerden dadurch fuer immer stecken bleiben - auch ein erneutes
 * TopDesk-Webhook-Signal wuerde am selben Guard abprallen. Dieses Skript
 * setzt gezielt EINEN Change zurueck und stoesst die echte Auflösung
 * erneut an, statt Felder manuell in der DB oder per Override-Route
 * zusammenzuflicken (bei einem ResolveError enthaelt `resolved` nur
 * {error, context}, kein vollstaendiges Objekt - ein Override waere
 * daher unvollstaendig).
 *
 * Sicherheitsbremse: Changes mit Status DONE oder PROCESSING werden NICHT
 * zurueckgesetzt (angelehnt an dieselbe Bremse in overrideChange.js).
 *
 * Nutzung:
 *   node tools/reingestChange.js <changeNumber>
 *   z.B. node tools/reingestChange.js CH-202608-031
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');
const { ingestChange } = require('../jobs/ingestWorker');

async function main() {
  const changeNumber = process.argv[2];
  if (!changeNumber) {
    console.error('Nutzung: node tools/reingestChange.js <changeNumber>');
    console.error('Beispiel: node tools/reingestChange.js CH-202608-031');
    process.exit(1);
  }

  const before = await db.query(
    `SELECT change_id, status, payload->>'id' as topdesk_uuid
     FROM topdesk_changes WHERE change_id = $1`,
    [changeNumber]
  );

  if (!before.rows.length) {
    console.error(`Change ${changeNumber} nicht in der ConnOps-Datenbank gefunden.`);
    console.error('(Nur bereits per Webhook erfasste Changes koennen hier zurueckgesetzt werden.)');
    process.exit(1);
  }

  const row = before.rows[0];
  console.log(`Aktueller Status von ${changeNumber}: ${row.status}`);

  if (['DONE', 'PROCESSING'].includes(row.status)) {
    console.error(`Status ${row.status} - wird aus Sicherheitsgruenden NICHT zurueckgesetzt.`);
    process.exit(1);
  }

  if (!row.topdesk_uuid) {
    console.error('Keine TopDesk-UUID im gespeicherten payload gefunden - kann nicht erneut abrufen.');
    process.exit(1);
  }

  console.log('Setze Status auf PENDING zurueck ...');
  await db.query(
    `UPDATE topdesk_changes SET status = 'PENDING', resolved = '{}'::jsonb WHERE change_id = $1`,
    [changeNumber]
  );

  console.log('Loese erneut auf (echte ingestChange()-Funktion, mit aktuellem resolveChange.js) ...');
  await ingestChange(row.topdesk_uuid);

  const after = await db.query(
    `SELECT status, resolved FROM topdesk_changes WHERE change_id = $1`,
    [changeNumber]
  );

  console.log('');
  console.log('── Ergebnis ──');
  console.log('Neuer Status:', after.rows[0].status);
  console.log('resolved:', JSON.stringify(after.rows[0].resolved, null, 2));
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
