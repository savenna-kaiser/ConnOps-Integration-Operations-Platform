/**
 * testBooleanParsing.js – Testet die "temporary"-Erkennung (Zeitlich begrenzt)
 * in resolveChange.js OFFLINE, mit simulierten Werten für optionalFields2.boolean1.
 *
 * Braucht KEINE TopDesk-Verbindung und KEINE Datenbank-Verbindung für die
 * Boolean-Logik selbst — nur die Personalnummer-Prüfung + org_departments/
 * org_roles-Lookup laufen erst bei EINTRITT/ABT_WECHSEL gegen die DB, AUSTRITT
 * kommt komplett ohne DB-Zugriff aus. Rein lokal, nichts wird irgendwo
 * geschrieben oder abgefragt.
 *
 * Nutzung:
 *   node tools/testBooleanParsing.js
 */

require('dotenv').config();

const { resolveChange } = require('../services/resolveChange');

const AUSTRITT_TEMPLATE_ID =
  process.env.TOPDESK_TEMPLATE_AUSTRITT || '3ebc323a-eb81-4211-b576-2e72af2ac322';

function makeChange(boolean1Value) {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    templateId: AUSTRITT_TEMPLATE_ID,
    optionalFields1: {
      date1: '2026-08-01',
      searchlist1: null,
      text1: '', text2: '', text3: '', text4: '',
    },
    optionalFields2: {
      text1: '999999',           // Personalnummer/SAM (Test-Wert)
      text2: '',
      boolean1: boolean1Value,
      date1: '2026-09-01',       // Rückkehrdatum
    },
  };
}

const cases = [
  { label: 'echter Boolean true',        value: true },
  { label: 'echter Boolean false',       value: false },
  { label: 'String "true"',              value: 'true' },
  { label: 'String "false"',             value: 'false' },
  { label: 'String "ja"',                value: 'ja' },
  { label: 'String "Ja" (Großschr.)',    value: 'Ja' },
  { label: 'String "nein"',              value: 'nein' },
  { label: 'undefined (Feld leer)',      value: undefined },
  { label: 'null',                       value: null },
];

async function main() {
  console.log('─────────────────────────────────────────────');
  console.log('Offline-Test: "Zeitlich begrenzt"-Erkennung (kein TopDesk nötig)');
  console.log('─────────────────────────────────────────────\n');

  for (const c of cases) {
    const change = makeChange(c.value);
    try {
      const resolved = await resolveChange(change);
      console.log(`${c.label.padEnd(28)} → temporary: ${resolved.temporary}   steps: [${resolved.steps.join(', ')}]`);
    } catch (err) {
      console.log(`${c.label.padEnd(28)} → ❌ ${err.message}`);
    }
  }

  console.log('\nErwartung: "true"/"ja"/"Ja" → temporary: true, nur "disable_account".');
  console.log('Alles andere (false/nein/leer/null) → temporary: false, alle drei Schritte.');
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exitCode = 1;
});