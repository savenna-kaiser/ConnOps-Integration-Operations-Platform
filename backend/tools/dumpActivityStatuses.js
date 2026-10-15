/**
 * dumpActivityStatuses.js – EINMAL-Diagnose, rein lesend: holt ALLE
 * CA-Aktivitaeten ueber die Sammelressource operatorChangeActivities
 * und gruppiert sie nach Status, um eine ECHTE, bestaetigte
 * "abgeschlossen"-Status-ID zu finden - statt wie bisher eine vermutete
 * ID (a1af2971-...) zu verwenden, die laut dumpActivityFields.js
 * NICHT zum Statusraum dieser Ressource gehoert.
 *
 * Hintergrund (Fortsetzung Eintrag 18/testActivityStatusUpdate.js/
 * dumpActivityFields.js, 12.09.2026): Bekannt ist bisher nur der
 * Status "1 - Zu bearbeiten" (id: 66666666-6666-4666-8666-666666666666),
 * weil das die einzige bisher per GET gesehene Aktivitaet war
 * (CA-202608-149, noch offen). Um den korrekten Zielwert fuer PATCH
 * zu bekommen, brauchen wir eine Aktivitaet, die BEREITS abgeschlossen
 * ist, und deren echtes status-Feld.
 *
 * Ansatz: EIN GET auf die Sammelressource (wie im Kopfkommentar von
 * testActivityStatusUpdate.js als "Sammelressource:
 * /tas/api/operatorChangeActivities" bezeichnet), mit fields=all und
 * ausreichend hoher pageSize - danach rein clientseitig nach
 * status.name gruppieren. Kein Rateversuch bei Feldnamen: wird die
 * Sammelressource unerwartet strukturiert (z.B. paginiert mit anderem
 * Response-Format), gibt das Skript die Rohantwort zur Fehlersuche aus,
 * statt still falsch zu interpretieren.
 *
 * Nutzung:
 *   node tools/dumpActivityStatuses.js
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

// Bereits bekannte Werte (aus dumpActivityFields.js), nur zum Abgleich/
// zur Einordnung der Ausgabe - werden hier nicht angefragt, nur zitiert.
const KNOWN_ACTIVITY_ID     = '55555555-5555-4555-8555-555555555555';
const KNOWN_ACTIVITY_NUMBER = 'CA-202608-149';
const KNOWN_STATUS_ID       = '66666666-6666-4666-8666-666666666666';
const KNOWN_STATUS_NAME     = '1 - Zu bearbeiten';

function fetchRaw(path, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const auth  = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const url   = new URL(path, BASE_URL);
    const agent = new https.Agent({ rejectUnauthorized: false });

    const req = https.get({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      headers:  { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
      timeout:  timeoutMs,
      agent,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`TopDesk API ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Antwort war kein gueltiges JSON: ${err.message}\nRohdaten: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function main() {
  console.log('─────────────────────────────────────────────');
  console.log('EINMAL-DIAGNOSE (rein lesend): Aktivitaets-Status-Uebersicht');
  console.log('─────────────────────────────────────────────');
  console.log(`Bereits bekannt: ${KNOWN_ACTIVITY_NUMBER} -> Status "${KNOWN_STATUS_NAME}" (id: ${KNOWN_STATUS_ID})`);
  console.log('Ziel: mindestens eine ANDERE (idealerweise abgeschlossene) Aktivitaet finden,');
  console.log('um deren echte status-id als bestaetigten PATCH-Zielwert zu haben.\n');

  console.log('GET /tas/api/operatorChangeActivities?pageSize=200&fields=all\n');
  const result = await fetchRaw('/tas/api/operatorChangeActivities?pageSize=200&fields=all');

  // Nicht raten, welche Form die Antwort hat - beide bekannten TopDesk-
  // Muster abdecken (verschachtelt unter "results", oder direktes Array),
  // gleiches Vorgehen wie in dumpFieldsByTemplate.js.
  const all = Array.isArray(result) ? result : (result.results || []);

  if (!all.length) {
    console.log('Keine Aktivitaeten gefunden. Rohantwort zur Fehlersuche:');
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
    return;
  }

  console.log(`${all.length} Aktivitaet(en) insgesamt gefunden.\n`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Nach status.name gruppieren
  const byStatusName = {};
  for (const a of all) {
    const name = a.status?.name || '(kein status.name)';
    if (!byStatusName[name]) byStatusName[name] = [];
    byStatusName[name].push(a);
  }

  console.log(`${Object.keys(byStatusName).length} unterschiedliche Status-Werte gefunden:\n`);

  for (const [statusName, activities] of Object.entries(byStatusName)) {
    const exampleId = activities[0].status?.id || '(keine id)';
    console.log(`Status: "${statusName}"  (id: ${exampleId})`);
    console.log(`  Anzahl Aktivitaeten mit diesem Status: ${activities.length}`);
    console.log(`  Beispiel: ${activities[0].number} - "${activities[0].briefDescription || '(keine Beschreibung)'}" (Change: ${activities[0].change?.number || '?'})`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Auswertung:');
  console.log('═══════════════════════════════════════════════════════════\n');

  const nonMatchingKnown = Object.entries(byStatusName).filter(
    ([, activities]) => activities[0].status?.id !== KNOWN_STATUS_ID
  );

  if (nonMatchingKnown.length) {
    console.log('Andere Status-Werte als der bisher bekannte ("1 - Zu bearbeiten") existieren:');
    for (const [name, activities] of nonMatchingKnown) {
      console.log(`  "${name}" -> id: ${activities[0].status?.id}`);
    }
    console.log('');
    console.log('Naechster Schritt (manuell, vor jedem weiteren PATCH-Versuch):');
    console.log('  In TopDesk selbst gegenpruefen, dass eine Aktivitaet mit einem dieser');
    console.log('  Status-Werte TATSAECHLICH sichtbar "erledigt"/"gelöst" ist - erst dann');
    console.log('  diese id als bestaetigten PATCH-Zielwert uebernehmen, nicht vorher raten.');
  } else {
    console.log('Alle gefundenen Aktivitaeten haben denselben Status wie CA-202608-149.');
    console.log('Es gibt in dieser Stichprobe (pageSize=200) keine abgeschlossene');
    console.log('Aktivitaet, aus der sich ein bestaetigter Zielwert ablesen liesse.');
    console.log('Moegliche naechste Schritte: pageSize erhoehen / Filterung nach aelteren');
    console.log('Changes, da neuere Changes moeglicherweise noch nicht so weit sind.');
  }
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
