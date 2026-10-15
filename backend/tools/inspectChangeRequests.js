/**
 * inspectChangeRequests.js – Rein lesend: zeigt die Teilaktivitaeten
 * ("requests", z.B. CA-202608-149) eines TopDesk-Changes.
 *
 * Hintergrund (30.07.2026): Ein Change (CH-xxx) kann mehrere Teilaktivitaeten
 * enthalten (CA-xxx). Beim Ausfuehren eines Changes darf NICHT der gesamte
 * Change auf "erledigt" gesetzt werden, sondern nur die zutreffende
 * Teilaktivitaet (z.B. "Domain User deaktivieren"). Wie bei Changes selbst
 * ist die menschenlesbare Nummer (CA-xxx) vermutlich NICHT die ID, die die
 * TopDesk-API fuer Status-Aenderungen erwartet - dieses Skript soll die
 * tatsaechliche Struktur zeigen (echte UUID, Statusfeld, verfuegbare
 * Werte), bevor irgendein schreibender Code gebaut wird. Bewusst rein
 * lesend, keine Aenderung.
 *
 * Nutzung:
 *   node tools/inspectChangeRequests.js <changeUuid>
 *   z.B. node tools/inspectChangeRequests.js 44444444-4444-4444-8444-444444444444
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

function fetchRaw(path, timeoutMs = 15000) {
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
          reject(new Error(`Antwort war kein gueltiges JSON: ${err.message}\nRohantwort: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

async function main() {
  const changeUuid = process.argv[2];
  if (!changeUuid) {
    console.error('Nutzung: node tools/inspectChangeRequests.js <changeUuid>');
    console.error('(die TopDesk-UUID des Changes, NICHT die CH-Nummer - siehe testResolve.js/dumpChanges.js)');
    process.exit(1);
  }

  console.log(`Hole Teilaktivitaeten (requests) fuer Change ${changeUuid} ...\n`);
  const result = await fetchRaw(`/tas/api/operatorChanges/${changeUuid}/requests`);

  console.log('── Vollstaendige Rohantwort ──');
  console.log(JSON.stringify(result, null, 2));

  const list = Array.isArray(result) ? result : (result.results || []);
  if (list.length) {
    console.log('\n── Kurzuebersicht ──');
    for (const item of list) {
      console.log(`  id: ${item.id}  number: ${item.number || item.requestNumber || '(kein number-Feld)'}  status: ${JSON.stringify(item.status)}`);
    }
  }
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
