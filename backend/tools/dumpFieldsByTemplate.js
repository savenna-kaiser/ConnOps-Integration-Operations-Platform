/**
 * dumpFieldsByTemplate.js – Zeigt optionalFields1/2 ALLER Changes, nach
 * templateId gruppiert, um sichtbar zu machen ob unterschiedliche
 * Change-Vorlagen (Eintritt/Austritt/Abteilungswechsel/unbekannt) die
 * "Freien Felder" unterschiedlich befuellen - und ob das INNERHALB einer
 * Vorlage konsistent ist oder von Change zu Change variiert.
 *
 * Rein lesend: ein einziger GET-Aufruf gegen die Listen-Ressource mit
 * fields=all (liefert laut topdeskClient.js/probeListFields.js bereits
 * templateId + optionalFields1/2 mit, keine Einzelabrufe pro Change
 * noetig).
 *
 * Hintergrund (29.07.2026): resolveChange.js geht global (nicht pro
 * Vorlage) von optionalFields2.text1=Personalnummer, text2=Rolle aus.
 * Bei Change CH-202608-031 (Austritt-Vorlage) war das vertauscht
 * (text1=Name, text2=Personalnummer) UND optionalFields1 komplett leer,
 * obwohl der Mitarbeitername bekannt war - offen, ob das ein
 * Vorlagen-weites Muster oder ein Einzelfall ist. Dieses Skript soll das
 * klaeren, bevor am Feldmapping-Code etwas geaendert wird.
 *
 * Nutzung:
 *   node tools/dumpFieldsByTemplate.js
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
    // TopDesk nutzt ein Zertifikat der internen Zertifizierungsstelle
    // (CORP ROOT CA, siehe IIS-Zertifikat), das Node.js standardmaessig
    // nicht vertraut - ohne diesen Agent: "self-signed certificate in
    // certificate chain". Gleiches Muster wie topdeskClient.js/
    // inspectTopdesk.js/probeListFields.js, hier zunaechst vergessen.
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
  console.log('Hole alle Changes mit fields=all ...\n');
  const result = await fetchRaw('/tas/api/operatorChanges?pageSize=200&fields=all');
  const all    = result.results || result || [];

  if (!all.length) {
    console.log('Keine Changes gefunden.');
    return;
  }

  // Nach templateId gruppieren
  // WICHTIG (Korrektur nach erstem Testlauf 29.07.2026): dieselbe
  // Fallback-Logik wie getTemplateId() in topdeskClient.js verwenden -
  // TopDesk liefert die templateId in der LISTEN-Antwort offenbar
  // verschachtelt unter change.template.id, nicht flach unter
  // change.templateId. Der erste Testlauf mit nur dem flachen Pfad zeigte
  // faelschlich "kein templateId" bei allen 200 Changes.
  const byTemplate = {};
  for (const c of all) {
    const tid = c.template?.id || c.templateId || '(kein templateId)';
    if (!byTemplate[tid]) byTemplate[tid] = [];
    byTemplate[tid].push(c);
  }

  console.log(`${all.length} Change(s) insgesamt, ${Object.keys(byTemplate).length} unterschiedliche Vorlage(n).\n`);
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const [templateId, changes] of Object.entries(byTemplate)) {
    console.log(`templateId: ${templateId}`);
    console.log(`Anzahl Changes mit dieser Vorlage: ${changes.length}`);
    console.log(`Beispiel-Beschreibung: "${changes[0].briefDescription || '(keine)'}"`);
    console.log('');

    for (const c of changes) {
      console.log(`  #${c.number}  (Status: ${c.status?.name})`);
      console.log(`    optionalFields1: ${JSON.stringify(c.optionalFields1)}`);
      console.log(`    optionalFields2: ${JSON.stringify(c.optionalFields2)}`);
    }
    console.log('\n───────────────────────────────────────────────────────────\n');
  }

  console.log('Tipp: Vergleiche pro Vorlage (gleiche templateId), ob text1/text2');
  console.log('immer dieselbe Bedeutung haben (z.B. immer Name in text1) oder ob');
  console.log('es auch INNERHALB einer Vorlage variiert (dann waere es kein');
  console.log('Konfigurationsmuster, sondern zufaellige Falscheingabe je Change).');
}

main().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
