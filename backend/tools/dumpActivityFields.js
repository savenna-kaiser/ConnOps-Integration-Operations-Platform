/**
 * dumpActivityFields.js – EINMAL-Diagnose, rein lesend: holt die volle
 * GET-Antwort fuer genau EINE Teilaktivitaet (operatorChangeActivities)
 * und gibt sie vollstaendig aus.
 *
 * Hintergrund (Fortsetzung Eintrag 18/testActivityStatusUpdate.js,
 * 12.09.2026): Der PATCH-Versuch auf
 *   /tas/api/operatorChangeActivities/{id}
 *   Body: [{ op: 'replace', path: '/status', value: { id: TARGET_STATUS_ID } }]
 * schlug fehl mit:
 *   "Path: /status/id is not allowed for operation replace/remove or
 *    has invalid value (a1af2971-...)"
 * Der Allow-Header (OPTIONS) bestaetigt aber, dass PATCH grundsaetzlich
 * unterstuetzt wird (HEAD,GET,OPTIONS,PATCH) - der Endpunkt existiert
 * also wirklich, nur Pfad und/oder Wert des Patch-Versuchs waren falsch.
 *
 * Offene Fragen, die dieses Skript rein durch Lesen beantworten soll,
 * OHNE einen weiteren Schreibversuch zu riskieren:
 *   1. Wie sieht das Feld "status" in der ECHTEN GET-Antwort dieser
 *      Aktivitaet strukturell aus (Name/Verschachtelung)?
 *   2. Gibt es ein Feld wie "possibleStatuses", "processingStatus" o.ae.,
 *      das den erlaubten Zielwertraum fuer PATCH vorgibt?
 *   3. Ist 77777777-7777-4777-8777-777777777777 (angenommen: Status
 *      "4 - Gelöst") ueberhaupt ein gueltiger Statuswert FUER DIESE
 *      RESSOURCE (operatorChangeActivities), oder stammt die ID
 *      moeglicherweise aus dem Statusraum von operatorChanges (dem
 *      GESAMTEN Change) und passt daher strukturell nicht?
 *
 * Bewusst KEIN Parameter fuer die Aktivitaets-ID - dieselbe, bereits
 * bestaetigte Aktivitaet wie in testActivityStatusUpdate.js, damit die
 * Ergebnisse direkt vergleichbar sind.
 *
 * Nutzung:
 *   node tools/dumpActivityFields.js
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

// Dieselbe Aktivitaet wie in testActivityStatusUpdate.js (siehe dort
// fuer die Herkunft dieser ID) - bewusst fest verankert, kein Parameter.
const ACTIVITY_ID     = '55555555-5555-4555-8555-555555555555';
const ACTIVITY_NUMBER = 'CA-202608-149'; // nur zur Anzeige/Bestaetigung

// Der bisher versuchte (fehlgeschlagene) Zielwert, zum spaeteren
// Abgleich gegen alles, was diese GET-Antwort an gueltigen Statuswerten
// tatsaechlich zeigt.
const PREVIOUSLY_ATTEMPTED_STATUS_ID = '77777777-7777-4777-8777-777777777777';

function fetchRaw(path, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const auth  = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const url   = new URL(path, BASE_URL);
    // Gleiches Muster wie topdeskClient.js/dumpFieldsByTemplate.js -
    // selbstsigniertes Zertifikat der internen CA.
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
          reject(new Error(`Antwort war kein gueltiges JSON: ${err.message}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function main() {
  console.log('─────────────────────────────────────────────');
  console.log('EINMAL-DIAGNOSE (rein lesend): Aktivitaets-Felder');
  console.log('─────────────────────────────────────────────');
  console.log(`Aktivitaet: ${ACTIVITY_NUMBER} (id: ${ACTIVITY_ID})\n`);

  console.log(`GET /tas/api/operatorChangeActivities/${ACTIVITY_ID}\n`);
  const activity = await fetchRaw(`/tas/api/operatorChangeActivities/${ACTIVITY_ID}`);

  console.log('Vollstaendige Antwort:');
  console.log(JSON.stringify(activity, null, 2));
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Gezielte Auswertung:');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Feld "status" (falls vorhanden):');
  console.log('  ' + JSON.stringify(activity.status ?? '(nicht vorhanden)'));
  console.log('');

  // Alle Top-Level-Feldnamen ausgeben, die auf "status" hindeuten
  // koennten (Groß-/Kleinschreibung, andere Benennung) - falls "status"
  // selbst nicht existiert oder nicht das richtige Feld ist.
  const statusLikeKeys = Object.keys(activity).filter(k =>
    k.toLowerCase().includes('status')
  );
  console.log('Alle Top-Level-Felder mit "status" im Namen:');
  if (statusLikeKeys.length) {
    for (const k of statusLikeKeys) {
      console.log(`  ${k}: ${JSON.stringify(activity[k])}`);
    }
  } else {
    console.log('  (keine gefunden)');
  }
  console.log('');

  // Nach moeglichen "erlaubte Werte"-Feldern suchen (possibleStatuses,
  // allowedStatuses, statusOptions, etc.) - Name nicht sicher bekannt,
  // daher breite Suche ueber alle Top-Level-Keys.
  const possibleValueKeys = Object.keys(activity).filter(k =>
    /possible|allowed|available|options/i.test(k)
  );
  console.log('Alle Top-Level-Felder, die auf einen erlaubten Wertebereich hindeuten:');
  if (possibleValueKeys.length) {
    for (const k of possibleValueKeys) {
      console.log(`  ${k}: ${JSON.stringify(activity[k])}`);
    }
  } else {
    console.log('  (keine gefunden - moeglicherweise ueber einen separaten Endpunkt,');
    console.log('   z.B. /tas/api/operatorChangeActivities/{id}/statuses o.ae.');
    console.log('   - nicht geraten, sondern separat pruefen falls noetig)');
  }
  console.log('');

  console.log(`Bisher versuchter Zielwert: ${PREVIOUSLY_ATTEMPTED_STATUS_ID}`);
  const activityJson = JSON.stringify(activity);
  if (activityJson.includes(PREVIOUSLY_ATTEMPTED_STATUS_ID)) {
    console.log('  -> Diese ID taucht IRGENDWO in der Antwort auf (siehe oben, wo genau).');
  } else {
    console.log('  -> Diese ID taucht NIRGENDS in der vollstaendigen Antwort auf.');
    console.log('     Moeglicher Hinweis: der Wert gehoert nicht zum Statusraum');
    console.log('     dieser Ressource (operatorChangeActivities), sondern vermutlich');
    console.log('     zu operatorChanges (dem gesamten Change) - separat gegenpruefen.');
  }
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
