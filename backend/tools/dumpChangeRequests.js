/**
 * dumpChangeRequests.js – Holt die "requests"-Unterressource eines Changes
 * (Freitext-Anfrage/Beschreibung) UND probiert Kandidaten für eine mögliche
 * "activities"-Unterressource (Change-Aktivitäten wie "Domain User
 * deaktivieren", "Hardware Rückgabe" — eigenes CA-Nummernschema).
 *
 * Rein lesend: nur GET.
 *
 * Nutzung:
 *   node tools/dumpChangeRequests.js <changeId (UUID)>
 */

require('dotenv').config();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

function fetchRaw(path, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const url  = new URL(path, BASE_URL);

    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      agent: new https.Agent({ rejectUnauthorized: false }),
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout nach ${timeoutMs}ms — keine Antwort erhalten`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const changeId = process.argv[2];
  if (!changeId) {
    console.error('Bitte Change-UUID als Argument angeben.');
    process.exit(1);
  }

  const path = `/tas/api/operatorChanges/${changeId}/requests`;
  console.log(`GET ${path}\n`);

  const { statusCode, body } = await fetchRaw(path);
  console.log(`HTTP ${statusCode}\n`);

  try {
    const parsed = JSON.parse(body);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log('(keine gültige JSON-Antwort, Rohtext:)');
    console.log(body);
  }

  // ─── Kandidaten für eine mögliche "activities"-Unterressource ───────────
  console.log('\n\n── Probe: mögliche Activities-Endpunkte ──\n');
  const candidates = [
    `/tas/api/operatorChanges/${changeId}/activities`,
    `/tas/api/operatorChanges/${changeId}/changeactivities`,
    `/tas/api/changeactivities?changeId=${changeId}`,
    `/tas/api/operatorChanges/${changeId}?fields=all,activities`,
  ];

  for (const path of candidates) {
    console.log(`→ GET ${path}`);
    try {
      const { statusCode, body } = await fetchRaw(path);
      if (statusCode >= 400) {
        console.log(`   HTTP ${statusCode}: ${body.slice(0, 150)}\n`);
        continue;
      }
      console.log(`   HTTP ${statusCode}: ${body.slice(0, 300)}\n`);
    } catch (err) {
      console.log(`   ⚠️  ${err.message}\n`);
    }
  }
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exitCode = 1;
});