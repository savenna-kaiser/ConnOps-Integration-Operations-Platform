/**
 * probeActivityEndpoints.js – Rein lesend: probiert mehrere plausible
 * API-Pfade fuer Change-Aktivitaeten (CA-xxx) durch, um herauszufinden,
 * welcher tatsaechlich funktioniert - NUR GET-Anfragen, niemals POST/PUT.
 *
 * Hintergrund (30.07.2026): TopDesk unterscheidet Changes (CH-xxx) von
 * Change-Aktivitaeten (CA-xxx) als eigene Ressource (bestaetigt durch
 * Drittanbieter-Doku, die "Operator Changes" und "Operator Changes
 * Activity" als getrennte Endpunkt-Typen fuehrt). Die offizielle
 * TopDesk-API-Doku ist eine JS-Anwendung und liefert per einfachem Abruf
 * keinen Inhalt. Dieses Skript probiert stattdessen mehrere plausible
 * Pfad-Varianten direkt an der echten Instanz aus (GET, keine Aenderung),
 * um zu sehen, welcher wirklich existiert - bevor irgendein schreibender
 * Code fuer "Aktivitaet abschliessen" gebaut wird.
 *
 * Nutzung:
 *   node tools/probeActivityEndpoints.js <changeUuid>
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

function fetchRaw(path, timeoutMs = 10000) {
  return new Promise((resolve) => {
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
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('timeout', () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
    req.on('error', (err) => resolve({ status: 'ERROR', body: err.message }));
  });
}

async function main() {
  const changeUuid = process.argv[2];
  if (!changeUuid) {
    console.error('Nutzung: node tools/probeActivityEndpoints.js <changeUuid>');
    process.exit(1);
  }

  // Plausible Kandidaten, NUR GET, keine Aenderung.
  const candidates = [
    `/tas/api/operatorChanges/${changeUuid}/activities`,
    `/tas/api/operatorChangeActivities?changeId=${changeUuid}`,
    `/tas/api/operatorChangeActivities`,
    `/tas/api/changeactivities?changeId=${changeUuid}`,
    `/tas/api/changeActivities?changeId=${changeUuid}`,
  ];

  for (const path of candidates) {
    const res = await fetchRaw(path);
    const preview = typeof res.body === 'string' ? res.body.slice(0, 200) : '';
    console.log(`${res.status}  ${path}`);
    const isHit = res.status === 200 || res.status === 206;
    if (isHit) {
      console.log(`  -> TREFFER. Vollstaendige Antwort:`);
      console.log(res.body);
    }
    console.log('');
  }

  console.log('Hinweis: Nur Status 200 ist ein moeglicher Treffer. 404/400 = Pfad existiert so nicht.');
}

main();
