/**
 * testResolve.js – Isolierter, rein lesender Test für TopDesk-Anbindung + Feldmapping
 *
 * Führt KEINE Schreiboperationen aus:
 *   - keine TopDesk-Schreibaufrufe (nutzt nur getAllPendingChanges/getChangeById)
 *   - keine AD/Exchange-Aktionen
 *   - resolveChange.js macht nur SELECT-Queries gegen org_departments/org_roles
 *
 * Nutzung:
 *   node tools/testResolve.js                → listet alle wartenden Changes
 *   node tools/testResolve.js <changeNumber>  → holt genau diesen Change und
 *                                                zeigt Rohdaten + resolveChange()-Ergebnis
 *
 * Voraussetzung: .env mit TOPDESK_URL, TOPDESK_USERNAME, TOPDESK_APP_PASSWORD
 * ist geladen (z. B. via `node -r dotenv/config tools/testResolve.js`, falls
 * dotenv im Projekt verwendet wird — sonst Variablen vorher exportieren).
 */

require('dotenv').config();

const topdesk = require('../services/topdeskClient');
const { resolveChange, ResolveError } = require('../services/resolveChange');

async function main() {
  const arg = process.argv[2];

  console.log('─────────────────────────────────────────────');
  console.log('TopDesk-Verbindungstest (nur lesend)');
  console.log('─────────────────────────────────────────────');
  console.log('TOPDESK_URL:      ', process.env.TOPDESK_URL || '(nicht gesetzt)');
  console.log('TOPDESK_USERNAME: ', process.env.TOPDESK_USERNAME || '(nicht gesetzt)');
  console.log('TOPDESK_APP_PASSWORD gesetzt:', !!process.env.TOPDESK_APP_PASSWORD);
  console.log('');

  // ─── Schritt 1: reine Erreichbarkeit/Auth prüfen ────────────────────────
  try {
    await topdesk.ping();
    console.log('✅ Verbindung + Auth OK (ping erfolgreich)\n');
  } catch (err) {
    console.error('❌ Verbindung/Auth fehlgeschlagen:', err.message);
    console.error('   → Prüfe TOPDESK_URL/USERNAME/APP_PASSWORD und ob die');
    console.error('     Berechtigungsgruppe "REST-API" aktiv ist.');
    process.exit(1);
  }

  // ─── Modus A: kein Argument → alle wartenden Changes auflisten ──────────
  if (!arg) {
    console.log(`Suche Changes mit Status "${topdesk.PROCESS_STATUS}" ...\n`);
    const changes = await topdesk.getAllPendingChanges();

    if (!changes.length) {
      console.log('ℹ️  Keine wartenden Changes gefunden.');
      console.log('   Das kann bedeuten: (a) es gibt aktuell wirklich keine,');
      console.log('   oder (b) Status-Text/Template-IDs stimmen nicht exakt.');
      return;
    }

    console.log(`${changes.length} Change(s) gefunden:\n`);
    for (const c of changes) {
      const type = topdesk.getTypeFromChange(c) || '(unbekannter Typ)';
      console.log(`  #${c.number}  Typ: ${type}  Status: ${c.status?.name}`);
    }
    console.log('\nTipp: node tools/testResolve.js <changeNumber> für Details.');
    return;
  }

  // ─── Modus B: konkreten Change holen und resolveChange() testen ─────────
  console.log(`Hole Change "${arg}" ...\n`);
  const change = await topdesk.getChangeById(arg);

  console.log('── Rohdaten (Auszug) ──');
  console.log('templateId:      ', change.templateId);
  console.log('status:          ', change.status?.name);
  console.log('optionalFields1: ', JSON.stringify(change.optionalFields1, null, 2));
  console.log('optionalFields2: ', JSON.stringify(change.optionalFields2, null, 2));
  console.log('');

  console.log('── Vollständiges Rohobjekt (alle Felder, fields=all) ──');
  console.log(JSON.stringify(change, null, 2));
  console.log('');

  console.log('── resolveChange() ──');
  try {
    const resolved = await resolveChange(change);
    console.log('✅ Erfolgreich aufgelöst:\n');
    console.log(JSON.stringify(resolved, null, 2));
  } catch (err) {
    if (err instanceof ResolveError) {
      console.error('❌ ResolveError:', err.message);
      console.error('   Kontext:', JSON.stringify(err.context || {}, null, 2));
    } else {
      console.error('❌ Unerwarteter Fehler:', err.message);
    }
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exitCode = 1;
});