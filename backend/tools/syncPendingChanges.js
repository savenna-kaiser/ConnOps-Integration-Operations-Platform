/**
 * syncPendingChanges.js – CLI-Wrapper um die gemeinsame
 * syncPendingChanges()-Funktion aus ingestWorker.js (dieselbe Funktion,
 * die auch der neue "Von TopDesk abrufen"-Button in der Oberflaeche
 * nutzt, POST /topdesk/changes/sync - siehe Projektnotizen 07.09.2026).
 *
 * Vereinfacht gegenueber der ersten Version dieses Werkzeugs: dank des
 * Guard-Fixes in ingestChange() (nur DONE/PROCESSING/PARTIAL werden
 * uebersprungen) ist der Aufruf fuer JEDEN wartenden Change sicher -
 * keine Unterscheidung zwischen "schon bekannt" und "neu" mehr noetig.
 * Bereits bekannte Changes werden dabei passend neu bewertet
 * (Selbstheilung bei CONFLICT/WARNING/FAILED).
 *
 * Fuehrt NICHTS aus (kein AD-Zugriff) - ruft nur ingestChange() auf
 * (Aufloesung + Speichern in der ConnOps-DB). Jeder Change braucht
 * danach weiterhin Pruefung + bewussten "Ausführen"-Klick in der UI.
 *
 * Nutzung:
 *   node tools/syncPendingChanges.js           (Trockenlauf, zeigt nur an)
 *   node tools/syncPendingChanges.js --apply   (fuehrt den Sync tatsaechlich aus)
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const db      = require('../data/db');
const topdesk = require('../services/topdeskClient');
const { syncPendingChanges } = require('../jobs/ingestWorker');

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('Hole alle aktuell wartenden Changes von TopDesk ...\n');
  const pending = await topdesk.getAllPendingChanges({ limit: 200 });
  console.log(`${pending.length} wartende Change(s) bei TopDesk gefunden:`);
  pending.forEach(c => console.log(`  ${c.number}`));

  if (!pending.length) return;

  if (!apply) {
    console.log('\nTrockenlauf (kein --apply) - es wurde NICHTS synchronisiert.');
    console.log('Zum tatsaechlichen Ausfuehren: node tools/syncPendingChanges.js --apply');
    return;
  }

  console.log('\nSynchronisiere (ruft ingestChange() fuer jeden Change auf) ...\n');
  const result = await syncPendingChanges();

  console.log('── Zusammenfassung ──');
  console.log(`Gesamt: ${result.total}`);
  console.log(`Erfolgreich verarbeitet: ${result.ok.length}`);
  console.log(`Fehler: ${result.errors.length}`);
  if (result.errors.length) result.errors.forEach(e => console.log(`  - ${e.number}: ${e.reason}`));

  console.log('\nHinweis: Es wurde NICHTS ausgefuehrt (kein AD-Zugriff). Jeder');
  console.log('Change braucht weiterhin Pruefung + "Ausführen" in der UI.');
}

main()
  .catch(err => {
    console.error('Fehler:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
