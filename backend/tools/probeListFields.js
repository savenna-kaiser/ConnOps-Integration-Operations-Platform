/**
 * probeListFields.js – Testet verschiedene Varianten des "fields"-Query-
 * Parameters gegen GET /tas/api/operatorChanges, um herauszufinden, wie man
 * templateId + optionalFields1/2 auch in der LISTE (nicht nur beim
 * Einzel-Abruf) bekommt.
 *
 * Rein lesend: nur GET-Requests, keine Schreiboperationen.
 *
 * Hintergrund: getChangeById() (Einzel-Abruf) liefert bereits alle Felder
 * korrekt. getAllPendingChanges()/getChanges() (Liste) liefert nur einen
 * reduzierten Standard-Feldsatz (number, status, id, ...). Dieses Skript
 * probiert verschiedene gängige Parameter-Varianten durch und zeigt, welche
 * (falls überhaupt eine) templateId und optionalFields1/2 in der Liste
 * mitliefert.
 *
 * Nutzung:
 *   node tools/probeListFields.js
 */

require('dotenv').config();

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.TOPDESK_URL;
const USERNAME = process.env.TOPDESK_USERNAME;
const PASSWORD = process.env.TOPDESK_APP_PASSWORD;

// Kandidaten für den Query-Parameter — verschiedene bei TopDesk kursierende
// Schreibweisen/Namen, die wir der Reihe nach ausprobieren.
const CANDIDATES = [
  { label: 'ohne Parameter (Baseline)',                  query: 'pageSize=1' },
  { label: 'fields=all',                                 query: 'pageSize=1&fields=all' },
  { label: 'fields=*',                                   query: 'pageSize=1&fields=*' },
  { label: 'fields=id,number,templateId,status,optionalFields1,optionalFields2',
    query: 'pageSize=1&fields=id,number,templateId,status,optionalFields1,optionalFields2' },
  { label: 'resultFields=all',                           query: 'pageSize=1&resultFields=all' },
  { label: 'include=optionalFields1,optionalFields2,template',
    query: 'pageSize=1&include=optionalFields1,optionalFields2,template' },
  { label: 'extendedField=true',                         query: 'pageSize=1&extendedField=true' },
];

function fetchRaw(query) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
    const url  = new URL(`/tas/api/operatorChanges?${query}`, BASE_URL);

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
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function summarizeFirstResult(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return '(keine gültige JSON-Antwort)';
  }
  const results = parsed.results || (Array.isArray(parsed) ? parsed : null);
  if (!results || !results.length) return '(keine Ergebnisse in Antwort)';

  const first = results[0];
  const hasTemplateId       = 'templateId' in first;
  const hasTemplateObj      = 'template' in first;
  const hasOptionalFields1  = 'optionalFields1' in first;
  const hasOptionalFields2  = 'optionalFields2' in first;

  return (
    `templateId: ${hasTemplateId ? '✅' : '❌'}  ` +
    `template (Objekt): ${hasTemplateObj ? '✅' : '❌'}  ` +
    `optionalFields1: ${hasOptionalFields1 ? '✅' : '❌'}  ` +
    `optionalFields2: ${hasOptionalFields2 ? '✅' : '❌'}`
  );
}

async function main() {
  console.log('─────────────────────────────────────────────');
  console.log('Probe: fields-Parameter für operatorChanges-Liste (nur lesend)');
  console.log('─────────────────────────────────────────────\n');

  for (const c of CANDIDATES) {
    process.stdout.write(`→ ${c.label}\n   Query: ${c.query}\n`);
    try {
      const { statusCode, body } = await fetchRaw(c.query);
      if (statusCode >= 400) {
        console.log(`   HTTP ${statusCode}: ${body.slice(0, 150)}\n`);
        continue;
      }
      console.log(`   HTTP ${statusCode} — ${summarizeFirstResult(body)}\n`);
    } catch (err) {
      console.log(`   Fehler: ${err.message}\n`);
    }
  }

  console.log('Fertig. Suche nach der ersten Zeile mit möglichst vielen ✅.');
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exitCode = 1;
});