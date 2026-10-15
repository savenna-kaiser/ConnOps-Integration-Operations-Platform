/**
 * reingestAustrittConflicts.js – Setzt ALLE Changes vom Typ AUSTRITT mit
 * Status CONFLICT auf PENDING zurueck und loest sie erneut auf (echte
 * ingestChange()-Funktion, mit dem aktuellen, korrigierten
 * resolveChange.js).
 *
 * Bewusst NUR AUSTRITT: fuer diesen Typ sind beide Feldmapping-Fehler
 * (SAM-Account text1/text2, Datumsfelder date1/date2) mit echten
 * Formulardaten bestaetigt und per End-to-End-Test (CH-202608-031)
 * verifiziert (29.-30.07.2026). Fuer EINTRITT/ABT_WECHSEL liegt weiterhin
 * KEIN bestaetigter Fix vor - Changes dieser beiden Typen werden hier
 * NICHT angefasst, selbst wenn sie ebenfalls auf CONFLICT stehen.
 *
 * Setzt NUR den Status zurueck und loest neu auf - fuehrt NICHTS aus.
 * Jeder einzelne Change braucht danach weiterhin den bewussten
 * "Ausführen"-Klick in der ConnOps-Oberflaeche (oder ueber die
 * execute-Route), inklusive erneuter Validierung.
 *
 * Nutzung:
 *   node tools/reingestAustrittConflicts.js           (zeigt nur an, fuehrt nichts aus)
 *   node tools/reingestAustrittConflicts.js --apply    (fuehrt tatsaechlich aus)
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db = require('../data/db');
const { ingestChange } = require('../jobs/ingestWorker');

async function main() {
  const apply = process.argv.includes('--apply');

  const { rows } = await db.query(
    `SELECT change_id, payload->>'id' as topdesk_uuid
     FROM topdesk_changes
     WHERE type = 'AUSTRITT' AND status = 'CONFLICT'
     ORDER BY change_id`
  );

  if (!rows.length) {
    console.log('Keine AUSTRITT-Changes mit Status CONFLICT gefunden. Nichts zu tun.');
    return;
  }

  console.log(`${rows.length} AUSTRITT-Change(s) mit Status CONFLICT gefunden:`);
  for (const r of rows) console.log(`  ${r.change_id}`);
  console.log('');

  if (!apply) {
    console.log('Trockenlauf (kein --apply) - es wurde NICHTS geaendert.');
    console.log('Zum tatsaechlichen Ausfuehren: node tools/reingestAustrittConflicts.js --apply');
    return;
  }

  console.log('Beginne Re-Ingest ...\n');

  const results = { ok: [], stillConflict: [], warning: [], error: [] };

  for (const r of rows) {
    if (!r.topdesk_uuid) {
      console.log(`  ${r.change_id}: UEBERSPRUNGEN - keine TopDesk-UUID im payload gefunden`);
      results.error.push({ change_id: r.change_id, reason: 'keine UUID' });
      continue;
    }

    try {
      await db.query(
        `UPDATE topdesk_changes SET status = 'PENDING', resolved = '{}'::jsonb WHERE change_id = $1`,
        [r.change_id]
      );
      await ingestChange(r.topdesk_uuid);

      const after = await db.query(
        `SELECT status FROM topdesk_changes WHERE change_id = $1`,
        [r.change_id]
      );
      const status = after.rows[0]?.status;

      console.log(`  ${r.change_id}: -> ${status}`);
      if (status === 'PENDING') results.ok.push(r.change_id);
      else if (status === 'CONFLICT') results.stillConflict.push(r.change_id);
      else if (status === 'WARNING') results.warning.push(r.change_id);
      else results.error.push({ change_id: r.change_id, reason: `unerwarteter Status: ${status}` });
    } catch (err) {
      console.log(`  ${r.change_id}: FEHLER - ${err.message}`);
      results.error.push({ change_id: r.change_id, reason: err.message });
    }
  }

  console.log('\n── Zusammenfassung ──');
  console.log(`Erfolgreich auf PENDING:        ${results.ok.length}`);
  console.log(`Weiterhin CONFLICT (echter Fehler, kein Feldmapping-Problem): ${results.stillConflict.length}`);
  if (results.stillConflict.length) results.stillConflict.forEach(c => console.log(`  - ${c}`));
  console.log(`WARNING (Konflikt erkannt, pruefbar):   ${results.warning.length}`);
  if (results.warning.length) results.warning.forEach(c => console.log(`  - ${c}`));
  console.log(`Fehler:                          ${results.error.length}`);
  if (results.error.length) results.error.forEach(e => console.log(`  - ${e.change_id}: ${e.reason}`));

  console.log('\nHinweis: Es wurde NICHTS ausgefuehrt (kein AD-Zugriff). Jeder Change');
  console.log('braucht weiterhin Validierung + bewussten "Ausführen"-Klick in der UI.');
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
