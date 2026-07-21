/**
 * dumpChanges.js – Zeigt id, number, templateId und Status ALLER Changes
 * (nicht nur der wartenden), damit id/number nebeneinander sichtbar sind.
 *
 * Rein lesend: nur GET /tas/api/operatorChanges.
 *
 * Nutzung:
 *   node tools/dumpChanges.js
 */

require('dotenv').config();

async function main() {
  // Bewusst nicht gefiltert nach Status/Template, um auch Changes zu sehen,
  // die (noch) nicht "1 - Zu bearbeiten" sind oder ein unbekanntes Template haben.
  const raw = await fetchRaw();

  console.log(`${raw.length} Change(s) insgesamt gefunden:\n`);
  for (const c of raw) {
    console.log(`id:         ${c.id}`);
    console.log(`number:     ${c.number}`);
    console.log(`templateId: ${c.templateId}`);
    console.log(`status:     ${c.status?.name}`);
    console.log('---');
  }

  if (raw.length) {
    console.log('\n── Vollständiges Rohobjekt des ersten Changes (zur Struktur-Prüfung) ──');
    console.log(JSON.stringify(raw[0], null, 2));
  }
}

async function fetchRaw() {
  // Direkter Zugriff auf den internen Client, um ungefiltert zu sehen
  const https = require('https');
  const { URL } = require('url');

  const BASE_URL = process.env.TOPDESK_URL;
  const USERNAME = process.env.TOPDESK_USERNAME;
  const PASSWORD = process.env.TOPDESK_APP_PASSWORD;
  const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
  const url = new URL('/tas/api/operatorChanges?pageSize=100', BASE_URL);

  return new Promise((resolve, reject) => {
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
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${res.statusCode}: ${data.slice(0, 200)}`));
        resolve(JSON.parse(data).results || []);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exitCode = 1;
});