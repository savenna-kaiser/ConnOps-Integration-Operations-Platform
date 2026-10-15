/**
 * testActivityStatusUpdate.js – EINMAL-Testwerkzeug: versucht genau EINE
 * Teilaktivitaet (CA-202608-149, "Domain User deaktivieren") auf
 * Status "4 - Gelöst" zu setzen.
 *
 * Bewusst KEIN Parameter fuer die Aktivitaets-ID - fest im Skript
 * verankert, damit unmoeglich versehentlich eine andere Aktivitaet
 * getroffen wird. Nur fuer diesen einen, vom Nutzer bestaetigten
 * Testfall gedacht, nicht fuer den produktiven Einsatz.
 *
 * Hintergrund (30.07.2026): Deaktivieren eines Accounts ist nur eine
 * Teilaktivitaet innerhalb eines Changes - nicht der gesamte Change darf
 * auf "erledigt" gesetzt werden, nur die zutreffende Aktivitaet. Aus
 * einer echten GET-Antwort bestaetigt:
 *   Sammelressource: /tas/api/operatorChangeActivities
 *   Diese Aktivitaet: id=55555555-5555-4555-8555-555555555555,
 *                      number=CA-202608-149
 *   Aktueller Status: {id: 66666666-6666-4666-8666-666666666666,
 *                       name: "1 - Zu bearbeiten"}
 *   Zielstatus (vom Nutzer bestaetigt): {id: a1af2971-f138-4bd7-ae46-
 *                       f285c4757a3b, name: "4 - Gelöst"}
 * Der PUT-Aufbau selbst ist NICHT bestaetigt, nur nach dem Muster von
 * updateChangeStatus() (topdeskClient.js) abgeleitet - deshalb dieser
 * isolierte Test, bevor irgendetwas in executeChange.js eingebaut wird.
 *
 * Nutzung:
 *   node tools/testActivityStatusUpdate.js
 */

require('dotenv').config();
require('../services/loadSecrets').loadSecrets();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

// Fest verankert, bewusst kein Parameter - siehe Kopfkommentar.
const ACTIVITY_ID     = '55555555-5555-4555-8555-555555555555';
const ACTIVITY_NUMBER = 'CA-202608-149'; // nur zur Anzeige/Bestaetigung
const TARGET_STATUS_ID   = '77777777-7777-4777-8777-777777777777';
const TARGET_STATUS_NAME = '4 - Gelöst';

function request(method, path, body, timeoutMs = 15000, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const auth  = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const url   = new URL(path, BASE_URL);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept':        'application/json',
        'Content-Type':  contentType,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: timeoutMs,
      agent,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({
        status: res.statusCode,
        body: data,
        allow: res.headers['allow'] || res.headers['Allow'],
      }));
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('─────────────────────────────────────────────');
  console.log('EINMAL-TEST: Aktivitaets-Status aktualisieren');
  console.log('─────────────────────────────────────────────');
  console.log(`Aktivitaet:     ${ACTIVITY_NUMBER} (id: ${ACTIVITY_ID})`);
  console.log(`Zielstatus:     ${TARGET_STATUS_NAME} (id: ${TARGET_STATUS_ID})`);
  console.log('');

  // Schritt 1 (rein lesend, keine Aenderung): OPTIONS-Anfrage, um den
  // Allow-Header auszulesen - zeigt, welche HTTP-Methoden TopDesk an
  // dieser URL tatsaechlich akzeptiert, statt PUT/PATCH/POST zu raten.
  console.log('Schritt 1: OPTIONS-Anfrage (rein lesend) ...');
  const optionsRes = await request('OPTIONS', `/tas/api/operatorChangeActivities/${ACTIVITY_ID}`, null);
  console.log(`  Status-Code: ${optionsRes.status}`);
  console.log(`  Allow-Header: ${optionsRes.allow || '(nicht gesetzt)'}`);
  console.log('');

  // Schritt 2: PATCH mit JSON-Patch-Format (RFC 6902), nachdem der
  // erste PATCH-Versuch mit normalem JSON einen 415 (falscher
  // Content-Type) zurueckgab. Bei Endpunkten, die AUSSCHLIESSLICH
  // PATCH erlauben (kein PUT), ist application/json-patch+json ein
  // uebliches Muster.
  console.log('Schritt 2: PATCH mit application/json-patch+json ...');
  const body = [
    { op: 'replace', path: '/status', value: { id: TARGET_STATUS_ID } },
  ];
  console.log('Sende PATCH /tas/api/operatorChangeActivities/' + ACTIVITY_ID);
  console.log('Content-Type: application/json-patch+json');
  console.log('Body:', JSON.stringify(body));
  console.log('');

  const res = await request(
    'PATCH',
    `/tas/api/operatorChangeActivities/${ACTIVITY_ID}`,
    body,
    15000,
    'application/json-patch+json'
  );

  console.log(`Status-Code: ${res.status}`);
  console.log('Antwort:');
  console.log(res.body);
  console.log('');

  if (res.status >= 200 && res.status < 300) {
    console.log('✅ Erfolgreich - bitte in TopDesk selbst gegenpruefen,');
    console.log('   ob CA-202608-149 jetzt wirklich "4 - Gelöst" zeigt.');
  } else {
    console.log('❌ Fehlgeschlagen - Status/Body oben zeigen vermutlich,');
    console.log('   welches Feld/welche Methode TopDesk stattdessen erwartet.');
  }
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
